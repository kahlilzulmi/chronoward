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
