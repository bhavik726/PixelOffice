import { Room, Client } from 'colyseus';
import { Schema, ArraySchema, type } from '@colyseus/schema';
import { logger } from '../utils/logger';

class LobbyState extends Schema {
  @type(['string'])
  clients = new ArraySchema<string>();
}

export class LobbyRoom extends Room<LobbyState> {
  onCreate() {
    this.setState(new LobbyState());
    logger.info('Lobby room created', { roomId: this.roomId });

    this.onMessage('chat', (client, message: { text: string }) => {
      this.broadcast('message', { from: client.sessionId, ...message });
    });
  }

  onJoin(client: Client) {
    this.state.clients.push(client.sessionId);
    logger.info('Lobby client joined', {
      roomId: this.roomId,
      sessionId: client.sessionId,
      clients: this.state.clients.length,
    });
    this.broadcast('joined', { id: client.sessionId });
  }

  onLeave(client: Client) {
    const index = this.state.clients.findIndex((id) => id === client.sessionId);
    if (index !== -1) {
      this.state.clients.splice(index, 1);
    }
    logger.info('Lobby client left', {
      roomId: this.roomId,
      sessionId: client.sessionId,
      clients: this.state.clients.length,
    });
    this.broadcast('left', { id: client.sessionId });
  }
}
