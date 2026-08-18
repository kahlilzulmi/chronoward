# ERRORS

## 2026-08-18 — Android `linker 'cc' not found` during Gradle/Tauri build

**What didn't work:**
- Placing Android linker config only in `src-tauri/.cargo/config.toml`.
- Retrying Android Studio/Gradle build without changing Cargo config discovery path.

**What worked instead:**
- Add the same linker mapping at repo root: `.cargo/config.toml` so Cargo invoked from repo root can resolve Android NDK linkers.

**Note for next time:**
- For Tauri Android builds launched by Gradle/npm wrappers, assume Cargo is executed from project root; put cross-target linker config in root `.cargo/config.toml`.

## 2026-08-18 — Android Studio `npm.bat` not found in Gradle task

**What didn't work:**
- Assuming Android Studio inherits terminal PATH where `npm` is available.

**What worked instead:**
- Add npm executable fallback lookup in `gen/android/buildSrc/.../BuildTask.kt` to use absolute Windows npm paths if present.

**Note for next time:**
- Android Studio and terminal env vars can differ; when Gradle shells out to Node tooling, include explicit executable resolution on Windows.

## 2026-08-18 — Android Studio `npm.cmd.bat` + WebSocket CLI options panic

**What didn't work:**
- Returning an absolute `npm.cmd` path, then on failure appending `.exe` / `.cmd` / `.bat` to that full path (`C:\Program Files\nodejs\npm.cmd.bat`).
- Using Android Studio Run while `tauri android dev` / `tauri android open` is not running. `android-studio-script` must connect to a local WebSocket whose address is written under `%TEMP%\com.chronoward.app-server-addr`.

**What worked instead:**
- Invoke npm via `cmd.exe /c` on Windows and never append extensions to an already-absolute npm path.
- Surface the original CLI error, and keep the Tauri mobile CLI process running before building from Android Studio.

**Note for next time:**
- If Gradle reports `npm.cmd.bat`, the real failure is usually the first `npm.cmd` run (often the CLI-options WebSocket). Do not treat the last fallback IOException as root cause.

## 2026-08-18 — Android Studio `cmd.exe` exit -1073740791 (0xC0000409)

**What didn't work:**
- Launching npm as `cmd.exe /c C:\Program Files\nodejs\npm.cmd ...`. The space in `Program Files` plus nested `.cmd` wrapping crashed cmd (`STATUS_STACK_BUFFER_OVERRUN`).

**What worked instead:**
- Invoke `node.exe` with `node_modules/@tauri-apps/cli/tauri.js android android-studio-script` from the repo root. Avoid `cmd.exe` and `npm.cmd` in Gradle.

**Note for next time:**
- On Windows Gradle, never `cmd /c` an unquoted path under `Program Files`. Prefer `node.exe` + a `.js` entrypoint over `.cmd` shims.

## 2026-08-18 — Emulator UI frozen while AVD is fine

**What didn't work:**
- Opening a debug Chronoward APK while `tauri android dev` had already exited, or while ADB never became `device`.
- Relying on `devUrl` `http://localhost:1420` plus `adb reverse`. Emulator localhost is not the PC.

**What worked instead:**
- Android `devUrl` `http://10.0.2.2:1420`, Vite `host: true`, HMR on 1421.
- 4s timeout on `check_permissions` so a hung plugin cannot leave an empty `RouterView`.

**Note for next time:**
- `10.0.2.2` is emulator-to-host only. Physical phones need `tauri android dev --host` (LAN IP). Desktop stays on localhost via main config.

## 2026-08-18 — Tauri waits forever: adb missing from PATH

**What didn't work:**
- `npm run tauri android dev` / `npm run android:dev` while `ANDROID_HOME` unset and `adb` not on PATH. Emulator window appeared; CLI never saw a `device`.

