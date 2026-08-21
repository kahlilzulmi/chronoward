use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::db::{read_google_account_file, write_google_account, DbState};

#[allow(dead_code)]
const GOOGLE_SIGN_IN_CANCELLED: &str = "Google sign-in was cancelled.";

pub struct GoogleSignInWaiter {
    abort: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl GoogleSignInWaiter {
    fn new() -> Self {
        Self {
            abort: Mutex::new(None),
        }
    }

    #[allow(dead_code)]
    fn replace(&self, next: tokio::sync::oneshot::Sender<()>) {
        if let Ok(mut slot) = self.abort.lock() {
            if let Some(previous) = slot.replace(next) {
                let _ = previous.send(());
            }
        }
    }

    fn take(&self) -> Option<tokio::sync::oneshot::Sender<()>> {
        self.abort.lock().ok()?.take()
    }

    #[allow(dead_code)]
    fn clear(&self) {
        if let Ok(mut slot) = self.abort.lock() {
            *slot = None;
        }
    }
}

pub fn install(app: &AppHandle) {
    app.manage(GoogleSignInWaiter::new());
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(15 * 60)).await;
                let _ = crate::drive::run_desktop_sync(handle.clone()).await;
            }
        });
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) async fn ensure_desktop_access_token(app: &AppHandle) -> Result<String, String> {
    desktop::ensure_access_token(app).await
}

const EMBEDDED_OAUTH_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/google-oauth.json"));
#[allow(dead_code)]
const SIGN_IN_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/drive.appdata";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthFile {
    desktop_client_id: Option<String>,
    desktop_client_secret: Option<String>,
    android_client_id: Option<String>,
    web_client_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAuthStatus {
    pub configured: bool,
    pub signed_in: bool,
    pub email: Option<String>,
    pub sub: Option<String>,
    pub next_step: String,
    pub server_client_id: Option<String>,
    pub android_client_id: Option<String>,
    pub desktop_client_suspect: bool,
    pub needs_drive_consent: bool,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSignIn {
    pub sub: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone)]
struct OAuthConfig {
    desktop_client_id: String,
    #[allow(dead_code)]
    desktop_client_secret: Option<String>,
    android_client_id: String,
    web_client_id: Option<String>,
    configured: bool,
    desktop_client_suspect: bool,
}

fn trim_id(value: Option<&String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
}

fn is_placeholder(id: &str) -> bool {
    id.contains("YOUR_") || !id.ends_with(".apps.googleusercontent.com")
}

fn looks_like_google_client_id(id: &str) -> bool {
    let Some((prefix, rest)) = id.split_once('-') else {
        return false;
    };
    prefix.chars().all(|ch| ch.is_ascii_digit())
        && !rest.is_empty()
        && rest.ends_with(".apps.googleusercontent.com")
}

fn load_oauth_config() -> OAuthConfig {
    let parsed: OAuthFile = serde_json::from_str(EMBEDDED_OAUTH_JSON).unwrap_or(OAuthFile {
        desktop_client_id: None,
        desktop_client_secret: None,
        android_client_id: None,
        web_client_id: None,
    });
    let desktop_client_id = trim_id(parsed.desktop_client_id.as_ref()).unwrap_or_default();
    let android_client_id = trim_id(parsed.android_client_id.as_ref()).unwrap_or_default();
    let web_client_id = trim_id(parsed.web_client_id.as_ref()).filter(|id| !is_placeholder(id));
    let desktop_client_secret = trim_id(parsed.desktop_client_secret.as_ref());
    let configured = !desktop_client_id.is_empty()
        && !android_client_id.is_empty()
        && !is_placeholder(&desktop_client_id)
        && !is_placeholder(&android_client_id);
    let desktop_client_suspect =
        configured && !looks_like_google_client_id(&desktop_client_id);
    OAuthConfig {
        desktop_client_id,
        desktop_client_secret,
        android_client_id,
        web_client_id,
        configured,
        desktop_client_suspect,
    }
}

fn server_client_id(config: &OAuthConfig) -> Option<String> {
    if !config.configured {
        return None;
    }
    config
        .web_client_id
        .clone()
        .or_else(|| {
            if config.desktop_client_id.is_empty() {
                None
            } else {
                Some(config.desktop_client_id.clone())
            }
        })
}

