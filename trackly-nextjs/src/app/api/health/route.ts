import IORedis from 'ioredis';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Health check is hot path on autoscaled pods (DO probes every 10s).
// Time-bounded to avoid blocking under degraded-dependency conditions.
const PROBE_TIMEOUT_MS = 1500;

type ProbeResult = {
  ok: boolean;
  latency_ms: number;
  error?: string;
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeDb(): Promise<ProbeResult> {
  const started = Date.now();
  try {
    await withTimeout(pool.query('SELECT 1'), PROBE_TIMEOUT_MS, 'db');
    return { ok: true, latency_ms: Date.now() - started };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - started, error: (e as Error).message };
  }
}

// Reuse a single dedicated client across requests so the health probe
// doesn't open a new TCP connection per call.
let healthRedisClient: IORedis | null = null;
let healthRedisInitFailed = false;

function getHealthRedisClient(): IORedis | null {
  if (healthRedisClient) return healthRedisClient;
  if (healthRedisInitFailed) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout: 1500,
    });
    client.on('error', () => {
      // Swallow - probeRedis returns the error in the response body.
    });
    healthRedisClient = client;
    return client;
  } catch {
    healthRedisInitFailed = true;
    return null;
  }
}

async function probeRedis(): Promise<ProbeResult & { configured: boolean }> {
  const started = Date.now();
  if (!process.env.REDIS_URL) {
    return { ok: true, latency_ms: 0, configured: false };
  }
  const client = getHealthRedisClient();
  if (!client) {
    return { ok: false, latency_ms: 0, configured: true, error: 'redis client init failed' };
  }
  try {
    const reply = await withTimeout(client.ping(), PROBE_TIMEOUT_MS, 'redis');
    const ok = reply === 'PONG';
    return {
      ok,
      latency_ms: Date.now() - started,
      configured: true,
      ...(ok ? {} : { error: `unexpected ping reply: ${reply}` }),
    };
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      configured: true,
      error: (e as Error).message,
    };
  }
}

export async function GET() {
  const [db, redis] = await Promise.all([probeDb(), probeRedis()]);

  // Redis is required for cross-pod cron locking + BullMQ once #407 lands,
  // but graceful: if REDIS_URL isn't configured (dev / single-pod fallback)
  // we don't fail the probe just because Redis is absent.
  const redisOk = redis.configured ? redis.ok : true;
  const ok = db.ok && redisOk;

  return Response.json(
    {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(process.uptime()),
      checks: {
        db: { ok: db.ok, latency_ms: db.latency_ms, ...(db.error ? { error: db.error } : {}) },
        redis: {
          ok: redis.ok,
          configured: redis.configured,
          latency_ms: redis.latency_ms,
          ...(redis.error ? { error: redis.error } : {}),
        },
      },
    },
    { status: ok ? 200 : 503 }
  );
}
