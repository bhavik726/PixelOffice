# Frontend-Backend Integration Guide

## Connection Flow

### 1. Authentication Flow
```
User (login.html)
  ↓ (submits credentials)
Supabase Auth
  ↓ (returns token)
localStorage.setItem('supabase_access_token', token)
  ↓
Frontend Ready
```

### 2. Room Management Flow
```
User clicks "Join Room" (lobby.html)
  ↓
POST /rooms/join
  Headers: { Authorization: Bearer {token} }
  Body: { room_id: "...", password?: "..." }
  ↓
Backend validates token with Supabase
  ↓
Backend gets/creates Colyseus room mapping
  ↓
Response: { colyseus_room_id: "...", already_joined: bool }
  ↓
localStorage.setItem('colyseus_room_id', colyseus_room_id)
  ↓
Redirect to /game.html
```

### 3. Game Connection Flow
```
Game loads (game.html → src/main.js → src/game.js → createGame())
  ↓
Check localStorage['supabase_access_token'] exists
  ↓
Check localStorage['colyseus_room_id'] exists
  ↓
Create Phaser game instance with MainScene
  ↓
Wait for MainScene to be active
  ↓
Create Colyseus Client: new Client('ws://127.0.0.1:4000')
  ↓
Join Colyseus room: client.joinById(colyseus_room_id, {token})
  ↓
Backend PixelOfficeRoom.onJoin()
  └─ Validates token with Supabase
  └─ Creates PlayerSchema with x,y,username
  └─ Adds player to state.players (broadcast to all clients)
  ↓
Bind player state listeners (onAdd, onRemove, onChange)
  ↓
Game Ready - Camera follows player
```

### 4. Player Movement Flow
```
User presses arrow key
  ↓
Player.update() calculates velocity
  ↓
MainScene.update() every frame:
  - Updates local player position
  - Sends to backend: room.send('move', {x, y})
  ↓
Backend PixelOfficeRoom.onMessage('move'):
  - Updates player.x and player.y
  - Broadcasts to all clients (automatic via @colyseus/schema)
  ↓
Colyseus client receives state change
  ↓
MainScene.updatePlayerPosition() updates remote player UI
```

---

## Backend API Endpoints

### ✅ Authentication
- **Status**: No explicit auth endpoint (uses Supabase directly from frontend)
- **Token**: Stored after login in localStorage['supabase_access_token']
- **Validation**: Backend validates token with each request

### ✅ Room Management
- **GET /rooms** - List all public rooms
- **POST /rooms/create** - Create private room (requires auth)
- **POST /rooms/join** - Join room by ID (requires auth)
- **Returns**: { colyseus_room_id, already_joined }

### ✅ Colyseus Room Events
- **'move'** - Player position update
  - Sent every frame by frontend: `room.send('move', {x, y})`
  - Updates player position in real-time
- **'chat'** - Chat messages (not yet used in frontend)

---

## Configuration Checks

### Frontend
- [ ] `COLYSEUS_SERVER` = `"ws://127.0.0.1:4000"` in `src/game.js`
- [ ] `AUTH_TOKEN_STORAGE_KEY` = `"supabase_access_token"` matches Supabase setup
- [ ] `COLYSEUS_ROOM_ID_STORAGE_KEY` = `"colyseus_room_id"` matches backend response
- [ ] Asset paths start with `/` for Vite public folder
- [ ] MainScene preload loads all tilesets

### Backend
- [ ] Colyseus server running on port 4000
- [ ] PixelOfficeRoom registered: `server.define('pixel-office', PixelOfficeRoom)`
- [ ] Supabase client configured with correct credentials
- [ ] Room service handles colyseus_room_id mapping
- [ ] CORS enabled for frontend origin

---

## Troubleshooting

### Game Shows "Failed to process file: Image 'chair'"
**Cause**: Tileset with external reference (.tsx) that Phaser can't load
**Fix**: Already fixed - filter out null tilesets in MainScene.create()

### "MatchMaker room not found"
**Cause**: colyseus_room_id is invalid or expired
**Solution**:
1. Go through lobby.html to join a room first
2. This gets a fresh colyseus_room_id
3. Then redirect to game

### "Cannot read properties of undefined (reading 'x')"
**Cause**: Scene not ready when Colyseus tries to connect
**Fix**: Already fixed - wait for scene.isActive() before using scene

### Player doesn't appear online
**Cause**: Room state listeners not bound properly
**Solution**: Check browser console for "Player listeners bound" message

