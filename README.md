# PixelOffice - 2D Multiplayer Metaverse Office

PixelOffice is a real-time multiplayer virtual office with room-based presence, avatar movement, chat, WebRTC proximity media, and shared whiteboard interaction.

## Tech Stack

- Frontend: Phaser 3 + Vite (JavaScript)
- Realtime Networking: Colyseus client and server
- Backend API/Game Server: Node.js + TypeScript + Express + Colyseus
- Database: Supabase (PostgreSQL)
- Whiteboard: WBO app in a separate service

## Monorepo Structure

- `backend/` - API + Colyseus server
- `frontend/` - Phaser client app
- `whiteboard/` - standalone WBO app (separately deployed)

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase project (URL + service role key)

## Environment Variables

Backend variables are defined in `backend/.env.example`.

Required keys:

- `PORT` (example: `4000`)
- `HOST` (example: `0.0.0.0`)
- `SERVER_URL` (example: `ws://127.0.0.1:4000`)
- `ROOM_INACTIVITY_TIMEOUT_MS` (example: `300000`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

Setup:

1. Copy `backend/.env.example` to `backend/.env`.
2. Fill all secret values in `backend/.env`.
3. Do not commit `.env` files.

Optional frontend environment variables:

- `VITE_API_BASE_URL` (defaults to `http://127.0.0.1:4000`)
- `VITE_COLYSEUS_URL` (defaults to ws/wss derived from API base URL)

## Database Setup (Supabase)

Schema file:

- `backend/db/supabase.sql`

Run in Supabase SQL Editor or with psql:

```bash
psql "<SUPABASE_DB_URL>" -f backend/db/supabase.sql
```

## Local Development

Run backend and frontend in separate terminals.

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Default server endpoint: `http://127.0.0.1:4000`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local URL in terminal (typically `http://127.0.0.1:5173` or `http://localhost:5173`).

### 3) Whiteboard Service (separate app)

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
- Deploy whiteboard as a third, separate service.
- Confirm frontend points to the correct backend and whiteboard URLs in production.
- Ensure CORS/origin settings allow frontend -> backend and frontend -> whiteboard communication.
- Use HTTPS/WSS in production.

## Useful Scripts

Backend (`backend/package.json`):

- `npm run dev` - development server (ts-node-dev)
- `npm run build` - TypeScript build
- `npm start` - run built server from `dist/`
- `npm run lint` - lint TypeScript source
- `npm run format` - format files

Frontend (`frontend/package.json`):

- `npm run dev` - Vite dev server
- `npm run build` - production build
- `npm run preview` - preview built app
- `npm run lint` - lint frontend source

## Troubleshooting

- Room join fails:
	- verify backend is running and `COLYSEUS_ROOM_ID_STORAGE_KEY` exists in browser storage flow.
	- clear stale local storage and rejoin from lobby.
- WebRTC unavailable:
	- allow camera/microphone permissions in browser.
	- verify HTTPS context in production.
- Whiteboard does not open:
	- verify whiteboard service is running and reachable from frontend origin.

## Security Checklist

- Never commit `backend/.env` or any secret values.
- Rotate `JWT_SECRET` and Supabase keys if accidentally exposed.
- Keep service role keys only on backend.