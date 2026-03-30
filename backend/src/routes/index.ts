import { Express } from 'express';
import authRoutes from './auth.routes';
import roomRoutes from './room.routes';


export function setupRoutes(app: Express) {
  app.use('/auth', authRoutes);
  app.use('/rooms', roomRoutes);
}
