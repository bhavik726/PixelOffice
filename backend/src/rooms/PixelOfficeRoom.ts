import { Room, Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { getRandomAvailableAvatar } from '../utils/avatar';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { ComputerZoneState, ComputerZonePlayer } from './schema/ComputerZoneState';

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

  @type('string')
  characterKey = 'adam';

  @type('string')
  direction = 'down';

  @type('boolean')
  isMoving = false;

  @type('boolean')
  isSitting = false;
}

class PixelOfficeState extends Schema {
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();

  @type(ComputerZoneState)
  computerZone = new ComputerZoneState();
}

const ROOM_INACTIVITY_TIMEOUT_MS = Number(env.ROOM_INACTIVITY_TIMEOUT_MS || '300000');
const CHARACTER_KEYS = ['adam', 'ash', 'lucy', 'nancy'] as const;
type CharacterKey = (typeof CHARACTER_KEYS)[number];

/** Must match frontend `PixelOfficeMap.json` (40×30 tiles @ 32px). */
const MAP_WIDTH_PX = 40 * 32;
const MAP_HEIGHT_PX = 30 * 32;

function clampPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH_PX, x)),
    y: Math.max(0, Math.min(MAP_HEIGHT_PX, y)),
  };
}

function normalizeCharacterKey(value: unknown): CharacterKey | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!CHARACTER_KEYS.includes(normalized as CharacterKey)) {
    return undefined;
  }

  return normalized as CharacterKey;
}

function avatarNumberToCharacterKey(avatarNumber: number): CharacterKey {
  const safeIndex = Math.max(0, Math.floor(avatarNumber) - 1);
  return CHARACTER_KEYS[safeIndex % CHARACTER_KEYS.length];
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 24);
}

