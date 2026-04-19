import Phaser from 'phaser';
import Player from '../player';
import { setupCollisions } from '../handlers/collision/collisionHandler';
import { setupChairInteraction } from '../handlers/interactions/chairInteraction';
import { setupWhiteboardInteraction } from '../handlers/interactions/whiteboardInteraction';
import { createCharacterAnims } from '../animations/CharacterAnimations';
import WBOOverlay from '../../ui/WBOOverlay';

const CHARACTER_KEYS = new Set(['adam', 'ash', 'lucy', 'nancy']);

function normalizeCharacterKey(characterKey, avatarId) {
  if (typeof characterKey === 'string') {
    const normalized = characterKey.trim().toLowerCase();
    if (CHARACTER_KEYS.has(normalized)) {
      return normalized;
    }
  }

  const avatarNumber = Number(avatarId);
  if (Number.isFinite(avatarNumber) && avatarNumber > 0) {
    const ordered = ['adam', 'ash', 'lucy', 'nancy'];
    const index = Math.max(0, Math.floor(avatarNumber) - 1) % ordered.length;
    return ordered[index];
  }

  return 'adam';
}

function isNetworkDiagnosticsEnabled() {
  return false;
}

/**
 * Main Game Scene
 * Handles map loading, tileset management, collision setup, and player initialization
 * Can be extended with Colyseus support
 */

export default class MainScene extends Phaser.Scene {
  constructor(config = {}) {
    super(config.key || 'MainScene');
    this.player = null;
    this.tilemap = null;
    this.layers = [];
    this.collidableLayers = [];
    this.room = null; // Colyseus room reference (optional)
    this.playersMap = new Map();
    this.playerRects = new Map();
    this.nameTexts = new Map();
    this.localNameText = null;
    this.localDisplayName = '';
    this.debugText = null;
    this.chairInteraction = null;
    this.whiteboardInteraction = null;
    this.wboOverlay = null;
    this.whiteboardActive = false;
    this.meetingModeActive = false;
    this.videoOverlay = null;
    this.chatBubbles = new Map();
    this.chatOverlay = null;
    this.chatInputActive = false;
    this.isLeavingRoom = false;
    this.leaveRoomButton = null;
    this.computerZoneManager = null;
    this.computerInteractionRects = [];
    this.nearestComputer = null;
    this.computerPromptText = null;
    this.interactKey = null;
    this.computerInteractRange = 18;
    this.worldThemeMode = 'day';
    this.worldBackground = null;
    this.worldSunMoon = null;
    this.worldClouds = [];
    this.networkDiagnosticsEnabled = false;
    this.diagLastFrameAt = 0;
    this.diagRenderWindowStartedAt = 0;
    this.diagRenderFrameCount = 0;
    this.diagRenderTotalDeltaMs = 0;
    this.diagRenderMaxDeltaMs = 0;
    this.diagMoveSendCount = 0;
    this.diagLastCameraLogAt = 0;
    this.moveSendIntervalMs = 50;
    this.lastMoveSendAt = 0;
    this.lastMovePayload = null;
    this.localCorrectionIdleDelayMs = 200;
    this.localCorrectionIgnoreDriftPx = 15;
    this.localCorrectionHardThresholdPx = 60;
    this.localCorrectionSmoothFactor = 0.08;
    this.nameTagYOffset = 6;
    this.chatBubbleYOffset = 24;
    this.nameTagUpdateThresholdPx = 1;
  }

  setNetworkDiagnostics(enabled) {
    this.networkDiagnosticsEnabled = Boolean(enabled);
  }

  getStableScreenPosition(x, y) {
    const camera = this.cameras.main;
    const screenX = (x - camera.scrollX) * camera.zoom;
    const screenY = (y - camera.scrollY) * camera.zoom;

    return {
      x: Math.round(screenX) / camera.zoom + camera.scrollX,
      y: Math.round(screenY) / camera.zoom + camera.scrollY,
    };
  }

  getPlayerSpriteBySessionId(sessionId) {
    if (sessionId === this.room?.sessionId) {
      return this.player?.sprite || null;
    }

    return this.playerRects.get(sessionId) || null;
  }

  getNameTagY(sprite) {
    const baseY = Number(sprite?.y) || 0;
    const spriteHeight = Number(sprite?.displayHeight) || Number(sprite?.height) || 32;
    return baseY - spriteHeight - this.nameTagYOffset;
  }

  getChatBubbleY(sprite) {
    const baseY = Number(sprite?.y) || 0;
    const spriteHeight = Number(sprite?.displayHeight) || Number(sprite?.height) || 32;
    return baseY - spriteHeight - this.chatBubbleYOffset;
  }

  createNameTag(x, y, label) {
    const snapped = this.getStableScreenPosition(x, y);
    const nameTag = this.add.text(snapped.x, snapped.y, label, {
      color: '#ffffff',
      fontFamily: 'VT323, monospace',
      fontSize: '16px',
      stroke: '#000000',
      strokeThickness: 3,
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
    });
    nameTag.setOrigin(0.5, 1);
    nameTag.setDepth(1205);
    nameTag.setResolution(1);
    nameTag.setScrollFactor(1);

    if (this.game?.renderer?.pipelines?.get('TextureTintPipeline')) {
      nameTag.setPipeline('TextureTintPipeline');
    }

    nameTag._lastX = snapped.x;
    nameTag._lastY = snapped.y;

    return nameTag;
  }

