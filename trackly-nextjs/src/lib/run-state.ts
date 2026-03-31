/**
 * In-memory run state tracking — mirrors the Express app's activeRuns + brandRunLocks.
 * Used by the run, run-status, and force-release API routes.
 *
 * Note: This is per-process state. In a multi-instance deploy, the DB advisory
 * lock in the run route provides cross-instance safety.
 */

export interface RunResult {
  platform: string;
  query: string;
  mentioned: boolean;
  recommended?: boolean;
  sentiment?: string;
  listPosition?: number | null;
  citations?: string[];
  competitorMentions?: string[];
  model?: string;
  snippet?: string;
  context?: string;
  error?: boolean;
  errorMessage?: string;
  cached?: boolean;
  cost?: number | null;
  tokensIn?: number;
  tokensOut?: number;
  locationRelevant?: boolean;
  matchedLocation?: string;
}

export interface ActiveRun {
  status: 'running' | 'done' | 'error';
  brandId: string;
  userId: string;
  runId: string;
  totalExpected: number;
  received: number;
  foundCount: number;
  errorCount: number;
  platforms: string[];
  queries: string[];
  results: RunResult[];
  finalData: Record<string, unknown> | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
  aborted?: boolean;
}

export interface BrandLock {
  lockedAt: number;
}

const MAX_LOCK_AGE_MS = 10 * 60 * 1000; // 10 minutes

// Global maps survive Next.js hot reload via globalThis
const g = globalThis as unknown as {
  _activeRuns?: Map<string, ActiveRun>;
  _brandRunLocks?: Map<string, BrandLock>;
};

export const activeRuns: Map<string, ActiveRun> = (g._activeRuns ??= new Map());
export const brandRunLocks: Map<string, BrandLock> = (g._brandRunLocks ??= new Map());

/** Try to acquire a brand lock. Returns true if acquired, false if already locked. */
export function acquireBrandLock(brandId: string, force = false): boolean {
  if (brandRunLocks.has(brandId) && !force) {
    const lock = brandRunLocks.get(brandId)!;
    const age = Date.now() - lock.lockedAt;

    // Auto-release expired locks
    if (age > MAX_LOCK_AGE_MS) {
      const activeRun = [...activeRuns.values()].find(r => r.brandId === brandId && r.status === 'running');
      if (activeRun) {
        activeRun.status = 'error';
        activeRun.completedAt = Date.now();
        activeRun.aborted = true;
      }
      brandRunLocks.delete(brandId);
    } else {
      // Check if there's actually a running run
      const activeRun = [...activeRuns.values()].find(r => r.brandId === brandId && r.status === 'running');
      if (activeRun) return false; // genuinely locked
      // Stale/orphaned lock — release it
      brandRunLocks.delete(brandId);
    }
  }

  if (force && brandRunLocks.has(brandId)) {
    const activeRun = [...activeRuns.values()].find(r => r.brandId === brandId && r.status === 'running');
    if (activeRun) {
      activeRun.status = 'error';
      activeRun.completedAt = Date.now();
      activeRun.aborted = true;
    }
    brandRunLocks.delete(brandId);
  }

  brandRunLocks.set(brandId, { lockedAt: Date.now() });
  return true;
}

export function releaseBrandLock(brandId: string): void {
  brandRunLocks.delete(brandId);
}

/** Periodic cleanup: remove completed runs older than 10 min from memory */
export function cleanupStaleRuns(): void {
  const cutoff = Date.now() - MAX_LOCK_AGE_MS;
  for (const [runId, run] of activeRuns) {
    if (run.status !== 'running' && run.completedAt && run.completedAt < cutoff) {
      activeRuns.delete(runId);
    }
  }
}
