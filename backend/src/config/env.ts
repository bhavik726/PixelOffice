import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT || '4000',
  HOST: process.env.HOST || '0.0.0.0',
  SERVER_URL: process.env.SERVER_URL || 'wss://your-domain.com',
  ROOM_INACTIVITY_TIMEOUT_MS: process.env.ROOM_INACTIVITY_TIMEOUT_MS || '300000',
  NETWORK_DIAGNOSTICS: process.env.NETWORK_DIAGNOSTICS || '0',
  CLOUDFLARE_TURN_KEY_ID: process.env.CLOUDFLARE_TURN_KEY_ID || '',
  CLOUDFLARE_TURN_API_TOKEN: process.env.CLOUDFLARE_TURN_API_TOKEN || '',
  CLOUDFLARE_TURN_TTL_SECONDS: process.env.CLOUDFLARE_TURN_TTL_SECONDS || '43200',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};
