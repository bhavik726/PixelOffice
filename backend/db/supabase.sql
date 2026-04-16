-- ============================================================================
-- PixelOffice Supabase Schema (GitHub-ready)
-- ============================================================================
-- Purpose:
--   This file defines the minimum database structure required by the backend.
--
-- Required tables for this project:
--   1) public.rooms
--
-- Backend currently reads/writes only `public.rooms`.
--
-- How to run:
--   Option A (Supabase SQL Editor): paste entire file and run.
--   Option B (psql):
--     psql "<SUPABASE_DB_URL>" -f backend/db/supabase.sql
--
-- Notes:
--   - Safe for fresh and existing deployments (uses IF NOT EXISTS / ALTER IF EXISTS).
--   - No dependency on auth.users.
--   - Keeps schema in `public` for straightforward access from backend services.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- TABLE: public.rooms
-- Stores both the default public room and user-created private rooms.
-- ============================================================================
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  type text not null check (type in ('public', 'private')),
  password text,
  colyseus_room_id text,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- Public rooms should not require a password.
  -- Private rooms should always have a non-empty password.
  constraint rooms_password_rule check (
    (type = 'public' and (password is null or length(trim(password)) = 0))
    or
    (type = 'private' and password is not null and length(trim(password)) > 0)
  )
);

-- Migration safety for older deployments that already have `rooms`.
alter table if exists public.rooms
  add column if not exists colyseus_room_id text;

alter table if exists public.rooms
  add column if not exists created_by uuid;

alter table if exists public.rooms
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.rooms
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Legacy foreign key from older auth-linked schema is intentionally removed.
alter table if exists public.rooms
  drop constraint if exists rooms_created_by_fkey;

-- Helpful indexes for room listing and join flows.
create index if not exists idx_rooms_type on public.rooms(type);
create unique index if not exists idx_rooms_colyseus_room_id_unique
  on public.rooms(colyseus_room_id)
  where colyseus_room_id is not null;

-- ============================================================================
-- SECURITY HARDENING (RLS + least-privilege client access)
-- ----------------------------------------------------------------------------
-- Why this is safe for current app behavior:
-- - Backend uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- - So enabling RLS here does NOT break backend reads/writes.
-- - Direct client (anon/authenticated) access is reduced to read-only public rooms.
-- ============================================================================

alter table if exists public.rooms enable row level security;

-- Reset policies idempotently for repeatable migrations.
drop policy if exists rooms_public_read on public.rooms;

-- Only allow direct client reads of public rooms.
create policy rooms_public_read
  on public.rooms
  for select
  to anon, authenticated
  using (type = 'public');

-- Least privilege at table level for client roles.
revoke all on table public.rooms from anon, authenticated;
grant select on table public.rooms to anon, authenticated;

commit;

-- ============================================================================
-- OPTIONAL CLEANUP (uncomment if you are removing old auth-based tables)
-- ============================================================================
-- drop table if exists public.room_participants;
-- drop table if exists public.users;

-- ============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================================================
-- 1) Confirm required table exists:
--    select table_name
--    from information_schema.tables
--    where table_schema = 'public' and table_name = 'rooms';
--
-- 2) Inspect columns:
--    select column_name, data_type, is_nullable
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'rooms'
--    order by ordinal_position;
--
-- 3) Inspect indexes:
--    select indexname, indexdef
--    from pg_indexes
--    where schemaname = 'public' and tablename = 'rooms';
