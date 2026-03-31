import { supabase } from '../config/supabase';
import { matchMaker } from 'colyseus';
import { Room } from '../models/room.model';
import { toErrorMessage } from '../utils/errors';
import { logger } from '../utils/logger';

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

function resolveColyseusRoomType(_dbRoomType: 'public' | 'private'): string {
  // TODO: map DB room type to specific Colyseus room handlers when multiple room types are introduced.
  return 'pixel-office';
}

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

export async function getPublicRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('*').eq('type', 'public');
  throwIfSupabaseError(error);
  return data || [];
}

export async function getAllRooms(): Promise<Room[]> {
  // IMPORTANT: never return real private room passwords to the frontend.
  // We only return a "locked" marker so the UI knows a password is required.
  const { data, error } = await supabase.from('rooms').select('id,name,description,type,password');

  throwIfSupabaseError(error);

  return (data || []).map((room) => {
    const isPrivate = room.type === 'private';
    const rawPassword = room.password;
    const locked = isPrivate && typeof rawPassword === 'string' && rawPassword.trim().length > 0;

    const masked: Partial<Room> = {
      id: room.id,
      name: room.name,
      description: room.description ?? '',
      type: room.type,
    };

    if (locked) {
      masked.password = '__LOCKED__';
    }

    return masked as Room;
  });
}

export async function createRoom(
  name: string,
  description: string,
  type: 'public' | 'private',
  created_by: string,
  password?: string,
): Promise<Room> {
  const normalizedName = ensureNonEmpty(name, 'name');
  const normalizedType = type === 'private' ? 'private' : 'public';
  const normalizedCreatedBy = ensureNonEmpty(created_by, 'created_by');
  const normalizedDescription = (description || '').trim();

  if (normalizedType === 'private' && !password?.trim()) {
    throw new Error('password is required for private rooms');
  }

  const { data: dbRoom, error: insertError } = await supabase
    .from('rooms')
    .insert({
      name: normalizedName,
      description: normalizedDescription,
      type: normalizedType,
      created_by: normalizedCreatedBy,
      password: normalizedType === 'private' ? password?.trim() || null : null,
      colyseus_room_id: null,
    })
    .select()
    .single();
  throwIfSupabaseError(insertError);

  const colyseusRoomType = resolveColyseusRoomType(normalizedType);

  try {
    const roomCreateResult = await matchMaker.createRoom(colyseusRoomType, {
      dbRoomId: dbRoom.id,
      dbRoomType: normalizedType,
      visibility: normalizedType,
    });

    const colyseusRoomId = extractColyseusRoomId(roomCreateResult);
    if (!colyseusRoomId) {
      throw new Error('Unable to resolve Colyseus room id');
    }

    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({ colyseus_room_id: colyseusRoomId })
      .eq('id', dbRoom.id)
      .select()
      .single();

    throwIfSupabaseError(updateError);

    logger.info('DB room mapped to Colyseus room', {
      dbRoomId: dbRoom.id,
      colyseusRoomId,
      colyseusRoomType,
    });

    return updatedRoom as Room;
  } catch (err: unknown) {
    await supabase.from('rooms').delete().eq('id', dbRoom.id);
    throw new Error(`Failed to create realtime room: ${toErrorMessage(err)}`);
  }
}

export async function joinRoom(
  user_id: string,
  room_id: string,
  password?: string,
): Promise<{ colyseus_room_id: string; alreadyJoined: boolean }> {
  const normalizedUserId = ensureNonEmpty(user_id, 'user_id');
  const normalizedRoomId = ensureNonEmpty(room_id, 'room_id');

  const room = await getRoomById(normalizedRoomId);
  if (!room) {
    throw new Error('Room not found');
  }

  if (room.type === 'private' && room.password && room.password !== (password || '').trim()) {
    throw new Error('Invalid room password');
  }

  if (!room.colyseus_room_id) {
    throw new Error('Realtime room mapping is missing for this room');
  }

  const { data: existingParticipation, error: existingError } = await supabase
    .from('room_participants')
    .select('user_id')
    .eq('user_id', normalizedUserId)
    .eq('room_id', normalizedRoomId)
    .maybeSingle();

  throwIfSupabaseError(existingError);

  if (existingParticipation) {
    return {
      colyseus_room_id: room.colyseus_room_id,
      alreadyJoined: true,
    };
  }

  const { error: insertError } = await supabase
    .from('room_participants')
    .insert({ user_id: normalizedUserId, room_id: normalizedRoomId });

  throwIfSupabaseError(insertError);

  return {
    colyseus_room_id: room.colyseus_room_id,
    alreadyJoined: false,
  };
}

export async function getRoomById(id: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle();
  throwIfSupabaseError(error);
  return data as Room;
}
