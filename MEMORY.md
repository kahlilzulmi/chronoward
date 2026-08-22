# MEMORY

## 2026-08-18 — Phase 1 architecture

**What was decided:** Composable engine + two-view shell (option 1).
- Timer state in `usePomodoro.ts` (module-level singleton so Timer and Settings share one clock).
- Settings in `useSettings.ts`, persisted to `localStorage`.
- Vue Router: `/` timer, `/settings` settings.
- Pre-alert: fire once when remaining time crosses 60s; `console.log` only for now.
- Defaults: 25 / 5 / 15 minutes, long break every 4 work sessions.

**Why:** Matches the project rule (`usePomodoro.ts`), keeps Phase 1 frontend-only, and avoids Pinia until more screens need a global store.

**What was rejected:**
- Pinia as the single store — heavier than two views need.
- Vite-only app with Tauri later — conflicts with Tauri v2 from day one.
- Android native init in this phase — tracking hooks are a later phase.

**Uncertainties going in:** Long-break interval is required by the state machine but was not listed as a settings field; default is hardcoded to 4, with short + long break durations both exposed because both are core states.

## 2026-08-18 — Vue Router version

**What was decided:** Pin `vue-router@4`.
**Why:** `vue-router@5` requires Vite 7/8; create-tauri-app Vue template ships Vite 6.
**What was rejected:** Forcing vue-router 5 with `--legacy-peer-deps`.

## 2026-08-18 — Rust toolchain

**What was decided:** Upgrade system `stable` with `rustup update stable` (1.86.0 → 1.97.1).
**Why:** Tauri lockfile crates (`darling`, `icu_*`, `time`, `plist`, `serde_with`) require rustc 1.88+.
**What was rejected:** Pinning older crate versions (fragile), and a repo-only `rust-toolchain.toml` (user chose a system upgrade).

## 2026-08-18 — Phase 1.5 dashboard layout

**What was decided:** Control-room grid (option 2).
- Desktop: timer ~2/3 left; Live Sensor + Analytics stacked on the right.
- Mobile: Timer → Sensor → Analytics.
- Mock sensor in `useSensorFeed.ts` (VS Code / `src/main.ts`).
- Focus time and upcoming break derived from the timer; distractions blocked mocked as 0.

**Why:** Dense data-first layout without turning the clock into a peer of the side cards.

**What was rejected:** Stacked bento (timer still a hero) and three equal columns (timer too small).

## 2026-08-18 — Phase 2 Windows tracking

**What was decided:** Option 1 — `tracker.rs` + existing `useSensorFeed`, plus desktop timer UX polish.
- Windows-only module, 1s background thread, `window-context-changed` events.
- Chromium URL via UIA Edit named like “Address”, timeout 0 so the loop never blocks 3s.
- App name from process image; browser detection by title suffix **or** exe name.
- Desktop timer: session dots, elapsed bar, Space/S shortcuts, Live vs Mock badge.

**Why:** Matches the sensor-composable contract from 1.5 and keeps `lib.rs` as a thin setup hook.

**What was rejected:** New `Dashboard.vue`, putting tracking in `lib.rs`, UIA-focused-element-only (no HWND).
**Also rejected:** `uiautomation` without the `input` feature — crate 0.25 does not compile `control` alone.

## 2026-08-18 — Phase 3 intervention engine

**What was decided:** Option 1 — `useIntervention.ts` + settings in `useSettings`, plus ignored-apps bypass.
- Blocklist default: twitter.com, instagram.com, netflix.com.
- Ignored apps default: cursor, code, antigravity (substring match on lowercase app name).
- Mode: `warning` (notification, 10s cooldown) or `block` (pause + window takeover + overlay).
- Evaluate only during Work, after ignore check.
- UI: centered countdown, remaining-time depleting bar, FOCUS/BREAK badge, ACTIVE poller dot.

**Why:** Keeps the timer composable a clock; policy lives with settings; overlay in `App.vue` covers Settings too.

**What was rejected:** Pinia; stuffing blocklist into `usePomodoro.ts`.

## 2026-08-18 — Phase 4 Android tracking strategy

**What was decided:** Use a dedicated Android plugin folder (`src-tauri/plugins/chronoward-tracking`) and keep Accessibility optional.
- Usage Access: required for active-app tracking.
- AccessibilityService: optional for browser URL extraction only.
- Frontend requests Usage first, then optional Accessibility.
- Frontend listens to both global Tauri events and Android plugin events.

**Why:** You want Android Studio work in a separate new folder and want to avoid forcing Accessibility for sensitive apps (m-banking).

**What was rejected:** Mandatory Accessibility for all users.
**Constraint noted:** `tauri android init` is blocked on this machine due missing Android CLI tools, so integration files are prepared and documented for later copy into `src-tauri/gen/android`.

## 2026-08-18 — Phase 4 plugin wired into generated Android app

**What was decided:** Keep Kotlin in `src-tauri/plugins/chronoward-tracking`, register it as Tauri plugin `chronoward-tracking`, and merge Usage Access / overlay / optional Accessibility service into `src-tauri/gen/android`.
- Windows crates (`uiautomation`, `windows`) moved to `cfg(windows)` so Android can compile.
- Accessibility stays optional in Settings; Usage Access is the only required prompt.

**Why:** Android Studio can open `gen/android`; native tracking stays in the dedicated plugin folder.
**What was rejected:** Forcing Accessibility for all users; putting Windows-only crates on the Android build.

## 2026-08-18 — Android linker config location

**What was decided:** Add Android linker configuration at repo root in `.cargo/config.toml` (keep existing `src-tauri/.cargo/config.toml` untouched for now).
- Cargo for Android is invoked from repo root via npm/Gradle, so root `.cargo` is discovered reliably.

