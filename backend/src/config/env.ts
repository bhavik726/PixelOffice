import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT || '4000',
  HOST: process.env.HOST || '0.0.0.0',
  SERVER_URL: process.env.SERVER_URL || 'ws://127.0.0.1:4000',
  ROOM_INACTIVITY_TIMEOUT_MS: process.env.ROOM_INACTIVITY_TIMEOUT_MS || '300000',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || 'changeme',
};
