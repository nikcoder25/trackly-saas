/**
 * /api/nap-audits/gbp-lookup — pull a canonical NAP from Google (Phase 3).
 *
 * POST { query } → resolves the business via the Google Places API (Text Search)
 * and returns a canonical NAP to prefill a new audit. This is the pragmatic
 * "GBP as source of truth" path: it uses a Places API key (GOOGLE_PLACES_API_KEY)
 * rather than full Business Profile OAuth, so it works for any public listing.
 * Returns 503 with a clear message when the key isn't configured.
 *
 * Runtime + timeouts: pinned to Node (matches other Next.js route handlers
 * that call out to slow external APIs) and capped at 15s. The Places call
 * itself is bounded to 7s with one retry, so the route always returns its
 * own response before DigitalOcean's edge proxy gives up and converts it
 * into an opaque 504 the user can't act on (the symptom that reported this
 * issue).
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import type { CanonicalNap } from '@/lib/nap-verify';

export const runtime = 'nodejs';
export const maxDuration = 15;

const PLACES_TIMEOUT_MS = 7_000;
const PLACES_MAX_ATTEMPTS = 2;

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface Place {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  addressComponents?: AddressComponent[];
}

function pick(components: AddressComponent[], type: string): string | undefined {
  return components.find((c) => c.types?.includes(type))?.longText?.trim() || undefined;
}

function toCanonical(place: Place): CanonicalNap {
  const comps = place.addressComponents ?? [];
  const streetNumber = pick(comps, 'street_number');
  const route = pick(comps, 'route');
  const street = [streetNumber, route].filter(Boolean).join(' ') || undefined;
  const city = pick(comps, 'postal_town') || pick(comps, 'locality') || pick(comps, 'sublocality');
  const postcode = pick(comps, 'postal_code');
  const suite = pick(comps, 'subpremise');
  return {
    name: place.displayName?.text?.trim() || '',
    phone: place.nationalPhoneNumber?.trim() || place.internationalPhoneNumber?.trim() || undefined,
    street,
    suite,
    city,
    postcode,
  };
}

async function callPlaces(query: string, apiKey: string): Promise<Response> {
  // One short retry: Places Text Search occasionally takes >5s on a cold
  // call from an idle pod, and a single retry costs almost nothing once
  // the TCP/TLS session is warm. Each attempt is independently bounded
  // by PLACES_TIMEOUT_MS so a hung connection can't eat the whole budget.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= PLACES_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.addressComponents',
        },
        // Text Search (New) takes `textQuery` (+ optional `pageSize`). It does NOT
        // accept `maxResultCount` (that's a Nearby Search field) and rejects the
        // request with INVALID_ARGUMENT if it's present. `pageSize: 1` keeps
        // the response small.
        body: JSON.stringify({ textQuery: query, pageSize: 1 }),
        signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
      });
    } catch (e) {
      lastErr = e;
      const name = (e as Error).name;
      // Retry on timeout/abort only; surface other errors immediately.
      if (name !== 'TimeoutError' && name !== 'AbortError') break;
    }
  }
  throw lastErr ?? new Error('Places lookup failed');
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: 'Google lookup is not configured. Enter the NAP manually, or ask an admin to set GOOGLE_PLACES_API_KEY.' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
  if (!query) return Response.json({ error: 'Enter a business name and location to look up' }, { status: 400 });

  let res: Response;
  try {
    res = await callPlaces(query, apiKey);
  } catch (e) {
    const name = (e as Error).name;
    const isTimeout = name === 'TimeoutError' || name === 'AbortError';
    logger.warn('nap_audits.gbp_lookup_failed', { err: (e as Error).message, isTimeout, userId: auth.id });
    if (isTimeout) {
      return Response.json(
        { error: 'Google lookup timed out. Try a more specific query (e.g. business name + city), or enter the NAP manually.' },
        { status: 504 },
      );
    }
    return Response.json({ error: 'Google lookup failed. Please try again.' }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.warn('nap_audits.gbp_lookup_upstream', { status: res.status, detail: detail.slice(0, 300) });
    // Surface Google's own message — this is the user's dashboard/key, so the
    // detail (e.g. "API key not valid", "Places API has not been enabled") is
    // actionable, not sensitive.
    let msg = '';
    try {
      msg = (JSON.parse(detail) as { error?: { message?: string } })?.error?.message || '';
    } catch { /* non-JSON body */ }
    return Response.json(
      { error: msg ? `Google lookup failed: ${msg}` : `Google lookup failed (HTTP ${res.status}). Try a more specific query.` },
      { status: 502 },
    );
  }

  try {
    const data = (await res.json()) as { places?: Place[] };
    const place = data.places?.[0];
    if (!place) return Response.json({ error: 'No matching business found.' }, { status: 404 });
    const canonical = toCanonical(place);
    if (!canonical.name) return Response.json({ error: 'No matching business found.' }, { status: 404 });
    return Response.json({ canonical });
  } catch (e) {
    logger.error('nap_audits.gbp_lookup_parse_failed', { err: (e as Error).message });
    return Response.json({ error: 'Google lookup returned an unexpected response.' }, { status: 502 });
  }
}