**Why:** `linker = "..."` in `src-tauri/.cargo/config.toml` was not applied in the Android Studio/Gradle path, causing `error: linker 'cc' not found`.

**What was rejected and why:**
- Gradle working-directory hacks to force `src-tauri/.cargo` discovery — more brittle than standard Cargo config lookup.
- CLI-only workaround — avoids the issue but does not fix Android Studio workflow.

## 2026-08-18 — Android Studio npm resolution fallback

**What was decided:** Add a Windows fallback in `src-tauri/gen/android/buildSrc/.../BuildTask.kt` that tries absolute npm paths (Program Files / Roaming npm) when PATH-based `npm` lookup fails in Android Studio.

**Why:** Android Studio Gradle environment can miss shell PATH entries, causing `Cannot run program "npm.bat"`.

**What was rejected and why:**
- Requiring users to only build from terminal — works, but does not solve Android Studio run-button flow.

## 2026-08-18 — Android Studio requires a live Tauri CLI WebSocket

**What was decided:** Keep Android Studio integration, but treat `tauri android dev` / `tauri android open` as required while using the Run button.
- `android-studio-script` reads CLI options from a local WebSocket, not from Gradle args alone.
- Gradle `BuildTask` now launches npm through `cmd.exe /c` and does not invent `npm.cmd.bat`.

**Why:** Clicking Run in Android Studio after the CLI process has exited leaves a stale `%TEMP%\com.chronoward.app-server-addr` and panics with connection refused (10061).

**What was rejected and why:**
- Teaching Gradle to compile Rust without the Tauri CLI script — would skip NDK/dev-url/port-forward setup Tauri owns.
- Launching npm through `cmd.exe /c` — crashed on Windows with exit `-1073740791` because `Program Files` is unquoted and `.cmd` is nested. Replaced with direct `node.exe` + `@tauri-apps/cli/tauri.js`.

## 2026-08-18 — Phase 4.5 Android onboarding gate

**What was decided:** Implement Option 1 (Router-Guard First) for Android permissions.
- New `/onboarding` route blocks navigation until Usage Access is granted.
- Startup flow runs `check_permissions` before route entry on Android.
- Onboarding gate rechecks on foreground (`visibilitychange` + `focus`) and auto-routes to dashboard when granted.
- Accessibility remains optional and is prompted later as a dismissible dashboard banner ("Deep URL Tracking").
- Live Sensor state now reports:
  - `ACTIVE` when plugin is available, Usage + Accessibility granted, and live events received.
  - `APP-ONLY` when Usage is granted but Accessibility is missing.
  - `OFFLINE / PERMISSION MISSING` when plugin unavailable, Usage revoked/missing, or live stream absent.

**Why:** Enforces required Usage Access without skip path, while preserving optional Accessibility for sensitive-app safety.

**What was rejected and why:**
- App-shell-only gating in `App.vue` (less explicit route control).
- Full store refactor for permission state machine (heavier than needed for this phase).

## 2026-08-18 — Do not block first paint on check_permissions

**What was decided:** Router `beforeEach` is sync and does not `await fetchStatus()`. App.vue fetches in the background and redirects after status is known. Tracking poll skips `UsageStats` until Usage Access is granted.

**Why:** The emulator showed Chronoward chrome + empty Dashboard. That is an unresolved `beforeEach` (`RouterView` empty). `check_permissions` / first `queryEvents` can hang; waiting on it produced a permanent white main pane. No ADB USB prompt is involved in that UI.

**What was rejected and why:**
- Keeping the hard await in the router — it matches the spec but freezes the only painted shell.

## 2026-08-18 — Settings Devices card (pairing later)

**What was decided:** Option 1 — Settings-only Devices panel.
- Shows this device (Android / Windows), tracking badge matching the dashboard (ACTIVE / APP-ONLY / OFFLINE, or WAITING on desktop).
- Short troubleshooting steps (ADB, localhost Vite, Usage Access / `tauri dev`).
- QR and PIN pairing buttons disabled with copy that they are planned, not wired.

**Why:** One-device app today; pairing needs a later protocol. Reserve the UI without a fake device list.

**What was rejected and why:**
- Device-list stubs and a `/devices` route — extra empty UI before pairing exists.

## 2026-08-18 — Android debug WebView uses localhost + adb reverse

**What was decided:** Remove `tauri.android.conf.json` `devUrl` `http://10.0.2.2:1420`. The CLI wait runs on Windows, which cannot reach `10.0.2.2`. Keep Vite on `0.0.0.0`, wait on `http://localhost:1420`, and after ADB is `device` run `adb reverse tcp:1420/1421`. Unset `TAURI_DEV_HOST` so Tauri does not inject a bad NIC such as `10.127.2.216`.

**Why:** ADB became ready and Vite started, then CLI looped on waiting for `10.0.2.2` while the app requested `10.127.2.216`.

**What was rejected and why:**
- Keeping Android `devUrl` on `10.0.2.2` — emulator can use it, but the host-side wait never succeeds.
- Auto `--host` — picked a Hyper-V/VPN address the emulator cannot fetch.

## 2026-08-18 — Windows `tauri android dev` defaults to a public NIC

**What was decided:** `scripts/android-dev.mjs` always passes `--host 127.0.0.1` unless the caller already passed `--host`. Keep `adb reverse` for 1420/1421. Set `JAVA_HOME` to Android Studio JBR and `org.gradle.java.installations.auto-download=false` so Gradle does not wait on api.foojay.io.

**Why:** On Windows, Tauri uses a “public network address” by default. It picked `10.127.2.216` (virtual NIC). Vite was on `localhost` / `192.168.1.10`. Foojay toolchain download is separate: Gradle daemon JVM discovery when no usable JAVA_HOME is visible to that process.

