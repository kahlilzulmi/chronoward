use crate::db::{
    apply_usage_rows, export_usage_for_sub, merge_usage_rows, stamp_unsigned_usage,
    store_drive_sync_meta, usage_from_jsonl, usage_to_jsonl, DbState,
};
use serde::Deserialize;
use tauri::{AppHandle, State};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Manager;

#[allow(dead_code)]
const DRIVE_FILE_NAME: &str = "usage.jsonl";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeUsagePayload {
    pub remote_jsonl: String,
}

async fn merge_against_local(
    app: &AppHandle,
    state: &DbState,
    remote_jsonl: &str,
    drive_file_id: Option<&str>,
) -> Result<String, String> {
    let sub = state
        .google_sub
        .lock()
        .map_err(|err| format!("google sub lock: {err}"))?
        .clone()
        .ok_or_else(|| "Sign in with Google before Drive sync.".to_string())?;
    stamp_unsigned_usage(state, &sub).await?;
    let local = export_usage_for_sub(state, &sub).await?;
    let remote = usage_from_jsonl(remote_jsonl);
    let merged = merge_usage_rows(remote, local);
    apply_usage_rows(state, &merged).await?;
    let jsonl = usage_to_jsonl(&merged);
    let now = chrono_like_now();
    store_drive_sync_meta(app, drive_file_id, &now)?;
    Ok(jsonl)
}

fn chrono_like_now() -> String {
    // RFC3339-ish UTC without extra deps: JS and SQLite already use ISO strings.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[tauri::command]
pub async fn google_merge_usage_jsonl(
    app: AppHandle,
    state: State<'_, DbState>,
    payload: MergeUsagePayload,
) -> Result<String, String> {
    merge_against_local(&app, &state, &payload.remote_jsonl, None).await
}

#[tauri::command]
pub async fn google_sync_drive(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, state);
        return Err(
            "On Android, Settings syncs Drive through the native plugin, not this command.".into(),
        );
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = state;
        run_desktop_sync(app).await
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) async fn run_desktop_sync(app: AppHandle) -> Result<(), String> {
    let state = app.state::<DbState>();
    desktop::sync_drive(app.clone(), state).await
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use super::*;
    use crate::db::read_google_account_file;
    use crate::google_auth;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct FileList {
        files: Option<Vec<FileRef>>,
    }

    #[derive(Deserialize)]
    struct FileRef {
        id: Option<String>,
        name: Option<String>,
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

    fn http() -> Result<reqwest::Client, String> {
        reqwest::Client::builder()
            .use_native_tls()
            .build()
            .map_err(|err| format!("HTTP client: {err}"))
    }

    async fn authorized_text(
        client: &reqwest::Client,
        method: reqwest::Method,
        url: &str,
        token: &str,
        body: Option<String>,
        content_type: &str,
    ) -> Result<(u16, String), String> {
        let mut req = client
            .request(method, url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", content_type);
        if let Some(body) = body {
            req = req.body(body);
        }
        let response = req
            .send()
            .await
            .map_err(|err| format!("Drive request: {err}"))?;
        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|err| format!("Drive body: {err}"))?;
        Ok((status, text))
    }

    async fn find_or_create_file(client: &reqwest::Client, token: &str) -> Result<String, String> {
        let query = pct_encode("name = 'usage.jsonl'");
        let list_url = format!(
            "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q={query}"
        );
        let (status, text) =
            authorized_text(client, reqwest::Method::GET, &list_url, token, None, "application/json")
                .await?;
        if status == 401 || status == 403 {
            return Err(
                "Drive access denied. Sign in with Google again to grant drive.appdata.".into(),
            );
        }
        if !(200..300).contains(&status) {
            return Err(format!("Drive list failed ({status})."));
        }
        let listed: FileList =
            serde_json::from_str(&text).map_err(|err| format!("Drive list JSON: {err}"))?;
        if let Some(id) = listed
            .files
            .unwrap_or_default()
            .into_iter()
            .find(|file| file.name.as_deref() == Some(DRIVE_FILE_NAME))
            .and_then(|file| file.id)
        {
            return Ok(id);
        }
        let meta = serde_json::json!({
            "name": DRIVE_FILE_NAME,
            "parents": ["appDataFolder"]
        })
        .to_string();
        let (status, text) = authorized_text(
            client,
            reqwest::Method::POST,
            "https://www.googleapis.com/drive/v3/files",
            token,
            Some(meta),
            "application/json",
        )
        .await?;
        if !(200..300).contains(&status) {
            return Err(format!("Drive create failed ({status})."));
        }
        let created: FileRef =
            serde_json::from_str(&text).map_err(|err| format!("Drive create JSON: {err}"))?;
        created
            .id
            .filter(|id| !id.is_empty())
            .ok_or_else(|| "Drive create returned no file id.".to_string())
    }

    async fn download_file(
        client: &reqwest::Client,
        token: &str,
        file_id: &str,
    ) -> Result<String, String> {
        let url = format!("https://www.googleapis.com/drive/v3/files/{file_id}?alt=media");
        let (status, text) =
            authorized_text(client, reqwest::Method::GET, &url, token, None, "text/plain").await?;
        if status == 404 {
            return Ok(String::new());
        }
        if !(200..300).contains(&status) {
            return Err(format!("Drive download failed ({status})."));
        }
        Ok(text)
    }

    async fn upload_file(
        client: &reqwest::Client,
        token: &str,
        file_id: &str,
        jsonl: &str,
    ) -> Result<(), String> {
        let url = format!(
            "https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media"
        );
        let (status, _) = authorized_text(
            client,
            reqwest::Method::PATCH,
            &url,
            token,
            Some(jsonl.to_string()),
            "text/plain; charset=UTF-8",
        )
        .await?;
        if !(200..300).contains(&status) {
            return Err(format!("Drive upload failed ({status})."));
        }
        Ok(())
    }

    pub async fn sync_drive(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
        let token = google_auth::ensure_desktop_access_token(&app).await?;
        let client = http()?;
        let cached_id = read_google_account_file(&app)?
            .and_then(|file| file.drive_file_id)
            .filter(|id| !id.is_empty());
        let mut file_id = if let Some(id) = cached_id {
            id
        } else {
            find_or_create_file(&client, &token).await?
        };
        let remote = match download_file(&client, &token, &file_id).await {
            Ok(text) => text,
            Err(_) => {
                file_id = find_or_create_file(&client, &token).await?;
                download_file(&client, &token, &file_id).await?
            }
        };
        let merged = merge_against_local(&app, &state, &remote, Some(&file_id)).await?;
        upload_file(&client, &token, &file_id, &merged).await?;
        Ok(())
    }
}
