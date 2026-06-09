import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Locks in two prod-risk fixes for the Pull-from-Google flow:
 *  1. The field mask excludes rating/userRatingCount so the call
 *     never bumps the Places SKU into the Enterprise tier the
 *     customer's key may not have enabled.
 *  2. The street-from-formattedAddress fallback strips not just the
 *     country shortText ("US") but the long-form aliases Google
 *     actually writes into formattedAddress ("United States",
 *     "United States of America"). Without this, a salvaged street
 *     ends with ", United States" stuck on it.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
const origFetch = globalThis.fetch;
const origKey = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  queryMock.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.GOOGLE_PLACES_API_KEY = 'fake-key';
});

afterEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = origFetch;
  if (origKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = origKey;
});

import { POST } from '../src/app/api/nap-audits/gbp-lookup/route';

function fakeRequest(query: string): Request {
  return new Request('http://localhost/api/nap-audits/gbp-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

describe('POST /api/nap-audits/gbp-lookup field mask', () => {
  it('does not request rating or userRatingCount (Enterprise-tier SKUs)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ places: [{ displayName: { text: 'Acme' } }] }), { status: 200 }),
    );
    await POST(fakeRequest('Acme Dental London'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const mask = headers['X-Goog-FieldMask'] ?? '';
    expect(mask).not.toMatch(/places\.rating/);
    expect(mask).not.toMatch(/places\.userRatingCount/);
    // Sanity check: the Pro-tier fields we DO want are still requested.
    expect(mask).toMatch(/places\.websiteUri/);
    expect(mask).toMatch(/places\.regularOpeningHours/);
  });
});

describe('POST /api/nap-audits/gbp-lookup street fallback', () => {
  it('salvages street from formattedAddress and strips "United States" tail', async () => {
    // No street_number/route components — only city/region/postcode/country —
    // so the route is forced to derive `street` from formattedAddress.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              displayName: { text: 'Wolfsbane K9' },
              formattedAddress: '1234 Main St, Surgoinsville, TN 37873, United States',
              addressComponents: [
                { types: ['locality'], longText: 'Surgoinsville', shortText: 'Surgoinsville' },
                { types: ['administrative_area_level_1'], longText: 'Tennessee', shortText: 'TN' },
                { types: ['postal_code'], longText: '37873', shortText: '37873' },
                { types: ['country'], longText: 'United States', shortText: 'US' },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const resp = await POST(fakeRequest('Wolfsbane K9 Surgoinsville TN'));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { canonical?: { street?: string; region?: string; country?: string } };
    expect(body.canonical?.street).toBe('1234 Main St');
    expect(body.canonical?.region).toBe('TN');
    expect(body.canonical?.country).toBe('US');
  });

  it('also strips "United States of America" when Google uses the full form', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              displayName: { text: 'Acme' },
              formattedAddress: 'PO Box 42, Springfield, IL 62701, United States of America',
              addressComponents: [
                { types: ['locality'], longText: 'Springfield', shortText: 'Springfield' },
                { types: ['administrative_area_level_1'], longText: 'Illinois', shortText: 'IL' },
                { types: ['postal_code'], longText: '62701', shortText: '62701' },
                { types: ['country'], longText: 'United States', shortText: 'US' },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const resp = await POST(fakeRequest('Acme Springfield'));
    const body = (await resp.json()) as { canonical?: { street?: string } };
    expect(body.canonical?.street).toBe('PO Box 42');
  });

  it('strips "United Kingdom" for GB listings', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              displayName: { text: 'Acme' },
              formattedAddress: '12 High Street, London SW1A 1AA, United Kingdom',
              addressComponents: [
                { types: ['postal_town'], longText: 'London', shortText: 'London' },
                { types: ['postal_code'], longText: 'SW1A 1AA', shortText: 'SW1A 1AA' },
                { types: ['country'], longText: 'United Kingdom', shortText: 'GB' },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const resp = await POST(fakeRequest('Acme London'));
    const body = (await resp.json()) as { canonical?: { street?: string; country?: string } };
    expect(body.canonical?.street).toBe('12 High Street');
    expect(body.canonical?.country).toBe('GB');
  });
});