**What was rejected and why:**
- Leaving default `--host` — wrong NIC, emulator cannot fetch it.

## 2026-08-18 — One Vite for desktop + Android

**What was decided:** `beforeDevCommand` is `node scripts/ensure-vite.mjs`. If `http://127.0.0.1:1420` is already up, it exits 0 and reuses that server. Otherwise it starts `npm run dev`. Added `npm run desktop:dev`.

**Why:** Desktop `tauri dev` and `android:dev` both wanted port 1420, so the second process failed. Shared Vite is how PC and emulator stay in sync (HMR).

**What was rejected and why:**
- Two Vite ports — would desync HMR.
- `strictPort: false` — second instance would bind a random port and miss `devUrl`.

## 2026-08-18 — Session notifications + desktop sensor badge

**What was decided:**
- Desktop Live Sensor uses Windows `isLive`, not Android `pluginAvailable` (that was why desktop showed OFFLINE).
- System notifications on work start, break start, and 1-minute pre-alert; Settings has “Send test notification”.
- Shared `useNotify.ts` + `useLiveSensorStatus.ts`.

**Why:** Phase 1 pre-alert was `console.log` only; Phase 3 only notified on distractions. User asked for work/break notifications and a test.

**What was rejected and why:**
- Firing a notification on every tick/pause — noise. Only phase enter + pre-alert + test + distraction warning.

## 2026-08-18 — android:dev must inject ANDROID_HOME + SDK adb

**What was decided:** `npm run android:dev` runs `scripts/android-dev.mjs`, which sets `ANDROID_HOME`/`ANDROID_SDK_ROOT`, prepends `platform-tools` to PATH, starts Pixel_7 if ADB is empty, waits until a device status is `device`, then launches Tauri.

**Why:** Tauri located the SDK/NDK, started Pixel_7, then polled `adb` from PATH. `adb` is not on PATH, so the CLI looped on "Waiting for emulator" even with the AVD window open.

**What was rejected and why:**
- Asking the user to type the full adb path every time — easy to miss, and Tauri still would not see `adb`.

## 2026-08-19 — Android plugin must override Tauri permission commands

**What was decided:** `TrackingPlugin` overrides `checkPermissions` / `requestPermissions` instead of defining `check_permissions` / `request_permissions`.

**Why:** Tauri Android converts JS `plugin:…|request_permissions` to Kotlin `requestPermissions`. That name is reserved on `Plugin` for runtime-permission aliases. With no `@Permission` aliases, the base method logged `No permission alias was provided` and never opened Usage Access. The same mapping made `check_permissions` hit base `checkPermissions`, which resolves empty — Live Sensor stayed OFFLINE even when Usage Access was granted.

**What was rejected and why:**
- Adding dummy `@Permission` aliases — would silence the log without opening Settings.
- Renaming JS commands (`check_status` / `open_settings`) — extra ACL churn; override is what the notification plugin already does.

## 2026-08-19 — Phase 5.1 exact pre-alert alarms

**What was decided:**
- Declare `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, and `USE_EXACT_ALARM` (timer-core on API 34+).
- Request notification permission from OnboardingGate on mount and again in Settings before “Send test notification”, via `plugin:notification|request_permission` (not `window.Notification`, and not TrackingPlugin’s overridden `requestPermissions`).
- Schedule the 1-minute pre-alert with `AlarmManager.setExactAndAllowWhileIdle` from `schedule_exact_alarm`. Pause/skip/idle calls `cancel_exact_alarm` so a stale alarm cannot fire.
- JS `emitPreAlert` is skipped when the native alarm armed, so a foreground session does not double-notify.

**Why:** `setTimeout` / `setInterval` pause when the Android screen is off. The pre-alert must still hit the shade (and a smartband) on wall-clock time.

**What was rejected and why:**
- Routing POST_NOTIFICATIONS through TrackingPlugin `requestPermissions` — that override is reserved for Usage Access.
- Blocking the dashboard until notifications are granted — Usage Access remains the only hard gate (Phase 4.5).

## 2026-08-19 — Phase 7.1 Android ongoing notification

**What was decided:**
- Foreground service `TimerNotificationService` with `foregroundServiceType="specialUse"` (Pomodoro countdown is not data sync). Notification ID **4201** (PreAlert stays 4101). Channel `chronoward.ongoing_timer`, `IMPORTANCE_LOW`.
- JS invoke names (snake_case) map to Kotlin camelCase:
  - `plugin:chronoward-tracking|start_ongoing_notification` → `startOngoingNotification`
  - `plugin:chronoward-tracking|update_notification_state` → `updateNotificationState`
  - `plugin:chronoward-tracking|clear_ongoing_notification` → `clearOngoingNotification`
- ACL: `allow-start-ongoing-notification`, `allow-update-notification-state`, `allow-clear-ongoing-notification`.
- Action event `notification-action` payload `{ action }` where `action` is `pause` | `resume` | `skip` | `add_time` | `stop`. Receiver updates the shade immediately; Vue `usePomodoro` applies pause/start/skip/`addFiveMinutes`/reset.
- Pause vs Resume: native `isPaused` (Vue `!isRunning`). Running shows Pause; paused shows Resume.
- FGS permissions: `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`. POST_NOTIFICATIONS unchanged from 5.1.

**Why:** Shade controls and a system chronometer keep counting while Android pauses JS timers with the screen off.

**What was rejected and why:**
- `dataSync` FGS type — a focus timer is not background sync; `specialUse` plus the subtype property is the honest fit.
- Kotlin methods named snake_case or `requestPermissions` / `checkPermissions` — Tauri Android reserved/mapping rules from 2026-08-19.

## 2026-08-19 — Phase 6.2 device-isolated usage ingestion

**What was decided:**
- Duration tracking lives in `src/composables/useTracking.ts`, not `usePomodoro.ts` (the timer stays a clock).
- On `window-context-changed`, elapsed = now − `contextStartTime`. Persist only if elapsed **> 2 seconds**, then switch context and reset the start time.
- `device_type` is `"desktop"` on Windows `tracker.rs` payloads and `"mobile"` on Android `TrackingPlugin` payloads.
- Rows go into `app_usage` via `tauri-plugin-sql` / `sqlite:chronoward.db`. SQL failures log and do not crash the timer.
- `useTracking()` is mounted in `App.vue` so the last slice flushes on app unmount, not when leaving the dashboard.

**Why:** Device-isolated ingestion without mixing clock state and SQL into the pomodoro composable. The 2s threshold drops flicker between windows.

**What was rejected and why:**
- Writing SQL from `usePomodoro.ts` — contradicts the clock-only decision from Phase 1 / 3.
- Flushing on TimerView unmount — would drop the current slice when opening Settings.

## 2026-08-19 — Phase 5.2 desktop LAN pairing host

**What was decided:**
- Desktop-only Axum WebSocket server in `src-tauri/src/server.rs`, spawned from the existing `lib.rs` setup hook on Tokio (`tauri::async_runtime`). Gated with `#[cfg(not(any(target_os = "android", target_os = "ios")))]` so Android builds do not pull the host.
- Bind `0.0.0.0:1422` (try through 1431 if taken). Vue `start_pairing_mode` returns `{ ip, port, pin }`. PIN is a random 6-digit string kept in memory only.
- Show PIN + `ip:port` on the desktop Settings Devices card. QR stays disabled. Android PIN entry is not wired.
- WebSocket path `/` and `/ws`. Incoming JSON `{ "type": "pairing-handshake", "pin": "......" }` is accepted or rejected against the in-memory PIN (`{ "status": "success"|"failure" }`). Full pairing session protocol stays later.

