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

export function isQueueAvailable(): boolean {
  return !!getRedisUrl();
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
