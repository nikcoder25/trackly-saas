import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the "persist mention_rate on every audit row"
 * upgrade.
 *
 * Asserts:
 *   1. ensureGeoAuditsSchema emits the additive ALTER for mention_rate
 *      and runs the historical backfill update.
 *   2. The worker's finalize path UPDATE writes mention_rate alongside
 *      mentions_count + received, computed as mentions / received,
 *      with `null` when received === 0 (no division-by-zero, no
 *      misleading 0.0%).
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: {
    query: (...args: Parameters<QueryFn>) => queryMock(...args),
    connect: vi.fn(),
  },
}));

const refundCreditsMock = vi.fn(async () => {});
vi.mock('../src/lib/credits', () => ({
  refundCredits: (...args: unknown[]) => refundCreditsMock(...(args as [])),
  reserveCredits: vi.fn(async () => ({
    ok: true, reserved: 0, remaining: 1000, monthlyCap: 1000,
    manualRemainingToday: 100, manualDailyCap: 100, nextResetAt: new Date().toISOString(),
  })),
}));

vi.mock('../src/lib/ai-platforms', () => ({
  queryAI: vi.fn(),
  getDefaultModel: vi.fn(() => 'mock-model'),
  pickBestKey: vi.fn((arr: string[]) => arr[0] || null),
  acquirePlatformSlot: vi.fn(async () => () => {}),
}));
vi.mock('../src/lib/tenant-keys', () => ({
  resolveKeysForTenant: vi.fn(async () => null),
}));
vi.mock('../src/lib/server-keys', () => ({
  getServerKeys: vi.fn(() => ({})),
}));

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  refundCreditsMock.mockClear();
  vi.resetModules();
});
afterEach(() => { vi.clearAllMocks(); });

describe('ensureGeoAuditsSchema - mention_rate persistence (#schema-upgrade-1)', () => {
  it('emits an additive ALTER TABLE … ADD COLUMN IF NOT EXISTS mention_rate NUMERIC', async () => {
    const { ensureGeoAuditsSchema } = await import('../src/lib/geo-audits');
    await ensureGeoAuditsSchema();
    const alterCall = queryMock.mock.calls.find(
      ([sql]) => /ALTER TABLE geo_audits[\s\S]*ADD COLUMN IF NOT EXISTS mention_rate NUMERIC/i.test(sql),
    );
    expect(alterCall).toBeDefined();
  });

  it('backfills historical terminal rows where mention_rate IS NULL', async () => {
    const { ensureGeoAuditsSchema } = await import('../src/lib/geo-audits');
    await ensureGeoAuditsSchema();
    const backfill = queryMock.mock.calls.find(
      ([sql]) =>
        /UPDATE geo_audits/i.test(sql) &&
        /SET mention_rate/i.test(sql) &&
        /mention_rate IS NULL/i.test(sql) &&
        /received\s*>\s*0/i.test(sql),
    );
    expect(backfill).toBeDefined();
    // Must be safely scoped to terminal statuses so an in-flight
    // 'queued' audit doesn't get a premature mention_rate.
    expect(backfill![0]).toMatch(/status IN \(\s*'done'\s*,\s*'failed'\s*,\s*'cancelled'\s*\)/i);
  });
});

