-- Users table
create table if not exists users (
  id uuid primary key,
  email text unique not null,
  username text not null,
  avatar_id int
);

-- Rooms table
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('public', 'private')),
  password text,
  colyseus_room_id text,
  created_by uuid references users(id)
);

-- Migration for existing deployments
alter table if exists rooms
add column if not exists colyseus_room_id text;

-- Room participants
create table if not exists room_participants (
  user_id uuid references users(id),
  room_id uuid references rooms(id),
  primary key (user_id, room_id)
);
