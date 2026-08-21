#[cfg(target_os = "windows")]
mod tracker;

#[cfg(windows)]
mod windows_notification;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod server;

mod db;
mod drive;
mod google_auth;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_app_usage",
            sql: include_str!("../migrations/001_create_app_usage.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "usage_sync_columns",
            sql: include_str!("../migrations/002_usage_sync_columns.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_chronoward_tracking::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:chronoward.db", migrations)
                .build(),
        );

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_websocket::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(windows)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::insert_app_usage,
        db::get_aggregated_usage,
        google_auth::google_auth_status,
        google_auth::google_sign_in,
        google_auth::google_complete_sign_in,
        google_auth::google_cancel_sign_in,
        google_auth::google_sign_out,
        drive::google_sync_drive,
        drive::google_merge_usage_jsonl,
        server::start_pairing_mode,
        server::stop_pairing_mode,
        windows_notification::show_windows_timer_toast,
        windows_notification::clear_windows_toast,
    ]);

    #[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::insert_app_usage,
        db::get_aggregated_usage,
        google_auth::google_auth_status,
        google_auth::google_sign_in,
        google_auth::google_complete_sign_in,
        google_auth::google_cancel_sign_in,
        google_auth::google_sign_out,
        drive::google_sync_drive,
        drive::google_merge_usage_jsonl,
        server::start_pairing_mode,
        server::stop_pairing_mode,
    ]);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::insert_app_usage,
        db::get_aggregated_usage,
        google_auth::google_auth_status,
        google_auth::google_sign_in,
        google_auth::google_complete_sign_in,
        google_auth::google_cancel_sign_in,
        google_auth::google_sign_out,
        drive::google_sync_drive,
        drive::google_merge_usage_jsonl,
    ]);

    builder
        .setup(|app| {
            db::install(app.handle())?;
            google_auth::install(app.handle());
            #[cfg(target_os = "windows")]
            tracker::start(app.handle().clone());
            #[cfg(windows)]
            windows_notification::init();
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            server::install(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
