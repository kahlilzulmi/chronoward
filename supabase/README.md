# Supabase + PowerSync prep (Phase 5 — cloud side)

PowerSync + Supabase is the **target** shared ledger. Drive code remains in the app until the Rust PowerSync plugin can compile beside `tauri-plugin-sql` (see `ERRORS.md` / `MEMORY.md`).

This folder is **manual** setup: run SQL in the Supabase dashboard. The app does not apply these migrations automatically yet.

## 1. Env (local)

Copy `.env.example` → `.env` (gitignored). Fill:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → **Project URL** (`https://xxxxx.supabase.co`) — **not** `db.xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Same page → **`anon` `public`** key — **never** `service_role` (secret). `VITE_` vars are exposed to the browser. |
| `VITE_POWERSYNC_URL` | PowerSync Dashboard → instance URL (needed in Phase 5.3+) |

Restart Vite / `tauri dev` after changing env.

If the browser console shows `net::ERR_NAME_NOT_RESOLVED`, the URL host is wrong (often the `db.` Postgres host). Fix `.env` and restart.

If you see **Forbidden use of secret API key in browser**, you pasted the `service_role` secret into `VITE_SUPABASE_ANON_KEY`. Replace it with the `anon` `public` key and restart.

## 2. Create / align `app_usage`

1. Open Supabase → SQL Editor.
2. Run [`001_app_usage.sql`](001_app_usage.sql).
3. Confirm columns match the Vue schema in `src/database/AppSchema.ts`:
   - `id` (uuid)
   - `user_id` (uuid, default `auth.uid()`)
   - `device_type`, `app_name`, `url`, `duration`, `timestamp`

If you already created `app_usage` without `user_id`, use the `alter table` comments at the bottom of that SQL file.

## 3. RLS checklist

After the script:

- [ ] RLS enabled on `public.app_usage`
- [ ] Policies: select / insert / update / delete only when `auth.uid() = user_id`
- [ ] Anon key alone cannot read another user’s rows (test with two accounts when auth lands)

## 4. PowerSync instance

1. Create a PowerSync project/instance and connect this Supabase database.
2. Paste [`powersync-sync-rules.yaml`](powersync-sync-rules.yaml) (or convert to Sync Streams in the dashboard if prompted).
3. Copy the instance URL into `VITE_POWERSYNC_URL`.
4. Do **not** expect the Tauri app to sync yet — Rust `tauri-plugin-powersync` is blocked until `tauri-plugin-sql` / `libsqlite3-sys` coexistence is fixed.

## 5. Privacy note

Drive never uploaded URLs. Prefer storing `url` as `null` in cloud rows until you explicitly decide otherwise. The column exists so the schema matches; the write path in Phase 5.4 should enforce the policy.

## 6. Auth (Profile — Google ID token)

Profile signs into Supabase with **`signInWithIdToken`** using the same Google OAuth ChronoWard already uses for Drive. Email OTP / magic links are not used (they opened the browser instead of Tauri).

1. Fill `.env` (section 1). Restart `npm run desktop:dev`.
2. **Authentication → Providers → Google** — enable.
3. Client ID / Client Secret: use your **Web** OAuth client from Google Cloud (same as `webClientId` in `google-oauth.json` when present).
4. **Authorized Client IDs** (important for native/desktop tokens): add
   - Web client ID (`….apps.googleusercontent.com`)
   - Desktop client ID from `google-oauth.json` (`desktopClientId`)
5. In app: **Profile → Sign in with Google** (runs Drive Google flow, then links the ID token to Supabase).

**Tauri CSP:** `connect-src` must allow `https://*.supabase.co` (already set). Restart Tauri after CSP/env changes.

If Supabase rejects the token (`audience` / client ID errors), double-check Authorized Client IDs match the `aud` claim of the Google ID token (desktop = Desktop client; Android = Web/`serverClientId`).

## 7. Auth + sync note

Settings **Sign in with Google** (Drive) and Profile **Sign in with Google** (Supabase) share the same Google OAuth clients. Drive tokens stay local; Supabase session is separate. PowerSync identity is the Supabase `auth.users` id (`user_id`). Deep-link OAuth (`chronoward://…`) is deferred.