  positionNameTag(nameTag, sprite) {
    if (!nameTag || !sprite) {
      return;
    }

    const snapped = this.getStableScreenPosition(sprite.x, this.getNameTagY(sprite));
    const shouldUpdate =
      !Number.isFinite(nameTag._lastX) ||
      !Number.isFinite(nameTag._lastY) ||
      Math.abs(nameTag._lastX - snapped.x) > this.nameTagUpdateThresholdPx ||
      Math.abs(nameTag._lastY - snapped.y) > this.nameTagUpdateThresholdPx;

    if (shouldUpdate) {
      nameTag.setPosition(snapped.x, snapped.y);
      nameTag._lastX = snapped.x;
      nameTag._lastY = snapped.y;
    }
  }

  positionChatBubble(textObject, sprite, fallbackX, fallbackY) {
    if (!textObject) {
      return null;
    }

    if (sprite) {
      const snapped = this.getStableScreenPosition(sprite.x, this.getChatBubbleY(sprite));
      textObject.setPosition(snapped.x, snapped.y);
      return snapped;
    }

    const snapped = this.getStableScreenPosition(fallbackX, (Number(fallbackY) || 0) - 56);
    textObject.setPosition(snapped.x, snapped.y);
    return snapped;
  }
  
  /**
   * Preload assets (map JSON and tileset images)
   */
  preload() {
    // Load the Tiled map JSON
    this.load.tilemapTiledJSON(
      'pixel-office-map',
      '/assets/maps/PixelOfficeMap.json'
    );
    
    // Load only the tileset images that are embedded (not external .tsx references)
    this.load.image('FloorAndGround', '/assets/tiles/FloorAndGround.png');
    this.load.image('Modern_Office_Black_Shadow', '/assets/tiles/Modern_Office_Black_Shadow.png');
    this.load.image('chair', '/assets/tiles/chair.png');
    this.load.image('Basement', '/assets/tiles/Basement.png');
    this.load.image('Generic', '/assets/tiles/Generic.png');
    this.load.image('Room_Builder_Walls', '/assets/tiles/Room_Builder_Walls.png');
    this.load.image('bg_backdrop_day', '/assets/background/backdrop_day.png');
    this.load.image('bg_backdrop_night', '/assets/background/backdrop_night.png');
    this.load.image('bg_cloud_day', '/assets/background/cloud_day.png');
    this.load.image('bg_cloud_night', '/assets/background/cloud_night.png');
    this.load.image('bg_moon', '/assets/background/moon.png');

    this.load.atlas(
      'adam',
      '/assets/character/single/adam.png',
      '/assets/character/single/adam.json',
    );
    this.load.atlas(
      'ash',
      '/assets/character/single/ash.png',
      '/assets/character/single/ash.json',
    );
    this.load.atlas(
      'lucy',
      '/assets/character/single/lucy.png',
      '/assets/character/single/lucy.json',
    );
    this.load.atlas(
      'nancy',
      '/assets/character/nancy.png',
      '/assets/character/nancy.json',
    );
  }

  ensureSunTexture() {
    if (this.textures.exists('bg_sun')) {
      return;
    }

    const texture = this.textures.createCanvas('bg_sun', 64, 64);
    const context = texture.getContext();

    context.clearRect(0, 0, 64, 64);

    const gradient = context.createRadialGradient(32, 32, 6, 32, 32, 28);
    gradient.addColorStop(0, '#fff7c2');
    gradient.addColorStop(0.55, '#facc15');
    gradient.addColorStop(1, '#f59e0b');

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(32, 32, 20, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(250, 204, 21, 0.7)';
    context.lineWidth = 3;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const innerX = 32 + Math.cos(angle) * 24;
      const innerY = 32 + Math.sin(angle) * 24;
      const outerX = 32 + Math.cos(angle) * 29;
      const outerY = 32 + Math.sin(angle) * 29;
      context.beginPath();
      context.moveTo(innerX, innerY);
      context.lineTo(outerX, outerY);
      context.stroke();
    }

    texture.refresh();
  }
  
