import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { getRandomAvailableAvatar } from '../utils/avatar';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { supabase } from '../config/supabase';

class PlayerSchema extends Schema {
  @type('string')
  id = '';

  @type('string')
  userId = '';

  @type('number')
  x = 400;

  @type('number')
  y = 300;

  @type('string')
  username = '';

  // Kept for backward-compat with any existing code that expects `name`.
  @type('string')
  name = '';

  @type('string')
  avatarId = '';
}

class PixelOfficeState extends Schema {
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();
}

const ROOM_INACTIVITY_TIMEOUT_MS = Number(env.ROOM_INACTIVITY_TIMEOUT_MS || '300000');

/** Must match frontend `PixelOfficeMap.json` (40×30 tiles @ 32px). */
const MAP_WIDTH_PX = 40 * 32;
const MAP_HEIGHT_PX = 30 * 32;

function clampPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH_PX, x)),
    y: Math.max(0, Math.min(MAP_HEIGHT_PX, y)),
  };
}

export class PixelOfficeRoom extends Room<PixelOfficeState> {
  private dbRoomId: string | null = null;
  /**
   * 'public'  → room is permanent; never auto-dispose when empty.
   * 'private' → room is ephemeral; dispose + full DB delete after 5 min empty.
   */
  private roomVisibility: 'public' | 'private' = 'public';
  private lastActivity = Date.now();
  private disposeRequested = false;
  private emptyRoomTimeout: NodeJS.Timeout | null = null;

  // ─── helpers ────────────────────────────────────────────────────────────────

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

