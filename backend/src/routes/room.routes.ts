import { Router } from 'express';
import { getPublicRooms, createRoom, joinRoom, getRoomById } from '../controllers/room.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/public', getPublicRooms);
router.post('/create', authMiddleware, createRoom);
router.post('/join', authMiddleware, joinRoom);
router.get('/:id', getRoomById);

export default router;
