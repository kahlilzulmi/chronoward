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