  /**
   * Schedules auto-dispose for PRIVATE rooms only.
   * Public rooms are permanent and must never be auto-disposed.
   */
  private scheduleEmptyRoomDispose() {
    // Public rooms stay alive forever — always available for anyone to join.
    if (this.roomVisibility === 'public') {
      logger.info('PixelOffice public room empty but staying alive (permanent)', {
        roomId: this.roomId,
        dbRoomId: this.dbRoomId,
      });
      return;
    }

    if (this.disposeRequested) return;
    if (this.state.players.size > 0) return;

    this.clearEmptyRoomTimeout();
    const scheduledAt = Date.now();

    this.emptyRoomTimeout = setTimeout(() => {
      if (this.disposeRequested) return;
      if (this.state.players.size > 0) return;

      const inactivityMs = Date.now() - this.lastActivity;
      logger.info('PixelOffice private room cleanup triggered (empty + inactive 5 min)', {
        roomId: this.roomId,
        dbRoomId: this.dbRoomId,
        inactivityMs,
        timeoutMs: ROOM_INACTIVITY_TIMEOUT_MS,
        scheduledSinceMs: Date.now() - scheduledAt,
      });

      void this.safeDispose();
    }, ROOM_INACTIVITY_TIMEOUT_MS);

    logger.info('PixelOffice private room empty — will be deleted in 5 min if still empty', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      timeoutMs: ROOM_INACTIVITY_TIMEOUT_MS,
    });
  }

  private async safeDispose() {
    if (this.disposeRequested) return;
    this.disposeRequested = true;

    try {
      // Enable Colyseus auto-dispose then force disconnect to trigger onDispose.
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

  // ─── lifecycle ───────────────────────────────────────────────────────────────

  onCreate(options: unknown) {
    this.autoDispose = false;
    this.setState(new PixelOfficeState());
    this.touchActivity();

    if (typeof options === 'object' && options !== null) {
      const opts = options as Record<string, unknown>;

      if (typeof opts.dbRoomId === 'string' && opts.dbRoomId.trim().length > 0) {
        this.dbRoomId = opts.dbRoomId.trim();
      }

      if (opts.visibility === 'private') {
        this.roomVisibility = 'private';
      }
    }

    logger.info('PixelOffice room created', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      visibility: this.roomVisibility,
    });

    this.onMessage('move', (client, data: { x?: number; y?: number }) => {
      this.touchActivity();

      const player = this.state.players.get(client.sessionId);
      if (!player) {
        logger.warn('PixelOffice move received for unknown player', {
          roomId: this.roomId,
          sessionId: client.sessionId,
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

      const clamped = clampPosition(data.x, data.y);
      player.x = clamped.x;
      player.y = clamped.y;
    });

    this.onMessage('chat', (client, data: { text?: string }) => {
      this.touchActivity();
      if (typeof data.text !== 'string' || !data.text.trim()) return;

      const player = this.state.players.get(client.sessionId);
      const sender = player?.username ?? client.sessionId;

      this.broadcast('chat', { from: sender, text: data.text.trim() });
    });
  }

  async onJoin(client: Client, options: { token?: string } = {}) {
    this.touchActivity();
    this.clearEmptyRoomTimeout();

    const token = options?.token;
    if (!token) {
      throw new Error('Missing auth token');
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error('Invalid or expired auth token');
    }

    const user = data.user;
    const meta = user.user_metadata as { username?: string; display_name?: string } | null;
    const username = meta?.username ?? meta?.display_name ?? user.email ?? 'Anonymous';

    // Pick a random avatar not currently in use.
    const usedAvatarIds = [...this.state.players.values()]
      .map((p) => Number(p.avatarId))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avatarNumber = getRandomAvailableAvatar(usedAvatarIds);

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.userId = user.id;
    const spawn = clampPosition(
      200 + (this.state.players.size % 6) * 70,
      200 + Math.floor(this.state.players.size / 6) * 70,
    );
    player.x = spawn.x;
    player.y = spawn.y;
    player.username = username;
    player.name = username;
    player.avatarId = String(avatarNumber);

    this.state.players.set(client.sessionId, player);

    logger.info('PixelOffice player joined', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      visibility: this.roomVisibility,
      sessionId: client.sessionId,
      username,
      totalPlayers: this.state.players.size,
    });
  }

  onLeave(client: Client) {
    this.touchActivity();
    const playerLabel = this.getPlayerLabel(client.sessionId);
    this.state.players.delete(client.sessionId);

    // Use players map size (already updated above) as the authoritative count.
    const remaining = this.state.players.size;

    logger.info('PixelOffice player left', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      visibility: this.roomVisibility,
      sessionId: client.sessionId,
      playerLabel,
      remainingPlayers: remaining,
      status:
        remaining > 0
          ? 'Room still active'
          : this.roomVisibility === 'public'
            ? 'Public room stays alive (permanent)'
            : 'Private room will be deleted in 5 min if still empty',
    });

    if (remaining === 0) {
      this.scheduleEmptyRoomDispose();
    }
  }

  async onDispose() {
    this.clearEmptyRoomTimeout();

    logger.info('PixelOffice room disposing', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      visibility: this.roomVisibility,
    });

    if (!this.dbRoomId) return;

    try {
      if (this.roomVisibility === 'private') {
        // Full cleanup: remove participants first (FK constraint), then the room row.
        const { error: participantsError } = await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', this.dbRoomId);

        if (participantsError) {
          logger.warn('Failed to delete room_participants on private room dispose', {
            dbRoomId: this.dbRoomId,
            error: participantsError.message,
          });
        }

        const { error: roomDeleteError } = await supabase
          .from('rooms')
          .delete()
          .eq('id', this.dbRoomId);

        if (roomDeleteError) {
          logger.warn('Failed to delete private room DB record on dispose', {
            dbRoomId: this.dbRoomId,
            error: roomDeleteError.message,
          });
        } else {
          logger.info('Private room fully removed from DB', { dbRoomId: this.dbRoomId });
        }
      } else {
        // Public room: just clear the Colyseus mapping so on next join it re-creates.
        const { error } = await supabase
          .from('rooms')
          .update({ colyseus_room_id: null })
          .eq('id', this.dbRoomId);

        if (error) {
          logger.warn('Failed to clear colyseus_room_id on public room dispose', {
            dbRoomId: this.dbRoomId,
            error: error.message,
          });
        }
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
