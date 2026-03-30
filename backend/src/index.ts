import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as ColyseusServer } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { setupRoutes } from './routes';
import { setupColyseusRooms } from './rooms';
import { errorHandler } from './middleware/error.handler';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach REST API routes
setupRoutes(app);

// Error handler
app.use(errorHandler);

const server = http.createServer(app);

// Colyseus server setup
const colyseusServer = new ColyseusServer({
  server,
});

// Register Colyseus rooms
setupColyseusRooms(colyseusServer);

// Colyseus monitor (admin UI)
app.use('/colyseus', monitor());

const PORT = Number(env.PORT);
const HOST = env.HOST;

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error('Server failed to start', {
    code: error.code,
    message: error.message,
    port: PORT,
    host: HOST,
  });
});

server.listen(PORT, HOST, () => {
  logger.info('Server started', {
    port: PORT,
    host: HOST,
    serverUrl: env.SERVER_URL,
    monitorPath: '/colyseus',
  });
});
