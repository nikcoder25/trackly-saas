/**
 * Per-tenant fairness scheduler for the platform slot semaphore.
 *
 * Replaces the single FIFO `waiters[]` per platform that existed in
 * `acquirePlatformSlot` (ai-platforms.ts). With a global FIFO, one
 * big tenant kicking off 30 ChatGPT queries would starve every other
 * tenant for the duration of those 30 calls. This scheduler instead
 * keeps one waiter list per (platform, tenantId) and dequeues across
 * tenants in weighted round-robin order, so a small tenant submitting
 * 1 query 100ms after a 30-task tenant completes well before the
 * 30-task tenant finishes.
 *
 * Design constraints (from issue #410):
 *   - Concurrency cap stays per-platform global (`maxConcurrent`).
 *     Fairness is in the dequeue order, NOT the cap.
 *   - Storage layer is pluggable: in-process today, swap for Redis
 *     once #407 lands without rewriting the scheduling logic.
 *   - Abort-aware (signal). A timed-out waiter must remove itself
 *     from its tenant queue without freezing the dispatcher.
 *   - Per-tenant queue depth cap (default 100). Beyond that, acquire
 *     throws a tagged error so the caller can surface a 429.
 *   - Per-tenant weight (default 1). Higher weight ⇒ more grants per
 *     round before yielding to other tenants.
 */

const DEFAULT_TENANT_ID = '__default__';
const DEFAULT_WEIGHT = 1;
const DEFAULT_MAX_QUEUE_DEPTH = Number(process.env.AI_FAIRNESS_MAX_QUEUE_DEPTH) || 100;

export interface FairnessError extends Error {
  isQueueOverflow?: boolean;
  isTransient?: boolean;
  isRateLimit?: boolean;
  tenantId?: string;
  platform?: string;
  // HTTP status hint for callers wrapping this in an API response.
  statusHint?: number;
}

function fairnessError(message: string, fields: Partial<FairnessError>): FairnessError {
  const e = new Error(message) as FairnessError;
  Object.assign(e, fields);
  return e;
}

export interface AcquireOptions {
  platform: string;
  tenantId?: string;
  weight?: number;
  maxQueueDepth?: number;
  signal?: AbortSignal;
  // Per-platform global concurrency cap. Caller (ai-platforms.ts)
  // passes the value from PLATFORM_LIMITS so the scheduler does not
  // need to know provider-specific config.
  maxConcurrent: number;
}

interface Waiter {
  resolve: () => void;
  reject: (e: Error) => void;
  signal?: AbortSignal;
  detach?: () => void;
  enqueuedAt: number;
}

interface TenantQueue {
  id: string;
  weight: number;
  active: number;
  waiters: Waiter[];
  totalAcquired: number;
  totalRejected: number;
  // Round-robin "credits" - how many more grants this tenant gets
  // in the current round before the round refreshes.
  credits: number;
}

interface PlatformState {
  inFlight: number;
  tenants: Map<string, TenantQueue>;
  // Insertion-ordered tenant IDs. The dispatcher walks this list
  // starting at `cursor` to pick the next-fairest waiter.
  tenantOrder: string[];
  cursor: number;
}

export interface TenantQueueMetrics {
  tenantId: string;
  active: number;
  queued: number;
  weight: number;
  totalAcquired: number;
  totalRejected: number;
}

export interface PlatformFairnessMetrics {
  platform: string;
  inFlight: number;
  totalQueued: number;
  tenants: TenantQueueMetrics[];
}

// ── Pluggable storage layer ─────────────────────────────────────
// Today: in-process Map. Once #407 lands, the Redis-backed impl can
// implement this same surface using Lua-script-based atomic state
// transitions; the scheduler logic stays unchanged.
export interface FairnessStorage {
  getOrCreate(platform: string): PlatformState;
  list(): Map<string, PlatformState>;
  reset(): void;
}

class InMemoryFairnessStorage implements FairnessStorage {
  private platforms = new Map<string, PlatformState>();

  getOrCreate(platform: string): PlatformState {
    let s = this.platforms.get(platform);
    if (!s) {
      s = { inFlight: 0, tenants: new Map(), tenantOrder: [], cursor: 0 };
      this.platforms.set(platform, s);
    }
    return s;
  }

  list(): Map<string, PlatformState> {
    return this.platforms;
  }

  reset(): void {
    this.platforms.clear();
  }
}

let _storage: FairnessStorage = new InMemoryFairnessStorage();

export function getFairnessStorage(): FairnessStorage {
  return _storage;
}

export function setFairnessStorage(storage: FairnessStorage): void {
  _storage = storage;
}

// ── Tenant settings cache ───────────────────────────────────────
// Per-tenant weight + maxQueueDepth read once and cached in-process.
// Caller (run route / worker) resolves these from `users.settings`
// at run start and calls `setTenantFairness` so the scheduler can
// fish them out without a DB hit on every acquire.
interface TenantSettings { weight: number; maxQueueDepth: number; }
const _tenantSettings = new Map<string, TenantSettings>();

