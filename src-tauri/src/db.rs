use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const DB_FILE: &str = "chronoward.db";
const DEVICE_ID_FILE: &str = "device_id";
const AUTH_FILE: &str = "google_account.json";
const LEGACY_AUTH_FILE: &str = "google_sub";

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountFile {
    pub sub: String,
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_expires_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drive_file_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageSyncRow {
    pub uuid: String,
    pub app_name: String,
    pub duration_seconds: i64,
    pub device_type: String,
    pub timestamp: String,
    #[serde(default)]
    pub google_sub: Option<String>,
    #[serde(default)]
    pub device_id: Option<String>,
}

pub struct DbState {
    pub pool: SqlitePool,
    pub device_id: String,
    pub google_sub: Mutex<Option<String>>,
    pub google_email: Mutex<Option<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInsert {
    pub app_name: String,
    pub url: String,
    pub duration_seconds: i64,
    pub device_type: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageQuery {
    pub start: String,
    pub end: String,
    pub device_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregatedUsageRow {
    pub app_name: String,
    pub total_seconds: f64,
}

fn config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("app config dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create config dir: {err}"))?;
    Ok(dir)
}

fn sqlite_url(dir: &Path) -> String {
    let path = dir.join(DB_FILE);
    format!("sqlite:{}?mode=rwc", path.to_string_lossy().replace('\\', "/"))
}

fn load_or_create_device_id(dir: &Path) -> Result<String, String> {
    let path = dir.join(DEVICE_ID_FILE);
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let id = Uuid::new_v4().to_string();
    fs::write(&path, &id).map_err(|err| format!("write device id: {err}"))?;
    Ok(id)
}

fn load_google_account(dir: &Path) -> (Option<String>, Option<String>) {
    read_account_file(dir)
        .map(|file| {
            let email = file
                .email
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            (Some(file.sub), email)
        })
        .unwrap_or_else(|| {
            let legacy = fs::read_to_string(dir.join(LEGACY_AUTH_FILE))
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            (legacy, None)
        })
}

fn read_account_file(dir: &Path) -> Option<GoogleAccountFile> {
    let raw = fs::read_to_string(dir.join(AUTH_FILE)).ok()?;
    let parsed: GoogleAccountFile = serde_json::from_str(&raw).ok()?;
    let sub = parsed.sub.trim();
    if sub.is_empty() {
        return None;
    }
    Some(GoogleAccountFile {
        sub: sub.to_string(),
        ..parsed
    })
}

fn write_account_file(dir: &Path, file: &GoogleAccountFile) -> Result<(), String> {
    let json = serde_json::to_string(file).map_err(|err| format!("google account json: {err}"))?;
    fs::write(dir.join(AUTH_FILE), json).map_err(|err| format!("write google account: {err}"))?;
    let _ = fs::remove_file(dir.join(LEGACY_AUTH_FILE));
    Ok(())
}

pub fn read_google_account_file(app: &AppHandle) -> Result<Option<GoogleAccountFile>, String> {
    Ok(read_account_file(&config_dir(app)?))
}

#[allow(dead_code)]
pub fn store_google_tokens(
    app: &AppHandle,
    refresh_token: Option<&str>,
    access_token: Option<&str>,
    access_expires_at: Option<i64>,
) -> Result<(), String> {
    let dir = config_dir(app)?;
    let mut file = read_account_file(&dir).ok_or_else(|| "Not signed in.".to_string())?;
    if let Some(token) = refresh_token.map(str::trim).filter(|value| !value.is_empty()) {
        file.refresh_token = Some(token.to_string());
    }
    file.access_token = access_token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    file.access_expires_at = access_expires_at;
    write_account_file(&dir, &file)
}

pub fn store_drive_sync_meta(
    app: &AppHandle,
    drive_file_id: Option<&str>,
    last_sync_at: &str,
) -> Result<(), String> {
    let dir = config_dir(app)?;
    let mut file = read_account_file(&dir).ok_or_else(|| "Not signed in.".to_string())?;
    if let Some(id) = drive_file_id.map(str::trim).filter(|value| !value.is_empty()) {
        file.drive_file_id = Some(id.to_string());
    }
    file.last_sync_at = Some(last_sync_at.to_string());
    write_account_file(&dir, &file)
}

pub fn write_google_account(
    app: &AppHandle,
    sub: Option<&str>,
    email: Option<&str>,
) -> Result<(), String> {
    let dir = config_dir(app)?;
    match sub {
        Some(value) if !value.is_empty() => {
            let mut file = read_account_file(&dir).unwrap_or_default();
            if file.sub != value {
                file.refresh_token = None;
                file.access_token = None;
                file.access_expires_at = None;
                file.drive_file_id = None;
            }
            file.sub = value.to_string();
            file.email = email
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            write_account_file(&dir, &file)
        }
        _ => {
            let _ = fs::remove_file(dir.join(AUTH_FILE));
            let _ = fs::remove_file(dir.join(LEGACY_AUTH_FILE));
            Ok(())
        }
    }
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    let dir = config_dir(app)?;
    let url = sqlite_url(&dir);
    let pool = tauri::async_runtime::block_on(SqlitePool::connect(&url))
        .map_err(|err| format!("open sqlite: {err}"))?;
    let device_id = load_or_create_device_id(&dir)?;
    let (google_sub, google_email) = load_google_account(&dir);
    app.manage(DbState {
        pool,
        device_id,
        google_sub: Mutex::new(google_sub),
        google_email: Mutex::new(google_email),
    });
    Ok(())
}

#[tauri::command]
pub async fn insert_app_usage(
    state: State<'_, DbState>,
    payload: UsageInsert,
) -> Result<(), String> {
    let google_sub = state
        .google_sub
        .lock()
        .map_err(|err| format!("google sub lock: {err}"))?
        .clone();
    let uuid = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO app_usage (app_name, url, duration_seconds, device_type, timestamp, uuid, google_sub, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(payload.app_name)
    .bind(payload.url)
    .bind(payload.duration_seconds)
    .bind(payload.device_type)
    .bind(payload.timestamp)
    .bind(uuid)
    .bind(google_sub)
    .bind(&state.device_id)
    .execute(&state.pool)
    .await
    .map_err(|err| format!("insert app_usage: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn get_aggregated_usage(
    state: State<'_, DbState>,
    query: UsageQuery,
) -> Result<Vec<AggregatedUsageRow>, String> {
    let rows = if let Some(device_type) = query.device_type.as_deref().filter(|value| *value != "all")
    {
        sqlx::query(
            "SELECT app_name, SUM(duration_seconds) AS total_seconds
             FROM app_usage
             WHERE timestamp >= $1 AND timestamp < $2 AND device_type = $3
             GROUP BY app_name
             ORDER BY total_seconds DESC",
        )
        .bind(&query.start)
        .bind(&query.end)
        .bind(device_type)
        .fetch_all(&state.pool)
        .await
    } else {
        sqlx::query(
            "SELECT app_name, SUM(duration_seconds) AS total_seconds
             FROM app_usage
             WHERE timestamp >= $1 AND timestamp < $2
             GROUP BY app_name
             ORDER BY total_seconds DESC",
        )
        .bind(&query.start)
        .bind(&query.end)
        .fetch_all(&state.pool)
        .await
    }
    .map_err(|err| format!("aggregate app_usage: {err}"))?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let app_name: String = row.try_get("app_name").ok()?;
            let total_seconds: f64 = row.try_get::<f64, _>("total_seconds").ok()
                .or_else(|| row.try_get::<i64, _>("total_seconds").ok().map(|n| n as f64))?;
            if app_name.trim().is_empty() || total_seconds <= 0.0 {
                return None;
            }
            Some(AggregatedUsageRow {
                app_name,
                total_seconds,
            })
        })
        .collect())
}

pub fn usage_to_jsonl(rows: &[UsageSyncRow]) -> String {
    rows.iter()
        .filter_map(|row| serde_json::to_string(row).ok())
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn usage_from_jsonl(text: &str) -> Vec<UsageSyncRow> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<UsageSyncRow>(line).ok())
        .filter(|row| !row.uuid.trim().is_empty())
        .collect()
}

pub fn merge_usage_rows(remote: Vec<UsageSyncRow>, local: Vec<UsageSyncRow>) -> Vec<UsageSyncRow> {
    let mut map = std::collections::BTreeMap::new();
    for row in remote {
        map.insert(row.uuid.clone(), row);
    }
    for row in local {
        map.insert(row.uuid.clone(), row);
    }
    map.into_values().collect()
}

pub async fn stamp_unsigned_usage(state: &DbState, sub: &str) -> Result<(), String> {
    sqlx::query("UPDATE app_usage SET google_sub = $1 WHERE google_sub IS NULL OR google_sub = ''")
        .bind(sub)
        .execute(&state.pool)
        .await
        .map_err(|err| format!("stamp google_sub: {err}"))?;
    Ok(())
}

pub async fn export_usage_for_sub(state: &DbState, sub: &str) -> Result<Vec<UsageSyncRow>, String> {
    let rows = sqlx::query(
        "SELECT uuid, app_name, duration_seconds, device_type, timestamp, google_sub, device_id
         FROM app_usage
         WHERE google_sub = $1 AND uuid IS NOT NULL AND uuid != ''",
    )
    .bind(sub)
    .fetch_all(&state.pool)
    .await
    .map_err(|err| format!("export app_usage: {err}"))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let uuid: String = row.try_get("uuid").ok()?;
            if uuid.trim().is_empty() {
                return None;
            }
            let duration: i64 = row
                .try_get::<i64, _>("duration_seconds")
                .ok()
                .or_else(|| {
                    row.try_get::<f64, _>("duration_seconds")
                        .ok()
                        .map(|value| value as i64)
                })?;
            Some(UsageSyncRow {
                uuid,
                app_name: row.try_get("app_name").ok()?,
                duration_seconds: duration,
                device_type: row.try_get("device_type").ok()?,
                timestamp: row.try_get("timestamp").ok()?,
                google_sub: row.try_get("google_sub").ok(),
                device_id: row.try_get("device_id").ok(),
            })
        })
        .collect())
}

pub async fn apply_usage_rows(state: &DbState, rows: &[UsageSyncRow]) -> Result<(), String> {
    for row in rows {
        sqlx::query(
            "INSERT INTO app_usage (app_name, url, duration_seconds, device_type, timestamp, uuid, google_sub, device_id)
             VALUES ($1, '', $2, $3, $4, $5, $6, $7)
             ON CONFLICT(uuid) DO UPDATE SET
               duration_seconds = excluded.duration_seconds,
               app_name = excluded.app_name,
               device_type = excluded.device_type,
               timestamp = excluded.timestamp,
               google_sub = excluded.google_sub,
               device_id = excluded.device_id",
        )
        .bind(&row.app_name)
        .bind(row.duration_seconds)
        .bind(&row.device_type)
        .bind(&row.timestamp)
        .bind(&row.uuid)
        .bind(&row.google_sub)
        .bind(&row.device_id)
        .execute(&state.pool)
        .await
        .map_err(|err| format!("upsert app_usage: {err}"))?;
    }
    Ok(())
}