function normalizeDirection(value: unknown): 'up' | 'down' | 'left' | 'right' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'up' ||
    normalized === 'down' ||
    normalized === 'left' ||
    normalized === 'right'
  ) {
    return normalized;
  }

  return undefined;
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

  private toComputerZonePayload() {
    const players: Record<
      string,
      {
        sessionId: string;
        peerId: string;
        isSharing: boolean;
        videoEnabled: boolean;
        audioEnabled: boolean;
      }
    > = {};

    this.state.computerZone.players.forEach((zonePlayer, sessionId) => {
      players[sessionId] = {
        sessionId: zonePlayer.sessionId,
        peerId: zonePlayer.peerId,
        isSharing: zonePlayer.isSharing,
        videoEnabled: zonePlayer.videoEnabled,
        audioEnabled: zonePlayer.audioEnabled,
      };
    });

    return { players };
  }

  private broadcastComputerZoneState() {
    this.broadcast('computer-zone-state', this.toComputerZonePayload());
  }

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

    this.onMessage(
      'move',
      (
        client,
        data: {
          x?: number;
          y?: number;
          direction?: string;
          isMoving?: boolean;
          isSitting?: boolean;
        },
      ) => {
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

        const nextDirection = normalizeDirection(data.direction);
        if (nextDirection) {
          player.direction = nextDirection;
        }

        if (typeof data.isMoving === 'boolean') {
          player.isMoving = data.isMoving;
        }

        if (typeof data.isSitting === 'boolean') {
          player.isSitting = data.isSitting;
        }
      },
    );

    this.onMessage('chat', (client, data: { text?: string }) => {
      this.touchActivity();

      if (typeof data.text !== 'string') return;

      const normalizedText = data.text.trim().replace(/\s+/g, ' ');
      if (!normalizedText) return;

      const message = normalizedText.slice(0, 180);

      const player = this.state.players.get(client.sessionId);
      const sender = player?.username ?? this.getPlayerLabel(client.sessionId);

      this.broadcast('chat', {
        sessionId: client.sessionId,
        from: sender,
        text: message,
        timestamp: Date.now(),
      });
    });

    this.onMessage('peer-id', (client, message: { peerId?: string }) => {
      this.touchActivity();

      if (typeof message?.peerId !== 'string') {
        return;
      }

      this.broadcast(
        'peer-id',
        {
          sessionId: client.sessionId,
          peerId: message.peerId,
        },
        { except: client },
      );
    });

    this.onMessage(
      'media-state',
      (
        client,
        message: {
          videoEnabled?: boolean;
          audioEnabled?: boolean;
        },
      ) => {
        this.touchActivity();

        this.broadcast(
          'media-state',
          {
            sessionId: client.sessionId,
            videoEnabled:
              typeof message?.videoEnabled === 'boolean' ? message.videoEnabled : undefined,
            audioEnabled:
              typeof message?.audioEnabled === 'boolean' ? message.audioEnabled : undefined,
          },
          { except: client },
        );
      },
    );

    this.onMessage(
      'computer-zone-join',
      (
        client,
        message: {
          peerId?: string;
          isSharing?: boolean;
          videoEnabled?: boolean;
          audioEnabled?: boolean;
        },
      ) => {
        this.touchActivity();

        const peerId = typeof message?.peerId === 'string' ? message.peerId.trim() : '';
        if (!peerId) {
          return;
        }

        const zonePlayer = new ComputerZonePlayer();
        zonePlayer.sessionId = client.sessionId;
        zonePlayer.peerId = peerId;
        zonePlayer.isSharing = Boolean(message?.isSharing);
        zonePlayer.videoEnabled = Boolean(message?.videoEnabled);
        zonePlayer.audioEnabled = Boolean(message?.audioEnabled);

        this.state.computerZone.players.set(client.sessionId, zonePlayer);
        this.broadcastComputerZoneState();
      },
    );

    this.onMessage('computer-zone-leave', (client) => {
      this.touchActivity();
      this.state.computerZone.players.delete(client.sessionId);
      this.broadcastComputerZoneState();
    });

    this.onMessage(
      'computer-zone-update',
      (
        client,
        message: {
          isSharing?: boolean;
          videoEnabled?: boolean;
          audioEnabled?: boolean;
        },
      ) => {
        this.touchActivity();

        const zonePlayer = this.state.computerZone.players.get(client.sessionId);
        if (!zonePlayer) {
          return;
        }

        if (typeof message?.isSharing === 'boolean') {
          zonePlayer.isSharing = message.isSharing;
        }

        if (typeof message?.videoEnabled === 'boolean') {
          zonePlayer.videoEnabled = message.videoEnabled;
        }

        if (typeof message?.audioEnabled === 'boolean') {
          zonePlayer.audioEnabled = message.audioEnabled;
        }

        this.broadcastComputerZoneState();
      },
    );
  }

  async onJoin(
    client: Client,
    options: { guestId?: string; displayName?: string; characterKey?: string } = {},
  ) {
    this.touchActivity();
    this.clearEmptyRoomTimeout();

    const username = normalizeDisplayName(options.displayName) ?? 'Anonymous';
    const metadataCharacter = normalizeCharacterKey(options.characterKey);

    // Pick a random avatar not currently in use only when no preferred avatar exists.
    const usedAvatarIds = [...this.state.players.values()]
      .map((p) => Number(p.avatarId))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avatarNumber = getRandomAvailableAvatar(usedAvatarIds);
    const characterKey = metadataCharacter ?? avatarNumberToCharacterKey(avatarNumber);
    const normalizedGuestId = normalizeDisplayName(options.guestId)?.replace(/\s+/g, '-') || '';

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.userId = normalizedGuestId || `guest-${client.sessionId}`;
    const MAP_SPAWN_X = 656;
    const MAP_SPAWN_Y = 877;
    const SPAWN_COLUMN_SPACING = 40;
    const SPAWN_ROW_SPACING = 40;
    const SPAWN_COLUMNS = 6;
    const spawn = clampPosition(
      MAP_SPAWN_X + (this.state.players.size % SPAWN_COLUMNS) * SPAWN_COLUMN_SPACING,
      MAP_SPAWN_Y + Math.floor(this.state.players.size / SPAWN_COLUMNS) * SPAWN_ROW_SPACING,
    );
    player.x = spawn.x;
    player.y = spawn.y;
    player.username = username;
    player.name = username;
    player.avatarId = String(avatarNumber);
    player.characterKey = characterKey;
    player.direction = 'down';
    player.isMoving = false;
    player.isSitting = false;

    this.state.players.set(client.sessionId, player);

    logger.info('PixelOffice player joined', {
      roomId: this.roomId,
      dbRoomId: this.dbRoomId,
      visibility: this.roomVisibility,
      sessionId: client.sessionId,
      username,
      totalPlayers: this.state.players.size,
    });

    this.broadcastComputerZoneState();
  }

  onLeave(client: Client) {
    this.touchActivity();
    const playerLabel = this.getPlayerLabel(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.state.computerZone.players.delete(client.sessionId);
    this.broadcastComputerZoneState();

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