**Why:** Pairing QR/PIN was UI-only. The desktop must listen on the LAN so a phone on the same Wi-Fi can connect next.

**What was rejected and why:**
- Port **1421** — Vite HMR and `adb reverse tcp:1420/1421`. Binding pairing there would break Android HMR.
- tokio-tungstenite as the primary crate — Axum `ws` fits Tauri’s existing Tokio 1 / Hyper 1 runtime.
- Persisting the PIN — in-memory is enough until handshake validation exists.

## 2026-08-19 — Phase 6.3 analytics aggregation

**What was decided:**
- Read path lives in `src/services/analytics.ts` as `getAggregatedUsage(filters)`, not in the dashboard view.
- `filters`: `dateRange: "today" | "last7days" | { start: string; end: string }` and `deviceType: "all" | "desktop" | "mobile"`.
- Query groups by `app_name`: `SELECT app_name, SUM(duration_seconds) AS total_seconds FROM app_usage ... GROUP BY app_name ORDER BY total_seconds DESC`. Returns `{ appName, totalSeconds }[]`. Errors log and return `[]`.
- Date bounds are **local calendar**, not UTC-day. `today` is `[local midnight today, local midnight tomorrow)`. `last7days` is `[local midnight 6 days ago, local midnight tomorrow)` (7 local days including today). Preset bounds are bound as UTC ISO-8601 (`toISOString()`) so they compare with `useTracking.ts` insert timestamps. Custom `{ start, end }` is bound as provided. All ranges are half-open: `timestamp >= $1 AND timestamp < $2`. `deviceType !== "all"` adds `AND device_type = $3`. All values are bound (`$1`/`$2`/`$3`), not concatenated.

**Why:** UTC `YYYY-MM-DD` would split the user's day (e.g. 04:00 UTC+7 is still the previous UTC date). Local midnight converted to ISO instants keeps "today" aligned with the wall clock while matching stored UTC ISO strings.

**What was rejected and why:**
- Rebuilding TimerView charts in this phase — user asked for fetch/group only; the analytics card stays on timer-derived mocks until a later wiring pass.
- UTC-only day windows — wrong for non-UTC local calendars.

## 2026-08-19 — Phase 7.3 frontend engine sync & action dispatcher

**What was decided:**
- Settings key: `showOngoingTimerNotification` (boolean, default **true** on Android and Windows). Persisted in `chronoward.settings` with the rest of `useSettings`. Toggle copy: “Show ongoing timer notification with quick actions” in `SettingsView.vue`.
- Native command split:
  - **Android:** `plugin:chronoward-tracking|start_ongoing_notification` / `update_notification_state` / `clear_ongoing_notification` (Kotlin camelCase `startOngoingNotification`, etc.). Wrappers in `useOngoingNotification.ts`; invoke failures no-op.
  - **Windows:** `show_windows_timer_toast` / `clear_windows_toast` (app commands). Pause/resume/add_5m re-show the toast because there is no Windows update command.
- Listener owner: `usePomodoro.ts` module singleton (`startNotificationActionListener`, once). `listen("notification-action")` plus Android `addPluginListener` for plugin `trigger`. App.vue does not bind a second listener.
- Action map: `pause` → `pause()`; `resume` → `start()`; `skip` → `skip()`; `add_5m` / `add_time` → `addFiveMinutes()` (`remainingSeconds += 300`, `targetEndMs += 300000`, refresh native base); `stop` / `reset` → `reset()` (idle, work-duration remaining). Payload may be a string, `action=pause`, or `{ action: "pause" }`.
- Lifecycle: start ticking → start; pause → update `isPaused=true`; resume → update `isPaused=false`; skip/complete/idle/reset → clear. If the toggle is off: never start/update, still listen but ignore actions, and clear if already showing.

