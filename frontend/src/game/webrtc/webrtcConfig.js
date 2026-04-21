export const CONNECT_RADIUS = 120;
export const DISCONNECT_RADIUS = 140;
export const PROXIMITY_RADIUS = CONNECT_RADIUS;
export const PROXIMITY_POLL_INTERVAL = 200;

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const API_BASE_URL = env.VITE_API_BASE_URL || 'http://127.0.0.1:4000';

let cachedRemoteIceServers = null;
let cachedRemoteIceExpiresAtMs = 0;
let inflightIceRequest = null;

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

function normalizeUrls(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  // Supports JSON array env values, e.g. ["turn:...", "turns:..."]
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      // Ignore JSON parse errors and continue with comma/newline split.
    }
  }

  // Supports comma-separated or newline-separated values.
  return trimmed
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterBrowserBlockedTurnPorts(urls) {
  // Cloudflare may return port 53 TURN URLs that commonly time out in browsers.
  return urls.filter((url) => !/^turns?:turn\.cloudflare\.com:53\b/i.test(url));
}

export const PEER_CONFIG = {
  host: env.VITE_PEER_HOST || '127.0.0.1',
  port: toNumber(env.VITE_PEER_PORT, 9000),
  path: env.VITE_PEER_PATH || '/peerjs',
  secure: toBoolean(env.VITE_PEER_SECURE, false),
};

export const getIceServers = () => {
  const stunUrls = normalizeUrls(env.VITE_STUN_URL, ['stun:stun.l.google.com:19302']);
  const turnUrls = filterBrowserBlockedTurnPorts(normalizeUrls(env.VITE_TURN_URL));

  return [
    {
      urls: stunUrls,
    },
    ...(turnUrls.length > 0 && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL
      ? [
          {
            urls: turnUrls,
            username: env.VITE_TURN_USERNAME,
            credential: env.VITE_TURN_CREDENTIAL,
          },
        ]
      : []),
  ];
};

function isIceServerShape(server) {
  return Boolean(server && (typeof server.urls === 'string' || Array.isArray(server.urls)));
}

function normalizeIceServerList(servers) {
  if (!Array.isArray(servers)) {
    return [];
  }

  return servers
    .filter(isIceServerShape)
    .map((server) => {
      const urls = filterBrowserBlockedTurnPorts(normalizeUrls(server.urls));
      if (urls.length === 0) {
        return null;
      }

      return {
        urls,
        ...(server.username ? { username: String(server.username) } : {}),
        ...(server.credential ? { credential: String(server.credential) } : {}),
      };
    })
    .filter(Boolean);
}

function parseExpiresAtMs(expiresAt) {
  if (typeof expiresAt !== 'string') {
    return 0;
  }

  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getIceServersAsync = async () => {
  const now = Date.now();
  if (cachedRemoteIceServers && now < cachedRemoteIceExpiresAtMs - 60 * 1000) {
    return cachedRemoteIceServers;
  }

  if (!inflightIceRequest) {
    inflightIceRequest = fetch(`${API_BASE_URL}/rtc/ice`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`ICE request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const iceServers = normalizeIceServerList(payload?.iceServers);
        if (iceServers.length === 0) {
          throw new Error('ICE response missing valid iceServers');
        }

        const expiresAtMs = parseExpiresAtMs(payload?.expiresAt);
        cachedRemoteIceServers = iceServers;
        cachedRemoteIceExpiresAtMs = expiresAtMs || Date.now() + 10 * 60 * 1000;
        return iceServers;
      })
      .finally(() => {
        inflightIceRequest = null;
      });
  }

  try {
    return await inflightIceRequest;
  } catch (error) {
    console.warn('[WebRTC] Falling back to env ICE config', error);
    return getIceServers();
  }
};