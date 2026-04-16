import { Request, Response } from 'express';
import * as roomService from '../services/room.service';
import { toErrorMessage } from '../utils/errors';
import { logger } from '../utils/logger';

export async function getPublicRooms(req: Request, res: Response) {
  try {
    const rooms = await roomService.getPublicRooms();
    res.json(rooms);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err, 'Failed to get public rooms') });
  }
}

export async function getAllRooms(req: Request, res: Response) {
  try {
    const rooms = await roomService.getAllRooms();
    res.json(rooms);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err, 'Failed to get all rooms') });
  }
}

/**
 * POST /rooms/create
 * Creates a private room for the current guest session.
 * Public rooms are server-managed and cannot be created via the API.
 *
 * Body: { name: string, description?: string, password: string, guest_id?: string }
 */
export async function createRoom(req: Request, res: Response) {
  const { name, description, password, guest_id } = req.body;
  const guestId = typeof guest_id === 'string' ? guest_id.trim() : '';

  if (!name) {
    return res.status(400).json({ message: 'Missing required fields: name' });
  }

  if (!password?.trim()) {
    return res.status(400).json({ message: 'A password is required to create a private room' });
  }

  try {
    const room = await roomService.createPrivateRoom(
      name,
      description ?? '',
      guestId || null,
      password,
    );
    logger.info('Private room created via API', {
      roomId: room.id,
      colyseusRoomId: room.colyseus_room_id,
      createdBy: guestId || null,
    });
    res.status(201).json(room);
  } catch (err: unknown) {
    logger.error('Room create failed', { guestId: guestId || null, error: toErrorMessage(err) });
    res.status(400).json({ message: toErrorMessage(err, 'Failed to create room') });
  }
}

/**
 * POST /rooms/join
 * Joins any room (public or private). Private rooms require a password.
 * Returns the colyseus_room_id to use for the WebSocket connection.
 *
 * Body: { room_id: string, password?: string }
 */
export async function joinRoom(req: Request, res: Response) {
  const { room_id, password } = req.body;

  if (!room_id) {
    return res.status(400).json({ message: 'Missing required field: room_id' });
  }

  try {
    const joinResult = await roomService.joinRoom(room_id, password);
    logger.info('Room joined', {
      roomId: room_id,
      colyseusRoomId: joinResult.colyseus_room_id,
    });
    res.json({
      message: 'Joined room',
      colyseus_room_id: joinResult.colyseus_room_id,
    });
  } catch (err: unknown) {
    logger.error('Room join failed', { roomId: room_id, error: toErrorMessage(err) });
    res.status(400).json({ message: toErrorMessage(err, 'Failed to join room') });
  }
}

export async function getRoomById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const room = await roomService.getRoomById(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err, 'Failed to fetch room') });
  }
}
