import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for POST /api/geo-audits - focused on the
 * credit-validation path. We don't exercise the worker here (that's
 * tested in geo-audits-worker.test.ts); the POST returns immediately
 * after the reservation + insert, so we mock processGeoAudit out.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: {
    query: (...args: Parameters<QueryFn>) => queryMock(...args),
  },
}));

// Auth always succeeds as our test user.
vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

// Stub the credits module so the test controls reservation outcome.
const reserveMock = vi.fn();
const refundMock = vi.fn(async () => {});
vi.mock('../src/lib/credits', () => ({
  reserveCredits: (...args: unknown[]) => reserveMock(...(args as [])),
  refundCredits: (...args: unknown[]) => refundMock(...(args as [])),
}));

// Re-stub the geo-audits library entry points the route imports. We
// keep ensureGeoAuditsSchema as a no-op (the schema CREATE statements
// are tested separately) and intercept createAuditRecord +
// processGeoAudit so the test can assert what the route delegated.
const createAuditMock = vi.fn(async () => ({ id: 'audit-1', totalExpected: 10 }));
const processAuditMock = vi.fn(async () => {});
vi.mock('../src/lib/geo-audits', () => ({
  ensureGeoAuditsSchema: vi.fn(async () => {}),
  createAuditRecord: (...args: unknown[]) => createAuditMock(...(args as [])),
  reserveAuditCredits: (...args: unknown[]) => reserveMock(...(args as [])),
  processGeoAudit: (...args: unknown[]) => processAuditMock(...(args as [])),
  GEO_AUDIT_PLATFORMS: ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Grok'],
}));

// next/server: after() should run the callback synchronously in tests
// so we can assert it dispatched.
vi.mock('next/server', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    after: (fn: () => unknown | Promise<unknown>) => { Promise.resolve().then(() => fn()); },
  };
});

import { POST } from '../src/app/api/geo-audits/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/geo-audits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  queryMock.mockReset();
  reserveMock.mockReset();
  refundMock.mockClear();
  createAuditMock.mockClear();
  createAuditMock.mockResolvedValue({ id: 'audit-1', totalExpected: 10 });
  processAuditMock.mockClear();

  queryMock.mockImplementation(async (sql: string) => {
    // brand ownership check
    if (/SELECT id FROM brands/i.test(sql)) {
      return { rows: [{ id: 'b1' }] };
    }
    // user plan lookup
    if (/SELECT plan, trial_ends_at FROM users/i.test(sql)) {
      return { rows: [{ plan: 'agency', trial_ends_at: null }] };
    }
    return { rows: [] };
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe('POST /api/geo-audits - validation', () => {
  it('400 on missing brandId', async () => {
    reserveMock.mockResolvedValue({ ok: true, reserved: 0, remaining: 1000, monthlyCap: 1000, manualRemainingToday: 100, manualDailyCap: 100, nextResetAt: '' });
    const res = await POST(makeRequest({ regions: ['India'], prompts: ['p'] }));
    expect(res.status).toBe(400);
  });

  it('400 when zero regions are sent', async () => {
    const res = await POST(makeRequest({ brandId: 'b1', regions: [], prompts: ['p'] }));
    expect(res.status).toBe(400);
  });

  it('400 when more than 5 regions are sent', async () => {
    const res = await POST(makeRequest({
      brandId: 'b1',
      regions: ['a', 'b', 'c', 'd', 'e', 'f'],
      prompts: ['p'],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error || '').toLowerCase()).toMatch(/at most 5 regions/i);
  });

  it('400 on empty prompts', async () => {
    const res = await POST(makeRequest({ brandId: 'b1', regions: ['India'], prompts: [] }));
    expect(res.status).toBe(400);
  });

  it('404 when brand does not belong to caller', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/SELECT id FROM brands/i.test(sql)) return { rows: [] };
      if (/SELECT plan, trial_ends_at FROM users/i.test(sql)) return { rows: [{ plan: 'agency', trial_ends_at: null }] };
      return { rows: [] };
    });
    const res = await POST(makeRequest({ brandId: 'b1', regions: ['India'], prompts: ['p'] }));
    expect(res.status).toBe(404);
  });

  it('403 when the user plan disallows Regional Audits (plan has 0 geoAudits)', async () => {
    // Override the plan-limits resolver to simulate a plan whose
    // geoAudits cap is zero. This is the explicit gate the route
    // uses to refuse non-paying tiers from running audits at all.
    const constants = await import('../src/lib/constants');
    const spy = vi.spyOn(constants, 'getPlanLimits').mockReturnValue({
      ...constants.getPlanLimits('free'),
      geoAudits: 0,
    });
    try {
      const res = await POST(makeRequest({ brandId: 'b1', regions: ['India'], prompts: ['p'] }));
      expect(res.status).toBe(403);
    } finally {
      spy.mockRestore();
    }
  });

  it('402 + reservation envelope when reserveCredits returns insufficient', async () => {
    reserveMock.mockResolvedValue({
      ok: false,
      code: 'monthly_exhausted',
      message: 'Monthly credits exhausted.',
      remaining: 5,
      monthlyCap: 100,
      manualRemainingToday: 0,
      manualDailyCap: 100,
      nextResetAt: new Date().toISOString(),
    });
    const res = await POST(makeRequest({ brandId: 'b1', regions: ['India'], prompts: ['p'] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('monthly_exhausted');
    expect(body.required).toBe(5); // 1 region × 1 prompt × 5 platforms
    // Worker should NOT have been dispatched.
    expect(createAuditMock).not.toHaveBeenCalled();
    expect(processAuditMock).not.toHaveBeenCalled();
  });

  it('201 + dispatches worker on the happy path', async () => {
    reserveMock.mockResolvedValue({
      ok: true, reserved: 10, remaining: 990, monthlyCap: 1000,
      manualRemainingToday: 100, manualDailyCap: 100, nextResetAt: new Date().toISOString(),
    });
    const res = await POST(makeRequest({
      brandId: 'b1',
      regions: ['India', 'France'],
      prompts: ['p'],
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('audit-1');
    expect(body.status).toBe('queued');
    expect(body.totalExpected).toBe(10); // 2 × 1 × 5
    expect(createAuditMock).toHaveBeenCalledTimes(1);
    // Wait a tick for after()'s microtask to drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(processAuditMock).toHaveBeenCalledWith('audit-1');
  });

  it('refunds when createAuditRecord throws after a successful reservation', async () => {
    reserveMock.mockResolvedValue({
      ok: true, reserved: 5, remaining: 995, monthlyCap: 1000,
      manualRemainingToday: 100, manualDailyCap: 100, nextResetAt: new Date().toISOString(),
    });
    createAuditMock.mockRejectedValueOnce(new Error('db blew up'));
    const res = await POST(makeRequest({ brandId: 'b1', regions: ['India'], prompts: ['p'] }));
    expect(res.status).toBe(500);
    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock.mock.calls[0]?.[1]).toBe(5);
  });
});
