#[cfg(target_os = "windows")]
mod tracker;

#[cfg(windows)]
mod windows_notification;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod server;

use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_app_usage",
        sql: include_str!("../migrations/001_create_app_usage.sql"),
        kind: MigrationKind::Up,
    }];

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

    // Mobile-only crate (`Cargo.toml` target cfg). Unconditional init breaks desktop compile.
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(windows)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        greet,
        server::start_pairing_mode,
        windows_notification::show_windows_timer_toast,
        windows_notification::clear_windows_toast,
    ]);

    #[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
    let builder =
        builder.invoke_handler(tauri::generate_handler![greet, server::start_pairing_mode]);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.invoke_handler(tauri::generate_handler![greet]);

    builder
        .setup(|app| {
            #[cfg(target_os = "windows")]
            tracker::start(app.handle().clone());
            #[cfg(windows)]
            windows_notification::init();
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            server::spawn(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
