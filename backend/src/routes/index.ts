import { Express } from 'express';
import roomRoutes from './room.routes';
import rtcRoutes from './rtc.routes';

export function setupRoutes(app: Express) {
  app.use('/rooms', roomRoutes);
  app.use('/rtc', rtcRoutes);
}
