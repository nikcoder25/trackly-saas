/**
 * BullMQ job queue for background brand runs.
 *
 * POLICY (2026-04-18): default to in-process execution. Queue mode must
 * be explicitly opted into with QUEUE_MODE=auto|always. This reverses
 * the previous default, which would silently enqueue jobs to Redis
 * whenever REDIS_URL was set - even if no worker dyno existed to
 * consume them. That left `active_runs` rows stuck at 'running', the
 * cron reaper would flip them to 'error', `brands.data.runs` was never
 * appended, and the dashboard "Last Run" clock froze for every paid
 * brand. See PR #361 for the original worker-detection fallback; this
 * file replaces it with a conservative default that guarantees runs
 * actually execute.
 *
 * QUEUE_MODE values (env):
 *   never   - always in-process via Next.js after() (default, safe)
 *   auto    - enqueue if a worker is connected AND the queue isn't
 *             backlogged; otherwise fall back to in-process
 *   always  - enqueue unconditionally (caller trusts that a worker
 *             exists; DO NOT use without a verified worker dyno)
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let queue: Queue | null = null;
let connection: IORedis | null = null;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL || null;
}

type QueueMode = 'never' | 'auto' | 'always';

function getQueueMode(): QueueMode {
  const raw = (process.env.QUEUE_MODE || '').toLowerCase().trim();
  if (raw === 'auto' || raw === 'always') return raw;
  return 'never';
}

/**
 * Returns true when the caller should enqueue to BullMQ instead of
 * running the work in-process.
 *
 * Defaults to `false` unless QUEUE_MODE opts in. In `auto` mode, we
 * additionally verify a worker is connected AND the queue isn't
 * backlogged (an old waiting job means connected workers aren't
 * actually consuming - a "ghost worker" scenario that defeated the
 * previous PR #361 check).
 */
const WORKER_CHECK_TTL_MS = 30_000;
const BACKLOG_AGE_MAX_MS = 5 * 60_000; // 5 min
let cachedDecision: { at: number; available: boolean } | null = null;

export async function isQueueAvailable(): Promise<boolean> {
  const mode = getQueueMode();
  if (mode === 'never') return false;
  if (!getRedisUrl()) return false;

  if (mode === 'always') return true;

  // mode === 'auto'
  const now = Date.now();
  if (cachedDecision && now - cachedDecision.at < WORKER_CHECK_TTL_MS) {
    return cachedDecision.available;
  }

  let available = false;
  try {
    const q = getQueue();
    const workers = await q.getWorkers();
    if (workers.length > 0) {
      // Additional liveness signal: if there's a waiting job older than
      // BACKLOG_AGE_MAX_MS, the "worker" isn't actually consuming and
      // we should fall back to in-process.
      const waitingJobs = await q.getJobs(['waiting'], 0, 0);
      const oldestAgeMs = waitingJobs[0]
        ? now - (waitingJobs[0].timestamp ?? now)
        : 0;
      available = oldestAgeMs < BACKLOG_AGE_MAX_MS;
    }
  } catch {
    // Redis unreachable - caller will use in-process fallback
    available = false;
  }

  cachedDecision = { at: now, available };
  return available;
}

export function getQueue(): Queue {
  if (!queue) {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
      throw new Error('REDIS_URL is not set - cannot create job queue');
    }
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue('brand-runs', { connection });
  }
  return queue;
}

// Job payload is intentionally minimal: provider API keys (server-side
// env keys + decrypted user keys) MUST NOT be serialized into Redis.
// The worker re-reads brand state from Postgres and re-derives keys
// from env / users.api_keys on pickup.
export interface BrandRunJobData {
  brandId: string;
  runId: string;
}

export async function enqueueBrandRun(data: BrandRunJobData): Promise<void> {
  const q = getQueue();
  await q.add('run', data, {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1, // no retries - runs are tracked in active_runs table
  });
}