**Why:** Phase 7.1/7.2 native commands may land in parallel; JS wrappers must exist so the engine can call them without renaming `start`/`pause`/`skip`. One dispatcher avoids double-binding.

**What was rejected and why:**
- Parallel names (`startTimer` / `pauseTimer`) — they are not the usePomodoro API.
- Putting the listener only in App.vue — the clock already owns session lifecycle; a module singleton there is enough.

## 2026-08-19 — Phase 6.4 usage pie chart

**What was decided:**
- Dashboard Analytics card uses `vue-chartjs` 5 + `chart.js` 4 (`Doughnut` in `src/components/UsagePieChart.vue`).
- Filter UI (no custom date picker): Date **Today | Last 7 Days** (default **today**); Device **All Devices | Desktop | Mobile** (default **all**). Changing a filter refetches `getAggregatedUsage`.
- Dark slate (`bg-slate-900`, `border-slate-800`, legend `text-slate-50`) applies **only to this chart card**. App shell stays light stone (`bg-stone-100`, white/stone timer + Live Sensor cards). Slices are teal/emerald plus cyan/sky so many apps stay distinct; **Other** is slate.
- If more than **8** apps, keep the top 8 by `totalSeconds` and fold the rest into **Other**.
- Phase 6.3’s service API is unchanged. This phase replaces the Analytics card’s timer-derived mock stats with the chart (6.3 had deferred that wiring).

**Why:** User asked for a high-contrast emerald/teal pie on dark slate without turning the Phase 1.5 control-room shell dark.

**What was rejected and why:**
- Darkening the whole dashboard — conflicts with the light stone shell.
- Custom date-range picker — out of scope; only the two presets.
- Showing every app as its own slice — unreadable once the log has many names.

## 2026-08-19 — Phase 5.3 Android PIN client and handshake validation

**What was decided:**
- Pairing WebSocket port is **1422** (`server.rs` `PREFERRED_PORT`). Vite HMR stays on **1421** (`scripts/android-dev.mjs` `adb reverse tcp:1421`). Do not bind pairing on 1421.
- Android client uses **manual IP + port + 6-digit PIN** (no UDP discovery). IP field starts empty; helper text says to copy the IP from the desktop pairing screen.
- Official plugin: `npm run tauri add websocket` → `@tauri-apps/plugin-websocket` + `tauri-plugin-websocket`, registered in `lib.rs`. Capabilities: `websocket:default`, `websocket:allow-connect`, `websocket:allow-send` on `src-tauri/capabilities/default.json` (no separate mobile capability file; that file has no `platforms` filter so Android gets the same ACL).
- Handshake JSON: client sends `{ "type": "pairing-handshake", "pin": "<6 digits>" }` to `ws://<DESKTOP_IP>:<port>/`. Server validates against the in-memory PIN from `start_pairing_mode`, replies `{ "status": "success" }` or `{ "status": "failure" }`, tracks paired clients, emits `pairing-connected` / `pairing-disconnected` to the desktop webview.
- Android Settings Devices shows `<PairingClient />` (Connect → "Connected"). Desktop host PIN UI stays; it also shows "Connected" when `pairing-connected` fires. This supersedes the Phase 5.2 note that PIN validation was later and that Android PIN entry was not wired.

**Why:** Same-Wi-Fi pairing needs a stable first connection without competing with Vite HMR, and both UIs must flip to Connected only after a real PIN match.

**What was rejected and why:**
- Port 1421 for pairing — already reserved for Vite HMR / adb reverse.
- UDP broadcast discovery — user allowed manual IP for now; no discovery crate was already in tree for a trivial add.
- Replacing the desktop host PIN UI with the client — desktop remains the host; Android is the client.
- Browser `WebSocket` instead of the Tauri plugin — user asked for the official plugin.

## 2026-08-19 — Phase 7.2 Windows interactive WinRT toasts

**What was decided:**
- New module `src-tauri/src/windows_notification.rs`, included only with `#[cfg(windows)]` in `lib.rs`. Commands are not registered on Android.
- App commands: `show_windows_timer_toast(session_type, remaining_seconds, is_paused)` and `clear_windows_toast`. ACL: `src-tauri/permissions/windows-toast.toml` identifiers `allow-show-windows-timer-toast` and `allow-clear-windows-toast`, listed in `capabilities/default.json` (same pattern as pairing).
- `windows` crate stays under `[target.'cfg(windows)'.dependencies]`. Added features `Data_Xml_Dom`, `UI_Notifications`, plus `Win32_UI_Shell` (AUMID), `Win32_System_Registry` (HKCU AppUserModelId DisplayName), `Win32_System_SystemInformation` (local end time). Not a default Android dep.
- Adaptive XML: ToastGeneric title/body (body includes local target end time); actions Pause/Skip/+5 Min with `arguments` `pause` | `skip` | `add_5m` and `activationType="background"`. Clicks emit Tauri event `notification-action` with that action name (shared with Android Phase 7.1 / 7.3 Vue listener).
- AUMID `com.chronoward.app` via `SetCurrentProcessExplicitAppUserModelID` plus HKCU `Software\Classes\AppUserModelId\com.chronoward.app` `DisplayName=Chronoward`. The `ToastNotification` is kept alive and `Activated` is subscribed in-process. No COM `INotificationActivationCallback` LocalServer and no Start Menu shortcut.
- Vue was already wired in Phase 7.3 (`useOngoingNotification.ts` + `usePomodoro` listener / `addFiveMinutes`). This phase did not change that.

**Why:** Desktop interactive timer controls in the Windows Action Center, without pulling WinRT into the Android crate graph, and without replacing `@tauri-apps/plugin-notification`.