describe('processGeoAudit - finalize writes mention_rate', () => {
  // We exercise the worker end-to-end so finalizeAudit's UPDATE
  // captures real call counts. Per-call results are stubbed via the
  // callProvider seam.

  interface AuditState {
    status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
    regions: string[];
    prompts: string[];
    totalExpected: number;
    finalizeMentionRate?: number | null;
  }

  function setupAuditQueries(state: AuditState) {
    const resultsInserted: Array<{ mentioned: boolean; error: string | null }> = [];
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE|UPDATE geo_audits[\s\S]*SET mention_rate/i.test(sql)
          && !/SET status = \$2/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/UPDATE geo_audits[\s\S]*SET status = 'running'/i.test(sql)) {
        if (state.status === 'queued') {
          state.status = 'running';
          return { rows: [{ id: 'a-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT id, user_id, brand_id, regions, prompts_count, total_expected/i.test(sql)) {
        return { rows: [{
          id: 'a-1',
          user_id: 'u-1',
          brand_id: 'b-1',
          regions: state.regions,
          prompts_count: state.prompts.length,
          total_expected: state.totalExpected,
        }] };
      }
      if (/SELECT prompts FROM geo_audits/i.test(sql)) {
        return { rows: [{ prompts: state.prompts }] };
      }
      if (/SELECT api_keys FROM users/i.test(sql)) {
        return { rows: [{ api_keys: {} }] };
      }
      if (/INSERT INTO geo_audit_results/i.test(sql)) {
        const p = params || [];
        resultsInserted.push({ mentioned: !!p[7], error: (p[8] as string | null) ?? null });
        return { rows: [], rowCount: 1 };
      }
      // Tally inside finalizeAudit
      if (/SELECT[\s\S]*COUNT\(\*\)[\s\S]*received[\s\S]*FROM geo_audit_results/i.test(sql)) {
        const received = resultsInserted.filter((r) => !r.error).length;
        const mentions = resultsInserted.filter((r) => r.mentioned && !r.error).length;
        return { rows: [{ received: String(received), mentions: String(mentions) }] };
      }
      // Final received-only count for the credit reconciliation
      if (/SELECT COUNT\(\*\)::int AS received FROM geo_audit_results/i.test(sql)) {
        const received = resultsInserted.filter((r) => !r.error).length;
        return { rows: [{ received }] };
      }
      // Finalize UPDATE - the assertion target for these tests.
      // params[]: id, status, received, mentions_count, mention_rate, error
      if (/UPDATE geo_audits[\s\S]*SET status = \$2/i.test(sql)) {
        const p = params || [];
        state.status = (p[1] as AuditState['status']) ?? state.status;
        const mentionRate = p[4] as number | null;
        state.finalizeMentionRate = mentionRate;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });
    return { resultsInserted };
  }

  it('writes mention_rate = mentions / received when received > 0', async () => {
    const { processGeoAudit } = await import('../src/lib/geo-audits');
    const state: AuditState = {
      status: 'queued',
      regions: ['India'],
      prompts: ['p1'], // 1 region × 1 prompt × 5 platforms = 5 calls
      totalExpected: 5,
    };
    setupAuditQueries(state);

    let i = 0;
    const callProvider = vi.fn(async () => {
      i++;
      // 3 of 5 are mentioned; expect mention_rate = 3 / 5 = 0.6
      return {
        model: 'mock-model',
        response: 'r',
        mentioned: i <= 3,
        error: null,
      };
    });

    await processGeoAudit('a-1', {
      callProvider,
      loadBrand: async () => ({ id: 'b-1', user_id: 'u-1', data: { name: 'Brand X' } }),
    });

    expect(state.status).toBe('done');
    expect(typeof state.finalizeMentionRate).toBe('number');
    expect(state.finalizeMentionRate).toBeCloseTo(0.6, 5);
  });

  it('writes mention_rate = null when zero calls succeeded (avoids misleading 0.0%)', async () => {
    const { processGeoAudit } = await import('../src/lib/geo-audits');
    const state: AuditState = {
      status: 'queued',
      regions: ['India'],
      prompts: ['p1'],
      totalExpected: 5,
    };
    setupAuditQueries(state);

    const callProvider = vi.fn(async () => ({
      model: null, response: null, mentioned: false, error: 'Provider 503',
    }));

    await processGeoAudit('a-1', {
      callProvider,
      loadBrand: async () => ({ id: 'b-1', user_id: 'u-1', data: { name: 'Brand X' } }),
    });

    expect(state.status).toBe('done');
    // received === 0 → mention_rate left null so the UI can render
    // an honest empty-state instead of "0.0%".
    expect(state.finalizeMentionRate).toBe(null);
  });
});
