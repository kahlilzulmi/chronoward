use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use local_ip_address::{list_afinet_netifas, local_ip};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::Notify;

/// Preferred pairing port. Vite HMR uses 1421 (`adb reverse tcp:1420/1421`); do not bind that.
pub const PREFERRED_PORT: u16 = 1422;
const PORT_SEARCH_END: u16 = 1432;
const PIN_TTL: Duration = Duration::from_secs(10 * 60);
const MAX_PIN_FAILURES: u32 = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingHostInfo {
    pub ip: String,
    pub port: u16,
    pub pin: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Deserialize)]
struct HandshakeMessage {
    #[serde(rename = "type")]
    kind: String,
    pin: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct HandshakeStatus {
    status: String,
}

struct PairingInner {
    pin: Mutex<Option<(String, Instant)>>,
    clients: Mutex<HashSet<u64>>,
    next_client_id: AtomicU64,
    pin_failures: AtomicU32,
    bound_port: Mutex<Option<u16>>,
    bound: Notify,
    shutdown: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
    app: tauri::AppHandle,
}

#[derive(Clone)]
pub struct PairingState {
    inner: Arc<PairingInner>,
}

impl PairingState {
    fn new(app: tauri::AppHandle) -> Self {
        Self {
            inner: Arc::new(PairingInner {
                pin: Mutex::new(None),
                clients: Mutex::new(HashSet::new()),
                next_client_id: AtomicU64::new(1),
                pin_failures: AtomicU32::new(0),
                bound_port: Mutex::new(None),
                bound: Notify::new(),
                shutdown: Mutex::new(None),
                app,
            }),
        }
    }
}

pub fn install(app: &tauri::AppHandle) {
    app.manage(PairingState::new(app.clone()));
}

#[tauri::command]
pub async fn start_pairing_mode(
    state: tauri::State<'_, PairingState>,
) -> Result<PairingHostInfo, String> {
    ensure_listening(&state).await?;
    let port = wait_for_bound_port(&state).await?;
    let pin = generate_pin();
    {
        let mut slot = state
            .inner
            .pin
            .lock()
            .map_err(|err| format!("pairing pin lock: {err}"))?;
        *slot = Some((pin.clone(), Instant::now() + PIN_TTL));
    }
    state.inner.pin_failures.store(0, Ordering::Relaxed);
    Ok(PairingHostInfo {
        ip: discover_lan_ipv4(),
        port,
        pin,
        expires_in_seconds: PIN_TTL.as_secs(),
    })
}

#[tauri::command]
pub async fn stop_pairing_mode(state: tauri::State<'_, PairingState>) -> Result<(), String> {
    {
        let mut slot = state
            .inner
            .pin
            .lock()
            .map_err(|err| format!("pairing pin lock: {err}"))?;
        *slot = None;
    }
    if let Ok(mut shutdown) = state.inner.shutdown.lock() {
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(true);
        }
    }
    if let Ok(mut port) = state.inner.bound_port.lock() {
        *port = None;
    }
    Ok(())
}

async fn ensure_listening(state: &PairingState) -> Result<(), String> {
    if bound_port(state)?.is_some() {
        return Ok(());
    }
    let (tx, rx) = tokio::sync::watch::channel(false);
    {
        let mut slot = state
            .inner
            .shutdown
            .lock()
            .map_err(|err| format!("pairing shutdown lock: {err}"))?;
        *slot = Some(tx);
    }
    let server_state = state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_server(server_state, rx).await {
            eprintln!("pairing server: {err}");
        }
    });
    Ok(())
}

async fn wait_for_bound_port(state: &PairingState) -> Result<u16, String> {
    let notified = state.inner.bound.notified();
    tokio::pin!(notified);
    if let Some(port) = bound_port(state)? {
        return Ok(port);
    }
    match tokio::time::timeout(Duration::from_secs(3), notified).await {
        Ok(()) => bound_port(state)?.ok_or_else(|| "Pairing server failed to bind a port".into()),
        Err(_) => Err("Pairing server is not listening yet".into()),
    }
}

fn bound_port(state: &PairingState) -> Result<Option<u16>, String> {
    state
        .inner
        .bound_port
        .lock()
        .map(|guard| *guard)
        .map_err(|err| format!("pairing port lock: {err}"))
}

async fn run_server(
    state: PairingState,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    let (listener, port) = bind_pairing_listener().await?;
    {
        let mut slot = state
            .inner
            .bound_port
            .lock()
            .map_err(|err| format!("pairing port lock: {err}"))?;
        *slot = Some(port);
    }
    state.inner.bound.notify_waiters();
    eprintln!("pairing server listening on 0.0.0.0:{port}/ws (until Stop pairing)");

    let app = Router::new()
        .route("/", get(upgrade_ws))
        .route("/ws", get(upgrade_ws))
        .with_state(state);

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown.wait_for(|stop| *stop).await;
        })
        .await
        .map_err(|err| format!("pairing server stopped: {err}"))
}

