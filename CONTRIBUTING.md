# Contributing to Chronoward

This is the developer handbook. [README.md](README.md) is the product/setup landing page. Architecture decisions live in [MEMORY.md](MEMORY.md); failed approaches live in [ERRORS.md](ERRORS.md). Read both before changing timer, tracking, pairing, Google, or Android plugin code.

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js 20+ | `npm install` at repo root |
| Rust 1.88+ | System `stable`. Current lockfile needs rustc 1.88+ (`icu_*`, `time`, `plist`, …) |
| Windows desktop | Visual Studio C++ build tools; UI Automation for Chromium URL |
| Android | Android Studio, SDK, NDK, platform-tools. Default AVD: `Pixel_7` |
| JDK **21** | Use `~\.gradle\jdks\jetbrains_s_r_o_-21-amd64-windows.2`. Android Studio JBR 25 cannot run Gradle 8.14 |
| Google Cloud | OAuth Desktop + Android + Web clients. Copy `src-tauri/google-oauth.example.json` → `src-tauri/google-oauth.json` (gitignored) |

IDE: VS Code + Vue - Official + Tauri + rust-analyzer. Open Android native work from `src-tauri/gen/android`, but **edit Kotlin only** under `src-tauri/plugins/chronoward-tracking/android/`.

## Run

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite only (`:1420`, HMR `:1421`) |
| `npm run desktop:dev` | Tauri Windows app (`tauri dev`) |
| `npm run android:dev` | Sets `ANDROID_HOME`, prefers JDK 21, waits for ADB `device`, `adb reverse` 1420/1421, then `tauri android dev --host 127.0.0.1` |
| `npm run build` | `vue-tsc --noEmit` + Vite production bundle |

One Vite process is shared. `scripts/ensure-vite.mjs` exits 0 if `http://127.0.0.1:1420` is already up. Do not start a second Vite; `strictPort` is true.

Android Studio **Run** only works while `tauri android dev` / `tauri android open` is still running. The Gradle script reads CLI options from a WebSocket whose address is under `%TEMP%\com.chronoward.app-server-addr`.

## Ports (do not collide)

| Port | Owner |
| --- | --- |
| **1420** | Vite `devUrl` |
| **1421** | Vite HMR + `adb reverse`. Never bind pairing here |
| **1422** | Desktop pairing WebSocket (`server.rs` preferred; tries through 1431 if taken) |

Debug Android WebView uses localhost + `adb reverse`, not `10.0.2.2` for the host-side wait. Unset `TAURI_DEV_HOST` so Tauri does not pick a Hyper-V/VPN NIC.

## Layout

```
src/                          Vue app
  views/                      Timer, Settings, Help, OnboardingGate
  composables/                Module-level singletons (no Pinia)
  services/analytics.ts       Read-path aggregation filters (local calendar)
  components/                 Overlay, pie chart, pairing client
src-tauri/src/
  lib.rs                      Plugin + command registration
  tracker.rs                  Windows foreground app + Chromium URL (cfg windows)
  windows_notification.rs     Interactive WinRT toasts (cfg windows)
  server.rs                   LAN pairing host (not Android/iOS)
  db.rs                       insert_app_usage / get_aggregated_usage
  google_auth.rs              PKCE desktop; complete_sign_in for Android
  drive.rs                    Drive appdata merge (usage.jsonl)
src-tauri/plugins/chronoward-tracking/
  android/                    Kotlin: Usage Access, Accessibility, FGS, Google, Drive HTTP
src-tauri/migrations/         SQL applied by tauri-plugin-sql
src-tauri/capabilities/       default.json (desktop) + mobile.json (Android/iOS)
scripts/                      ensure-vite.mjs, android-dev.mjs
```

## Architecture

Frontend is a two-view shell plus Help and an Android onboarding route. Native code is split so Windows crates never land on the Android NDK graph, and `rustls`/`ring` never land on Android.

