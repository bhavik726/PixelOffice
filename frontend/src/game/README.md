# Phaser 3 Pixel Office Game

A modular Phaser 3 implementation for a 2D multiplayer metaverse application using Tiled maps and Colyseus networking.

## Project Structure

```
src/
  game/
    config.js           # Phaser game configuration
    player.js          # Player controller class
    scenes/
      MainScene.js     # Main game scene with map and collision
  game.js              # Game initialization and Colyseus integration
  main.js              # Entry point

public/
  assets/
    maps/
      PixelOfficeMap.json     # Tiled map JSON export
    tiles/
      FloorAndGround.png      # Tileset images
      Modern_Office_Black_Shadow.png
      chair.png
      Basement.png
      Generic.png
      Room_Builder_Walls.png
```

## Features

✅ **Map Loading**
- Loads Tiled JSON map format
- Automatically loads all tilesets
- Supports multiple layers with proper rendering order

✅ **Collision System**
- Per-tile collision detection using Tiled custom properties
- Only tiles with `collides: true` property create collision bodies
- Prevents player from passing through walls and obstacles

✅ **Player Controller**
- Arrow keys + WASD input for movement
- Smooth velocity-based movement
- Camera follows player automatically
- Camera bounds match tilemap size

✅ **Multiplayer Support (Colyseus)**
- Integrates with Colyseus for real-time multiplayer
- Displays other players as rectangles with names
- Synchronizes player positions across network
- Debug overlay shows all connected players

✅ **UI Elements**
- Debug text showing player list and coordinates
- Logout button in top-right corner
- Responsive to window resize

## File Descriptions

### `config.js`
Phaser game configuration with:
- Game instance settings (width, height, physics)
- Arcade physics setup
- Scene registration
- Scale and responsive settings

### `player.js`
Player class handling:
- Player sprite creation (rectangle placeholder)
- Input handling (arrow keys and WASD)
- Smooth movement with velocity
- Camera follow setup
- Position getters/setters for networking

### `scenes/MainScene.js`
Main game scene with:
- **Preload**: Loads tilemap JSON and all tileset images
- **Create**: 
  - Creates tilemap with all layers
  - Sets collision on tiles with `collides: true`
  - Spawns player
  - Sets up colliders
  - Creates UI elements
- **Update**: Updates player and sends position to server
- **Colyseus Methods**: 
  - `updatePlayerPosition()` - Display other players
  - `removePlayer()` - Remove players who disconnected
  - `bindPlayerChange()` - Listen to player state changes
  - `updateDebugOverlay()` - Show player list

### `game.js`
Game initialization and networking:
- Creates Phaser game instance
- Sets up Colyseus connection
- Binds scene to Colyseus room
- Manages player state synchronization

## How It Works

### Startup Flow

```
main.js
  ↓
Check for auth token
  ↓
game.js → createGame()
  ↓
Phaser.Game created with GameConfig
  ↓
MainScene preload() → Load map and tilesets
  ↓
MainScene create() → Create tilemap, layers, player
  ↓
Colyseus connection established
  ↓
Player listeners bound → Ready for multiplayer
```

### Map Loading Process

1. JSON map file is loaded via `this.load.tilemapTiledJSON()`
2. Tileset images are loaded via `this.load.image()`
3. Tilemap object created with `this.make.tilemap()`
4. Tilesets added to tilemap with `addTilesetImage()` (names must match JSON)
5. Layers created in order with `createLayer()` for proper rendering
6. Collision set per-layer with `setCollisionByProperty({ collides: true })`

### Collision System

**Tiled Setup:**
- In Tiled, select tiles and add custom property: `collides: true` (string)
- This applies to the entire tile layer

**Phaser Runtime:**
- `layer.setCollisionByProperty({ collides: true })` - Enable collision on marked tiles
- `this.physics.add.collider(player.sprite, layer)` - Create collision between player and layer
- Player cannot pass through these tiles

### Player Input

```javascript
// Arrow Keys
↑ ↓ ← → 

// WASD
W A S D
```

Movement is smooth using velocity:
- Get key states every frame
- Calculate velocity based on pressed keys
- Apply velocity to sprite
- Physics engine handles collision and movement

## Configuration

### Player Speed
Edit in `player.js`:
```javascript
this.speed = 120;  // pixels per second
```

### Player Size
Edit in `player.js`:
```javascript
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xff7f00);
                                                  ^^^^ player size
```

### Player Color
Edit in `player.js`:
```javascript
this.sprite.setTint(0xff7f00);  // RGB hex color
```

### Starting Position
Edit in `MainScene.js` `create()`:
```javascript
const startX = 100;
const startY = 100;
```

### Debug Mode
Enable collision visualization in `config.js`:
```javascript
arcade: {
  gravity: { y: 0 },
  debug: true,  // Show physics bodies and collisions
},
```

Or call in MainScene:
```javascript
this.enableCollisionDebug();
```

## Colyseus Integration

### Server Communication
- **Event**: `room.send('move', { x, y })` - Sent every frame when moving
- Sends player absolute coordinates to backend
- Backend broadcasts to all clients

### Player Synchronization
- Each player represented as rectangle with name label above
- Local player (you): Orange rectangle (0xff7f00)
- Remote players: Blue rectangles (0x3399ff)
- Names show above each player
- Updates automatically on state changes

### Requirements
- Server running on `ws://127.0.0.1:4000`
- Valid Colyseus room ID in localStorage
- Valid auth token in localStorage

## Debugging

### Debug Overlay
Shows:
- Total number of players
- Each player's username, session ID (first 8 chars), and coordinates (x, y)
- Updates in real-time

### Console Logs
Key messages:
- "✓ Connected to Colyseus room: ..." - Server connected
- "Loaded X layers, Y with collision" - Map loaded
- "Scene created successfully!" - Scene ready
- "[onAdd] sessionId: ..." - New player joined
- "State updated" - Network update

### Common Issues

**Map layers not showing**
- Check layer names in MainScene match JSON exactly
- Verify tileset image paths are correct
- Check browser console for asset loading errors

**Collisions not working**
- Verify `collides: true` property is set in Tiled on desired tiles
- Check console for "Loaded ... with collision" message
- Enable physics debug to visualize collision bodies

**Player invisible or stuck**
- Check player sprite size isn't too small
- Verify starting position is valid (not inside walls)
- Check console for errors in Player class

**Multiplayer not working**
- Verify backend server is running
- Check auth token and room ID in localStorage
- Check browser console for connection errors
- Verify room exists on server

## Performance Tips

- Keep tileset images optimized (pngquant, tinypng)
- Use appropriate tile size for your game (32x32 is standard)
- Limit number of active layers visible at once
- Use camera culling to render only visible tiles (Phaser does this by default)
- Monitor physics bodies count (debug overlay helps)

## Future Enhancements

- Add animated sprites instead of rectangles
- Implement player emotes/reactions
- Add minimap
- Implement fog of war
- Add sound/music
- Particle effects
- Create spawner zones
- NPCs with AI
