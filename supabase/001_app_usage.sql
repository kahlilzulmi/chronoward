-- Chronoward: Supabase `app_usage` (run in SQL Editor)
-- Matches src/database/AppSchema.ts (PowerSync local mirror).
-- PowerSync client `id` is text; use uuid as text-compatible PK.

create extension if not exists "pgcrypto";

create table if not exists public.app_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_type text,
  app_name text,
  -- Prefer null until privacy policy is confirmed (Drive never uploaded URLs).
  url text,
  duration integer not null default 0 check (duration >= 0),
  timestamp timestamptz not null default now()
);

create index if not exists app_usage_user_id_idx on public.app_usage (user_id);
create index if not exists app_usage_user_timestamp_idx on public.app_usage (user_id, timestamp desc);

alter table public.app_usage enable row level security;

-- Drop old policies if re-running this script
drop policy if exists "app_usage_select_own" on public.app_usage;
drop policy if exists "app_usage_insert_own" on public.app_usage;
drop policy if exists "app_usage_update_own" on public.app_usage;
drop policy if exists "app_usage_delete_own" on public.app_usage;

create policy "app_usage_select_own"
  on public.app_usage for select
  to authenticated
  using (auth.uid() = user_id);

create policy "app_usage_insert_own"
  on public.app_usage for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "app_usage_update_own"
  on public.app_usage for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "app_usage_delete_own"
  on public.app_usage for delete
  to authenticated
  using (auth.uid() = user_id);

-- If the table already existed without user_id:
-- alter table public.app_usage add column if not exists user_id uuid references auth.users (id);
-- update public.app_usage set user_id = auth.uid() where user_id is null; -- only works in a user session
-- alter table public.app_usage alter column user_id set default auth.uid();
-- alter table public.app_usage alter column user_id set not null;
