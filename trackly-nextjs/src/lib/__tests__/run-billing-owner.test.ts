/**
 * Scans run by a team member (or an admin) on someone else's brand must
 * be billed to the brand owner.
 *
 * Production bug: credits were reserved against the owner, but queryAI got
 * the caller as tenantId, so tenant_cost_events rows (and the cost cap and
 * grounded-Gemini budget) landed on the caller. The credits sweeper then
 * reset the owner's monthly_used down to the owner's own (empty) ledger
 * and handed the reserved credits back. Run-path cache hits wrote no
 * ledger row at all, so the sweeper refunded those too.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const OWNER = 'owner-1';
const MEMBER = 'member-2';
const BRAND_ID = 'brand-1';
const RUN_ID = 'run-1';

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

const poolQuery = vi.fn(async (sql: string) => {
  if (sql.includes('FROM active_runs WHERE id = $1 LIMIT 1')) {
    // The caller (team member) is recorded on the run row.
    return { rows: [{ id: RUN_ID, user_id: MEMBER, total_expected: 2, platforms: ['Gemini'], queries: ['q1', 'q2'] }] };
  }
  if (sql.includes('SELECT id, user_id, data FROM brands')) {
    return { rows: [{ id: BRAND_ID, user_id: OWNER, data: { name: 'Acme' } }] };
  }
  if (sql.includes('SELECT api_keys, plan, trial_ends_at FROM users')) {
    return { rows: [{ api_keys: {}, plan: 'pro', trial_ends_at: null }] };
  }
  if (sql.includes('SELECT status FROM active_runs')) return { rows: [{ status: 'running' }] };
  if (sql.includes('SELECT data FROM brands')) return { rows: [{ data: {} }] };
  return { rows: [] };
});
vi.mock('../db', () => ({ pool: { query: (sql: string, params?: unknown[]) => poolQuery(sql, params as never) } }));

const recordCostEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('../cost-tracker', () => ({
  recordCostEvent: (...args: unknown[]) => recordCostEvent(...args),
}));

const queryAI = vi.fn();
let cacheCalls = 0;
vi.mock('../ai-platforms', () => ({
  queryAI: (...args: unknown[]) => queryAI(...args),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash'),
  estimateCost: vi.fn(() => 0),
  resolveChatGPTModel: vi.fn((_q: string, m: string) => m),
  // First task misses the cache (live provider call), second one hits.
  withCacheAndRetry: vi.fn(async (_p: unknown, fn: () => Promise<unknown>) => {
    cacheCalls++;
    if (cacheCalls === 1) return { data: await fn(), fromCache: false };
    return { data: { text: 'cached answer', model: 'gemini-2.5-flash', tokensIn: 10, tokensOut: 20 }, fromCache: true };
  }),
  withDeepRetry: vi.fn((_plat: string, fn: () => Promise<unknown>) => fn()),
  circuitBreakerCheck: vi.fn(() => false),
  recordApiKeyFailure: vi.fn(),
  resetApiKeyFailures: vi.fn(),
  acquirePlatformSlot: vi.fn(async () => () => {}),
}));

const geminiGroundingWithinBudget = vi.fn().mockResolvedValue(true);
vi.mock('../gemini-grounding-budget', () => ({
  geminiGroundingWithinBudget: (...args: unknown[]) => geminiGroundingWithinBudget(...args),
}));

const resolveKeysForTenant = vi.fn().mockResolvedValue({ source: 'server', key: 'k', pool: ['k'] });
vi.mock('../tenant-keys', () => ({
  resolveKeysForTenant: (...args: unknown[]) => resolveKeysForTenant(...args),
  recordTenantKeyResult: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../response-cache', () => ({
  isSearchEnabled: vi.fn(() => true),
  getRunCacheMaxAgeSeconds: vi.fn(() => 300),
}));
vi.mock('../search-budget', () => ({
  resolveSearchModelWithBudget: vi.fn(async (p: { model: string }) => ({ model: p.model, searchEnabled: true })),
}));
vi.mock('../site-config', () => ({ getAdminModel: vi.fn(async () => 'gemini-2.5-flash') }));
vi.mock('../parser', () => ({
  parseResponse: vi.fn(() => ({ mentioned: false, recommended: false, sentiment: 'neutral', cites: [] })),
  buildBrandMatcher: vi.fn(() => ({})),
  detectCompetitors: vi.fn(() => []),
  aggregateCompetitorCounts: vi.fn(() => ({})),
}));
vi.mock('../citations', () => ({
  mergeCitations: vi.fn(() => []),
  persistCitations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../fanout', () => ({ persistFanout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../recommendations-engine', () => ({ refreshRecommendationsAfterRun: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../helpers', () => ({
  uid: vi.fn(() => 'id'),
  decryptApiKeys: vi.fn(() => ({})),
  loadTenantFairnessSettings: vi.fn(async () => ({ weight: 1, maxQueueDepth: 100 })),
}));
vi.mock('../fairness-scheduler', () => ({ setTenantFairness: vi.fn() }));
vi.mock('../citation-hosts', () => ({ isRedirectCitationHost: vi.fn(() => false) }));
vi.mock('../server-keys', () => ({ getServerKeys: vi.fn(() => ({ GEMINI_API_KEY: ['k'] })) }));
vi.mock('../plan-config', () => ({
  applyChatGPTCohortOverride: vi.fn((m: string) => ({ model: m, inCohort: false, cohortPercent: 0, bucket: null })),
  resolveModelForPlan: vi.fn((_p: string, _plan: string, m: string) => m),
}));
vi.mock('../constants', () => ({ getEffectivePlan: vi.fn((p: string) => p) }));
vi.mock('../run-sov', () => ({ computeSovFromResults: vi.fn(() => 0) }));

let processRun: ((job: { data: { brandId: string; runId: string } }) => Promise<void>) | null = null;
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, processor: typeof processRun) { processRun = processor; }
    on() { /* noop */ }
    close() { return Promise.resolve(); }
  },
}));
vi.mock('ioredis', () => ({ default: class { quit() { return Promise.resolve(); } } }));