```
┌─────────────────────────────────────────────────────────────┐
│ Vue (WebView)                                               │
│  usePomodoro  ── clock only                                 │
│  useSettings  ── localStorage chronoward.settings           │
│  useTracking  ── duration slices → insert_app_usage         │
│  useIntervention / useSensorFeed / useLiveSensorStatus      │
│  useGoogleAuth / useDriveSync / usePairingHost|Client       │
└────────────┬───────────────────────────┬────────────────────┘
             │ events                    │ invoke
    window-context-changed        Rust commands (db, google, drive, pairing)
    notification-action           plugin:chronoward-tracking|*
             │                           │
   Windows tracker.rs            Android TrackingPlugin.kt
   WinRT toasts                  UsageStats + optional Accessibility
   Axum ws :1422                 FGS ongoing notification, exact alarms
                                 Kotlin Drive HTTP + Google Sign-In
```

**Device bind (G3):** same Google `sub` on PC and phone. Local SQLite is a cache. Drive `appDataFolder` is the shared ledger. LAN PIN/QR on 1422 is same-Wi-Fi fallback.

## Frontend conventions

- Vue 3 `<script setup>` + TypeScript. Pin **`vue-router@4`** (`vue-router@5` needs Vite 7/8; this template is Vite 6).
- **No Pinia.** Shared state is module-level refs in composables.
- **`usePomodoro.ts` is a clock.** Do not put SQL, blocklists, or Google there. Session lifecycle (start / pause / skip / reset / `addFiveMinutes`) and the `notification-action` listener live here because they are clock events.
- **`useSettings.ts`** owns policy: durations, blocklist, ignored apps, intervention mode, `showOngoingTimerNotification`, `persistUrls`. Defaults: 25 / 5 / 15 minutes, long break every **4** work sessions (`LONG_BREAK_INTERVAL`).
- **`useTracking()`** is mounted in `App.vue` so the last duration slice flushes on app unmount, not when leaving the dashboard. Persist a slice only if elapsed **> 2 seconds**.
- **`useIntervention.ts`** evaluates only during Work, after ignored-app substring match. Modes: `warning` (notification, 10s cooldown) or `block` (pause + window takeover + overlay in `App.vue`).
- Routes: `/` timer, `/settings`, `/help`, `/onboarding`. Router `beforeEach` is **sync**. Do not `await check_permissions` there — it can hang and leave an empty `RouterView`. `App.vue` fetches status in the background and redirects.
- Analytics: `getAggregatedUsage` in `src/services/analytics.ts`. Date bounds are **local calendar**, converted to UTC ISO for comparison with insert timestamps. Half-open `[start, end)`. Chart: top 8 apps + **Other**; dark slate card only — do not darken the stone shell.
- Shell: light stone (`bg-stone-100`). Analytics pie is the only dark slate card.

## Rust / Tauri conventions

- `lib.rs` stays a thin setup hook: plugins, migrations, `cfg`-gated command lists, `setup` that starts tracker / pairing / google install.
- Windows-only: `tracker.rs`, `windows_notification.rs`, `uiautomation` + `windows` crate features. Do not add those as default (Android) deps.
- Desktop-only: `server.rs`, `tauri-plugin-websocket`, `reqwest` + `native-tls` (not rustls on Android).
- Mobile-only: `tauri-plugin-barcode-scanner`.
- **Usage insert and aggregate are Rust commands** (`db.rs`). Do not grant `sql:allow-execute` or run SELECT from JS.
- New Tauri commands need: Rust handler, `src-tauri/permissions/*.toml` identifier, and a line in `capabilities/default.json` and/or `mobile.json`.
- `build.rs` embeds `google-oauth.json` if present, else the example file. Rebuild after changing IDs.

## Android plugin

Source of truth:

`src-tauri/plugins/chronoward-tracking/android/src/main/java/com/chronoward/tracking/`

Do not edit duplicate copies under `src-tauri/gen/android/app/.../tracking/`. The app module excludes that package so Kotlin is not compiled twice.

**JS snake_case → Kotlin camelCase.** `start_ongoing_notification` → `startOngoingNotification`.