**What was rejected and why:**
- Making `windows` a default (Android) dependency — breaks `cfg(windows)` tracking split.
- A full COM class factory / Start Menu shortcut installer — more than the minimum for a running unpackaged Tauri process; document as a known limitation.
- Rewriting `usePomodoro` clock logic — 7.3 already owns toast calls and the shared `notification-action` dispatcher.

**Limitations (uncertain until device QA):** Unpackaged Win32 + `activationType="background"` without a COM activator is often flaky. Button clicks should work while Chronoward is running if Windows delivers the WinRT `Activated` event on the live toast object. Clicks after the process exits will not launch or emit. A packaged install with a Start Menu shortcut + COM CustomActivator is the reliable OS contract.

## 2026-08-19 — Phase 5.4 QR pairing and Android camera scan

**What was decided:**
- Desktop Settings pairing UI renders a QR via `qrcode.vue` 3.x. Payload is JSON `{"ip","pin","port"}` from `pairingQrJson()` so Android does not connect to Vite HMR on **1421**. Pairing WebSocket stays on **1422**. The 6-digit PIN remains visible as fallback. QR `:value` is computed from `pairingHost`, so New PIN / IP refresh updates the code.
- Official plugin: `npm run tauri add barcode-scanner` → `@tauri-apps/plugin-barcode-scanner` ^2.4.5 + `tauri-plugin-barcode-scanner` 2.4.5 (Cargo target `cfg(any(target_os = "android", target_os = "ios"))` only). `lib.rs` registers `.plugin(tauri_plugin_barcode_scanner::init())` behind that same cfg so Windows desktop still compiles.
- Capabilities: new `src-tauri/capabilities/mobile.json` (`mobile-capability`, platforms android + iOS) with `barcode-scanner:default` and `barcode-scanner:allow-scan`. Desktop `default.json` is unchanged.
- Android CAMERA: `uses-permission CAMERA` plus `uses-feature camera required=false` in `src-tauri/gen/android/app/src/main/AndroidManifest.xml`. The crate also merges CAMERA at Android build time. No iOS `Info.plist` was generated (`tauri add` did not create `gen/apple`).
- Android `<PairingClient />` **Scan QR Code** button (Android-only) calls `scan()` → invoke `plugin:barcode-scanner|scan`, parses JSON with `parsePairingQr`, fills ip/pin/port, then **`connectWithPin`** (same handshake as Connect). Cancel / invalid JSON leaves the manual fields.

**Why:** Manual IP/PIN is the fallback; QR is the primary same-Wi-Fi path. Port must be in the QR because pairing is not 1421.

**What was rejected and why:**
- Binding pairing or QR connect to 1421 — Vite HMR / `adb reverse tcp:1421`.
- Unconditional `barcode_scanner::init()` on desktop — crate is mobile-only in Cargo.toml; Windows would fail to compile.

## 2026-08-19 — Android pairing uses WebView WebSocket

**What was decided:** `tauri-plugin-websocket` is desktop-only. `usePairingClient.ts` uses the WebView `WebSocket` constructor on Android (and the same path everywhere). Handshake JSON and port 1422 are unchanged. App Gradle excludes `com/chronoward/tracking/**` so plugin Kotlin is not duplicated. `CC_*`/`AR_*` in `.cargo/config.toml` so bundled sqlite compiles. Websocket ACL identifiers removed from `default.json` so Android ACL does not require a plugin that is not in the Android crate graph.

**Why:** rustls/ring cannot cross-compile on Windows NDK (`clang.exe` not found), so `npm run android:dev` failed at assemble APK.

**What was rejected and why:**
- Forcing ring via extra `CC=` in `.cargo/config.toml` — fragile vs NDK `.cmd` wrappers; browser WS is enough for a LAN handshake.
- Replacing the Phase 5.3 handshake — scan only feeds `connectWithPin`.
- iOS plist keys — no apple project in this repo yet.

## 2026-08-19 — Android Gradle JDK is JetBrains 21, not Studio JBR 25

**What was decided:** Point `org.gradle.java.home` / `org.gradle.java.installations.paths` at the already-provisioned Foojay JDK `~/.gradle/jdks/jetbrains_s_r_o_-21-amd64-windows.2`. Keep `gradle-daemon-jvm.properties` on `toolchainVersion=21` / `toolchainVendor=JETBRAINS`. `android-dev.mjs` prefers that JDK 21 over Android Studio `jbr`.

**Why:** Tauri's `gradlew` spawn does not include `JAVA_HOME`. Daemon JVM discovery then looks for JetBrains 21 with Foojay auto-download disabled. Android Studio JBR is now Java 25; Gradle 8.14 cannot run on it (`Unsupported class file major version 69`).

**What was rejected and why:**
- Pinning the daemon to JBR 25 — Gradle 8.14 Groovy/ASM cannot load Java 25 class files.
- Re-enabling Foojay auto-download — hangs when `api.foojay.io` is slow/blocked; JDK 21 is already on disk.
- Deleting the duplicate `app/src/main/java/com/chronoward/tracking/**` copies — user confirmation required. `java.exclude` is not enough (KT-41142); `KotlinCompile.exclude` is applied in `app/build.gradle.kts`.

## 2026-08-19 — Private beta (Approach A) + Google bind (G3)

**What was decided:** Ship a private beta first. Public/Play comes only after the user is satisfied. Device bind is G3: Sign in with Google + Drive application data folder (same `sub` on Windows and Android). Local `sqlite:chronoward.db` stays the cache. LAN PIN/QR on 1422 becomes a same-Wi-Fi fallback, not the source of truth. Iteration 1 does not call Google APIs.

**Why:** All Devices is a lie without a shared ledger. Drive appdata avoids running a Chronoward backend. Firebase/Firestore (G2) was rejected as the default because usage/URLs would live in our Google Cloud project. Identity-only (G1) was rejected because it does not merge the two databases.

