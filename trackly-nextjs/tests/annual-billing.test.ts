/**
 * Annual billing via DodoPayments.
 *
 * - /api/payments/checkout accepts billing: 'monthly' | 'annual' (default
 *   monthly), charges the annual product id for annual, 400s when the plan
 *   has no annual product, and records billing in the checkout metadata.
 * - A monthly -> annual switch of the same plan is allowed; every other
 *   same/lower tier checkout is still blocked as a downgrade.
 * - GET /api/payments/checkout reports which plans are sellable annually.
 * - /pricing plan intent (?plan=pro&billing=annual) parsing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { poolQuery, authFn } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  authFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
}));

vi.mock('@/lib/auth', () => ({
  requireVerifiedAuth: (req: Request) => authFn(req),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkUserIpRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: (retryAfter: number) =>
    Response.json({ error: 'Rate limited', retryAfter }, { status: 429 }),
}));

vi.mock('@/lib/api-error', () => ({
  serverError: (opts?: { message?: string }) =>
    Response.json({ error: opts?.message ?? 'Internal server error' }, { status: 500 }),
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as checkoutGet, POST as checkoutPost } from '@/app/api/payments/checkout/route';
import { resolveCheckout, billingCycleForProduct, parseBillingCycle } from '@/lib/dodo-products';
import { parsePlanIntent } from '@/lib/plan-intent';

const ENV: Record<string, string> = {
  DODO_PAYMENTS_API_KEY: 'dodo_key',
  DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
  APP_URL: 'https://livesov.com',
  DODO_STARTER_PRODUCT_ID: 'prod_starter',
  DODO_PRO_PRODUCT_ID: 'prod_pro',
  DODO_AGENCY_PRODUCT_ID: 'prod_agency',
  DODO_ENTERPRISE_PRODUCT_ID: 'prod_enterprise',
  DODO_STARTER_ANNUAL_PRODUCT_ID: 'prod_starter_year',
  DODO_PRO_ANNUAL_PRODUCT_ID: 'prod_pro_year',
  DODO_AGENCY_ANNUAL_PRODUCT_ID: 'prod_agency_year',
};

let fetchMock: ReturnType<typeof vi.fn>;

function setUser(plan: string, settings: Record<string, unknown> = {}) {
  poolQuery.mockResolvedValue({ rows: [{ email: 'a@test.com', name: 'A', plan, settings }] });
}

function post(body: unknown): Promise<Response> {
  return checkoutPost(new Request('https://livesov.com/api/payments/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function sentCheckout(): { product_cart: { product_id: string }[]; metadata: Record<string, unknown>; return_url: string } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  poolQuery.mockReset();
  authFn.mockReset().mockResolvedValue({ id: 'user_A', email: 'a@test.com' });
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ checkout_url: 'https://pay/x', session_id: 'cs_1' }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/payments/checkout billing cycle', () => {
  it('defaults to monthly and uses the monthly product id', async () => {
    setUser('free');
    const res = await post({ plan: 'pro' });
    expect(res.status).toBe(200);
    const body = sentCheckout();
    expect(body.product_cart[0].product_id).toBe('prod_pro');
    expect(body.metadata).toEqual({ userId: 'user_A', plan: 'pro', billing: 'monthly' });
  });

  it('uses the annual product id for billing: annual', async () => {
    setUser('free');
    const res = await post({ plan: 'agency', billing: 'annual' });
    expect(res.status).toBe(200);
    const body = sentCheckout();
    expect(body.product_cart[0].product_id).toBe('prod_agency_year');
    expect(body.metadata).toEqual({ userId: 'user_A', plan: 'agency', billing: 'annual' });
  });

  it('400s when the plan has no annual product configured', async () => {
    vi.stubEnv('DODO_STARTER_ANNUAL_PRODUCT_ID', '');
    setUser('free');
    const res = await post({ plan: 'starter', billing: 'annual' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Annual billing is not available/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s for enterprise annual (no annual product exists)', async () => {
    setUser('free');
    const res = await post({ plan: 'enterprise', billing: 'annual' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s on an unknown billing value', async () => {
    setUser('free');
    const res = await post({ plan: 'pro', billing: 'weekly' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid billing cycle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a monthly -> annual switch of the same plan', async () => {
    setUser('pro', { dodo_product_id: 'prod_pro', subscription_id: 'sub_1' });
    const res = await post({ plan: 'pro', billing: 'annual' });
    expect(res.status).toBe(200);
    const body = sentCheckout();
    expect(body.product_cart[0].product_id).toBe('prod_pro_year');
    // Same plan: no `from`, so the success banner does not wait for a plan change.
    expect(body.return_url).toBe('https://livesov.com/dashboard?payment=success');
  });

  it('blocks annual -> annual of the same plan', async () => {
    setUser('pro', { dodo_product_id: 'prod_pro_year' });
    const res = await post({ plan: 'pro', billing: 'annual' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still blocks same-plan monthly and lower-tier checkouts', async () => {
    setUser('pro', { dodo_product_id: 'prod_pro' });
    expect((await post({ plan: 'pro' })).status).toBe(400);
    expect((await post({ plan: 'starter', billing: 'annual' })).status).toBe(400);
    setUser('pro', { dodo_product_id: 'prod_pro_year' });
    expect((await post({ plan: 'pro', billing: 'monthly' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an annual upgrade to a higher tier with from= in the return url', async () => {
    setUser('starter', { dodo_product_id: 'prod_starter' });
    const res = await post({ plan: 'pro', billing: 'annual' });
    expect(res.status).toBe(200);
    const body = sentCheckout();
    expect(body.product_cart[0].product_id).toBe('prod_pro_year');
    expect(body.return_url).toBe('https://livesov.com/dashboard?payment=success&from=starter');
  });
});

describe('GET /api/payments/checkout', () => {
  it('reports annual availability and the current cycle', async () => {
    vi.stubEnv('DODO_AGENCY_ANNUAL_PRODUCT_ID', '');
    poolQuery.mockResolvedValue({ rows: [{ settings: { dodo_product_id: 'prod_pro_year' } }] });
    const res = await checkoutGet(new Request('https://livesov.com/api/payments/checkout'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      annual: { starter: true, pro: true, agency: false },
      currentBilling: 'annual',
    });
  });

  it('returns the auth response when unauthenticated', async () => {
    authFn.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await checkoutGet(new Request('https://livesov.com/api/payments/checkout'));
    expect(res.status).toBe(401);
  });
});

describe('dodo-products helpers', () => {
  it('parseBillingCycle', () => {
    expect(parseBillingCycle(undefined)).toBe('monthly');
    expect(parseBillingCycle(null)).toBe('monthly');
    expect(parseBillingCycle('annual')).toBe('annual');
    expect(parseBillingCycle('ANNUAL')).toBeNull();
    expect(parseBillingCycle(12)).toBeNull();
  });

  it('billingCycleForProduct', () => {
    expect(billingCycleForProduct('prod_agency_year')).toBe('annual');
    expect(billingCycleForProduct('prod_agency')).toBe('monthly');
    expect(billingCycleForProduct('prod_unknown')).toBeNull();
    expect(billingCycleForProduct(undefined)).toBeNull();
  });

  it('resolveCheckout rejects unknown plans', () => {
    for (const plan of ['owner', 'free', 'trial', '']) {
      expect(resolveCheckout({ plan, billing: 'monthly', currentPlan: 'free' }).ok).toBe(false);
    }
  });
});

describe('plan intent from /pricing', () => {
  it('parses plan + billing', () => {
    expect(parsePlanIntent('?plan=pro&billing=annual')).toEqual({ plan: 'pro', billing: 'annual' });
    expect(parsePlanIntent('?plan=Agency')).toEqual({ plan: 'agency', billing: 'monthly' });
    expect(parsePlanIntent('?plan=owner&billing=annual')).toBeNull();
    expect(parsePlanIntent('')).toBeNull();
  });
});