export function setTenantFairness(tenantId: string, settings: Partial<TenantSettings>): void {
  if (!tenantId) return;
  const existing = _tenantSettings.get(tenantId) || { weight: DEFAULT_WEIGHT, maxQueueDepth: DEFAULT_MAX_QUEUE_DEPTH };
  if (typeof settings.weight === 'number' && settings.weight > 0) existing.weight = settings.weight;
  if (typeof settings.maxQueueDepth === 'number' && settings.maxQueueDepth > 0) {
    existing.maxQueueDepth = settings.maxQueueDepth;
  }
  _tenantSettings.set(tenantId, existing);
}

export function getTenantFairness(tenantId: string): TenantSettings {
  return _tenantSettings.get(tenantId) || { weight: DEFAULT_WEIGHT, maxQueueDepth: DEFAULT_MAX_QUEUE_DEPTH };
}

export function clearTenantFairnessCache(): void {
  _tenantSettings.clear();
}

// ── Core scheduler ──────────────────────────────────────────────
function getTenant(state: PlatformState, tenantId: string, weight: number): TenantQueue {
  let t = state.tenants.get(tenantId);
  if (!t) {
    t = {
      id: tenantId,
      weight,
      active: 0,
      waiters: [],
      totalAcquired: 0,
      totalRejected: 0,
      credits: weight,
    };
    state.tenants.set(tenantId, t);
    state.tenantOrder.push(tenantId);
  } else if (t.weight !== weight) {
    // A later acquire from the same tenant with a freshly-loaded
    // weight (e.g. plan upgrade) should take effect on the next
    // round without requiring a process restart.
    t.weight = weight;
  }
  return t;
}

function pruneTenantIfIdle(state: PlatformState, tenantId: string): void {
  const t = state.tenants.get(tenantId);
  if (!t) return;
  if (t.active === 0 && t.waiters.length === 0) {
    state.tenants.delete(tenantId);
    const idx = state.tenantOrder.indexOf(tenantId);
    if (idx !== -1) {
      state.tenantOrder.splice(idx, 1);
      // Keep cursor in range. Picking the next tenant becomes
      // ambiguous when the removed tenant sat before the cursor;
      // adjust so we never skip a tenant entirely.
      if (state.tenantOrder.length === 0) {
        state.cursor = 0;
      } else if (idx < state.cursor) {
        state.cursor = (state.cursor - 1) % state.tenantOrder.length;
      } else {
        state.cursor = state.cursor % state.tenantOrder.length;
      }
    }
  }
}

// Pick the next waiter to wake using deficit-style weighted round-robin.
// Walks `tenantOrder` from `cursor`. Skips tenants with empty queues.
// A tenant must have `credits > 0` to win a grant. When NO tenant with
// a non-empty queue has credits, all tenants refresh credits to their
// weight (start of a new round) and we retry.
function pickNextWaiter(state: PlatformState): { tenant: TenantQueue; waiter: Waiter } | null {
  if (state.tenantOrder.length === 0) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const start = state.cursor % state.tenantOrder.length;
    let sawAnyWaiter = false;
    for (let i = 0; i < state.tenantOrder.length; i++) {
      const idx = (start + i) % state.tenantOrder.length;
      const tenantId = state.tenantOrder[idx];
      const t = state.tenants.get(tenantId);
      if (!t || t.waiters.length === 0) continue;
      sawAnyWaiter = true;
      if (t.credits <= 0) continue;
      const waiter = t.waiters.shift()!;
      t.credits -= 1;
      // Advance the cursor by 1 so the next dispatch starts after
      // this tenant - prevents one weight=10 tenant from monopolizing
      // the dispatcher within a single burst.
      state.cursor = (idx + 1) % state.tenantOrder.length;
      return { tenant: t, waiter };
    }
    if (!sawAnyWaiter) return null;
    // No tenant with waiters had credits. Refresh round.
    for (const id of state.tenantOrder) {
      const t = state.tenants.get(id);
      if (t) t.credits = t.weight;
    }
  }
  return null;
}

// Wake the next waiter if there is global capacity and a queued waiter.
// Idempotent - safe to call from `release` and from `acquire`.
function dispatch(platform: string, maxConcurrent: number): void {
  const state = _storage.getOrCreate(platform);
  while (state.inFlight < maxConcurrent) {
    const next = pickNextWaiter(state);
    if (!next) return;
    state.inFlight += 1;
    next.tenant.active += 1;
    next.tenant.totalAcquired += 1;
    if (next.waiter.detach) next.waiter.detach();
    // Resolve outside the loop iteration to keep the state mutation
    // ordering observable to whoever inspects metrics next.
    next.waiter.resolve();
  }
}