**What was rejected and why:**
- Going public/Play in this iteration — `USE_EXACT_ALARM`, Data safety, and store listings wait.
- Drive REST from Rust on the Android NDK target — same ring/clang failure as websocket; Android Drive comes later in Kotlin.
- Auto-listening on `0.0.0.0:1422` at process start — pairing binds only after Start pairing.
- `sql:allow-execute` / JS SELECT — usage insert and aggregate are Rust commands.

**Uncertainties:** OAuth client IDs must be created in Google Cloud Console by the user (G3.0) before G3.1 sign-in can succeed.

## 2026-08-19 — G3.1 Google sign-in (no Drive)

**What was decided:** After Cloud Console, iteration 2 stores Google `sub` + email locally. Desktop uses OAuth 2.0 PKCE in the system browser and a `127.0.0.1` loopback. Android uses `play-services-auth` Google Sign-In in `TrackingPlugin`, then `google_complete_sign_in`. Scopes this slice: `openid email profile` only. ID token payload is parsed for `sub`/`email`/`aud`/`iss`; JWKS signature verify is not in this slice. Refresh tokens are not stored. Drive REST is not called. Account file is `google_account.json` (migrates legacy plaintext `google_sub`). Client IDs are compiled from gitignored `src-tauri/google-oauth.json` via `build.rs` (falls back to the example file).

**Why:** Same `sub` on PC and phone is the bind. Drive appdata stays G3.3. Android must not call Google from NDK Rust (ring/clang). Credential Manager still wants a Web client as `serverClientId`; we pass `webClientId` or Desktop ID.

**What was rejected and why:**
- Drive upload in this slice — user asked for sign-in first.
- rustls reqwest on Android — same NDK failure as websocket; token POST is desktop-only `native-tls`.
- Storing refresh tokens in plaintext — not needed until Drive sync.
- Editing duplicate Kotlin under `src-tauri/gen/android/app/.../tracking/` — plugin source is the source of truth.

**Uncertainties:** The Desktop client ID in `google-oauth.json` does not match Google's usual `PROJECTNUMBER-xxxxx.apps.googleusercontent.com` shape. Token exchange may also need `desktopClientSecret`. Android ID tokens usually need a **Web** client as `webClientId`. Debug SHA-1 for the Android client is `BD:68:60:7A:0B:40:39:BC:F9:31:7C:EC:3C:0B:1A:05:AB:9A:0F:91`, package `com.chronoward.app`.

**Follow-up 2026-08-19:** Windows Google 400 ("incomplete request") was `cmd /C start` truncating the OAuth URL at `&`. Browser open now uses `tauri_plugin_opener::open_url` (`ShellExecute` / `open` crate). Cancel / `access_denied` aborts the loopback wait immediately (does not `join.await` the axum server forever) and Settings shows a Cancel button while waiting.

**Confirmed 2026-08-19:** Desktop G3.1 sign-in works. The Desktop client ID must be `PROJECTNUMBER-xxxxx.apps.googleusercontent.com` (not a secret with `.apps.googleusercontent.com` appended). Token POST requires `desktopClientSecret` in gitignored `google-oauth.json`, then a rebuild. Android sign-in and Drive appdata sync are still unverified. Do not commit `google-oauth.json`.

## 2026-08-19 — Web client secret stays out of the app

**What was decided:** `google-oauth.json` may contain `webClientId` (public) and `desktopClientSecret` (installed-app secret, treated as non-confidential by Google). It must not contain the Web application client secret.

**Why:** Android Google Sign-In only needs the Web client ID as `serverClientId` / `requestIdToken`. The Web secret is a confidential-server credential. `build.rs` embeds the JSON in the Windows exe and the APK, so a Web secret would ship to every device. Chronoward has no backend to hold it. Drive appdata later uses the user ID token / desktop refresh, not a Web secret.

**What was rejected and why:**
- `webClientSecret` next to `webClientId` — looks symmetric with Desktop, but Web secrets are not equivalent to Desktop secrets.
- Using the Web secret for desktop PKCE — Desktop already has its own client + secret.

## 2026-08-19 — G3.3 Drive appDataFolder (approach A)

**What was decided:** One `usage.jsonl` in Drive application data folder. Merge by `uuid` (local wins). URLs are never written to Drive. Desktop uses `reqwest` + refresh token (`access_type=offline`, `prompt=consent` if no refresh yet). Android uses Kotlin `HttpURLConnection` + `GoogleAuthUtil` in `TrackingPlugin`; merge stays in Rust (`google_merge_usage_jsonl`). Sync on sign-in, Settings **Sync now**, desktop every 15 minutes, Android interval from `App.vue`. Refresh token lives in app-config `google_account.json` (private beta; not Web secret).

**Why:** Same `sub` on PC and phone needs a shared ledger without a Chronoward backend.

**What was rejected and why:**
- Monthly chunk files (B) — extra Drive list/create for a private beta.
- Desktop-only (C) — user chose A, so Android Kotlin path shipped in the same design.
- Drive REST from Android Rust — ring/clang.

**Uncertainties:** Existing desktop sessions have no refresh token until **Sign in with Google** again. Android still needs a real `webClientId`. OAuth consent screen must include `drive.appdata`. Refresh tokens in plaintext config are a private-beta limitation.

## 2026-08-19 — Contributor docs live in README + CONTRIBUTING

**What was decided:** `README.md` is the product/setup landing page. `CONTRIBUTING.md` is the developer handbook (architecture, ports, invariants, Android/Google landmines, PR checklist). `MEMORY.md` stays the decision log; `ERRORS.md` stays failed approaches.

**Why:** The previous README was still the Tauri Vue template. A second contributor needs run commands and “do not contradict” rules without reading the whole session history.

