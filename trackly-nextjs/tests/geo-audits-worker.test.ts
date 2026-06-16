import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the Regional Audits worker (processGeoAudit).
 *
 * Strategy: mock pg.pool query-by-query and inject a stub callProvider
 * (the LLM call seam exposed on processGeoAudit's options). Asserts:
 *   - claim-and-run lifecycle: queued → running → done
 *   - per-(region × prompt × platform) result rows are persisted
 *   - mention detection wires through to mentions_count
 *   - refundCredits is invoked when received < total_expected
 *   - per-call provider failures don't abort the audit
 *   - already-claimed (status != 'queued') short-circuits with no work
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

// We don't need real ai-platforms / parser / tenant-keys / server-keys
// modules - the worker only uses them through the default callProvider,
// which we override via opts.callProvider in tests below.
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

import { processGeoAudit, GEO_AUDIT_PLATFORMS } from '../src/lib/geo-audits';

const AUDIT_ID = 'a-1';
const USER_ID = 'u-1';
const BRAND_ID = 'b-1';

interface AuditState {
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  regions: string[];
  prompts: string[];
  totalExpected: number;
  receivedFinal?: number;
  mentionsFinal?: number;
  errorFinal?: string | null;
}

function setupAuditQueries(state: AuditState) {
  // resultsInserted accumulates the per-call rows the worker
  // persists; the final tally SELECT rebuilds COUNT(*) from this.
  const resultsInserted: Array<{ mentioned: boolean; error: string | null }> = [];

  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    // ensureGeoAuditsSchema's CREATEs and ALTERs:
    if (/CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    // claimAuditForRunning
    if (/UPDATE geo_audits[\s\S]*SET status = 'running'/i.test(sql)) {
      if (state.status === 'queued') {
        state.status = 'running';
        return { rows: [{ id: AUDIT_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    // load audit row
    if (/SELECT id, user_id, brand_id, regions, prompts_count, total_expected/i.test(sql)) {
      return { rows: [{
        id: AUDIT_ID,
        user_id: USER_ID,
        brand_id: BRAND_ID,
        regions: state.regions,
        prompts_count: state.prompts.length,
        total_expected: state.totalExpected,
      }] };
    }
    // load prompts back from row
    if (/SELECT prompts FROM geo_audits/i.test(sql)) {
      return { rows: [{ prompts: state.prompts }] };
    }
    // user keys
    if (/SELECT api_keys FROM users/i.test(sql)) {
      return { rows: [{ api_keys: {} }] };
    }
    // INSERT into geo_audit_results - capture mention/error so the
    // final tally SELECT below can compute COUNT(*) consistently.
    if (/INSERT INTO geo_audit_results/i.test(sql)) {
      const p = params || [];
      resultsInserted.push({
        mentioned: !!p[7],
        error: (p[8] as string | null) ?? null,
      });
      return { rows: [], rowCount: 1 };
    }
    // tally + finalize SELECTs
    if (/SELECT[\s\S]*COUNT\(\*\)[\s\S]*received[\s\S]*FROM geo_audit_results/i.test(sql)) {
      const received = resultsInserted.filter((r) => !r.error).length;
      const mentions = resultsInserted.filter((r) => r.mentioned && !r.error).length;
      return { rows: [{ received: String(received), mentions: String(mentions) }] };
    }
    if (/SELECT COUNT\(\*\)::int AS received FROM geo_audit_results/i.test(sql)) {
      const received = resultsInserted.filter((r) => !r.error).length;
      return { rows: [{ received }] };
    }
    // finalize UPDATE
    if (/UPDATE geo_audits[\s\S]*SET status = \$2/i.test(sql)) {
      // params: [id=$1, status=$2, received=$3, mentions=$4,
      //          mention_rate=$5, error=$6]
      const p = params || [];
      state.status = (p[1] as AuditState['status']) ?? state.status;
      state.receivedFinal = Number(p[2]) || 0;
      state.mentionsFinal = Number(p[3]) || 0;
      state.errorFinal = (p[5] as string | null) ?? null;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
  return { resultsInserted };
}

beforeEach(() => {
  queryMock.mockReset();
  refundCreditsMock.mockClear();
});
afterEach(() => { vi.clearAllMocks(); });

describe('processGeoAudit', () => {
  it('runs queued → done, persisting one result per (region × prompt × platform) and refunding only unreserved credits', async () => {
    const regions = ['United States', 'France'];
    const prompts = ['best running shoes'];
    const totalExpected = regions.length * prompts.length * GEO_AUDIT_PLATFORMS.length;
    const state: AuditState = { status: 'queued', regions, prompts, totalExpected };
    const { resultsInserted } = setupAuditQueries(state);

    const callProvider = vi.fn(async () => ({
      model: 'mock-model',
      response: 'Sure - try Brand X for that.',
      mentioned: true,
      error: null,
    }));

    await processGeoAudit(AUDIT_ID, {
      callProvider,
      loadBrand: async () => ({ id: BRAND_ID, user_id: USER_ID, data: { name: 'Brand X' } }),
    });

    // One call per (region × prompt × platform).
    expect(callProvider).toHaveBeenCalledTimes(totalExpected);
    expect(resultsInserted).toHaveLength(totalExpected);
    // All called with mentioned=true; mentions_count should match.
    expect(resultsInserted.every((r) => r.mentioned)).toBe(true);
    expect(state.status).toBe('done');
    expect(state.mentionsFinal).toBe(totalExpected);
    expect(state.receivedFinal).toBe(totalExpected);

    // Every call returned a successful (non-error) result, so the
    // worker has no headroom to refund.
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it('refunds the unconsumed reservation when some calls fail', async () => {
    const regions = ['Japan'];
    const prompts = ['best ramen'];
    const totalExpected = regions.length * prompts.length * GEO_AUDIT_PLATFORMS.length;
    const state: AuditState = { status: 'queued', regions, prompts, totalExpected };
    setupAuditQueries(state);

    let callIdx = 0;
    const callProvider = vi.fn(async () => {
      callIdx++;
      // Fail half the calls (alternate). Each failed call writes a row
      // with error != null and contributes 0 to received.
      if (callIdx % 2 === 0) {
        return { model: 'mock-model', response: null, mentioned: false, error: 'Provider 503' };
      }
      return { model: 'mock-model', response: 'r', mentioned: false, error: null };
    });

    await processGeoAudit(AUDIT_ID, {
      callProvider,
      loadBrand: async () => ({ id: BRAND_ID, user_id: USER_ID, data: { name: 'B' } }),
    });

    expect(callProvider).toHaveBeenCalledTimes(totalExpected);
    expect(state.status).toBe('done');
    // ceil(5/2) = 3 successes for 5 calls
    const successes = Math.ceil(totalExpected / 2);
    expect(state.receivedFinal).toBe(successes);
    // The unconsumed half-ish gets refunded.
    expect(refundCreditsMock).toHaveBeenCalledTimes(1);
    expect(refundCreditsMock.mock.calls[0]?.[1]).toBe(totalExpected - successes);
  });

  it('short-circuits when the audit is no longer queued (already-claimed race)', async () => {
    const regions = ['Brazil'];
    const prompts = ['p'];
    const totalExpected = regions.length * prompts.length * GEO_AUDIT_PLATFORMS.length;
    const state: AuditState = { status: 'running', regions, prompts, totalExpected };
    setupAuditQueries(state);

    const callProvider = vi.fn(async () => ({
      model: null, response: null, mentioned: false, error: null,
    }));

    await processGeoAudit(AUDIT_ID, {
      callProvider,
      loadBrand: async () => ({ id: BRAND_ID, user_id: USER_ID, data: { name: 'B' } }),
    });

    // Claim failed (status was already 'running'); worker exits before
    // any provider call.
    expect(callProvider).not.toHaveBeenCalled();
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it('fails the audit and refunds the entire reservation when the brand is missing', async () => {
    const regions = ['India'];
    const prompts = ['p1', 'p2'];
    const totalExpected = regions.length * prompts.length * GEO_AUDIT_PLATFORMS.length;
    const state: AuditState = { status: 'queued', regions, prompts, totalExpected };
    setupAuditQueries(state);

    const callProvider = vi.fn();

    await processGeoAudit(AUDIT_ID, {
      callProvider,
      loadBrand: async () => null, // brand vanished mid-flight
    });

    expect(callProvider).not.toHaveBeenCalled();
    expect(state.status).toBe('failed');
    expect(state.errorFinal).toBe('Brand not found');
    expect(refundCreditsMock).toHaveBeenCalledWith(USER_ID, totalExpected, 'manual');
  });
});
