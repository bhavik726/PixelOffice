import { Router } from 'express';
import { getIceServers } from '../controllers/rtc.controller';

const router = Router();

router.get('/ice', getIceServers);

export default router;