async fn bind_pairing_listener() -> Result<(TcpListener, u16), String> {
    let mut last_err = String::from("no ports attempted");
    for port in PREFERRED_PORT..PORT_SEARCH_END {
        match TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).await {
            Ok(listener) => return Ok((listener, port)),
            Err(err) => last_err = format!("port {port}: {err}"),
        }
    }
    Err(format!(
        "could not bind pairing WebSocket on {}–{} ({last_err})",
        PREFERRED_PORT,
        PORT_SEARCH_END - 1
    ))
}

async fn upgrade_ws(ws: WebSocketUpgrade, State(state): State<PairingState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: PairingState) {
    let client_id = state.inner.next_client_id.fetch_add(1, Ordering::Relaxed);
    let mut paired = false;

    while let Some(msg) = socket.recv().await {
        let Ok(msg) = msg else {
            break;
        };
        match msg {
            Message::Text(text) => {
                let Some(status) = handshake_status(&state, text.as_str()) else {
                    continue;
                };
                if status == "success" && !paired {
                    paired = true;
                    if let Ok(mut clients) = state.inner.clients.lock() {
                        clients.insert(client_id);
                    }
                    let _ = state.inner.app.emit(
                        "pairing-connected",
                        HandshakeStatus {
                            status: "success".into(),
                        },
                    );
                }
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({ "status": status }).to_string().into(),
                    ))
                    .await;
            }
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = socket.send(Message::Pong(payload)).await;
            }
            _ => {}
        }
    }

    if paired {
        let last_client = if let Ok(mut clients) = state.inner.clients.lock() {
            clients.remove(&client_id);
            clients.is_empty()
        } else {
            false
        };
        if last_client {
            let _ = state.inner.app.emit(
                "pairing-disconnected",
                HandshakeStatus {
                    status: "disconnected".into(),
                },
            );
        }
    }
}

fn handshake_status(state: &PairingState, text: &str) -> Option<&'static str> {
    let parsed: HandshakeMessage = serde_json::from_str(text.trim()).ok()?;
    if parsed.kind != "pairing-handshake" {
        return None;
    }
    if state.inner.pin_failures.load(Ordering::Relaxed) >= MAX_PIN_FAILURES {
        return Some("failure");
    }
    let offered = parsed.pin.as_deref().map(str::trim).unwrap_or("");
    let Ok(guard) = state.inner.pin.lock() else {
        return Some("failure");
    };
    let result = match guard.as_ref() {
        Some((expected, expires_at))
            if Instant::now() < *expires_at && expected == offered =>
        {
            Some("success")
        }
        _ => Some("failure"),
    };
    drop(guard);
    if result == Some("failure") {
        state.inner.pin_failures.fetch_add(1, Ordering::Relaxed);
    } else {
        state.inner.pin_failures.store(0, Ordering::Relaxed);
    }
    result
}

fn generate_pin() -> String {
    let n = rand::rng().random_range(0..1_000_000u32);
    format!("{n:06}")
}

fn discover_lan_ipv4() -> String {
    if let Ok(ifaces) = list_afinet_netifas() {
        let mut best: Option<(i32, Ipv4Addr)> = None;
        for (name, addr) in ifaces {
            let IpAddr::V4(ip) = addr else {
                continue;
            };
            let score = score_ipv4(&name, ip);
            if score < 0 {
                continue;
            }
            if best
                .map(|(best_score, _)| score > best_score)
                .unwrap_or(true)
            {
                best = Some((score, ip));
            }
        }
        if let Some((_, ip)) = best {
            return ip.to_string();
        }
    }

    match local_ip() {
        Ok(IpAddr::V4(ip)) => ip.to_string(),
        Ok(IpAddr::V6(ip)) => ip.to_string(),
        Err(_) => "127.0.0.1".into(),
    }
}

fn score_ipv4(adapter_name: &str, ip: Ipv4Addr) -> i32 {
    if ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() {
        return -1;
    }
    if is_virtual_nic(adapter_name) {
        return 0;
    }
    if !is_rfc1918(ip) {
        return 1;
    }
    // Prefer typical home LAN; 10.127.x was previously a Hyper-V/VPN NIC on this machine.
    if ip.octets()[0] == 192 && ip.octets()[1] == 168 {
        return 100;
    }
    if ip.octets()[0] == 10 && ip.octets()[1] == 127 {
        return 25;
    }
    if ip.octets()[0] == 10 {
        return 80;
    }
    if ip.octets()[0] == 172 && (16..=31).contains(&ip.octets()[1]) {
        return 70;
    }
    10
}

fn is_rfc1918(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168)
}

fn is_virtual_nic(name: &str) -> bool {
    let n = name.to_lowercase();
    [
        "vethernet",
        "hyper-v",
        "vmware",
        "virtualbox",
        "vbox",
        "loopback",
        "bluetooth",
        "wsl",
        "vpn",
        "tap-",
        "tap0",
        "tun",
        "cisco",
        "anyconnect",
        "zerotier",
        "default switch",
        "pseudo-interface",
        "isatap",
        "teredo",
    ]
    .iter()
    .any(|hint| n.contains(hint))
}
