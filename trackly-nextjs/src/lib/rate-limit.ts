/**
 * Rate limiter backed by PostgreSQL for persistence across deploys and instances.
 * Falls back to in-memory if DB is unavailable.
 *
 * Same API as before: rateLimit(key, windowMs, max) - but now async.
 */
import { pool } from './db';

// In-memory fallback (used if DB call fails)
const memStore = new Map<string, { count: number; resetAt: number }>();

// Auto-create table on first use
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INT NOT NULL DEFAULT 1,
        reset_at BIGINT NOT NULL
      )
    `);
    tableReady = true;
  } catch {
    // Table creation failed - will use in-memory fallback
  }
}

// Cleanup expired entries periodically (called lazily, not on interval)
let lastCleanup = 0;
async function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return; // every 5 minutes
  lastCleanup = now;
  try {
    await pool.query('DELETE FROM rate_limits WHERE reset_at < $1', [now]);
  } catch {}
  // Also clean in-memory fallback
  for (const [k, v] of memStore) {
    if (now > v.resetAt) memStore.delete(k);
  }
}

function memFallback(key: string, windowMs: number, max: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count++;
  if (entry.count > max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

export async function rateLimit(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  const resetAt = now + windowMs;

  try {
    await ensureTable();
    cleanupIfNeeded().catch(() => {}); // fire-and-forget with error suppression

    // Atomic upsert: increment count if window is still active, reset if expired
    const result = await pool.query(
      `INSERT INTO rate_limits (key, count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.reset_at < $3 THEN 1
           ELSE rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN rate_limits.reset_at < $3 THEN $2
           ELSE rate_limits.reset_at
         END
       RETURNING count, reset_at`,
      [key, resetAt, now]
    );

    const row = result.rows[0];
    const count = row.count;
    const windowEnd = Number(row.reset_at);

    if (count > max) {
      const retryAfter = Math.ceil((windowEnd - now) / 1000);
      return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
    }
    return { allowed: true, retryAfter: 0 };
  } catch {
    // DB unavailable - fall back to in-memory
    return memFallback(key, windowMs, max);
  }
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: `Too many requests. Please retry after ${retryAfter} seconds.`, retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

// Extract the caller IP from a standard Next.js Request. Prefers the first
// entry of X-Forwarded-For (the client, not intermediate proxies), falling
// back to X-Real-IP and finally a literal "unknown" bucket so rate-limit
// keys are never null.
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

export interface DualLimitConfig {
  user?: { max: number; windowMs: number };
  ip?: { max: number; windowMs: number };
}

// Combined per-user AND per-IP rate limit check. The user bucket stops a
// single authenticated account from spamming an endpoint; the IP bucket
// caps damage if one attacker cycles through many compromised accounts
// from the same host. `bucket` namespaces the keys so two endpoints using
// the same (userId, ip) pair don't share counters.
export async function checkUserIpRateLimit(
  bucket: string,
  userId: string | null | undefined,
  ip: string | null | undefined,
  limits: DualLimitConfig,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (userId && limits.user) {
    const r = await rateLimit(`${bucket}:u:${userId}`, limits.user.windowMs, limits.user.max);
    if (!r.allowed) return r;
  }
  if (ip && limits.ip) {
    const r = await rateLimit(`${bucket}:ip:${ip}`, limits.ip.windowMs, limits.ip.max);
    if (!r.allowed) return r;
  }
  return { allowed: true, retryAfter: 0 };
}