export async function acquirePlatformSlotFair(opts: AcquireOptions): Promise<() => void> {
  const platform = opts.platform;
  const tenantId = opts.tenantId || DEFAULT_TENANT_ID;
  const cached = getTenantFairness(tenantId);
  const weight = (typeof opts.weight === 'number' && opts.weight > 0) ? opts.weight : cached.weight;
  const maxQueueDepth = (typeof opts.maxQueueDepth === 'number' && opts.maxQueueDepth > 0)
    ? opts.maxQueueDepth
    : cached.maxQueueDepth;
  const maxConcurrent = opts.maxConcurrent;
  const signal = opts.signal;

  if (signal?.aborted) {
    throw fairnessError(`acquirePlatformSlot aborted for ${platform}`, {
      isTransient: false, tenantId, platform,
    });
  }

  const state = _storage.getOrCreate(platform);
  const tenant = getTenant(state, tenantId, weight);

  // Fast path: capacity available AND nobody else queued ahead of us
  // for any tenant (otherwise we would jump the line).
  const anyoneQueued = state.tenantOrder.some(id => {
    const t = state.tenants.get(id);
    return !!t && t.waiters.length > 0;
  });
  if (state.inFlight < maxConcurrent && !anyoneQueued) {
    state.inFlight += 1;
    tenant.active += 1;
    tenant.totalAcquired += 1;
    return makeReleaser(platform, tenantId, maxConcurrent);
  }

  // Queue overflow: the tenant already has too many waiters parked.
  // Reject loudly so the caller can surface a 429.
  if (tenant.waiters.length >= maxQueueDepth) {
    tenant.totalRejected += 1;
    throw fairnessError(
      `${platform}: per-tenant queue overflow (depth=${tenant.waiters.length}, max=${maxQueueDepth})`,
      {
        isQueueOverflow: true,
        isTransient: false,
        isRateLimit: true,
        tenantId,
        platform,
        statusHint: 429,
      },
    );
  }

  // Slow path: queue.
  return new Promise<() => void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve: () => resolve(makeReleaser(platform, tenantId, maxConcurrent)),
      reject,
      signal,
      enqueuedAt: Date.now(),
    };
    if (signal) {
      const onAbort = () => {
        const idx = tenant.waiters.indexOf(waiter);
        if (idx !== -1) tenant.waiters.splice(idx, 1);
        pruneTenantIfIdle(state, tenantId);
        // If our removal opens a slot for another tenant, dispatch it.
        // (Capacity didn't change, but the per-round credit landscape may have.)
        dispatch(platform, maxConcurrent);
        reject(fairnessError(
          `acquirePlatformSlot aborted for ${platform}`,
          { isTransient: false, tenantId, platform },
        ));
      };
      waiter.detach = () => signal.removeEventListener('abort', onAbort);
      signal.addEventListener('abort', onAbort, { once: true });
    }
    tenant.waiters.push(waiter);
    // Defensive: if we somehow have headroom right now (e.g. a race
    // where capacity opened up between the fast-path check and here),
    // dispatch immediately so we don't park unnecessarily.
    dispatch(platform, maxConcurrent);
  });
}

function makeReleaser(platform: string, tenantId: string, maxConcurrent: number): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const state = _storage.getOrCreate(platform);
    state.inFlight = Math.max(0, state.inFlight - 1);
    const t = state.tenants.get(tenantId);
    if (t) t.active = Math.max(0, t.active - 1);
    pruneTenantIfIdle(state, tenantId);
    dispatch(platform, maxConcurrent);
  };
}

// ── Metrics ─────────────────────────────────────────────────────
export function getPlatformFairnessMetrics(platform: string): PlatformFairnessMetrics {
  const state = _storage.list().get(platform);
  if (!state) {
    return { platform, inFlight: 0, totalQueued: 0, tenants: [] };
  }
  const tenants: TenantQueueMetrics[] = [];
  let totalQueued = 0;
  for (const id of state.tenantOrder) {
    const t = state.tenants.get(id);
    if (!t) continue;
    totalQueued += t.waiters.length;
    tenants.push({
      tenantId: t.id,
      active: t.active,
      queued: t.waiters.length,
      weight: t.weight,
      totalAcquired: t.totalAcquired,
      totalRejected: t.totalRejected,
    });
  }
  return { platform, inFlight: state.inFlight, totalQueued, tenants };
}

export function getAllFairnessMetrics(): PlatformFairnessMetrics[] {
  const out: PlatformFairnessMetrics[] = [];
  for (const platform of _storage.list().keys()) {
    out.push(getPlatformFairnessMetrics(platform));
  }
  return out;
}

// ── Test helpers ────────────────────────────────────────────────
// Tests need a clean slate between cases. Production callers should
// never invoke this - it discards in-flight counts and waiter queues.
export function _resetFairnessForTests(): void {
  _storage.reset();
  _tenantSettings.clear();
}
