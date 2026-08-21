const COMMANDS: &[&str] = &[
    "check_permissions",
    "request_permissions",
    "register_listener",
    "schedule_exact_alarm",
    "cancel_exact_alarm",
    "start_ongoing_notification",
    "update_notification_state",
    "clear_ongoing_notification",
    "google_sign_in",
    "drive_appdata_download",
    "drive_appdata_upload",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
