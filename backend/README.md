# Metaverse Backend

Production-ready backend for a 2D multiplayer metaverse app (Gather/Town style).

## Tech Stack

- Node.js (TypeScript)
- Express.js
- Colyseus
- Supabase (PostgreSQL + Auth)
- JWT Auth

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Run `npm install`.
3. Start dev server: `npm run dev`.

## Folder Structure

- `src/config` - Configuration files
- `src/routes` - Express routes
- `src/controllers` - Route controllers
- `src/services` - Business logic
- `src/middleware` - Express middleware
- `src/rooms` - Colyseus room classes
- `src/models` - Data models/types
- `src/utils` - Utility functions

## Scripts

- `npm run dev` - Start dev server
- `npm run build` - Build TypeScript
- `npm start` - Run production build
- `npm run lint` - Lint code
- `npm run format` - Format code