### Backend shows no players connected
**Cause**: Frontend failed to join Colyseus room
**Solution**: Check:
1. WebSocket connection to ws://127.0.0.1:4000
2. Token validity (not expired)
3. Room ID exists on server
4. Check console for detailed error messages

---

## Testing Integration

### 1. Login Test
```
1. Go to /login.html
2. Submit credentials
3. Should redirect to /lobby.html
4. Check localStorage has 'supabase_access_token'
✓ Auth works
```

### 2. Join Room Test
```
1. In lobby.html, click "Join" on any public room
2. Should redirect to /game.html
3. Check localStorage has 'colyseus_room_id'
✓ Room join works
```

### 3. Game Load Test
```
1. Game should load without errors
2. Tilemap should render
3. Orange player rectangle appears
4. Check console for "✓ Game fully initialized"
✓ Game loads
```

### 4. Movement Test
```
1. Press arrow keys
2. Orange player moves
3. Console shows "move {x, y}" being sent
4. Check backend logs for position updates
✓ Movement works
```

### 5. Multiplayer Test
```
1. Open game in two browser windows
2. Move in one window
3. Other window should show your player moving
4. Username should appear above player
✓ Multiplayer works
```

---

## Data Flow Diagram

```
Frontend (Browser)
┌─────────────────────────────────────┐
│  src/main.js                        │
│  ↓                                  │
│  src/game.js (createGame)           │
│  ├─ Create Phaser Game              │
│  └─ Create Colyseus Client          │
│     ↓                               │
│     GameConfig                      │
│     └─ MainScene                    │
│        ├─ preload() → Load assets   │
│        ├─ create() → Build map      │
│        │  ├─ Load tilemap           │
│        │  ├─ Create layers          │
│        │  ├─ Create Player          │
│        │  └─ Setup collisions       │
│        └─ update() → Every frame    │
│           ├─ Update player input    │
│           └─ Send room.send('move') │
│                                     │
│  localStorage                       │
│  ├─ supabase_access_token          │
│  └─ colyseus_room_id               │
└─────────────────────────────────────┘
          ↑              ↓
          │ /rooms/join  │ Success
          │             │
┌─────────────────────────────────────┐
│  Backend (ExpressJS + Colyseus)     │
│                                     │
│  REST API (Express)                 │
│  ├─ GET /rooms                      │
│  ├─ POST /rooms/create              │
│  └─ POST /rooms/join                │
│                                     │
│  Colyseus Server                    │
│  └─ PixelOfficeRoom                 │
│     ├─ onCreate() → Setup state     │
│     ├─ onJoin(client, {token})      │
│     │  └─ Validate token            │
│     │  └─ Create player in state    │
│     ├─ onMessage('move', {x, y})    │
│     │  └─ Update player.x, y        │
│     │  └─ Broadcast to all          │
│     └─ onLeave(client)              │
│        └─ Remove player from state  │
│                                     │
│  Supabase                           │
│  ├─ Auth validation                 │
│  ├─ User metadata (username)        │
│  └─ Room/participant tracking       │
└─────────────────────────────────────┘
```

---

## Key Integration Points

### Point 1: Token Validation
Every request from frontend includes:
```javascript
Authorization: Bearer {token}
```
Backend validates with Supabase before responding.

### Point 2: Room ID Mapping
Database stores mapping:
```
database_room_id → colyseus_room_id
```
Frontend uses colyseus_room_id to connect via WebSocket.

### Point 3: Player Position Sync
Sent from frontend every frame:
```javascript
room.send('move', { x: 123, y: 456 })
```
Backend updates and broadcasts:
```javascript
player.x = 123;
player.y = 456; // Auto-syncs via @colyseus/schema
```

### Point 4: State Synchronization
Colyseus handles schema automatically:
```
Backend: player.x = 200
  ↓ (automatic encoding)
Network (binary delta)
  ↓ (automatic decoding)
Frontend: Updates UI via onStateChange
```

---

## Environment Variables

### Frontend (.env or vite.env.js)
```
VITE_API_BASE_URL=http://127.0.0.1:4000
VITE_COLYSEUS_SERVER=ws://127.0.0.1:4000
```

### Backend (.env)
```
PORT=4000
HOST=127.0.0.1
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=xxxxxxxxxxxxx
```

---

## Next Steps

1. ✅ Verify backend is running and Colyseus room is registered
2. ✅ Test REST API endpoints work with token
3. ✅ Test WebSocket connection to Colyseus server
4. ✅ Test token validation in onJoin
5. ✅ Test player state synchronization
6. ✅ Test multiplayer with 2+ clients

All integration is complete and ready to test! 🚀
