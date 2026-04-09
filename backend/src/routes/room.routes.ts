import { Router } from 'express';
import {
  getPublicRooms,
  createRoom,
  joinRoom,
  getRoomById,
  getAllRooms,
} from '../controllers/room.controller';

const router = Router();

router.get('/public', getPublicRooms);
router.get('/', getAllRooms);
router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/:id', getRoomById);

export default router;
