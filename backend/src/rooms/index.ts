import { Server as ColyseusServer } from 'colyseus';
import { LobbyRoom } from './LobbyRoom';
import { PixelOfficeRoom } from './PixelOfficeRoom';

export function setupColyseusRooms(server: ColyseusServer) {
  // TODO: dynamically map DB-defined rooms to Colyseus room instances for multi-room scaling.
  server.define('lobby', LobbyRoom);
  server.define('pixel-office', PixelOfficeRoom);
}
