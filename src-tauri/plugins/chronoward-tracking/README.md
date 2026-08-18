# Chronoward Android tracking plugin

Native tracking lives here so you can open it in Android Studio without mixing it into the generated app forever.

- `android/` — Kotlin library (UsageStats + optional AccessibilityService)
- `src/lib.rs` — Tauri plugin registration (`chronoward-tracking`)

## Open in Android Studio

1. Open `src-tauri/gen/android` (the generated app).
2. After `npm run tauri android dev` (or first Android build), Tauri links this plugin as an Android library module.
3. Edit Kotlin in:
   `src-tauri/plugins/chronoward-tracking/android/src/main/java/com/chronoward/tracking/`

## Permissions

- **Usage Access** — required for foreground app name.
- **Accessibility** — optional. Only needed to read the browser URL. Leave it off for banking apps.
- **POST_NOTIFICATIONS** — Android 13+ notification permission.
- **SCHEDULE_EXACT_ALARM** / **USE_EXACT_ALARM** — 1-minute pre-alert while Doze / screen-off.
- **SYSTEM_ALERT_WINDOW** — reserved for a later native overlay.

## Commands

- `plugin:chronoward-tracking|check_permissions`
- `plugin:chronoward-tracking|request_permissions` with `{ requestAccessibility: boolean }`
- `plugin:chronoward-tracking|schedule_exact_alarm` with `{ delayMs, notificationTitle, notificationBody }`
- `plugin:chronoward-tracking|cancel_exact_alarm`
- Event: `window-context-changed` (`app_name`, `window_title`, `url`)