beforeAll(async () => {
  process.env.REDIS_URL = 'redis://test';
  await import('../run-worker');
});

beforeEach(() => {
  cacheCalls = 0;
  recordCostEvent.mockClear();
  queryAI.mockReset();
  queryAI.mockResolvedValue({ text: 'live answer', model: 'gemini-2.5-flash', tokensIn: 10, tokensOut: 20 });
  geminiGroundingWithinBudget.mockClear();
});

describe('billingTenantId', () => {
  it('returns the brand owner when a team member triggers the run', async () => {
    const { billingTenantId } = await import('../run-billing');
    expect(billingTenantId({ userId: OWNER }, MEMBER)).toBe(OWNER);
    expect(billingTenantId({ userId: null }, MEMBER)).toBe(MEMBER);
  });
});

describe('BullMQ worker bills the brand owner, not the caller', () => {
  it('passes the owner as queryAI tenantId (ledger + cost cap) and grounded budget tenant', async () => {
    expect(processRun).toBeTypeOf('function');
    await processRun!({ data: { brandId: BRAND_ID, runId: RUN_ID } });

    // Live call: queryAI writes the ledger row and runs enforceCostCap
    // against options.tenantId, so it must be the owner.
    expect(queryAI).toHaveBeenCalledTimes(1);
    const opts = queryAI.mock.calls[0][5] as { tenantId?: string };
    expect(opts.tenantId).toBe(OWNER);
    expect(opts.tenantId).not.toBe(MEMBER);

    for (const call of geminiGroundingWithinBudget.mock.calls) {
      expect(call[0]).toBe(OWNER);
    }
    expect(geminiGroundingWithinBudget).toHaveBeenCalled();

    // Tenant key lookup stays on the owner whose keys/plan apply.
    for (const call of resolveKeysForTenant.mock.calls) {
      expect((call[0] as { tenantId: string }).tenantId).toBe(OWNER);
    }
  });

  it('writes a zero-cost ledger row under the owner for a cache hit', async () => {
    await processRun!({ data: { brandId: BRAND_ID, runId: RUN_ID } });
    expect(recordCostEvent).toHaveBeenCalledTimes(1);
    expect(recordCostEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: OWNER, runId: RUN_ID, platform: 'Gemini', usdCost: 0, tokensIn: 0, tokensOut: 0,
    }));
  });
});

// The /run route pulls in Next.js runtime (after(), auth, Postgres) and
// cannot be imported here, so check its wiring at the source level.
describe('/run route bills the brand owner', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'app/api/brands/[id]/run/route.ts'),
    'utf8',
  );
  const inner = src.slice(src.indexOf('async function executeRunBackgroundInner('));

  it('derives the billing tenant from the brand owner', () => {
    expect(inner).toMatch(/const ownerTenantId = billingTenantId\(brand, userId\)/);
  });

  it('passes the owner to queryAI and the grounded-Gemini budget', () => {
    expect(inner).toMatch(/tenantId: ownerTenantId,\s*\n\s*brandId,\s*\n\s*runId,/);
    expect(inner).toMatch(/geminiGroundingWithinBudget\(ownerTenantId, ownerPlan\)/);
    expect(inner).not.toMatch(/tenantId: userId/);
    expect(inner).not.toMatch(/geminiGroundingWithinBudget\(userId/);
  });

  it('records cache hits on the owner ledger', () => {
    expect(inner).toMatch(/if \(cached\.fromCache\) \{\s*await recordCacheHitCredit\(\{\s*tenantId: ownerTenantId/);
  });
});
