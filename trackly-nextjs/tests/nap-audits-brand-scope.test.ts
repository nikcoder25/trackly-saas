import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the brand-scoping bug: switching the active
 * brand in the dashboard dropdown used to leave the NAP audits list
 * showing whichever audits were created on the account, including
 * audits belonging to OTHER brands. The fix is:
 *  - GET /api/nap-audits reads ?brandId= and filters strictly by it,
 *    returning an empty list when no brand is provided (or when the
 *    brand isn't owned by the caller).
 *  - POST /api/nap-audits requires brandId and persists it.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

const listNapAuditsMock = vi.fn(async () => []);
const insertNapAuditMock = vi.fn(async () => ({ id: 'a1' }));
const countNapAuditsMock = vi.fn(async () => 0);
const processNapAuditMock = vi.fn(async () => null);

vi.mock('../src/lib/nap-audits', () => ({
  listNapAudits: (...args: unknown[]) => listNapAuditsMock(...(args as [])),
  insertNapAudit: (...args: unknown[]) => insertNapAuditMock(...(args as [])),
  countNapAudits: (...args: unknown[]) => countNapAuditsMock(...(args as [])),
  processNapAudit: (...args: unknown[]) => processNapAuditMock(...(args as [])),
  NAP_MAX_SAVED_AUDITS: 200,
}));

// next/server's after() is only available in the Next runtime - stub it
// so the POST handler can fire-and-forget without crashing the test.
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn; } }));

import { GET, POST } from '../src/app/api/nap-audits/route';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  listNapAuditsMock.mockReset();
  listNapAuditsMock.mockResolvedValue([]);
  insertNapAuditMock.mockReset();
  insertNapAuditMock.mockResolvedValue({ id: 'a1' } as never);
  countNapAuditsMock.mockReset();
  countNapAuditsMock.mockResolvedValue(0);
});
afterEach(() => { vi.clearAllMocks(); });

describe('GET /api/nap-audits brand scoping', () => {
  it('returns an empty list when no brandId is provided', async () => {
    const resp = await GET(new Request('http://localhost/api/nap-audits'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.audits).toEqual([]);
    expect(listNapAuditsMock).not.toHaveBeenCalled();
  });

  it('returns an empty list when the brandId does not belong to the caller', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM brands WHERE id = \$1 AND user_id = \$2/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(new Request('http://localhost/api/nap-audits?brandId=somebody-elses'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.audits).toEqual([]);
    expect(listNapAuditsMock).not.toHaveBeenCalled();
  });

  it('filters audits strictly by brandId when one is provided', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM brands WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
        return { rows: [{ id: 'brand-easypump' }] };
      }
      return { rows: [] };
    });
    listNapAuditsMock.mockResolvedValueOnce([
      { id: 'a-easypump', brandId: 'brand-easypump' } as never,
    ]);
    const resp = await GET(new Request('http://localhost/api/nap-audits?brandId=brand-easypump'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.audits).toEqual([{ id: 'a-easypump', brandId: 'brand-easypump' }]);
    expect(listNapAuditsMock).toHaveBeenCalledWith('u1', 'brand-easypump');
  });
});

describe('POST /api/nap-audits brand requirement', () => {
  function makeBody(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      label: 'Acme',
      canonical: { name: 'Acme Inc' },
      urls: ['https://example.com/listing'],
      ...extra,
    });
  }
  function postRequest(body: string): Request {
    return new Request('http://localhost/api/nap-audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }

  it('400s when brandId is missing', async () => {
    const resp = await POST(postRequest(makeBody()));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/brandId/i);
    expect(insertNapAuditMock).not.toHaveBeenCalled();
  });

  it('404s when the brand does not belong to the caller', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM brands WHERE id = \$1 AND user_id = \$2/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const resp = await POST(postRequest(makeBody({ brandId: 'not-mine' })));
    expect(resp.status).toBe(404);
    expect(insertNapAuditMock).not.toHaveBeenCalled();
  });

  it('persists the brandId on the new audit', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM brands WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
        return { rows: [{ id: 'brand-easypump' }] };
      }
      return { rows: [] };
    });
    const resp = await POST(postRequest(makeBody({ brandId: 'brand-easypump' })));
    expect(resp.status).toBe(201);
    expect(insertNapAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      brandId: 'brand-easypump',
      label: 'Acme',
    }));
  });
});