**What was rejected and why:**
- One giant `CONTRIBUTING.md` only — weaker GitHub landing page.
- Split `docs/` (setup / architecture / android / windows) — more files to drift from MEMORY.

## 2026-08-21 — Pivot: PowerSync + Supabase replaces Drive ledger

**What was decided:** PowerSync + Supabase becomes the sole shared ledger / source of truth for multi-device usage sync. Google Drive appDataFolder (G3.3) is no longer the target architecture. Phase 5 ships Path B first: install + schema + clients only (5.1–5.2), then pause. Drive Rust/Kotlin/UI code stays in the tree until PowerSync desktop compile is verified; do not delete it in this slice. Do not migrate `tauri-plugin-sql` / `db.rs` / ingestion yet. Local PowerSync file is `powersync.db` (not `chronoward.db`) so it does not collide with `tauri-plugin-sql`. Client schema includes `user_id`. Schema helpers come from `@powersync/common` (official Tauri docs), not re-exported from `@powersync/tauri-plugin`.

**Compile reality (same day):** Enabling `tauri-plugin-powersync` 0.0.6 fails Cargo resolution: `rusqlite 0.39` needs `libsqlite3-sys ^0.37`, while `tauri-plugin-sql` → `sqlx 0.8` pins an older `libsqlite3-sys` (`links = "sqlite3"` allows only one). Bumping our direct `sqlx` to 0.9 does not help while `tauri-plugin-sql` still pulls sqlx 0.8. Even `optional = true` still fails resolution. The crate is therefore **commented out** of `Cargo.toml` (not listed as a dependency). `powersync:default` is not in capabilities until the crate exists. Default `cargo check` (desktop) succeeds. Android NDK was not reached — resolution fails before compile.

**Why:** User pivoted after dual-SQLite and NDK risks were flagged. Drive avoided a Chronoward backend; Supabase + PowerSync is the chosen backend path going forward.

**What was rejected and why:**
- Deleting Drive code in the same pass — keep until compile proof.
- Full 5.3–5.4 connector + tracking rewrite in this pass — pause after 5.1–5.2.
- Sharing `chronoward.db` between PowerSync and `tauri-plugin-sql` — two engines, one file is unsafe.
- Leaving `tauri-plugin-powersync` as a hard (or optional) dependency — breaks Cargo resolution until sql coexistence is solved.

## 2026-08-21 — Unblock PowerSync by waiting on tauri-plugin-sql

**What was decided:** Do not remove `tauri-plugin-sql` or patch/fork sqlite crates for now. Wait for an upstream `tauri-plugin-sql` (or equivalent) that uses sqlx 0.9+ / a `libsqlite3-sys` range compatible with PowerSync’s `rusqlite 0.39` (`^0.37`). Until then: keep frontend PowerSync/Supabase clients; keep Drive code; keep `tauri-plugin-powersync` commented out of `Cargo.toml`; do not start Phase 5.3 connector work that requires the Rust plugin.

**Why:** User chose option 2 after the Phase 5.1–5.2 pause. Lowest risk to the current private-beta path while the ledger pivot is incomplete.

**What was rejected and why:**
- Option 1 (drop `tauri-plugin-sql` now) — premature while ingestion still uses sql plugin + `db.rs`.
- Option 3 (patch/fork) — last resort; more maintenance than waiting.

## 2026-08-21 — Supabase cloud prep (option 1)

**What was decided:** While waiting on `tauri-plugin-sql`, ship manual Supabase prep under `supabase/`: `001_app_usage.sql` (table + `user_id` default `auth.uid()` + RLS), `powersync-sync-rules.yaml` sketch, and `supabase/README.md` checklist. Extend `.env.example` with `VITE_POWERSYNC_URL`. Do not call Supabase/PowerSync APIs from the agent. Do not enable Rust PowerSync or rewrite ingestion.

**Why:** User chose next-slice option 1 so the cloud schema is ready before 5.3.

**What was rejected and why:**
- Auto-applying migrations from the app — Supabase SQL Editor is the source of truth for this prep.
- Syncing URLs by default — keep Drive-era privacy; prefer null `url` until product decides.

## 2026-08-21 — Timer targetEndMs persistence (A P3)

**What was decided:** Persist active pomodoro session to `localStorage` key `chronoward.timer`: phase, `isRunning`, wall-clock `targetEndMs` (when running), remaining (when paused), session duration, work/focus counters, pre-alert flag. On load and on `visibilitychange`/`pagehide`, restore and catch up. If the end time is in the past, replay auto-start chain from the expired end (not “restart full duration from now”) so long kills land on the correct phase. Suppress phase-start notifications during that replay. Idle clears the snapshot.

**Why:** Android/WebView kill/background was leaving timers wrong or stuck; wall-clock end is the source of truth while running.

**What was rejected and why:**
- Persisting only remaining seconds — drifts across kill.
- Completing a single phase then always starting the next from `Date.now()` — wrong if multiple auto-started phases elapsed while dead.

## 2026-08-21 — Release hygiene (A P5)

**What was decided:** Document private-beta APK build + `zipalign`/`apksigner` (debug keystore) in CONTRIBUTING; refresh README for PowerSync-target ledger + `.env` / supabase links; expand `.gitignore` for `.env`, `*-aligned.apk`, `*-unsigned.apk`. Do not commit binaries. Do not delete `src-tauri/2` until the user confirms (accidental npm dump).

**Why:** Sideload failures were often unsigned release APKs; docs were still Drive-first.

**What was rejected and why:**
- Adding a npm script that shells the full Android release pipeline — env (JDK 21 path) is machine-specific; document first.
- Deleting APKs from disk — user may still need them; gitignore is enough.


