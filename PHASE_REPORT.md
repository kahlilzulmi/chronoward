# Chronoward phase report (for review)

Date: 2026-08-18  
Repo: Chronoward (Tauri v2 + Vue 3 + Android plugin)

## Verdict

Phases 1–3 are **feature-complete** on desktop (timer, dashboard, Windows tracking, intervention).  
Phase 4 Android tracking is **wired but not fully live in the emulator yet**.  
Phase 4.5 onboarding is **implemented** (no longer blocks first paint).  
Pairing (QR/PIN) is **UI placeholder only**.  
Session notifications (work/break/pre-alert + test button) were added after this review snapshot.

Treat Android “Live Sensor ACTIVE with URLs” as **not done** until Usage Access is granted on a healthy ADB `device` session and events stream.

---

## Phase status

| Phase | Goal | Status |
| --- | --- | --- |
| 1 Timer engine + two views | Idle/Work/Short/Long, settings, router | **Done** |
| 1.5 Control-room dashboard | Timer + Live Sensor + Analytics | **Done** (desktop layout) |
| 2 Windows native tracking | Foreground app + Chromium URL via UIA | **Done** in `tracker.rs` |
| 3 Intervention | Blocklist, ignore apps, warning notification, block overlay | **Done** |
| 4 Android tracking plugin | Usage Access apps, optional Accessibility URLs | **Code in**; emulator live feed still flaky |
| 4.5 Onboarding gate | Hard gate for Usage Access, optional Accessibility banner | **Done** (gate no longer awaits plugin before first paint) |
| Devices UI | This-device status + troubleshoot + QR/PIN coming soon | **Done** (no real pairing) |
| Shared Vite desktop+Android | One server on 1420 | **Done** (`ensure-vite.mjs`) |
| Session notifications | Test + work/break/pre-alert | **Just added** — verify on both OS |

---

## What works

- Pomodoro state machine, Settings persistence, desktop dashboard.
- Windows `window-context-changed` from `tracker.rs`.
- Intervention warning (notification plugin) and block overlay + window takeover.
- Android plugin crate `chronoward-tracking`, Usage Access + optional Accessibility.
- Dev wrapper: `ANDROID_HOME`, JBR `JAVA_HOME`, cold-boot Pixel_7, `adb reverse` 1420/1421, `--host 127.0.0.1`.
- Desktop Live Sensor was wrongly using Android `pluginAvailable` (always OFFLINE). Status is now platform-aware: desktop WAITING/ACTIVE from Windows events.

---

## What is incomplete / blocked

1. **Android Live Sensor ACTIVE**  
   Depends on: ADB `device` (not `offline`), Usage Access granted, plugin payload, then `window-context-changed`. Empty/`null` `check_permissions` was crashing the UI; guarded now. Still expect APP-ONLY until Accessibility, OFFLINE until Usage Access + events.

2. **QR / PIN pairing**  
   Settings buttons disabled. No protocol, no device list backend.

3. **Emulator/ADB reliability**  
   Guest freeze → `emulator-5554:offline`. Windows Tauri default `--host` picked `10.127.2.216`. Foojay JDK download if `JAVA_HOME` missing. Operational, not product-complete.

4. **Notification verification**  
   Code path exists; confirm OS permission dialogs on Windows and Android 13+ (`POST_NOTIFICATIONS`).

---

## Suggested next phases (for Gemini)

1. Prove Android tracking on a **physical Poco** with Usage Access (emulator was the bottleneck).  
2. Notification QA: Settings “Send test notification”, then Start work / wait for break / 1-minute pre-alert.  
3. Pairing phase: QR on LAN + 6-digit PIN, real device list.  
4. Optional: drop Foojay from `gen/android/settings.gradle` if Gradle still downloads a JDK.

---

## How to run (current)

```bat
npm run android:dev
```

Second terminal (same Vite):

```bat
npm run desktop:dev
```

WebView must be `http://127.0.0.1:1420`, not `10.127.2.216`. Allow notifications when prompted. Grant Usage Access on Android for app tracking.
