import Phaser from 'phaser';
import Player from '../player';

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
  }
  
  /**
   * Create the scene (called after preload)
   */
  create() {
    // Create the tilemap from the loaded JSON
    this.tilemap = this.make.tilemap({ key: 'pixel-office-map' });
    
    // Add tilesets to the map (filter out null values for external tilesets)
    // These must match the names in the JSON file
    const tilesets = [
      this.tilemap.addTilesetImage('FloorAndGround', 'FloorAndGround'),
      this.tilemap.addTilesetImage('Modern_Office_Black_Shadow', 'Modern_Office_Black_Shadow'),
      this.tilemap.addTilesetImage('chair', 'chair'),
      this.tilemap.addTilesetImage('Basement', 'Basement'),
      this.tilemap.addTilesetImage('Generic', 'Generic'),
      this.tilemap.addTilesetImage('Room_Builder_Walls', 'Room_Builder_Walls'),
    ].filter(ts => ts !== null);  // Remove null tilesets (external references)
    
    // Create all layers from the tilemap
    // Layer order in Tiled determines rendering order
    // Bottom → top order must match PixelOfficeMap.json (Tiled layer list)
    const layerNames = [
      'Ground',
      'walls',
      'carpet',
      'compounds',
      'chairs',
      'furniture',
      'computers',
      'chill zone',
      'extra things',
      'decoration',
    ];
    
    layerNames.forEach((layerName) => {
      const layer = this.tilemap.createLayer(layerName, tilesets, 0, 0);
      
      if (!layer) {
        console.warn(`Layer "${layerName}" not found in map`);
        return;
      }
      
      this.layers.push(layer);
      
      // Set collision on tiles with collides property
      layer.setCollisionByProperty({ collides: true });
      
      // Track collidable layers
      if (layer.properties?.some(prop => prop.name === 'collides' && prop.value === 'true')) {
        this.collidableLayers.push(layer);
      }
    });
    
    console.log(`Loaded ${this.layers.length} layers, ${this.collidableLayers.length} with collision`);

    this.physics.world.setBounds(0, 0, this.tilemap.widthInPixels, this.tilemap.heightInPixels);

    // Placeholder until Colyseus applies server spawn (see updatePlayerPosition for local session)
    const startX = 400;
    const startY = 300;
    this.player = new Player(this, startX, startY);
    
    // Add physics collider between player and collidable layers
    this.collidableLayers.forEach((layer) => {
      this.physics.add.collider(this.player.sprite, layer);
    });
    
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
    this.playersMap.set(sessionId, {
      x,
      y,
      username: username ?? existing.username,
      userId: userId ?? existing.userId,
    });

    if (!this.room) return;

    const isLocal = sessionId === this.room.sessionId;

    if (isLocal && this.player) {
      this.player.setPosition(x, y);
      return;
    }

    let rect = this.playerRects.get(sessionId);
    let nameText = this.nameTexts.get(sessionId);

    if (!rect) {
      rect = this.add.rectangle(x, y, 20, 20, 0x3399ff);
      this.physics.world.enable(rect);
      this.playerRects.set(sessionId, rect);
    }

    const label = username || userId || sessionId.slice(0, 8);

    if (!nameText) {
      nameText = this.add.text(x, y - 30, label, {
        color: '#ffffff',
        fontSize: '12px',
      });
      nameText.setOrigin(0.5, 1);
      this.nameTexts.set(sessionId, nameText);
    } else {
      nameText.setText(label);
    }

    if (rect) {
      rect.x = x;
      rect.y = y;
    }
    if (nameText) {
      nameText.x = x;
      nameText.y = y - 30;
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

