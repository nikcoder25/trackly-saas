import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoke tests for GET /api/geo-audits/[id] — the route the new
 * Screen 02 drill-down page consumes. We mock pg.pool so we can
 * assert the response shape + the ownership check without standing
 * up a database.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

// The detail route imports ensureGeoAuditsSchema from the lib module.
// Stub it so we don't accidentally exercise the real CREATE TABLEs.
vi.mock('../src/lib/geo-audits', () => ({
  ensureGeoAuditsSchema: vi.fn(async () => {}),
}));

import { GET } from '../src/app/api/geo-audits/[id]/route';

function fakeRequest(): Request {
  return new Request('http://localhost/api/geo-audits/aud-1');
}
function asParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

describe('GET /api/geo-audits/[id]', () => {
  it('returns 400 when no id is provided', async () => {
    const resp = await GET(fakeRequest(), asParams(''));
    expect(resp.status).toBe(400);
  });

  it('returns 404 when the audit does not exist', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM geo_audits WHERE id = \$1/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest(), asParams('aud-missing'));
    expect(resp.status).toBe(404);
  });

  it('returns 404 when the audit belongs to a different user (no leak)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM geo_audits WHERE id = \$1/i.test(sql)) {
        return { rows: [{
          id: 'aud-x',
          user_id: 'someone-else',
          brand_id: 'b1',
          regions: ['India'],
          prompts: ['p1'],
          prompts_count: 1,
          status: 'done',
          mentions_count: 0,
          total_expected: 5,
          received: 5,
          error: null,
          created_at: new Date('2026-04-30T10:00:00Z'),
          started_at: new Date('2026-04-30T10:00:01Z'),
          completed_at: new Date('2026-04-30T10:00:30Z'),
        }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest(), asParams('aud-x'));
    expect(resp.status).toBe(404);
    const body = await resp.json();
    // Same copy as the not-found case so the boundary doesn't leak existence.
    expect(body.error).toBe('Audit not found');
  });

  it('returns the joined audit + per-call results on the happy path', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM geo_audits WHERE id = \$1/i.test(sql)) {
        return { rows: [{
          id: 'aud-1',
          user_id: 'u1',
          brand_id: 'brand-1',
          regions: ['India'],
          prompts: ['best running shoes'],
          prompts_count: 1,
          status: 'done',
          mentions_count: 3,
          total_expected: 5,
          received: 5,
          error: null,
          created_at: new Date('2026-04-30T10:00:00Z'),
          started_at: new Date('2026-04-30T10:00:01Z'),
          completed_at: new Date('2026-04-30T10:00:30Z'),
        }] };
      }
      if (/FROM geo_audit_results/i.test(sql)) {
        return { rows: [
          { id: 'r1', region: 'India', prompt_text: 'best running shoes', platform: 'ChatGPT', model: 'gpt-4o', response: 'Try Brand X.', mentioned: true, error: null, created_at: new Date('2026-04-30T10:00:05Z') },
          { id: 'r2', region: 'India', prompt_text: 'best running shoes', platform: 'Perplexity', model: 'sonar', response: 'Brand X is popular.', mentioned: true, error: null, created_at: new Date('2026-04-30T10:00:08Z') },
        ] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest(), asParams('aud-1'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.audit.id).toBe('aud-1');
    expect(body.audit.brandId).toBe('brand-1');
    expect(body.audit.prompts).toEqual(['best running shoes']);
    expect(body.audit.mentionsCount).toBe(3);
    expect(body.audit.received).toBe(5);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].promptText).toBe('best running shoes');
    expect(body.results[0].platform).toBe('ChatGPT');
    expect(body.results[0].mentioned).toBe(true);
  });
});
