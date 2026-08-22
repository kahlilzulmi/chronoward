# Chronoward

A cross-platform Pomodoro timer that tracks which apps and sites you use during work, then syncs that usage across devices.

**Windows** is the desktop host (foreground window + Chromium URL via UI Automation). **Android** is the phone client (Usage Access for the app name; Accessibility is optional for browser URLs).

**Cloud ledger (target):** PowerSync + Supabase (`app_usage`, per-user RLS). See [`supabase/README.md`](supabase/README.md). **Legacy still in the tree:** Google Drive `appDataFolder` (`usage.jsonl`) until the PowerSync Rust plugin can compile beside `tauri-plugin-sql`. Same-Wi-Fi PIN/QR pairing is a fallback, not the source of truth.

This repo is a **private beta**. It is not published on Google Play.

## Stack

- **UI:** Vue 3 (`<script setup>`) + TypeScript + Vue Router 4 + Tailwind CSS 4
- **Shell:** Tauri v2 (Rust)
- **Desktop tracking:** `src-tauri/src/tracker.rs` (Windows-only)
- **Android tracking:** `src-tauri/plugins/chronoward-tracking` (Kotlin)
- **Local cache:** SQLite `sqlite:chronoward.db` via `tauri-plugin-sql` (PowerSync will use `powersync.db` when unblocked)
- **Cloud ledger (target):** Supabase + PowerSync
- **Cloud ledger (legacy in-tree):** Google Drive `appDataFolder`

## Quick start (Windows desktop)

Prerequisites: Node.js 20+, Rust **1.88+** (`rustup update stable`), Visual Studio C++ build tools.

```bat
npm install
copy src-tauri\google-oauth.example.json src-tauri\google-oauth.json
copy .env.example .env
```

Edit `src-tauri/google-oauth.json` with your Google Cloud OAuth client IDs (see [CONTRIBUTING.md](CONTRIBUTING.md#google-sign-in-and-drive-sync)). Fill `.env` with Supabase (and later PowerSync) values — see [supabase/README.md](supabase/README.md). Then:

```bat
npm run desktop:dev
```

Vite is on `http://localhost:1420`. `beforeDevCommand` reuses that server if it is already running, so desktop and Android can share one HMR session.

## Quick start (Android)

Prerequisites: Android Studio, SDK + NDK, an emulator (default AVD `Pixel_7`) or a phone with USB debugging. Gradle must use **JDK 21**, not Android Studio’s bundled JBR 25.

```bat
npm run android:dev
```

In a second terminal, with Vite already up:

```bat
npm run desktop:dev
```

First Android launch: grant **Usage Access**. Accessibility is optional (“Deep URL Tracking”). Onboarding lives at `/onboarding` and does not block first paint.

Sideload **release** APKs: see [CONTRIBUTING.md — Release / sideload APK](CONTRIBUTING.md#release--sideload-apk). Unsigned release APKs will not install.

Details, ports, and known Android landmines: [CONTRIBUTING.md](CONTRIBUTING.md).

## What works today

- Pomodoro clock (work / short break / long break), Settings, Help
- Timer session persistence across kill/background (`chronoward.timer` in localStorage)
- Windows live sensor + intervention (warning notification or block overlay)
- Android Usage Access tracking, optional Accessibility URLs, exact pre-alert alarms, ongoing timer notification
- Local `app_usage` log and dashboard pie chart (today / last 7 days, desktop / mobile / all)
- Desktop LAN pairing host (PIN + QR on port **1422**) and Android PIN/QR client
- Google sign-in + Drive appdata usage sync (desktop verified; Android needs a real `webClientId`)
- Frontend PowerSync/Supabase clients scaffolded; Rust PowerSync plugin blocked on `libsqlite3-sys` vs `tauri-plugin-sql` (see ERRORS.md)

## Docs

| File | Audience |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to run, architecture, invariants, release APK, PR checklist |
| [supabase/README.md](supabase/README.md) | Supabase schema / RLS / PowerSync sync-rules prep |
| [MEMORY.md](MEMORY.md) | Logged architecture decisions — do not contradict without flagging |
| [ERRORS.md](ERRORS.md) | Approaches that failed more than twice |

## License / status

Private beta. Do not commit `src-tauri/google-oauth.json`, `.env`, APKs, `.idsig`, or account files.
