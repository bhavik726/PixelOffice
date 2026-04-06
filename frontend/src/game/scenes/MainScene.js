import Phaser from 'phaser';
import Player from '../player';
import { setupCollisions } from '../handlers/collision/collisionHandler';
import { createCharacterAnims } from '../animations/CharacterAnimations';

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
    this.debugText = null;
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
  }
  
  /**
   * Create the scene (called after preload)
   */
  create() {
    // Create the tilemap from the loaded JSON with explicit tile dimensions
    this.tilemap = this.make.tilemap({
      key: 'pixel-office-map',
      tileWidth: 32,
      tileHeight: 32,
    });
    console.log('Available layers in map:', this.tilemap.layers.map((l) => l.name));
    console.log('Available object layers:', this.tilemap.objects?.map((o) => o.name));

    // Bind tilesets using exact names from Tiled JSON
    console.log('Tilesets in map:', this.tilemap.tilesets);
    
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
        } else {
          console.log(`Tileset bound: "${tilesetData.name}" (firstgid: ${tilesetData.firstgid})`);
        }

        return boundTileset;
      })
      .filter((ts) => ts !== null);
    
    // Create all tile layers (skip only object layers "interactions" and "player_spawn")
    this.tilemap.layers.forEach((layerData) => {
      // Skip object layers (they don't have tile data)
      if (!layerData.data) {
        console.log(`Skipping object layer: "${layerData.name}"`);
        return;
      }

      const layer = this.tilemap.createLayer(layerData.name, tilesets, 0, 0);
      
      if (!layer) {
        console.error(`Layer failed: "${layerData.name}"`);
        return;
      }

      console.log(`Layer created: "${layerData.name}"`);
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

    console.log(`Loaded ${this.layers.length} layers, ${this.collidableLayers.length} with collision`);
    
    // Setup UI
    this.setupUI();
    
    console.log('Scene created successfully!');
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
  }
  
  /**
   * Logout and redirect to login page
   */
  logout() {
    try {
      window.localStorage.removeItem('supabase_access_token');
    } catch {
      // ignore
    }
    window.location.href = '/login.html';
  }
  
  /**
   * Update loop (called every frame)
   */
  update() {
    if (this.player) {
      this.player.update();
      
      // Send player position to Colyseus server if connected
      if (this.room) {
        const pos = this.player.getPosition();
        this.room.send('move', { 
          x: Math.round(pos.x), 
          y: Math.round(pos.y) 
        });
      }
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
  updatePlayerPosition(sessionId, x, y, username, userId) {
    const existing = this.playersMap.get(sessionId) || {};
    const resolvedX = Number.isFinite(Number(x)) ? Number(x) : (existing.x ?? 400);
    const resolvedY = Number.isFinite(Number(y)) ? Number(y) : (existing.y ?? 300);

    this.playersMap.set(sessionId, {
      x: resolvedX,
      y: resolvedY,
      username: username ?? existing.username,
      userId: userId ?? existing.userId,
    });

    if (!this.room) return;

    const isLocal = sessionId === this.room.sessionId;

    if (isLocal && this.player) {
      this.player.setPosition(resolvedX, resolvedY);
      return;
    }

    let rect = this.playerRects.get(sessionId);
    let nameText = this.nameTexts.get(sessionId);

    if (!rect) {
      rect = this.add.rectangle(resolvedX, resolvedY, 20, 20, 0x3399ff);
      this.physics.world.enable(rect);
      this.playerRects.set(sessionId, rect);
    }

    const label = username || userId || sessionId.slice(0, 8);

    if (!nameText) {
      nameText = this.add.text(resolvedX, resolvedY - 30, label, {
        color: '#ffffff',
        fontSize: '12px',
      });
      nameText.setOrigin(0.5, 1);
      this.nameTexts.set(sessionId, nameText);
    } else {
      nameText.setText(label);
    }

    if (rect) {
      rect.x = resolvedX;
      rect.y = resolvedY;
    }
    if (nameText) {
      nameText.x = resolvedX;
      nameText.y = resolvedY - 30;
    }
  }
  
  /**
   * Colyseus Integration: Remove player display
   */
  removePlayer(sessionId) {
    this.playersMap.delete(sessionId);
    if (!this.room) return;

    if (sessionId === this.room.sessionId) {
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
      );
      this.updateDebugOverlay();
    };
  }
}

