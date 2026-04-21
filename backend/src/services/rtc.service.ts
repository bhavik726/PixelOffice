import { env } from '../config/env';
import { logger } from '../utils/logger';

type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

type CachedIce = {
  iceServers: IceServer[];
  expiresAtMs: number;
};

type CloudflareResponse = {
  iceServers?: Array<{
    urls?: string[];
    username?: string;
    credential?: string;
  }>;
};

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 86400;
const DEFAULT_TTL_SECONDS = 43200;

let cachedIce: CachedIce | null = null;
let inflightRefresh: Promise<CachedIce> | null = null;

function parseTtlSeconds(): number {
  const parsed = Number(env.CLOUDFLARE_TURN_TTL_SECONDS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TTL_SECONDS;
  }

  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(parsed)));
}

function getRefreshWindowMs(ttlSeconds: number): number {
  const tenPercent = Math.floor((ttlSeconds * 1000) / 10);
  return Math.min(5 * 60 * 1000, Math.max(30 * 1000, tenPercent));
}

function isStillFresh(cache: CachedIce, nowMs: number): boolean {
  const ttlSeconds = parseTtlSeconds();
  const refreshWindowMs = getRefreshWindowMs(ttlSeconds);
  return nowMs < cache.expiresAtMs - refreshWindowMs;
}

function normalizeIceServers(iceServers: CloudflareResponse['iceServers']): IceServer[] {
  if (!Array.isArray(iceServers)) {
    throw new Error('Invalid Cloudflare TURN response: missing iceServers array');
  }

  return iceServers
    .map((server) => {
      const rawUrls = Array.isArray(server?.urls) ? server.urls : [];
      const urls = rawUrls
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((url) => !/^turns?:turn\.cloudflare\.com:53\b/i.test(url));

      if (urls.length === 0) {
        return null;
      }

      return {
        urls,
        ...(server?.username ? { username: server.username } : {}),
        ...(server?.credential ? { credential: server.credential } : {}),
      };
    })
    .filter((item): item is IceServer => Boolean(item));
}

async function fetchCloudflareIceServers(): Promise<CachedIce> {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !apiToken) {
    throw new Error('Cloudflare TURN is not configured: missing CLOUDFLARE_TURN_KEY_ID or CLOUDFLARE_TURN_API_TOKEN');
  }

  const ttlSeconds = parseTtlSeconds();
  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: ttlSeconds }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare TURN request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as CloudflareResponse;
  const normalized = normalizeIceServers(data.iceServers);
  if (normalized.length === 0) {
    throw new Error('Cloudflare TURN response did not include any usable ICE URLs');
  }

  return {
    iceServers: normalized,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  };
}

export async function getCloudflareIceServers() {
  const nowMs = Date.now();

  if (cachedIce && isStillFresh(cachedIce, nowMs)) {
    return {
      iceServers: cachedIce.iceServers,
      expiresAt: new Date(cachedIce.expiresAtMs).toISOString(),
      source: 'cache',
    } as const;
  }

  if (!inflightRefresh) {
    inflightRefresh = fetchCloudflareIceServers()
      .then((next) => {
        cachedIce = next;
        return next;
      })
      .finally(() => {
        inflightRefresh = null;
      });
  }

  try {
    const refreshed = await inflightRefresh;
    return {
      iceServers: refreshed.iceServers,
      expiresAt: new Date(refreshed.expiresAtMs).toISOString(),
      source: 'cloudflare',
    } as const;
  } catch (error) {
    if (cachedIce) {
      logger.warn('Using stale cached ICE servers after refresh failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        iceServers: cachedIce.iceServers,
        expiresAt: new Date(cachedIce.expiresAtMs).toISOString(),
        source: 'stale-cache',
      } as const;
    }

    throw error;
  }
}
