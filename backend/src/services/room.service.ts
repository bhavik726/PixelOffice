import { supabase } from '../config/supabase';
import { matchMaker } from 'colyseus';
import { Room } from '../models/room.model';
import { toErrorMessage } from '../utils/errors';
import { logger } from '../utils/logger';

// ─── internal helpers ────────────────────────────────────────────────────────

function ensureNonEmpty(value: string, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function throwIfSupabaseError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/** All rooms map to the same Colyseus room handler type. */
function resolveColyseusRoomType(_dbRoomType: 'public' | 'private'): string {
  return 'pixel-office';
}

/**
 * Colyseus v0.15 matchMaker.createRoom returns a RoomListingData object.
 * Extract the roomId from whatever shape comes back.
 */
function extractColyseusRoomId(roomCreateResult: unknown): string | null {
  if (typeof roomCreateResult === 'string' && roomCreateResult.trim().length > 0) {
    return roomCreateResult;
  }

  if (
    typeof roomCreateResult === 'object' &&
    roomCreateResult !== null &&
    'roomId' in roomCreateResult &&
    typeof (roomCreateResult as { roomId: unknown }).roomId === 'string'
  ) {
    return (roomCreateResult as { roomId: string }).roomId;
  }

  return null;
}

async function deleteRoomsAndParticipants(roomIds: string[]): Promise<void> {
  const normalizedRoomIds = roomIds.map((roomId) => roomId.trim()).filter(Boolean);
  if (!normalizedRoomIds.length) {
    return;
  }

  const { error: roomsError } = await supabase.from('rooms').delete().in('id', normalizedRoomIds);

  throwIfSupabaseError(roomsError);
}

/**
 * Creates a Colyseus room and persists its ID back to the DB.
 * Used both when a room is first created AND to recover from a server restart
 * where the Colyseus room no longer exists but the DB record does.
 */
async function createColyseusRoomForDbRoom(room: Room): Promise<string> {
  const colyseusRoomType = resolveColyseusRoomType(room.type);

  const roomCreateResult = await matchMaker.createRoom(colyseusRoomType, {
    dbRoomId: room.id,
    dbRoomType: room.type,
    visibility: room.type,
  });

  const colyseusRoomId = extractColyseusRoomId(roomCreateResult);
  if (!colyseusRoomId) {
    throw new Error('Unable to resolve Colyseus room id from matchMaker result');
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ colyseus_room_id: colyseusRoomId })
    .eq('id', room.id);

  throwIfSupabaseError(updateError);

  return colyseusRoomId;
}

/**
 * Ensures a live Colyseus room exists for `room`. If the stored colyseus_room_id
 * is already set we trust it (only called when we know the mapping is fresh).
 * For recovery flows (post-restart) the caller must have cleared the stale ID first.
 */
async function ensureRealtimeRoomMapping(room: Room): Promise<string> {
  const existing = room.colyseus_room_id?.trim();
  if (existing) {
    try {
      const liveRoom = matchMaker.getRoomById(existing);
      if (liveRoom) {
        return existing;
      }
    } catch (err: unknown) {
      logger.warn('Detected stale Colyseus room mapping; recreating', {
        dbRoomId: room.id,
        staleColyseusRoomId: existing,
        roomType: room.type,
        error: toErrorMessage(err),
      });
    }
  }

  try {
    const colyseusRoomId = await createColyseusRoomForDbRoom(room);

    logger.info('Recovered DB room → Colyseus room mapping', {
      dbRoomId: room.id,
      colyseusRoomId,
      roomType: room.type,
    });

    return colyseusRoomId;
  } catch (err: unknown) {
    throw new Error(`Failed to recover realtime room mapping: ${toErrorMessage(err)}`);
  }
}