  /**
   * Create the scene (called after preload)
   */
  create() {
    this.networkDiagnosticsEnabled = this.networkDiagnosticsEnabled || isNetworkDiagnosticsEnabled();

    // Create the tilemap from the loaded JSON with explicit tile dimensions
    this.tilemap = this.make.tilemap({
      key: 'pixel-office-map',
      tileWidth: 32,
      tileHeight: 32,
    });

    // Bind tilesets using exact names from Tiled JSON
    
    const tilesets = (this.tilemap.tilesets || [])
      .map((tilesetData) => {
        const boundTileset = this.tilemap.addTilesetImage(
          tilesetData.name,
          tilesetData.name,
        );

        if (!boundTileset) {
          console.warn(
            `Failed to bind tileset "${tilesetData.name}" (firstgid: ${tilesetData.firstgid})`,
          );
        }

        return boundTileset;
      })
      .filter((ts) => ts !== null);

    this.ensureSunTexture();
    this.createWorldBackdrop();
    
    // Create all tile layers (skip only object layers "interactions" and "player_spawn")
    this.tilemap.layers.forEach((layerData) => {
      // Skip object layers (they don't have tile data)
      if (!layerData.data) {
        return;
      }

      const layer = this.tilemap.createLayer(layerData.name, tilesets, 0, 0);
      
      if (!layer) {
        console.error(`Layer failed: "${layerData.name}"`);
        return;
      }
      this.layers.push(layer);
    });

    createCharacterAnims(this.anims);

    this.physics.world.setBounds(0, 0, this.tilemap.widthInPixels, this.tilemap.heightInPixels);

    const spawnLayer =
      this.tilemap.getObjectLayer('player_spawn') ||
      this.tilemap.getObjectLayer('spawn') ||
      this.tilemap.getObjectLayer('Spawn') ||
      this.tilemap.objects?.find((objectLayer) =>
        Array.isArray(objectLayer.objects) &&
        objectLayer.objects.some(
          (object) =>
            object.name === 'player_spawn' ||
            object.name === 'PlayerSpawn' ||
            object.name === 'spawn' ||
            object.name === 'Spawn',
        ),
      );
    const spawnPoint = spawnLayer?.objects.find(
      (o) => o.name === 'player_spawn' || o.name === 'PlayerSpawn',
    );

    const rawSpawnX = Number(spawnPoint?.x);
    const rawSpawnY = Number(spawnPoint?.y);
    const rawSpawnHeight = Number(spawnPoint?.height);

    const spawnX = Number.isFinite(rawSpawnX) ? rawSpawnX : 400;
    // For rectangle objects, y is top edge in Tiled; include height so feet spawn on the marker.
    const spawnY = Number.isFinite(rawSpawnY)
      ? rawSpawnY + (Number.isFinite(rawSpawnHeight) ? rawSpawnHeight : 0)
      : 300;
    this.player = new Player(this, spawnX, spawnY);

    // Setup tile collisions after map/layers/player are ready.
    this.collidableLayers = setupCollisions(this, this.tilemap, this.player.sprite) || [];
    this.chairInteraction = setupChairInteraction(this, this.tilemap, this.player);
    this.wboOverlay = new WBOOverlay(this);
    this.whiteboardInteraction = setupWhiteboardInteraction(
      this,
      this.tilemap,
      this.player,
      this.wboOverlay,
    );
    this.initializeComputerInteractions();
    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
    
    // Setup UI
    this.setupUI();
  }

  resolveWorldTheme() {
    try {
      const stored = window.localStorage.getItem('pixel_office_lobby_theme');
      return stored === 'night' ? 'night' : 'day';
    } catch {
      return 'day';
    }
  }

  createWorldBackdrop() {
    this.worldThemeMode = this.resolveWorldTheme();

    const mapWidth = Number(this.tilemap?.widthInPixels) || 1200;
    const mapHeight = Number(this.tilemap?.heightInPixels) || 900;
    const padX = 900;
    const padY = 640;
    const backdropWidth = mapWidth + padX * 2;
    const backdropHeight = mapHeight + padY * 2;
    const backdropKey = this.worldThemeMode === 'night' ? 'bg_backdrop_night' : 'bg_backdrop_day';
    const cloudKey = this.worldThemeMode === 'night' ? 'bg_cloud_night' : 'bg_cloud_day';
    const orbKey = this.worldThemeMode === 'night' ? 'bg_moon' : 'bg_sun';

    // Set a fallback clear color so empty areas outside textures still match the scene theme.
    this.cameras.main.setBackgroundColor(this.worldThemeMode === 'night' ? '#1b2a4b' : '#8fc8ea');

    this.worldBackground = this.add
      .tileSprite(mapWidth / 2, mapHeight / 2, backdropWidth, backdropHeight, backdropKey)
      .setDepth(-1200)
      .setScrollFactor(1)
      .setAlpha(this.worldThemeMode === 'night' ? 0.95 : 0.88);

    this.worldSunMoon = this.add
      .image(mapWidth - 120, 90, orbKey)
      .setDepth(-1170)
      .setScrollFactor(0.92)
      .setScale(2);

    const cloudDefs = [
      { x: mapWidth * 0.15, y: 110, scale: 1.2, speed: 0.12 },
      { x: mapWidth * 0.52, y: 170, scale: 0.95, speed: 0.09 },
      { x: mapWidth * 0.78, y: 135, scale: 1.05, speed: 0.14 },
    ];

    this.worldClouds = cloudDefs.map((cfg) => {
      const cloud = this.add
        .image(cfg.x, cfg.y, cloudKey)
        .setDepth(-1160)
        .setScrollFactor(0.9)
        .setScale(cfg.scale)
        .setAlpha(this.worldThemeMode === 'night' ? 0.7 : 0.9);

      cloud.bgSpeed = cfg.speed;
      return cloud;
    });
  }

  updateWorldBackdrop() {
    if (this.worldBackground) {
      this.worldBackground.tilePositionX += this.worldThemeMode === 'night' ? 0.05 : 0.08;
    }

    if (!Array.isArray(this.worldClouds) || this.worldClouds.length === 0) {
      return;
    }

    const worldWidth = Number(this.tilemap?.widthInPixels) || 1200;
    this.worldClouds.forEach((cloud) => {
      if (!cloud || !cloud.active) {
        return;
      }

      cloud.x += cloud.bgSpeed || 0.1;
      const cloudWidth = (cloud.displayWidth || 0) / 2;
      if (cloud.x - cloudWidth > worldWidth + 180) {
        cloud.x = -180;
      }
    });
  }
  
