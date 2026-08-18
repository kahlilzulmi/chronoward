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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::Notify;

/// Preferred pairing port. Vite HMR uses 1421 (`adb reverse tcp:1420/1421`); do not bind that.
pub const PREFERRED_PORT: u16 = 1422;
const PORT_SEARCH_END: u16 = 1432;

#[derive(Debug, Clone, Serialize)]
pub struct PairingHostInfo {
    pub ip: String,
    pub port: u16,
    pub pin: String,
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
    pin: Mutex<Option<String>>,
    clients: Mutex<HashSet<u64>>,
    next_client_id: AtomicU64,
    bound_port: Mutex<Option<u16>>,
    bound: Notify,
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
                bound_port: Mutex::new(None),
                bound: Notify::new(),
                app,
            }),
        }
    }
}

pub fn spawn(app: &tauri::AppHandle) {
    let state = PairingState::new(app.clone());
    app.manage(state.clone());
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_server(state).await {
            eprintln!("pairing server: {err}");
        }
    });
}

#[tauri::command]
pub async fn start_pairing_mode(
    state: tauri::State<'_, PairingState>,
) -> Result<PairingHostInfo, String> {
    let port = wait_for_bound_port(&state).await?;
    let pin = generate_pin();
    {
        let mut slot = state
            .inner
            .pin
            .lock()
            .map_err(|err| format!("pairing pin lock: {err}"))?;
        *slot = Some(pin.clone());
    }
    Ok(PairingHostInfo {
        ip: discover_lan_ipv4(),
        port,
        pin,
    })
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

async fn run_server(state: PairingState) -> Result<(), String> {
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
    eprintln!("pairing server listening on 0.0.0.0:{port}/ws");

    let app = Router::new()
        .route("/", get(upgrade_ws))
        .route("/ws", get(upgrade_ws))
        .with_state(state);

    axum::serve(listener, app)
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
    let offered = parsed.pin.as_deref().map(str::trim).unwrap_or("");
    let Ok(guard) = state.inner.pin.lock() else {
        return Some("failure");
    };
    match guard.as_deref() {
        Some(expected) if expected == offered => Some("success"),
        _ => Some("failure"),
    }
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