async function purgeStalePrivateRooms(): Promise<void> {
  const { data: privateRooms, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('type', 'private');

  throwIfSupabaseError(error);

  const privateRoomIds = (privateRooms || [])
    .map((room) => room.id)
    .filter((roomId): roomId is string => typeof roomId === 'string' && roomId.trim().length > 0);

  if (!privateRoomIds.length) {
    return;
  }

  await deleteRoomsAndParticipants(privateRoomIds);

  logger.info('Purged stale private rooms from DB on startup', {
    deletedRooms: privateRoomIds.length,
  });
}

async function ensureSinglePublicRoom(): Promise<Room> {
  const { data: publicRooms, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('type', 'public');

  throwIfSupabaseError(error);

  const rooms = (publicRooms || []) as Room[];
  const primaryRoom = rooms.find((room) => room.name === DEFAULT_PUBLIC_ROOM_NAME) || null;

  if (!primaryRoom) {
    const { data: insertedRoom, error: insertError } = await supabase
      .from('rooms')
      .insert({
        name: DEFAULT_PUBLIC_ROOM_NAME,
        description: DEFAULT_PUBLIC_ROOM_DESCRIPTION,
        type: 'public',
        created_by: null,
        password: null,
        colyseus_room_id: null,
      })
      .select()
      .single();

    if (insertError || !insertedRoom) {
      throw new Error(
        `Failed to seed default public room: ${insertError?.message || 'Unknown error'}`,
      );
    }

    rooms.push(insertedRoom as Room);
  }

  const canonicalRoom = rooms.find((room) => room.name === DEFAULT_PUBLIC_ROOM_NAME) || rooms[0];

  const duplicateRoomIds = rooms
    .filter((room) => room.id !== canonicalRoom.id)
    .map((room) => room.id)
    .filter((roomId) => typeof roomId === 'string' && roomId.trim().length > 0);

  if (duplicateRoomIds.length) {
    await deleteRoomsAndParticipants(duplicateRoomIds);
    logger.info('Removed duplicate public rooms from DB on startup', {
      deletedRooms: duplicateRoomIds.length,
      keptRoomId: canonicalRoom.id,
    });
  }

  return canonicalRoom;
}

// ─── startup initialisation ──────────────────────────────────────────────────

const DEFAULT_PUBLIC_ROOM_NAME = 'Public Plaza';
const DEFAULT_PUBLIC_ROOM_DESCRIPTION = 'The default public space — always open for everyone.';

/**
 * Called once when the server starts.
 *
 * 1. Deletes stale private rooms and their participation rows from previous runs.
 * 2. Ensures exactly one public room exists in the DB.
 * 3. Spins up one live Colyseus room for that public DB room.
 */
export async function initializeRooms(): Promise<void> {
  logger.info('Initializing rooms on startup...');

  try {
    await purgeStalePrivateRooms();
  } catch (err) {
    logger.warn('Failed to purge stale private rooms on startup', {
      error: toErrorMessage(err),
    });
  }

  let publicRoom: Room;

  try {
    publicRoom = await ensureSinglePublicRoom();
  } catch (err) {
    logger.error('Failed to ensure a single public room on startup', {
      error: toErrorMessage(err),
    });
    return;
  }

  try {
    const colyseusRoomId = await createColyseusRoomForDbRoom(publicRoom);
    logger.info('Public room live on startup', {
      dbRoomId: publicRoom.id,
      name: publicRoom.name,
      colyseusRoomId,
    });
  } catch (err) {
    logger.error('Failed to start live Colyseus room for public DB room on startup', {
      dbRoomId: publicRoom.id,
      error: toErrorMessage(err),
    });
  }

  logger.info('Room initialization complete');
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function getPublicRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('*').eq('type', 'public');
  throwIfSupabaseError(error);
  return data || [];
}

/**
 * Returns all rooms. Private room passwords are masked — the frontend only
 * receives '__LOCKED__' so it knows a password is required without leaking it.
 */
export async function getAllRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id,name,description,type,password,colyseus_room_id');

  throwIfSupabaseError(error);

  return (data || []).map((room) => {
    const isPrivate = room.type === 'private';
    const locked =
      isPrivate && typeof room.password === 'string' && room.password.trim().length > 0;

    const masked: Partial<Room> = {
      id: room.id,
      name: room.name,
      description: room.description ?? '',
      type: room.type,
      colyseus_room_id: room.colyseus_room_id ?? null,
    };

    if (locked) {
      masked.password = '__LOCKED__';
    }

    return masked as Room;
  });
}

/**
 * Creates a new private room for a user.
 * Public rooms are system-seeded; users always create private rooms.
 */
export async function createPrivateRoom(
  name: string,
  description: string,
  created_by: string | null,
  password?: string,
): Promise<Room> {
  const normalizedName = ensureNonEmpty(name, 'name');
  const normalizedCreatedBy = typeof created_by === 'string' ? created_by.trim() : null;
  const normalizedDescription = (description || '').trim();

  if (!password?.trim()) {
    throw new Error('A password is required for private rooms');
  }

  const { data: dbRoom, error: insertError } = await supabase
    .from('rooms')
    .insert({
      name: normalizedName,
      description: normalizedDescription,
      type: 'private',
      created_by: normalizedCreatedBy || null,
      password: password.trim(),
      colyseus_room_id: null,
    })
    .select()
    .single();

  throwIfSupabaseError(insertError);

  try {
    const colyseusRoomId = await createColyseusRoomForDbRoom(dbRoom as Room);

    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', dbRoom.id)
      .single();

    throwIfSupabaseError(updateError);

    logger.info('Private room created with live Colyseus room', {
      dbRoomId: dbRoom.id,
      colyseusRoomId,
    });

    return updatedRoom as Room;
  } catch (err: unknown) {
    // Roll back DB insert if Colyseus room creation fails.
    await supabase.from('rooms').delete().eq('id', dbRoom.id);
    throw new Error(`Failed to create private room: ${toErrorMessage(err)}`);
  }
}

/**
 * Legacy alias kept for compatibility — always creates a private room.
 * @deprecated Use createPrivateRoom() directly.
 */
export async function createRoom(
  name: string,
  description: string,
  type: 'public' | 'private',
  created_by: string | null,
  password?: string,
): Promise<Room> {
  if (type === 'public') {
    throw new Error('Public rooms are managed by the server. Use createPrivateRoom() instead.');
  }
  return createPrivateRoom(name, description, created_by, password);
}

export async function joinRoom(
  room_id: string,
  password?: string,
): Promise<{ colyseus_room_id: string }> {
  const normalizedRoomId = ensureNonEmpty(room_id, 'room_id');

  const room = await getRoomById(normalizedRoomId);
  if (!room) {
    throw new Error('Room not found');
  }

  // Password gate — only for private rooms that have a password set.
  if (room.type === 'private' && room.password && room.password !== (password || '').trim()) {
    throw new Error('Invalid room password');
  }

  // If the Colyseus room mapping is missing (e.g. post-restart for a private room),
  // recreate it on-demand.
  const colyseusRoomId = await ensureRealtimeRoomMapping(room);

  return { colyseus_room_id: colyseusRoomId };
}

export async function getRoomById(id: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle();
  throwIfSupabaseError(error);
  return data as Room;
}
