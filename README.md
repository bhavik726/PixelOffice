# PixelOffice - 2D Multiplayer Metaverse Office

PixelOffice is a real-time multiplayer virtual office with room-based presence, avatar movement, chat, WebRTC proximity media, and shared whiteboard interaction.

## Tech Stack

- Frontend: Phaser 3 + Vite (JavaScript)
- Realtime Networking: Colyseus client and server
- Backend API/Game Server: Node.js + TypeScript + Express + Colyseus
- Peer Signaling: PeerJS server
- Database: Supabase (PostgreSQL)
- Whiteboard: WBO app in a separate service

## Monorepo Structure

- `backend/` - API + Colyseus server
- `frontend/` - Phaser client app
- `backend/peer-server.js` - PeerJS signaling server used by WebRTC media
- `whiteboard/` - standalone WBO app (separately deployed)

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase project (URL + service role key)
- Optional for local whiteboard service: Docker or Node.js (see `whiteboard/README.md`)

## Environment Variables

Backend variables are defined in `backend/.env.example`.

Required backend keys:

- `PORT` (example: `4000`)
- `HOST` (example: `0.0.0.0`)
- `SERVER_URL` (example: `ws://127.0.0.1:4000`)
- `ROOM_INACTIVITY_TIMEOUT_MS` (example: `300000`)
- `NETWORK_DIAGNOSTICS` (`0` or `1`, default `0`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Setup:

1. Copy `backend/.env.example` to `backend/.env`.
2. Fill all secret values in `backend/.env`.
3. Do not commit `.env` files.

Frontend variables are defined in `frontend/.env.example`.

Setup:

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Update values for your local or deployed services.

Frontend keys:

- `VITE_API_BASE_URL` (defaults to `http://127.0.0.1:4000`)
- `VITE_COLYSEUS_URL` (defaults to ws/wss derived from API base URL)
- `VITE_WHITEBOARD_BASE_URL` (defaults to `http://127.0.0.1:8080` in local dev; set this in production when the whiteboard is deployed separately)
- `VITE_PEER_HOST` (defaults to `127.0.0.1`)
- `VITE_PEER_PORT` (defaults to `9000`)
- `VITE_PEER_PATH` (defaults to `/peerjs`)
- `VITE_PEER_SECURE` (`true` or `false`, defaults to `false`)
- `VITE_PEER_WARMUP_URL` (optional health/warmup URL used by lobby)
- `VITE_STUN_URL` (optional; defaults to Google STUN if empty)
- `VITE_TURN_URL` (optional; recommended for production NAT traversal)
- `VITE_TURN_USERNAME` (required when TURN is used)
- `VITE_TURN_CREDENTIAL` (required when TURN is used)

## Database Setup (Supabase)

Schema file:

- `backend/db/supabase.sql`

Run in Supabase SQL Editor or with psql:

```bash
psql "<SUPABASE_DB_URL>" -f backend/db/supabase.sql
```

## Local Development

Run services in separate terminals.

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Default server endpoint: `http://127.0.0.1:4000`

### 2) PeerJS signaling server (for voice/video)

From the backend folder:

```bash
cd backend
node peer-server.js
```

Defaults: `HOST=0.0.0.0`, `PORT=9000`, `PATH=/peerjs`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local URL in terminal (typically `http://127.0.0.1:5173` or `http://localhost:5173`).

### 4) Whiteboard Service (optional, separate app)

The `whiteboard/` folder is an independent WBO application and should be deployed and managed separately from backend/frontend.

- For local run and deployment, use instructions in `whiteboard/README.md`.
- Ensure the whiteboard URL used by frontend is reachable from your deployed frontend.

## Production Build and Run

### Backend

```bash
cd backend
npm install
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
npm run preview
```

## Deployment Notes

- Deploy backend and frontend as separate services.
- Deploy PeerJS signaling as another reachable service (or alongside backend with proper routing/ports).
- Deploy whiteboard as a separate service.
- Confirm frontend points to the correct backend, PeerJS, and whiteboard URLs in production.
- Ensure CORS/origin settings allow frontend -> backend and frontend -> whiteboard communication.
- Use HTTPS/WSS in production.

## Useful Scripts

Backend (`backend/package.json`):

- `npm run dev` - development server (ts-node-dev)
- `npm run build` - TypeScript build
- `npm start` - run built server from `dist/`
- `npm run lint` - lint TypeScript source
- `npm run format` - format files
- `node peer-server.js` - start PeerJS signaling server (WebRTC signaling)

Frontend (`frontend/package.json`):

- `npm run dev` - Vite dev server
- `npm run build` - production build
- `npm run preview` - preview built app
- `npm run lint` - lint frontend source

## Troubleshooting

- Room join fails:
	- verify backend is running and reachable at `VITE_API_BASE_URL`.
	- verify Colyseus endpoint (`VITE_COLYSEUS_URL`) is correct for your environment.
	- clear stale local storage and rejoin from lobby.
- WebRTC unavailable:
	- allow camera/microphone permissions in browser.
	- verify PeerJS signaling server is reachable at `VITE_PEER_HOST`/`VITE_PEER_PORT`/`VITE_PEER_PATH`.
	- if users are behind strict NAT/firewall, configure TURN (`VITE_TURN_*`).
	- verify HTTPS context in production.
- Whiteboard does not open:
	- verify `VITE_WHITEBOARD_BASE_URL` points to a reachable whiteboard deployment.
	- verify whiteboard service is running and reachable from frontend origin.

## Security Checklist

- Never commit `.env` files or secret values.
- Rotate Supabase and TURN credentials if accidentally exposed.
- Keep service role keys only on backend.