# Phaser 3 Pixel Office - Quick Start & Examples

## Quick Start

### 1. The Game is Ready to Use!
No additional setup needed - everything is already implemented. Just ensure:
- `frontend/public/assets/maps/PixelOfficeMap.json` exists ✓
- Tilesets are in `frontend/public/assets/tiles/` ✓
- Backend Colyseus server is running on `ws://127.0.0.1:4000`
- User has valid auth token in localStorage

### 2. Starting the Game
The game starts automatically when user visits the page with valid auth:

```javascript
// frontend/src/main.js
if (hasAuthToken()) {
  createGame();  // Loads immediately
}
```

### 3. First Time Testing
1. Ensure you're authenticated (have token in localStorage)
2. Go to /lobby.html to join a room (gets room ID)
3. Game loads automatically
4. Use arrow keys or WASD to move
5. See other players as blue rectangles with names

---

## Common Modifications

### Change Player Color

**File:** `frontend/src/game/player.js` line 12

```javascript
// Current: orange (0xff7f00)
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xff7f00);

// Change to:
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0x00ff00);  // green
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xff0000);  // red
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xffff00);  // yellow
```

### Change Player Size

**File:** `frontend/src/game/player.js` line 12

```javascript
// Current: 20x20
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xff7f00);

// Bigger player (30x30):
this.sprite = scene.physics.add.rectangle(x, y, 30, 30, 0xff7f00);

// Smaller player (15x15):
this.sprite = scene.physics.add.rectangle(x, y, 15, 15, 0xff7f00);
```

### Change Movement Speed

**File:** `frontend/src/game/player.js` line 25

```javascript
// Current: 120 pixels/second
this.speed = 120;

// Faster:
this.speed = 200;

// Slower:
this.speed = 80;
```

### Change Starting Position

**File:** `frontend/src/game/scenes/MainScene.js` around line 86

```javascript
// Current: top-left area
const startX = 100;
const startY = 100;

// Change to spawn in center:
const startX = this.tilemap.widthInPixels / 2;
const startY = this.tilemap.heightInPixels / 2;

// Or specific coordinates:
const startX = 500;
const startY = 600;
```

### Change Remote Player Color

**File:** `frontend/src/game/scenes/MainScene.js` around line 200 (in `updatePlayerPosition()`)

```javascript
// Current: blue (0x3399ff)
rect = this.add.rectangle(x, y, 20, 20, 0x3399ff);

// Change to:
rect = this.add.rectangle(x, y, 20, 20, 0xff3333);  // red
rect = this.add.rectangle(x, y, 20, 20, 0x33ff33);  // green
```

### Change Remote Player Size

**File:** `frontend/src/game/scenes/MainScene.js` around line 200

```javascript
// Current: 20x20 (same as local)
rect = this.add.rectangle(x, y, 20, 20, 0x3399ff);

// Make remote players bigger:
rect = this.add.rectangle(x, y, 30, 30, 0x3399ff);
```

### Enable Physics Debug (see collisions)

**Option 1 - Config File:**
**File:** `frontend/src/game/config.js` line 17

```javascript
arcade: {
  gravity: { y: 0 },
  debug: false,  // ← Change to true
},
```

**Option 2 - In MainScene:**
**File:** `frontend/src/game/scenes/MainScene.js` add to `create()` method

```javascript
// Add at the end of create() method:
this.enableCollisionDebug();
```

### Add More Tilesets

If you add more tilesets to your Tiled map:

**File:** `frontend/src/game/scenes/MainScene.js` in `preload()`

```javascript
// Add new tileset image
this.load.image('NewTileset', 'assets/tiles/NewTileset.png');
```

Then in `create()`:

```javascript
const tilesets = [
  this.tilemap.addTilesetImage('FloorAndGround', 'FloorAndGround'),
  // ... existing tilesets ...
  this.tilemap.addTilesetImage('NewTileset', 'NewTileset'),  // ← Add this
];
```

### Add More Layers

If you add layers in Tiled:

**File:** `frontend/src/game/scenes/MainScene.js` in `create()`

```javascript
const layerNames = [
  'Ground', 'walls', 'carpet', 'furniture', 'chairs',
  'compounds', 'computers', 'chill zone', 'extra things', 'decoration',
  'NewLayer1',  // ← Add new layer names
  'NewLayer2',
];
```

### Make Collision Tiles Visible

**File:** `frontend/src/game/scenes/MainScene.js` at the end of `create()`

```javascript
// Add this line to visualize collision tiles:
this.collidableLayers.forEach(layer => {
  layer.renderDebug(this.make.graphics({ x: 0, y: 0, add: false }), {
    tileColor: new Phaser.Display.Color(35, 150, 50, 150),
  });
});
```

