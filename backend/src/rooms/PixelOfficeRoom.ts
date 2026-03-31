import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { getRandomAvailableAvatar } from '../utils/avatar';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { supabase } from '../config/supabase';

class PlayerSchema extends Schema {
  @type('string')
  id = '';

  @type('number')
  x = 400;

  @type('number')
  y = 300;

  @type('string')
  name = '';

  @type('number')
  avatarId = 0;
}

class PixelOfficeState extends Schema {
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();
}

const ROOM_INACTIVITY_TIMEOUT_MS = Number(env.ROOM_INACTIVITY_TIMEOUT_MS || '300000');

export class PixelOfficeRoom extends Room<PixelOfficeState> {
  private dbRoomId: string | null = null;
  private lastActivity = Date.now();
  private disposeRequested = false;
  private emptyRoomTimeout: NodeJS.Timeout | null = null;

  private getPlayerLabel(sessionId: string) {
    const sessionIds = [...this.state.players.keys()];
    const index = sessionIds.indexOf(sessionId);
    return index >= 0 ? `Player-${index + 1}` : 'Player-?';
  }

  private touchActivity() {
    this.lastActivity = Date.now();
  }

  private clearEmptyRoomTimeout() {
    if (!this.emptyRoomTimeout) return;
    clearTimeout(this.emptyRoomTimeout);
    this.emptyRoomTimeout = null;
  }

  private scheduleEmptyRoomDispose() {
    if (this.disposeRequested) return;
    if (this.clients.length > 0) return;

    this.clearEmptyRoomTimeout();
    const scheduledAt = Date.now();

    this.emptyRoomTimeout = setTimeout(() => {
      if (this.disposeRequested) return;
      if (this.clients.length > 0) return;

      const inactivityMs = Date.now() - this.lastActivity;
      logger.info('PixelOffice cleanup triggered (room empty + inactive)', {
        roomId: this.roomId,
        dbRoomId: this.dbRoomId,
        clients: this.clients.length,
        inactivityMs,
        timeoutMs: ROOM_INACTIVITY_TIMEOUT_MS,
        scheduledForMs: ROOM_INACTIVITY_TIMEOUT_MS,
        scheduledSinceMs: Date.now() - scheduledAt,
      });

      void this.safeDispose();
    }, ROOM_INACTIVITY_TIMEOUT_MS);
  }

  private async safeDispose() {
    if (this.disposeRequested) return;
    this.disposeRequested = true;

    try {
      // We manage disposal ourselves while active; once cleanup triggers, let Colyseus dispose.
      this.autoDispose = true;
      this.disconnect();
    } catch (err) {
      logger.warn('PixelOffice disconnect during cleanup failed', {
        roomId: this.roomId,
        dbRoomId: this.dbRoomId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onCreate(options: unknown) {
    this.autoDispose = false;
    this.setState(new PixelOfficeState());
    this.touchActivity();

    if (typeof options === 'object' && options !== null && 'dbRoomId' in options) {
      const dbRoomId = (options as { dbRoomId?: unknown }).dbRoomId;
      if (typeof dbRoomId === 'string' && dbRoomId.trim().length > 0) {
        this.dbRoomId = dbRoomId;
      }
    }

    logger.info('PixelOffice room created', { roomId: this.roomId, dbRoomId: this.dbRoomId });

    // TODO: support DB room metadata -> Colyseus room options mapping for multi-room scaling.

    this.onMessage('move', (client, data: { x?: number; y?: number }) => {
      this.touchActivity();

      const player = this.state.players.get(client.sessionId);
      if (!player) {
        logger.warn('PixelOffice move received for missing player', {
          roomId: this.roomId,
          sessionId: client.sessionId,
          data,
        });
        return;
      }

      if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        logger.warn('PixelOffice move received with invalid payload', {
          roomId: this.roomId,
          sessionId: client.sessionId,
          data,
        });
        return;
      }

      player.x = data.x;
      player.y = data.y;

      logger.info('PixelOffice player moved', {
        roomId: this.roomId,
        sessionId: client.sessionId,
        playerLabel: this.getPlayerLabel(client.sessionId),
        x: player.x,
        y: player.y,
      });
    });
  }

  onJoin(client: Client) {
    this.touchActivity();
    this.clearEmptyRoomTimeout();

    // Assign a random available avatar
    const usedAvatars = [...this.state.players.values()].map((player) => player.avatarId);
    const avatarId = getRandomAvailableAvatar(usedAvatars);

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.x = 400;
    player.y = 300;
    player.name = '';
    player.avatarId = avatarId;

    this.state.players.set(client.sessionId, player);
    logger.info('PixelOffice client joined (room will stay alive)', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      sessionId: client.sessionId,
      playerLabel: this.getPlayerLabel(client.sessionId),
      connectedClients: this.clients.length,
      players: this.state.players.size,
    });
  }

  onLeave(client: Client) {
    this.touchActivity();
    const playerLabel = this.getPlayerLabel(client.sessionId);
    this.state.players.delete(client.sessionId);
    const remainingClients = this.clients.length - 1; // This client is still counted until handler completes
    logger.info('PixelOffice client left', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      sessionId: client.sessionId,
      playerLabel,
      remainingClients,
      players: this.state.players.size,
      status:
        remainingClients > 0 ? 'Room stays alive' : 'Room will dispose after 5 min of inactivity',
    });

    if (remainingClients <= 0) {
      this.scheduleEmptyRoomDispose();
    }
  }

  async onDispose() {
    this.clearEmptyRoomTimeout();

    logger.info('PixelOffice room disposed', { roomId: this.roomId, dbRoomId: this.dbRoomId });

    if (!this.dbRoomId) return;

    try {
      const { error } = await supabase
        .from('rooms')
        .update({ colyseus_room_id: null })
        .eq('id', this.dbRoomId);

      if (error) {
        logger.warn('Failed to clear DB room colyseus_room_id on dispose', {
          roomId: this.roomId,
          dbRoomId: this.dbRoomId,
          error: error.message,
        });
      }
    } catch (err) {
      logger.warn('DB sync during room dispose failed', {
        roomId: this.roomId,
        dbRoomId: this.dbRoomId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
