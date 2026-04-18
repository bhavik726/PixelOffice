export const CONNECT_RADIUS = 120;
export const DISCONNECT_RADIUS = 140;
export const PROXIMITY_RADIUS = CONNECT_RADIUS;
export const PROXIMITY_POLL_INTERVAL = 200;

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
  }

  return fallback;
}

export const PEER_CONFIG = {
  host: env.VITE_PEER_HOST || '127.0.0.1',
  port: toNumber(env.VITE_PEER_PORT, 9000),
  path: env.VITE_PEER_PATH || '/peerjs',
  secure: toBoolean(env.VITE_PEER_SECURE, false),
};

export const getIceServers = () => {
  return [
    {
      urls: env.VITE_STUN_URL || 'stun:stun.l.google.com:19302',
    },
    {
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    },
  ];
};