**What worked instead:**
- Wrapper script sets SDK env, uses `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, waits for `adb devices` → `device`, then starts Tauri.

**Note for next time:**
- "SDK found" in Tauri logs does not mean `adb` is callable. Device wait uses PATH `adb` unless `ANDROID_HOME`+`platform-tools` are exported in that same process.

## 2026-08-18 — emulator-5554 stays `offline`, UI frozen

**What didn't work:**
- Waiting on `emulator-5554:offline` and spawning a second Pixel_7 because `readyDevice()` only accepted status `device`.
- `adb connect 127.0.0.1:5555` while guest adbd was stuck; still offline.

**What worked instead:**
- Treat offline as "emulator already running": do not start another AVD.
- After ~45s still offline, kill qemu/emulator and cold-boot with `-no-snapshot-load -gpu swiftshader_indirect`.

**Note for next time:**
- `offline` + a frozen Pixel window usually means the Android guest (and adbd) hung on a snapshot/GPU path, not that Vue crashed.

## 2026-08-19 — Android APK assemble fails wrapping Gradle Io(BeforeSpawn)

**What didn't work:**
- Compiling `tauri-plugin-websocket` (rustls/ring) into the Android target on Windows. `ring` looks for `clang.exe` / `aarch64-linux-android-clang`, not Cargo's NDK `*-clang.cmd` linker.
- After removing websocket from Android, `libsqlite3-sys` (tauri-plugin-sql bundled sqlite) failed the same way.
- Tauri's `Failed to assemble APK with Io(BeforeSpawn(...))` dump hid that rustc error.

**What worked instead:**
- Keep `tauri-plugin-websocket` desktop-only. Android pairing uses the WebView `WebSocket` API (`ws://<ip>:1422`).
- Set `CC_*` / `AR_*` for Android targets in root and `src-tauri/.cargo/config.toml` so cc-rs finds NDK clang for sqlite.
- Exclude `com/chronoward/tracking/**` from the app module so plugin Kotlin is not compiled twice.

**Note for next time:**
- Re-run `cargo check --target aarch64-linux-android` (with NDK linkers) to see `ring` / clang, not the wrapped Io error.
- If Gradle fails in ~5–17s with no rustc output, it is the daemon JDK: `Cannot find ... vendor=JetBrains languageVersion=21` or `Unsupported class file major version 69` (JBR 25). Use `~/.gradle/jdks/jetbrains_s_r_o_-21-*`, not Android Studio `jbr`. Run `src-tauri/gen/android/gradlew.bat :app:assembleDebug` with that `JAVA_HOME` to see the real message.

## 2026-08-19 — `E Tauri: No permission alias was provided`

**What didn't work:**
- Kotlin commands named `check_permissions` / `request_permissions`.
- Treating empty `check_permissions` payloads as “plugin available” defaults (hid the miss).
- Assuming the log was from the notification plugin / `POST_NOTIFICATIONS`.

**What worked instead:**
- Override `Plugin.checkPermissions` and `Plugin.requestPermissions`. Tauri maps JS snake_case to those camelCase names; they are reserved for Android permission aliases unless overridden.

**Note for next time:**
- Ignore `MotionEvent.getEventTimeNano()` WebView warnings. If a custom Android plugin command is `foo_bar`, the Kotlin method must be `fooBar`, and must not collide with `Plugin`’s `checkPermissions` / `requestPermissions` unless you intend to override them.

## 2026-08-19 — `[chronoward] notification unavailable` on Android

**What didn't work:**
- `@tauri-apps/plugin-notification` `isPermissionGranted()` / `requestPermission()` via `window.Notification`. Android WebView often has `Notification.permission === "denied"` without a POST_NOTIFICATIONS prompt, so the native plugin was never called.
- Swallowing invoke errors in `ensureNotificationPermission` (`catch { return false }`), which logged only “unavailable”.

**What worked instead:**
- Invoke `plugin:notification|is_permission_granted`, `plugin:notification|request_permission`, and `plugin:notification|notify` directly.
- Log the invoke error / native permission state. Do not route POST_NOTIFICATIONS through TrackingPlugin `requestPermissions`.

**Note for next time:**
- Missing `POST_NOTIFICATIONS` in the merged manifest also makes the notification plugin reject; declare it on the app *and* rebuild the APK. Vite HMR cannot add Android permissions.
