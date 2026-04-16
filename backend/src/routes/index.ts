import { Express } from 'express';
import roomRoutes from './room.routes';

export function setupRoutes(app: Express) {
  app.use('/rooms', roomRoutes);
}