**Reserved names:** Tauri maps `check_permissions` / `request_permissions` to `Plugin.checkPermissions` / `requestPermissions`. Chronoward **overrides** those for Usage Access. Do not add a second command with those names. Do not route `POST_NOTIFICATIONS` through TrackingPlugin — use `plugin:notification|request_permission`.

Permissions:

| Permission | Required? | Why |
| --- | --- | --- |
| Usage Access | Yes | Foreground app name; onboarding gate |
| Accessibility | Optional | Browser URL only (skip for banking apps) |
| POST_NOTIFICATIONS | For shade | Notifications + ongoing timer |
| SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM | Pre-alert | Screen-off 1-minute warning |
| FOREGROUND_SERVICE + SPECIAL_USE | Ongoing timer | FGS type is `specialUse`, not `dataSync` |
| CAMERA | Pairing QR | `required=false` |

Live Sensor badges: `ACTIVE` (Usage + Accessibility + events), `APP-ONLY` (Usage, no Accessibility), `OFFLINE` (plugin missing, Usage missing, or no events). Desktop uses Windows `isLive`, not Android `pluginAvailable`.

Ongoing notification ID **4201**, pre-alert **4101**. Actions: `pause` | `resume` | `skip` | `add_time` / `add_5m` | `stop` / `reset`. Vue maps those in `usePomodoro`.

Manifest / permission changes require an APK rebuild. Vite HMR cannot add Android permissions.

## Pairing (LAN fallback)

1. Desktop Settings → Start pairing. Host binds `0.0.0.0:1422` (or 1423–1431). PIN is a random 6-digit string **in memory only**.
2. Desktop shows PIN + `ip:port` and a QR (`qrcode.vue`) whose JSON is `{"ip","pin","port"}`. Port must be in the QR because pairing is not 1421.
3. Android: Scan QR **or** type IP + port + PIN. Connect uses the **WebView `WebSocket`**, not `tauri-plugin-websocket` (that crate is desktop-only; ring/clang fails on Windows NDK).
4. Client sends `{ "type": "pairing-handshake", "pin": "......" }`. Server replies `{ "status": "success"|"failure" }` and emits `pairing-connected` / `pairing-disconnected`.

Do not persist the PIN. Do not auto-listen on 1422 at process start — bind only after Start pairing.

## Google sign-in and Drive sync

Copy the example file, then fill real IDs:

```bat
copy src-tauri\google-oauth.example.json src-tauri\google-oauth.json
```

| Field | Role |
| --- | --- |
| `desktopClientId` | Must look like `PROJECTNUMBER-xxxxx.apps.googleusercontent.com` |
| `desktopClientSecret` | Installed-app secret; required for desktop token POST. Not a Web secret |
| `androidClientId` | Android OAuth client; package `com.chronoward.app` |
| `webClientId` | Public. Android Google Sign-In `serverClientId` / `requestIdToken`. **Never put `webClientSecret` in this file** |

Scopes: `openid email profile drive.appdata`. Consent screen must include Drive application data.

- **Desktop:** OAuth 2.0 PKCE in the system browser via `tauri_plugin_opener::open_url` (never `cmd start` — `&` truncates the URL). Loopback `127.0.0.1`. Refresh token stored in app-config `google_account.json` for Drive.
- **Android:** `play-services-auth` in `TrackingPlugin`, then `google_complete_sign_in`. Drive HTTP is Kotlin `HttpURLConnection` + `GoogleAuthUtil`; merge stays in Rust (`google_merge_usage_jsonl`).
- Account file: `google_account.json`. Do not commit it.
- Drive: one `usage.jsonl` in appDataFolder. Merge by `uuid` (**local wins**). **URLs are never written to Drive.** Sync on sign-in, Settings **Sync now**, and every 15 minutes.
- ID token `sub`/`email`/`aud`/`iss` are parsed; JWKS signature verify is not in this slice.

Debug Android SHA-1 (for the Android OAuth client): `BD:68:60:7A:0B:40:39:BC:F9:31:7C:EC:3C:0B:1A:05:AB:9A:0F:91`, package `com.chronoward.app`.

Existing desktop sessions have no refresh token until the user signs in again after Drive scopes were added.

