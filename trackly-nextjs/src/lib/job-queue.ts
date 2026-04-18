/**
 * BullMQ job queue for background brand runs.
 * Uses Redis (via REDIS_URL) to offload run execution from the Next.js after() callback,
 * preventing OOM crashes at scale.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let queue: Queue | null = null;
let connection: IORedis | null = null;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL || null;
}

/**
 * Returns true only when:
 *   1. REDIS_URL is set, AND
 *   2. At least one BullMQ worker is currently connected to the queue.
 *
 * (2) is critical. Before this check, enqueuing silently succeeded whenever
 * Redis was reachable even if no worker process was running - jobs would
 * sit in Redis forever, `active_runs` rows would stay `'running'` until
 * the cron reaper flipped them to `'error'`, and `brands.data.runs`
 * would never be appended, which is exactly the "Last Run frozen"
 * symptom we saw on production. When no worker is present we return
 * false so callers fall back to in-process `after()` execution.
 *
 * Cached for a short window so we don't issue a `CLIENT LIST` on every
 * /run request. Short enough that a worker dying is detected within a
 * minute; long enough to absorb a burst of concurrent runs.
 */
const WORKER_CHECK_TTL_MS = 30_000;
let cachedDecision: { at: number; available: boolean } | null = null;

export async function isQueueAvailable(): Promise<boolean> {
  if (!getRedisUrl()) return false;

  const now = Date.now();
  if (cachedDecision && now - cachedDecision.at < WORKER_CHECK_TTL_MS) {
    return cachedDecision.available;
  }

  let available = false;
  try {
    const workers = await getQueue().getWorkers();
    available = workers.length > 0;
  } catch {
    // Redis unreachable - caller will use after() fallback
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

export interface BrandRunJobData {
  brandId: string;
  userId: string;
  runId: string;
  totalExpected: number;
  activePlatforms: string[];
  queries: string[];
  serverKeys: Record<string, string[]>;
  userKeys: Record<string, string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brand: any;
}

export async function enqueueBrandRun(data: BrandRunJobData): Promise<void> {
  const q = getQueue();
  await q.add('run', data, {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1, // no retries - runs are tracked in active_runs table
  });
}