fn next_step(config: &OAuthConfig, signed_in: bool, needs_drive_consent: bool) -> String {
    if !config.configured {
        return "Add real Desktop and Android client IDs to src-tauri/google-oauth.json (gitignored), then rebuild.".into();
    }
    if signed_in && needs_drive_consent {
        return "Sign in with Google again to grant Drive app data, then tap Sync now. Current session has no refresh token.".into();
    }
    if signed_in {
        return "Signed in. Drive syncs usage.jsonl in appDataFolder. URLs are not uploaded.".into();
    }
    if config.desktop_client_suspect {
        return desktop_client_invalid_message();
    }
    if config.web_client_id.is_none() {
        return "Sign in with Google. Android ID tokens usually need a Web OAuth client in google-oauth.json as webClientId. Desktop token exchange may need desktopClientSecret from Cloud Console.".into();
    }
    "Sign in with Google. Drive appdata is included so All Devices can merge.".into()
}

fn desktop_client_invalid_message() -> String {
    "Google 401 invalid_client: desktopClientId is not a real OAuth client ID. \
In Cloud Console create Credentials → OAuth client ID → Desktop app. \
Paste the Client ID (must look like 356341681867-xxxxx.apps.googleusercontent.com) \
and Client secret as desktopClientSecret. Do not paste the secret as the ID. Then rebuild.".into()
}

fn persist_account(
    app: &AppHandle,
    state: &State<'_, DbState>,
    sub: &str,
    email: Option<&str>,
) -> Result<(), String> {
    write_google_account(app, Some(sub), email)?;
    *state
        .google_sub
        .lock()
        .map_err(|err| format!("google sub lock: {err}"))? = Some(sub.to_string());
    *state
        .google_email
        .lock()
        .map_err(|err| format!("google email lock: {err}"))? =
        email.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    Ok(())
}

#[tauri::command]
pub fn google_auth_status(app: AppHandle, state: State<'_, DbState>) -> Result<GoogleAuthStatus, String> {
    let config = load_oauth_config();
    let sub = state
        .google_sub
        .lock()
        .map_err(|err| format!("google sub lock: {err}"))?
        .clone();
    let email = state
        .google_email
        .lock()
        .map_err(|err| format!("google email lock: {err}"))?
        .clone();
    let account = read_google_account_file(&app)?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let needs_drive_consent = sub.is_some()
        && account
            .as_ref()
            .map(|file| {
                file.refresh_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_none()
            })
            .unwrap_or(true);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let needs_drive_consent = false;
    let last_sync_at = account.and_then(|file| file.last_sync_at);
    let signed_in = sub.is_some();
    Ok(GoogleAuthStatus {
        configured: config.configured,
        signed_in,
        email,
        sub,
        next_step: next_step(&config, signed_in, needs_drive_consent),
        server_client_id: server_client_id(&config),
        android_client_id: if config.configured {
            Some(config.android_client_id)
        } else {
            None
        },
        desktop_client_suspect: config.desktop_client_suspect,
        needs_drive_consent,
        last_sync_at,
    })
}

#[tauri::command]
pub async fn google_sign_in(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, state);
        return Err(
            "On Android, Settings uses the native Google account sheet instead of this command."
                .into(),
        );
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        desktop::sign_in(app, state).await
    }
}

#[tauri::command]
pub fn google_complete_sign_in(
    app: AppHandle,
    state: State<'_, DbState>,
    payload: CompleteSignIn,
) -> Result<(), String> {
    let sub = payload.sub.trim();
    if sub.is_empty() {
        return Err("Google sign-in did not return a subject (sub).".into());
    }
    persist_account(
        &app,
        &state,
        sub,
        payload.email.as_deref(),
    )
}