  /**
   * Setup UI elements (debug text, logout button, etc.)
   */
  setupUI() {
    // Debug text for player information and room status
    this.debugText = this.add.text(12, 12, 'Connected', {
      color: '#ffffff',
      fontSize: '14px',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
    });
    this.debugText.setScrollFactor(0);
    
    // Logout button pinned to top-right
    const logoutText = this.add
      .text(window.innerWidth - 20, 20, 'Logout', {
        color: '#9ca3af',
        fontSize: '12px',
        backgroundColor: 'rgba(15,23,42,0.6)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    logoutText.on('pointerover', () => {
      logoutText.setColor('#ffffff');
    });
    logoutText.on('pointerout', () => {
      logoutText.setColor('#9ca3af');
    });
    logoutText.on('pointerup', () => {
      this.logout();
    });

    if (!this.leaveRoomButton) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Leave Room';
      button.style.position = 'fixed';
      button.style.left = '16px';
      button.style.top = '16px';
      button.style.zIndex = '99999';
      button.style.padding = '10px 14px';
      button.style.border = '1px solid rgba(239, 68, 68, 0.65)';
      button.style.borderRadius = '10px';
      button.style.background = 'rgba(127, 29, 29, 0.92)';
      button.style.color = '#fecaca';
      button.style.fontSize = '13px';
      button.style.fontWeight = '600';
      button.style.cursor = 'pointer';
      button.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.35)';
      button.style.pointerEvents = 'auto';
      button.style.backdropFilter = 'blur(8px)';

      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(153, 27, 27, 0.98)';
        button.style.color = '#ffffff';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(127, 29, 29, 0.92)';
        button.style.color = '#fecaca';
      });
      button.addEventListener('click', () => {
        void this.leaveRoom();
      });

      document.body.appendChild(button);
      this.leaveRoomButton = button;
    }
  }

  resolveMeetingWhiteboardBoardId() {
    const roomId = String(this.room?.roomId || '').trim();
    if (!roomId) {
      return null;
    }

    return `${roomId}-wb-3`;
  }

  syncMeetingWhiteboardButton() {
    this.videoOverlay?.syncMeetingWhiteboardButton?.();
  }

  openMeetingWhiteboard() {
    const boardId = this.resolveMeetingWhiteboardBoardId();
    if (!boardId) {
      return;
    }

    this.wboOverlay?.open?.(boardId);
  }

  updateMeetingUi() {
    this.syncMeetingWhiteboardButton();
  }
  
  /**
   * Exit current session and return to lobby.
   */
  logout() {
    try {
      window.localStorage.removeItem('colyseus_room_id');
    } catch {
      // ignore
    }
    window.location.href = '/lobby.html';
  }

  async leaveRoom() {
    if (this.isLeavingRoom) {
      return;
    }

    this.isLeavingRoom = true;

    // Close map overlays before leaving so controls/UI are reset.
    this.wboOverlay?.close?.();
    this.chatOverlay?.closeInput?.();

    try {
      await this.room?.leave?.(true);
    } catch (error) {
      console.warn('Failed to leave Colyseus room cleanly', error);
    }

    this.room = null;

    try {
      window.localStorage.removeItem('colyseus_room_id');
    } catch {
      // ignore storage failures and continue redirect
    }

    window.location.href = '/lobby.html';
  }
  
  /**
   * Update loop (called every frame)
   */
  update() {
    if (this.networkDiagnosticsEnabled) {
      const now = performance.now();
      if (this.diagLastFrameAt > 0) {
        const frameDeltaMs = now - this.diagLastFrameAt;
        this.diagRenderFrameCount += 1;
        this.diagRenderTotalDeltaMs += frameDeltaMs;
        this.diagRenderMaxDeltaMs = Math.max(this.diagRenderMaxDeltaMs, frameDeltaMs);
      }

      if (this.diagRenderWindowStartedAt === 0) {
        this.diagRenderWindowStartedAt = now;
      }

      const renderWindowMs = now - this.diagRenderWindowStartedAt;
      if (renderWindowMs >= 1000) {
        const fps = this.diagRenderFrameCount > 0
          ? (this.diagRenderFrameCount * 1000) / renderWindowMs
          : 0;
        const avgFrameMs = this.diagRenderFrameCount > 0
          ? this.diagRenderTotalDeltaMs / this.diagRenderFrameCount
          : 0;

        console.log('[DIAG][render-loop]', {
          ts: Date.now(),
          fps: Number(fps.toFixed(2)),
          avgFrameMs: Number(avgFrameMs.toFixed(2)),
          maxFrameMs: Number(this.diagRenderMaxDeltaMs.toFixed(2)),
          moveSendsPerSec: this.diagMoveSendCount,
        });

        this.diagRenderWindowStartedAt = now;
        this.diagRenderFrameCount = 0;
        this.diagRenderTotalDeltaMs = 0;
        this.diagRenderMaxDeltaMs = 0;
        this.diagMoveSendCount = 0;
      }

      this.diagLastFrameAt = now;
    }

    this.updateWorldBackdrop();
    this.syncMeetingWhiteboardButton();

    if (this.player) {
      this.chairInteraction?.update();
      this.whiteboardInteraction?.update();
      this.updateComputerInteractionState();
      this.player.update();

      if (this.localNameText && this.player.sprite) {
        this.positionNameTag(this.localNameText, this.player.sprite);
      }

      this.nameTexts.forEach((nameText, sessionId) => {
        const sprite = this.playerRects.get(sessionId);
        if (sprite) {
          this.positionNameTag(nameText, sprite);
        }
      });

      this.updateChatBubbles();
      
      // Send movement snapshots at a fixed network tick instead of every render frame.
      if (this.room) {
        const now = performance.now();
        const sync = this.player.getSyncState();
        const nextPayload = {
          x: Math.round(sync.x),
          y: Math.round(sync.y),
          direction: sync.direction,
          isMoving: sync.isMoving,
          isSitting: sync.isSitting,
        };

        const lastPayload = this.lastMovePayload;
        const payloadChanged =
          !lastPayload ||
          lastPayload.x !== nextPayload.x ||
          lastPayload.y !== nextPayload.y ||
          lastPayload.direction !== nextPayload.direction ||
          lastPayload.isMoving !== nextPayload.isMoving ||
          lastPayload.isSitting !== nextPayload.isSitting;

        const sinceLastSend = now - this.lastMoveSendAt;
        const due = sinceLastSend >= this.moveSendIntervalMs;
        const heartbeatDue = sinceLastSend >= 250;

        if (due && (payloadChanged || heartbeatDue)) {
          this.room.send('move', nextPayload);
          this.lastMoveSendAt = now;
          this.lastMovePayload = nextPayload;
          if (this.networkDiagnosticsEnabled) {
            this.diagMoveSendCount += 1;
          }
        }
      }

      if (this.networkDiagnosticsEnabled && this.player?.sprite) {
        const camera = this.cameras.main;
        const drift = Phaser.Math.Distance.Between(
          camera.midPoint.x,
          camera.midPoint.y,
          this.player.sprite.x,
          this.player.sprite.y,
        );
        const now = Date.now();
        if (drift > 6 && now - this.diagLastCameraLogAt >= 500) {
          this.diagLastCameraLogAt = now;
          console.log('[DIAG][camera-follow]', {
            ts: now,
            drift: Number(drift.toFixed(2)),
            cameraX: Number(camera.midPoint.x.toFixed(2)),
            cameraY: Number(camera.midPoint.y.toFixed(2)),
            playerX: Number(this.player.sprite.x.toFixed(2)),
            playerY: Number(this.player.sprite.y.toFixed(2)),
          });
        }
      }
    }
  }

  shutdown() {
    this.chairInteraction?.destroy();
    this.chairInteraction = null;

    this.whiteboardInteraction?.destroy();
    this.whiteboardInteraction = null;

    this.wboOverlay?.destroy?.();
    this.wboOverlay = null;

    this.chatOverlay?.destroy?.();
    this.chatOverlay = null;

    this.leaveRoomButton?.remove?.();
    this.leaveRoomButton = null;

    this.worldBackground?.destroy?.();
    this.worldBackground = null;
    this.worldSunMoon?.destroy?.();
    this.worldSunMoon = null;
    this.worldClouds.forEach((cloud) => cloud?.destroy?.());
    this.worldClouds = [];

    this.interactKey?.off?.('down');
    this.interactKey = null;

    this.computerPromptText?.destroy?.();
    this.computerPromptText = null;
    this.computerInteractionRects = [];
    this.nearestComputer = null;

    this.chatBubbles.forEach((bubble) => bubble.text?.destroy?.());
    this.chatBubbles.clear();
  }

  initializeComputerInteractions() {
    const interactionLayer = this.tilemap?.getObjectLayer?.('interactions');
    const objects = Array.isArray(interactionLayer?.objects) ? interactionLayer.objects : [];

    this.computerInteractionRects = objects
      .filter((obj) => {
        const type = String(obj?.type || obj?.name || '').trim().toLowerCase();
        const propType = Array.isArray(obj?.properties)
          ? String(
              obj.properties.find((prop) => String(prop?.name || '').toLowerCase() === 'type')
                ?.value || '',
            )
              .trim()
              .toLowerCase()
          : '';
        return type === 'computer' || type === 'computers' || propType === 'computer';
      })
      .map((obj, index) => {
        const x = Number(obj?.x) || 0;
        const y = Number(obj?.y) || 0;
        const width = Math.max(1, Number(obj?.width) || 0);
        const height = Math.max(1, Number(obj?.height) || 0);

        return {
          id: String(obj?.id || obj?.name || `computer-${index + 1}`),
          rect: new Phaser.Geom.Rectangle(x, y, width, height),
        };
      });

    this.computerPromptText = this.add.text(0, 0, 'Press C to use computer', {
      color: '#111827',
      fontFamily: 'VT323, monospace',
      fontSize: '18px',
      backgroundColor: '#f8fafc',
      padding: { left: 8, right: 8, top: 3, bottom: 3 },
    });
    this.computerPromptText.setOrigin(0.5, 1);
    this.computerPromptText.setDepth(2000);
    this.computerPromptText.setVisible(false);

    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.interactKey.on('down', () => {
      if (!this.computerZoneManager) {
        return;
      }

      if (this.computerZoneManager.isInZone()) {
        this.computerZoneManager.exitZone();
        return;
      }

      if (this.nearestComputer) {
        void this.computerZoneManager.enterZone(this.nearestComputer.id);
      }
    });
  }

  findNearestComputer() {
    const sprite = this.player?.sprite;
    if (!sprite || !Array.isArray(this.computerInteractionRects) || this.computerInteractionRects.length === 0) {
      return null;
    }

    const px = Number(sprite.x);
    const py = Number(sprite.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return null;
    }

    let best = null;

    this.computerInteractionRects.forEach((entry) => {
      const expanded = Phaser.Geom.Rectangle.Clone(entry.rect);
      expanded.x -= this.computerInteractRange;
      expanded.y -= this.computerInteractRange;
      expanded.width += this.computerInteractRange * 2;
      expanded.height += this.computerInteractRange * 2;

      if (!expanded.contains(px, py)) {
        return;
      }

      const centerX = entry.rect.centerX;
      const centerY = entry.rect.centerY;
      const dist = Phaser.Math.Distance.Between(px, py, centerX, centerY);

      if (!best || dist < best.distance) {
        best = {
          ...entry,
          distance: dist,
        };
      }
    });

    return best;
  }

  updateComputerInteractionState() {
    const inZone = this.computerZoneManager?.isInZone?.() || false;
    this.nearestComputer = this.findNearestComputer();

    const promptVisible = Boolean(this.nearestComputer) && !inZone;
    if (!this.computerPromptText) {
      return;
    }

    this.computerPromptText.setVisible(promptVisible);

    if (promptVisible) {
      this.computerPromptText.x = this.nearestComputer.rect.centerX;
      this.computerPromptText.y = this.nearestComputer.rect.y - 20;
    }
  }
  
  /**
   * Enable debug rendering for collision tiles
   * Visualize which tiles have collision enabled
   */
  enableCollisionDebug() {
    this.collidableLayers.forEach((layer) => {
      layer.renderDebug(this.make.graphics({ x: 0, y: 0, add: false }), {
        tileColor: new Phaser.Display.Color(35, 150, 50, 150),
      });
    });
  }
  
  /**
   * Colyseus Integration: Update other players' positions and display names
   */
  updatePlayerPosition(
    sessionId,
    x,
    y,
    username,
    userId,
    characterKey,
    avatarId,
    direction,
    isMoving,
    isSitting,
  ) {
    const existing = this.playersMap.get(sessionId) || {};
    const resolvedX = Number.isFinite(Number(x)) ? Number(x) : (existing.x ?? 400);
    const resolvedY = Number.isFinite(Number(y)) ? Number(y) : (existing.y ?? 300);
    const resolvedCharacterKey = normalizeCharacterKey(
      characterKey ?? existing.characterKey,
      avatarId ?? existing.avatarId,
    );
    const resolvedDirection = direction ?? existing.direction ?? 'down';
    const resolvedMoving = typeof isMoving === 'boolean' ? isMoving : (existing.isMoving ?? false);
    const resolvedSitting = typeof isSitting === 'boolean' ? isSitting : (existing.isSitting ?? false);

    this.playersMap.set(sessionId, {
      x: resolvedX,
      y: resolvedY,
      username: username ?? existing.username,
      userId: userId ?? existing.userId,
      avatarId: avatarId ?? existing.avatarId,
      characterKey: resolvedCharacterKey,
      direction: resolvedDirection,
      isMoving: resolvedMoving,
      isSitting: resolvedSitting,
    });

    if (!this.room) return;

    const isLocal = sessionId === this.room.sessionId;

    if (isLocal && this.player) {
      this.player.setCharacterKey(resolvedCharacterKey);
      const localPosition = this.player.getPosition();
      const drift = Phaser.Math.Distance.Between(
        localPosition.x,
        localPosition.y,
        resolvedX,
        resolvedY,
      );

      const isLocallyMoving = Boolean(this.player?.isMoving);
      const recentlyMoving = Boolean(this.player?.wasRecentlyMoving?.(this.localCorrectionIdleDelayMs));

      if (isLocallyMoving || recentlyMoving) {
        const label = username || userId || sessionId.slice(0, 8);
        this.localDisplayName = label;

        if (!this.localNameText) {
          const localSprite = this.player.sprite;
          this.localNameText = this.createNameTag(
            localSprite?.x ?? localPosition.x,
            localSprite ? this.getNameTagY(localSprite) : localPosition.y - 38,
            label,
          );
        } else {
          this.localNameText.setText(label);
        }

        const localSprite = this.player.sprite;
        const visualX = localSprite?.x ?? localPosition.x;
        const visualY = localSprite?.y ?? localPosition.y;
        if (localSprite) {
          this.positionNameTag(this.localNameText, localSprite);
        }
        this.syncChatBubblePosition(sessionId, visualX, visualY);
        return;
      }

      if (drift < this.localCorrectionIgnoreDriftPx) {
        const label = username || userId || sessionId.slice(0, 8);
        this.localDisplayName = label;
        if (!this.localNameText) {
          const localSprite = this.player.sprite;
          this.localNameText = this.createNameTag(
            localSprite?.x ?? localPosition.x,
            localSprite ? this.getNameTagY(localSprite) : localPosition.y - 38,
            label,
          );
        } else {
          this.localNameText.setText(label);
        }

        const localSprite = this.player.sprite;
        if (localSprite) {
          this.positionNameTag(this.localNameText, localSprite);
        }
        this.syncChatBubblePosition(sessionId, localPosition.x, localPosition.y);
        return;
      }

      const snapCorrection = drift > this.localCorrectionHardThresholdPx;
      const targetX = snapCorrection
        ? resolvedX
        : Phaser.Math.Linear(localPosition.x, resolvedX, this.localCorrectionSmoothFactor);
      const targetY = snapCorrection
        ? resolvedY
        : Phaser.Math.Linear(localPosition.y, resolvedY, this.localCorrectionSmoothFactor);

      if (this.networkDiagnosticsEnabled) {
        console.warn('[DIAG][local-correction]', {
          ts: Date.now(),
          sessionId,
          drift: Number(drift.toFixed(2)),
          mode: snapCorrection ? 'hard' : 'soft',
          isLocallyMoving,
          recentlyMoving,
          fromX: Number(localPosition.x.toFixed(2)),
          fromY: Number(localPosition.y.toFixed(2)),
          toX: Number(targetX.toFixed(2)),
          toY: Number(targetY.toFixed(2)),
        });
      }

      this.player.setPosition(targetX, targetY);

      const label = username || userId || sessionId.slice(0, 8);
      this.localDisplayName = label;

      if (!this.localNameText) {
        const localSprite = this.player.sprite;
        this.localNameText = this.createNameTag(
          localSprite?.x ?? targetX,
          localSprite ? this.getNameTagY(localSprite) : targetY - 38,
          label,
        );
      } else {
        this.localNameText.setText(label);
      }

      const visualX = this.player.sprite?.x ?? targetX;
      const visualY = this.player.sprite?.y ?? targetY;
      if (this.player.sprite) {
        this.positionNameTag(this.localNameText, this.player.sprite);
      }

      this.syncChatBubblePosition(sessionId, visualX, visualY);
      return;
    }

    let rect = this.playerRects.get(sessionId);
    let nameText = this.nameTexts.get(sessionId);

    if (!rect) {
      rect = this.physics.add.sprite(resolvedX, resolvedY, resolvedCharacterKey);
      rect.setOrigin(0.5, 1);
      rect.setDepth(900);
      rect.body.setImmovable(true);
      rect.body.setAllowGravity(false);
      this.playerRects.set(sessionId, rect);
    }

    if (rect.texture?.key !== resolvedCharacterKey) {
      rect.setTexture(resolvedCharacterKey);
    }

    if (resolvedSitting) {
      rect.anims.play(`${resolvedCharacterKey}_sit_${resolvedDirection}`, true);
    } else if (resolvedMoving) {
      rect.anims.play(`${resolvedCharacterKey}_run_${resolvedDirection}`, true);
    } else {
      rect.anims.play(`${resolvedCharacterKey}_idle_${resolvedDirection}`, true);
    }

    const label = username || userId || sessionId.slice(0, 8);

    if (!nameText) {
      nameText = this.createNameTag(resolvedX, resolvedY - 30, label);
      this.nameTexts.set(sessionId, nameText);
    } else {
      nameText.setText(label);
    }

    if (rect) {
      if (this.networkDiagnosticsEnabled && Number.isFinite(existing.x) && Number.isFinite(existing.y)) {
        const remoteJump = Phaser.Math.Distance.Between(existing.x, existing.y, resolvedX, resolvedY);
        if (remoteJump > 45) {
          console.log('[DIAG][remote-jump]', {
            ts: Date.now(),
            sessionId,
            jumpDistance: Number(remoteJump.toFixed(2)),
            fromX: Number(existing.x.toFixed(2)),
            fromY: Number(existing.y.toFixed(2)),
            toX: Number(resolvedX.toFixed(2)),
            toY: Number(resolvedY.toFixed(2)),
          });
        }
      }
      rect.x = resolvedX;
      rect.y = resolvedY;
    }
    if (nameText) {
      this.positionNameTag(nameText, rect);
    }

    this.syncChatBubblePosition(sessionId, resolvedX, resolvedY);
  }
  
  /**
   * Colyseus Integration: Remove player display
   */
  removePlayer(sessionId) {
    this.playersMap.delete(sessionId);
    this.destroyChatBubble(sessionId);
    if (!this.room) return;

    if (sessionId === this.room.sessionId) {
      if (this.localNameText) {
        this.localNameText.destroy();
        this.localNameText = null;
      }
      this.playerRects.delete(sessionId);
      const nameText = this.nameTexts.get(sessionId);
      if (nameText) nameText.destroy();
      this.nameTexts.delete(sessionId);
      return;
    }

    const rect = this.playerRects.get(sessionId);
    if (rect) rect.destroy();
    this.playerRects.delete(sessionId);

    const nameText = this.nameTexts.get(sessionId);
    if (nameText) nameText.destroy();
    this.nameTexts.delete(sessionId);
  }
  
  /**
   * Update debug overlay with player information
   */
  updateDebugOverlay() {
    if (!this.debugText) return;

    const lines = [`Players: ${this.playersMap.size}`];
    this.playersMap.forEach((pos, sessionId) => {
      lines.push(
        `${pos.username || sessionId.slice(0, 8)} (${sessionId.slice(
          0,
          8,
        )}): (${Math.round(pos.x)}, ${Math.round(pos.y)})`,
      );
    });

    this.debugText.setText(lines.join('\n'));
  }

  normalizeChatMessage(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text.trim().replace(/\s+/g, ' ').slice(0, 180);
  }

  syncChatBubblePosition(sessionId, x, y) {
    const bubble = this.chatBubbles.get(sessionId);
    if (!bubble?.text) return;

    const sprite = this.getPlayerSpriteBySessionId(sessionId);
    const positioned = this.positionChatBubble(bubble.text, sprite, x, y);
    if (!positioned) {
      return;
    }

    bubble.baseX = positioned.x;
    bubble.baseY = positioned.y;
  }

  destroyChatBubble(sessionId) {
    const bubble = this.chatBubbles.get(sessionId);
    if (!bubble) return;

    bubble.text?.destroy?.();
    this.chatBubbles.delete(sessionId);
  }

  showChatBubble(sessionId, from, text, durationMs = 3500) {
    const normalizedText = this.normalizeChatMessage(text);
    if (!normalizedText) return;

    const current = this.playersMap.get(sessionId);
    const baseX = current?.x ?? this.player?.sprite?.x;
    const baseY = current?.y ?? this.player?.sprite?.y;

    if (!Number.isFinite(Number(baseX)) || !Number.isFinite(Number(baseY))) {
      return;
    }

    this.destroyChatBubble(sessionId);

    const bubbleText = this.add.text(0, 0, normalizedText, {
      color: '#f8fafc',
      fontFamily: 'VT323, monospace',
      fontSize: '14px',
      backgroundColor: 'rgba(10, 14, 24, 0.92)',
      padding: { left: 8, right: 8, top: 5, bottom: 5 },
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      wordWrap: { width: 160, useAdvancedWrap: true },
    });
    bubbleText.setOrigin(0.5, 1);
    bubbleText.setDepth(1300);
    bubbleText.setResolution(2);

    const sprite = this.getPlayerSpriteBySessionId(sessionId);
    const positioned = this.positionChatBubble(bubbleText, sprite, Number(baseX), Number(baseY));

    this.chatBubbles.set(sessionId, {
      text: bubbleText,
      from,
      expiresAt: Date.now() + durationMs,
      baseX: positioned?.x ?? Number(baseX),
      baseY: positioned?.y ?? Number(baseY),
    });
  }

  updateChatBubbles() {
    const now = Date.now();

    this.chatBubbles.forEach((bubble, sessionId) => {
      const expired = now >= bubble.expiresAt;
      if (expired) {
        this.destroyChatBubble(sessionId);
        return;
      }

      const current = this.playersMap.get(sessionId);
      const x = Number.isFinite(Number(current?.x)) ? Number(current?.x) : bubble.baseX;
      const y = Number.isFinite(Number(current?.y)) ? Number(current?.y) : bubble.baseY;
      const sprite = this.getPlayerSpriteBySessionId(sessionId);

      if (bubble.text) {
        const positioned = this.positionChatBubble(bubble.text, sprite, x, y);
        if (positioned) {
          bubble.baseX = positioned.x;
          bubble.baseY = positioned.y;
          return;
        }
      }
      bubble.baseX = x;
      bubble.baseY = y;
    });
  }
  
  /**
   * Bind listeners to individual player fields (Colyseus)
   */
  bindPlayerChange(statePlayer, sessionId) {
    // For Colyseus 0.15+ with @colyseus/schema, listen to individual fields
    if (typeof statePlayer.listen === 'function') {
      statePlayer.listen('x', (newX) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          newX,
          current.y ?? 0,
          current.username,
          current.userId,
          current.characterKey,
          current.avatarId,
          current.direction,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('y', (newY) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          newY,
          current.username,
          current.userId,
          current.characterKey,
          current.avatarId,
          current.direction,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('username', (newUsername) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          newUsername,
          current.userId,
          current.characterKey,
          current.avatarId,
          current.direction,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('characterKey', (newCharacterKey) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          current.username,
          current.userId,
          newCharacterKey,
          current.avatarId,
          current.direction,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('avatarId', (newAvatarId) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          current.username,
          current.userId,
          current.characterKey,
          newAvatarId,
          current.direction,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('direction', (newDirection) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          current.username,
          current.userId,
          current.characterKey,
          current.avatarId,
          newDirection,
          current.isMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('isMoving', (newIsMoving) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          current.username,
          current.userId,
          current.characterKey,
          current.avatarId,
          current.direction,
          newIsMoving,
          current.isSitting,
        );
        this.updateDebugOverlay();
      });
      statePlayer.listen('isSitting', (newIsSitting) => {
        const current = this.playersMap.get(sessionId) || {};
        this.updatePlayerPosition(
          sessionId,
          current.x ?? 0,
          current.y ?? 0,
          current.username,
          current.userId,
          current.characterKey,
          current.avatarId,
          current.direction,
          current.isMoving,
          newIsSitting,
        );
        this.updateDebugOverlay();
      });
      return;
    }

    // Fallback for older Colyseus
    statePlayer.onChange = () => {
      this.updatePlayerPosition(
        sessionId,
        statePlayer.x,
        statePlayer.y,
        statePlayer.username || statePlayer.name,
        statePlayer.userId,
        statePlayer.characterKey,
        statePlayer.avatarId,
        statePlayer.direction,
        statePlayer.isMoving,
        statePlayer.isSitting,
      );
      this.updateDebugOverlay();
    };
  }
}