## Database

SQLite database name: `sqlite:chronoward.db`.

- Migration 1: `app_usage (device_type, app_name, url, duration_seconds, timestamp)`
- Migration 2: `uuid`, `google_sub`, `device_id` + indexes

`device_type` is `"desktop"` on Windows tracker payloads and `"mobile"` on Android plugin payloads. Add a new migration file under `src-tauri/migrations/` and register it in `lib.rs` — do not ALTER from JS.

## Invariants (do not contradict without flagging in MEMORY.md)

1. Timer stays a clock (`usePomodoro`). Policy in `useSettings`. Duration SQL in `useTracking` / `db.rs`.
2. No Pinia until more screens truly need a global store.
3. Accessibility stays optional. Usage Access is the only hard Android gate.
4. Pairing port is 1422+, never 1421.
5. Do not compile `tauri-plugin-websocket`, rustls, or ring into the Android target.
6. Do not put Windows crates on the Android crate graph.
7. Do not commit `google-oauth.json`, Web client secrets, or APKs.
8. Do not grant JS raw SQL execute for usage.
9. Plugin Kotlin lives in `plugins/chronoward-tracking`, not generated app copies.
10. Router must not await native permission checks before first paint.

## Landmines (see ERRORS.md)

- Android linker: put NDK `linker` / `CC_*` / `AR_*` in **repo-root** `.cargo/config.toml` (Gradle invokes Cargo from the repo root).
- Gradle JDK: JetBrains 21 on disk, not Studio JBR 25 (`Unsupported class file major version 69`).
- `E Tauri: No permission alias was provided` → you hit base `checkPermissions` / `requestPermissions` instead of the override.
- Google 400 “incomplete request” on Windows → OAuth URL was opened with `cmd start` and truncated at `&`.
- `ring` / `clang.exe not found` on `aarch64-linux-android` → a rustls crate leaked onto the Android target. `cargo check --target aarch64-linux-android` shows the real rustc error; Tauri’s `Io(BeforeSpawn)` dump does not.
- Emulator `offline` + frozen Pixel window → guest/adbd hung; cold-boot with `-no-snapshot-load`, do not spawn a second AVD.
- `POST_NOTIFICATIONS` missing from the merged manifest → notification plugin rejects; rebuild the APK.

## Adding a feature (checklist)

1. Read MEMORY.md for the subsystem you are touching. If you need to reverse a decision, log it first.
2. Prefer a new composable or Rust module over stuffing `usePomodoro` / `lib.rs`.
3. Platform-gate native deps (`cfg(windows)`, `cfg(not(android))`, plugin Kotlin).
4. Add Tauri permission identifiers + capability entries for new commands.
5. Android: name Kotlin methods camelCase; override reserved Plugin methods only on purpose.
6. Do not add `sql:allow-execute` for new queries — add a Rust command.
7. Keep URLs out of Drive payloads.
8. After two failed approaches, log ERRORS.md.

## What not to commit

- `src-tauri/google-oauth.json`
- `google_account.json` / any refresh tokens
- Release APKs and `.idsig` files
- `node_modules`, `dist`, IDE junk (already gitignored)

`google-oauth.example.json` is the only OAuth template that belongs in git. It must not contain a Web application client secret.

## Testing / QA (private beta)

There is no CI suite yet. Before a PR that touches a platform:

- **Desktop:** `npm run desktop:dev` — timer, Live Sensor ACTIVE after switching windows, Settings persist, Google sign-in, Sync now, pairing PIN visible.
- **Android:** `npm run android:dev` — Usage Access onboarding, APP-ONLY without Accessibility, shade pre-alert with screen off, ongoing notification actions, QR or PIN connect to desktop `:1422`.
- **Analytics:** log >2s on both devices, confirm pie filters (today / 7 days, desktop / mobile / all).
- **Intervention:** hit a blocklist domain during Work; ignored apps (cursor, code, …) must not trigger.

Unpackaged Windows toast buttons are flaky after the process exits (no COM activator). Clicks should work while Chronoward is running.