#[tauri::command]
pub fn google_cancel_sign_in(app: AppHandle) -> Result<(), String> {
    if let Some(tx) = app.state::<GoogleSignInWaiter>().take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn google_sign_out(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    if let Some(tx) = app.state::<GoogleSignInWaiter>().take() {
        let _ = tx.send(());
    }
    write_google_account(&app, None, None)?;
    *state
        .google_sub
        .lock()
        .map_err(|err| format!("google sub lock: {err}"))? = None;
    *state
        .google_email
        .lock()
        .map_err(|err| format!("google email lock: {err}"))? = None;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use super::*;
    use crate::db::store_google_tokens;
    use axum::extract::{Query, State as AxumState};
    use axum::response::Html;
    use axum::routing::get;
    use axum::Router;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use serde::Deserialize;
    use sha2::{Digest, Sha256};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::oneshot;
    use uuid::Uuid;

    #[derive(Deserialize)]
    struct CallbackQuery {
        code: Option<String>,
        state: Option<String>,
        error: Option<String>,
        error_description: Option<String>,
    }

    struct Loopback {
        expected_state: String,
        tx: tokio::sync::Mutex<Option<oneshot::Sender<Result<String, String>>>>,
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        id_token: Option<String>,
        access_token: Option<String>,
        refresh_token: Option<String>,
        expires_in: Option<u64>,
        error: Option<String>,
        error_description: Option<String>,
    }

    #[derive(Deserialize)]
    struct IdClaims {
        iss: Option<String>,
        aud: Option<String>,
        sub: Option<String>,
        email: Option<String>,
    }

    fn pct_encode(value: &str) -> String {
        let mut out = String::new();
        for byte in value.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    out.push(byte as char);
                }
                _ => out.push_str(&format!("%{byte:02X}")),
            }
        }
        out
    }

    fn pkce_pair() -> (String, String) {
        let mut raw = [0u8; 32];
        raw[..16].copy_from_slice(Uuid::new_v4().as_bytes());
        raw[16..].copy_from_slice(Uuid::new_v4().as_bytes());
        let verifier = URL_SAFE_NO_PAD.encode(raw);
        let digest = Sha256::digest(verifier.as_bytes());
        let challenge = URL_SAFE_NO_PAD.encode(digest);
        (verifier, challenge)
    }

    fn open_browser(url: &str) -> Result<(), String> {
        // Do not use `cmd /C start` on Windows: cmd splits on `&`, so Google
        // only receives `client_id` and returns 400 "incomplete request".
        tauri_plugin_opener::open_url(url, None::<&str>)
            .map_err(|err| format!("open browser: {err}"))
    }

    async fn stop_loopback(
        shutdown_tx: oneshot::Sender<()>,
        join: &mut tokio::task::JoinHandle<()>,
    ) {
        let _ = shutdown_tx.send(());
        tokio::select! {
            _ = &mut *join => {}
            _ = tokio::time::sleep(Duration::from_millis(400)) => {
                join.abort();
            }
        }
    }

    fn decode_id_token(id_token: &str, expected_aud: &str) -> Result<(String, Option<String>), String> {
        let payload = id_token.split('.').nth(1).ok_or("ID token is not a JWT.")?;
        let json = URL_SAFE_NO_PAD
            .decode(payload)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
            .map_err(|err| format!("ID token payload: {err}"))?;
        let claims: IdClaims =
            serde_json::from_slice(&json).map_err(|err| format!("ID token claims: {err}"))?;
        let iss = claims.iss.unwrap_or_default();
        if iss != "https://accounts.google.com" && iss != "accounts.google.com" {
            return Err(format!("Unexpected ID token issuer: {iss}"));
        }
        let aud = claims.aud.unwrap_or_default();
        if aud != expected_aud {
            return Err("ID token audience does not match this app's Desktop client ID.".into());
        }
        let sub = claims
            .sub
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "ID token is missing sub.".to_string())?;
        let email = claims
            .email
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        Ok((sub, email))
    }

    async fn callback(
        AxumState(state): AxumState<Arc<Loopback>>,
        Query(query): Query<CallbackQuery>,
    ) -> Html<&'static str> {
        let result = if query.error.as_deref() == Some("access_denied") {
            Err(GOOGLE_SIGN_IN_CANCELLED.into())
        } else if let Some(error) = query.error {
            let detail = query.error_description.unwrap_or_default();
            Err(format!("Google OAuth error: {error} {detail}").trim().to_string())
        } else if query.state.as_deref() != Some(state.expected_state.as_str()) {
            Err("OAuth state mismatch. Try Sign in with Google again.".into())
        } else if let Some(code) = query.code.filter(|value| !value.is_empty()) {
            Ok(code)
        } else {
            Err("Google did not return an authorization code.".into())
        };
        if let Some(tx) = state.tx.lock().await.take() {
            let _ = tx.send(result);
        }
        Html("<html><body style=\"font-family:sans-serif;padding:2rem\"><p>You can close this tab and return to Chronoward.</p></body></html>")
    }

    pub async fn sign_in(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
        let config = load_oauth_config();
        if !config.configured {
            return Err(next_step(&config, false, false));
        }
        if config.desktop_client_suspect {
            return Err(desktop_client_invalid_message());
        }
        let client_id = config.desktop_client_id.clone();
        let (verifier, challenge) = pkce_pair();
        let csrf = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        let loopback = Arc::new(Loopback {
            expected_state: csrf.clone(),
            tx: tokio::sync::Mutex::new(Some(tx)),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|err| format!("bind OAuth loopback: {err}"))?;
        let port = listener
            .local_addr()
            .map_err(|err| format!("OAuth loopback address: {err}"))?
            .port();
        let redirect = format!("http://127.0.0.1:{port}/");
        let needs_consent = read_google_account_file(&app)?
            .and_then(|file| file.refresh_token)
            .map(|token| token.trim().is_empty())
            .unwrap_or(true);
        let mut auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline",
            pct_encode(&client_id),
            pct_encode(&redirect),
            pct_encode(SIGN_IN_SCOPES),
            pct_encode(&challenge),
            pct_encode(&csrf),
        );
        if needs_consent {
            auth_url.push_str("&prompt=consent");
        }

        let router = Router::new()
            .route("/", get(callback))
            .with_state(loopback);
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        let mut join = tokio::spawn(async move {
            let _ = server.await;
        });
        let (abort_tx, abort_rx) = oneshot::channel();
        app.state::<GoogleSignInWaiter>().replace(abort_tx);

        if let Err(err) = open_browser(&auth_url) {
            stop_loopback(shutdown_tx, &mut join).await;
            app.state::<GoogleSignInWaiter>().clear();
            return Err(err);
        }

        let waited = tokio::select! {
            result = rx => match result {
                Ok(Ok(code)) => Ok(code),
                Ok(Err(err)) => Err(err),
                Err(_) => Err("OAuth loopback closed before Google redirected.".into()),
            },
            _ = abort_rx => Err(GOOGLE_SIGN_IN_CANCELLED.into()),
            _ = tokio::time::sleep(Duration::from_secs(180)) => {
                Err("Google sign-in timed out after 3 minutes.".into())
            }
        };
        stop_loopback(shutdown_tx, &mut join).await;
        app.state::<GoogleSignInWaiter>().clear();
        let code = waited?;

        let mut body = format!(
            "code={}&client_id={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}",
            pct_encode(&code),
            pct_encode(&client_id),
            pct_encode(&redirect),
            pct_encode(&verifier),
        );
        if let Some(secret) = config.desktop_client_secret.as_deref() {
            body.push_str("&client_secret=");
            body.push_str(&pct_encode(secret));
        }

        let http = reqwest::Client::builder()
            .use_native_tls()
            .build()
            .map_err(|err| format!("HTTP client: {err}"))?;
        let response = http
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|err| format!("Google token request: {err}"))?;
        let text = response
            .text()
            .await
            .map_err(|err| format!("Google token body: {err}"))?;
        let parsed: TokenResponse =
            serde_json::from_str(&text).map_err(|err| format!("Google token JSON: {err}"))?;
        if let Some(error) = parsed.error {
            let detail = parsed.error_description.unwrap_or_default();
            return Err(format!(
                "Google token error: {error} {detail}. If this is invalid_client, add desktopClientSecret from Cloud Console to google-oauth.json and rebuild."
            ));
        }
        let id_token = parsed
            .id_token
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Google token response had no id_token.".to_string())?;
        let (sub, email) = decode_id_token(&id_token, &client_id)?;
        persist_account(&app, &state, &sub, email.as_deref())?;
        let expires_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
            + parsed.expires_in.unwrap_or(3600) as i64;
        store_google_tokens(
            &app,
            parsed.refresh_token.as_deref(),
            parsed.access_token.as_deref(),
            Some(expires_at),
        )?;
        Ok(())
    }

    pub(crate) async fn ensure_access_token(app: &AppHandle) -> Result<String, String> {
        let file = read_google_account_file(app)?
            .ok_or_else(|| "Sign in with Google before Drive sync.".to_string())?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if let (Some(token), Some(expires)) = (
            file.access_token
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            file.access_expires_at,
        ) {
            if expires > now + 60 {
                return Ok(token.to_string());
            }
        }
        let refresh = file
            .refresh_token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                "Sign in with Google again to grant Drive app data (refresh token missing).".to_string()
            })?;
        let config = load_oauth_config();
        if config.desktop_client_suspect {
            return Err(desktop_client_invalid_message());
        }
        let mut body = format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}",
            pct_encode(refresh),
            pct_encode(&config.desktop_client_id),
        );
        if let Some(secret) = config.desktop_client_secret.as_deref() {
            body.push_str("&client_secret=");
            body.push_str(&pct_encode(secret));
        }
        let http = reqwest::Client::builder()
            .use_native_tls()
            .build()
            .map_err(|err| format!("HTTP client: {err}"))?;
        let response = http
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|err| format!("Google refresh: {err}"))?;
        let text = response
            .text()
            .await
            .map_err(|err| format!("Google refresh body: {err}"))?;
        let parsed: TokenResponse =
            serde_json::from_str(&text).map_err(|err| format!("Google refresh JSON: {err}"))?;
        if let Some(error) = parsed.error {
            return Err(format!(
                "Google refresh failed: {error}. Sign in with Google again."
            ));
        }
        let access = parsed
            .access_token
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Google refresh returned no access token.".to_string())?;
        let expires_at = now + parsed.expires_in.unwrap_or(3600) as i64;
        store_google_tokens(
            app,
            parsed.refresh_token.as_deref().or(Some(refresh)),
            Some(&access),
            Some(expires_at),
        )?;
        Ok(access)
    }
}
