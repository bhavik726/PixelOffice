import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { getRandomAvailableAvatar } from '../utils/avatar';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { supabase } from '../config/supabase';

class Player extends Schema {
  @type('string')
  id = '';

  @type('number')
  x = 0;

  @type('number')
  y = 0;

  @type('number')
  avatarId = 0;
}

class PixelOfficeState extends Schema {
  @type({ map: Player })
  players = new MapSchema<Player>();
}

const CLEANUP_CHECK_INTERVAL_MS = 60_000;
const ROOM_INACTIVITY_TIMEOUT_MS = Number(env.ROOM_INACTIVITY_TIMEOUT_MS || '300000');

export class PixelOfficeRoom extends Room<PixelOfficeState> {
  private dbRoomId: string | null = null;
  private lastActivity = Date.now();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private disposeRequested = false;

  private touchActivity() {
    this.lastActivity = Date.now();
  }

  private startCleanupLoop() {
    this.cleanupInterval = setInterval(() => {
      this.tryCleanupInactiveRoom();
    }, CLEANUP_CHECK_INTERVAL_MS);
  }

  private async tryCleanupInactiveRoom() {
    if (this.disposeRequested) return;

    // RULE: Only dispose if room is completely empty AND has been inactive
    if (this.clients.length > 0) {
      // Room has people - keep it alive forever
      return;
    }

    // Room is empty, check if it's been inactive too long
    const inactivityMs = Date.now() - this.lastActivity;
    const shouldDispose = inactivityMs > ROOM_INACTIVITY_TIMEOUT_MS;

    if (!shouldDispose) return;

    logger.info('PixelOffice cleanup triggered (room empty + inactive)', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      clients: this.clients.length,
      inactivityMs,
      timeoutMs: ROOM_INACTIVITY_TIMEOUT_MS,
    });

    await this.safeDispose();
  }

  private async safeDispose() {
    if (this.disposeRequested) return;
    this.disposeRequested = true;

    try {
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
    this.startCleanupLoop();

    if (typeof options === 'object' && options !== null && 'dbRoomId' in options) {
      const dbRoomId = (options as { dbRoomId?: unknown }).dbRoomId;
      if (typeof dbRoomId === 'string' && dbRoomId.trim().length > 0) {
        this.dbRoomId = dbRoomId;
      }
    }

    logger.info('PixelOffice room created', { roomId: this.roomId, dbRoomId: this.dbRoomId });

    // TODO: support DB room metadata -> Colyseus room options mapping for multi-room scaling.

    this.onMessage(
      'move',
      (client, message: { x?: number; y?: number; dx?: number; dy?: number }) => {
        this.touchActivity();

        const player = this.state.players.get(client.sessionId);
        if (!player) {
          logger.warn('PixelOffice move received for missing player', {
            roomId: this.roomId,
            sessionId: client.sessionId,
            message,
          });
          return;
        }

        const hasAbsolute = typeof message.x === 'number' && typeof message.y === 'number';
        const hasDelta = typeof message.dx === 'number' || typeof message.dy === 'number';

        if (hasAbsolute) {
          player.x = message.x as number;
          player.y = message.y as number;
        } else if (hasDelta) {
          player.x += message.dx ?? 0;
          player.y += message.dy ?? 0;
        } else {
          logger.warn('PixelOffice move received with invalid payload', {
            roomId: this.roomId,
            sessionId: client.sessionId,
            message,
          });
          return;
        }

        logger.info('PixelOffice player moved', {
          roomId: this.roomId,
          sessionId: client.sessionId,
          x: player.x,
          y: player.y,
          raw: message,
        });
      },
    );
  }

  onJoin(client: Client) {
    this.touchActivity();

    // Assign a random available avatar
    const usedAvatars = [...this.state.players.values()].map((player) => player.avatarId);
    const avatarId = getRandomAvailableAvatar(usedAvatars);

    const player = new Player();
    player.id = client.sessionId;
    player.x = 0;
    player.y = 0;
    player.avatarId = avatarId;

    this.state.players.set(client.sessionId, player);
    logger.info('PixelOffice client joined (room will stay alive)', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      sessionId: client.sessionId,
      connectedClients: this.clients.length,
      players: this.state.players.size,
    });
  }

  onLeave(client: Client) {
    this.touchActivity();
    this.state.players.delete(client.sessionId);
    const remainingClients = this.clients.length - 1; // This client is still counted until handler completes
    logger.info('PixelOffice client left', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      sessionId: client.sessionId,
      remainingClients,
      players: this.state.players.size,
      status:
        remainingClients > 0 ? 'Room stays alive' : 'Room will dispose after 5 min of inactivity',
    });
  }

  async onDispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

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