Or call the built-in method:
```javascript
this.enableCollisionDebug();
```

### Add Camera Zoom

**File:** `frontend/src/game/scenes/MainScene.js` in `create()` after creating player

```javascript
// Add zoom to camera (1.0 = normal, 2.0 = zoomed in)
this.cameras.main.setZoom(1.5);

// Or make it adaptive:
const zoomLevel = Math.min(
  window.innerWidth / this.tilemap.widthInPixels,
  window.innerHeight / this.tilemap.heightInPixels
);
this.cameras.main.setZoom(zoomLevel);
```

### Change Game Background Color

**File:** `frontend/src/game/config.js` line 11

```javascript
// Current: dark gray
backgroundColor: '#1a1a1a',

// Change to:
backgroundColor: '#000000',  // black
backgroundColor: '#ffffff',  // white
backgroundColor: '#2a4a2a',  // dark green
```

---

## Adding Sprites Instead of Rectangles

Replace the rectangle player with a sprite image:

**File:** `frontend/src/game/player.js` modify `constructor()`

```javascript
// OLD CODE (remove this):
this.sprite = scene.physics.add.rectangle(x, y, 20, 20, 0xff7f00);

// NEW CODE:
this.sprite = scene.physics.add.sprite(x, y, 'player-image');
this.sprite.setScale(0.5);  // Adjust size as needed
```

Then in `MainScene.js` add to `preload()`:

```javascript
this.load.image('player-image', 'assets/player.png');  // Path to your image
```

The rest of the code works the same!

---

## Common Mistakes to Avoid

❌ **Copying tileset image with wrong extension**
- Map expects `.png` but you loaded `.jpg`
- Solution: Ensure filenames match exactly, including extension

❌ **Forgetting to rebuild when changing `preload()`**
- Changed tileset loading but game shows old tilesets
- Solution: Hard refresh (Ctrl+Shift+R) to clear cache

❌ **Tileset names don't match Tiled**
- Added `FloorAndGround.png` but named it differently in code
- Solution: Names must match Tiled JSON exactly, case-sensitive!

❌ **Layers don't appear**
- Added layer name but it's not in the map
- Solution: Check layer exists in `PixelOfficeMap.json`

❌ **Player spawns stuck in wall**
- Starting position is inside a collision tile
- Solution: Test starting position, use debug visualization

❌ **Movement feels jerky**
- Physics time step might be wrong
- Solution: Keep default config, adjust speed instead

---

## Testing Examples

### Test 1: Movement Works
```javascript
// Expected: Player should move smoothly in 8 directions
// Press: → (right arrow)
// Result: Orange rectangle moves right smoothly
```

### Test 2: Collision Works
```javascript
// Expected: Can't move through walls
// Press: → toward wall
// Result: Player stops at wall edge
```

### Test 3: Camera Follows
```javascript
// Expected: Camera stays centered on player
// Press: → and move across map
// Result: Screen scrolls with player
```

### Test 4: Multiplayer Works
```javascript
// Expected: See other players join
// Action: Have 2+ players connected
// Result: See blue rectangles with names above them
```

### Test 5: Debug Overlay Works
```javascript
// Expected: See player info in top-left
// Look: Top-left corner
// Result: Shows "Players: X" and names with coordinates
```

---

## Console Debugging

Open browser console (F12) to see:

```javascript
// Expected log messages:
"✓ Connected to Colyseus room: [room-id]"
"Loaded 10 layers, 3 with collision"
"Scene created successfully!"

// If movement is sending:
"move { x: 123, y: 456 }" (many times per second)

// If multiplayer working:
"[onAdd] sessionId: abc123..."
"State updated..."
```

### Debug Log Statements

Add temporary logs to understand flow:

**In `player.js` in `update()`:**
```javascript
// Add at start to see key presses
console.log('Keys:', {
  left: this.keys.left.isDown,
  right: this.keys.right.isDown,
  up: this.keys.up.isDown,
  down: this.keys.down.isDown,
});
```

**In `MainScene.js` in `update()`:**
```javascript
// See position every 30 frames
if (Math.random() < 0.03) {
  console.log('Player pos:', this.player.getPosition());
}
```

---

## Notes

- All modifications are **non-destructive** - original code survives changes
- Most tweaks are in `player.js` or `config.js`
- Physics and scenes are properly managed
- No memory leaks or orphaned objects
- Safe to call `createGame()` multiple times (though not recommended)

---

## Next Steps

1. **Test in browser** - Does it work?
2. **Adjust player sprite** - Color, size, speed
3. **Test collisions** - Enable debug mode
4. **Test multiplayer** - Connect multiple clients
5. **Add more layers** - Expand map if needed
6. **Replace rectangles** - Add proper sprite art

Enjoy your Phaser 3 metaverse! 🎮✨
