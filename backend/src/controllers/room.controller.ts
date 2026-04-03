import { Request, Response } from 'express';
import * as roomService from '../services/room.service';
import { AuthRequest } from '../middleware/auth.middleware';
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
 * Creates a private room for the authenticated user.
 * Public rooms are server-managed and cannot be created via the API.
 *
 * Body: { name: string, description?: string, password: string }
 */
export async function createRoom(req: AuthRequest, res: Response) {
  const { name, description, password } = req.body;
  const userId = req.user?.id || req.user?.sub;

  if (!name || !userId) {
    return res.status(400).json({ message: 'Missing required fields: name' });
  }

  if (!password?.trim()) {
    return res
      .status(400)
      .json({ message: 'A password is required to create a private room' });
  }

  try {
    const room = await roomService.createPrivateRoom(name, description ?? '', userId, password);
    logger.info('Private room created via API', {
      roomId: room.id,
      colyseusRoomId: room.colyseus_room_id,
      createdBy: userId,
    });
    res.status(201).json(room);
  } catch (err: unknown) {
    logger.error('Room create failed', { userId, error: toErrorMessage(err) });
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
export async function joinRoom(req: AuthRequest, res: Response) {
  const { room_id, password } = req.body;
  const userId = req.user?.id || req.user?.sub;

  if (!room_id || !userId) {
    return res.status(400).json({ message: 'Missing required field: room_id' });
  }

  try {
    const joinResult = await roomService.joinRoom(userId, room_id, password);
    logger.info('Room joined', {
      roomId: room_id,
      userId,
      colyseusRoomId: joinResult.colyseus_room_id,
      alreadyJoined: joinResult.alreadyJoined,
    });
    res.json({
      message: joinResult.alreadyJoined ? 'Rejoined room' : 'Joined room',
      colyseus_room_id: joinResult.colyseus_room_id,
      already_joined: joinResult.alreadyJoined,
    });
  } catch (err: unknown) {
    logger.error('Room join failed', { roomId: room_id, userId, error: toErrorMessage(err) });
    res.status(400).json({ message: toErrorMessage(err, 'Failed to join room') });
  }
}

export async function getRoomById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const room = await roomService.getRoomById(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err, 'Failed to fetch room') });
  }
}
