-- Auth-free schema for room selection and guest sessions.
-- Safe to run on fresh setups and existing deployments.

create extension if not exists pgcrypto;

-- Rooms table (no dependency on users/auth tables)
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('public', 'private')),
  password text,
  colyseus_room_id text,
  created_by uuid
);

-- Migration for existing deployments
alter table if exists rooms
add column if not exists colyseus_room_id text;

alter table if exists rooms
add column if not exists created_by uuid;

alter table if exists rooms
drop constraint if exists rooms_created_by_fkey;

-- Legacy auth-linked tables are no longer used.
drop table if exists room_participants;
drop table if exists users;
