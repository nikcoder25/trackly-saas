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
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
  };
  location?: { latitude?: number; longitude?: number };
}

function pickLong(components: AddressComponent[], type: string): string | undefined {
  return components.find((c) => c.types?.includes(type))?.longText?.trim() || undefined;
}
function pickShort(components: AddressComponent[], type: string): string | undefined {
  return components.find((c) => c.types?.includes(type))?.shortText?.trim() || undefined;
}

/** Useful business metadata returned alongside the canonical NAP. */
export interface GbpExtras {
  /** Google's pre-formatted single-line address — fallback when component parsing misses pieces. */
  formattedAddress?: string;
  /** Display label for the primary business category, e.g. "Dog kennel". */
  category?: string;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY". */
  businessStatus?: string;
  /** Link to the Google Maps listing for this business. */
  mapsUrl?: string;
  /** Latitude/longitude — handy for the operator to verify the right branch. */
  latitude?: number;
  longitude?: number;
  /** Average star rating (0-5) and the count behind it. */
  rating?: number;
  reviewCount?: number;
  /** Human-readable weekday hours, one entry per day, in Google's locale. */
  hours?: string[];
}

function toCanonical(place: Place): CanonicalNap {
  const comps = place.addressComponents ?? [];
  const streetNumber = pickLong(comps, 'street_number');
  const route = pickLong(comps, 'route');
  let street: string | undefined = [streetNumber, route].filter(Boolean).join(' ') || undefined;
  const city = pickLong(comps, 'postal_town') || pickLong(comps, 'locality') || pickLong(comps, 'sublocality');
  const postcode = pickLong(comps, 'postal_code');
  const suite = pickLong(comps, 'subpremise');
  // Prefer the short code ("TN", "CA") which is what most US citations use
  // on a single address line; fall back to the long name otherwise.
  const region = pickShort(comps, 'administrative_area_level_1') || pickLong(comps, 'administrative_area_level_1');
  const country = pickShort(comps, 'country');
  // If component parsing left the street blank (PO boxes, rural addresses,
  // some international listings), salvage what we can from the formatted
  // line — strip the city / region / postcode suffix the rest of the form
  // already owns.
  if (!street && place.formattedAddress) {
    const tail = [city, region, postcode, country]
      .filter((s): s is string => !!s)
      .reduce((acc, s) => acc.replace(new RegExp(`,?\\s*${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'i'), ''), place.formattedAddress.trim());
    const cleaned = tail.replace(/[,\s]+$/, '').trim();
    if (cleaned && cleaned.length <= 200) street = cleaned;
  }
  return {
    name: place.displayName?.text?.trim() || '',
    phone: place.nationalPhoneNumber?.trim() || place.internationalPhoneNumber?.trim() || undefined,
    street,
    suite,
    city,
    region,
    postcode,
    country,
    website: place.websiteUri?.trim() || undefined,
  };
}

function toExtras(place: Place): GbpExtras {
  return {
    formattedAddress: place.formattedAddress?.trim() || undefined,
    category: place.primaryTypeDisplayName?.text?.trim() || place.primaryType || undefined,
    businessStatus: place.businessStatus || undefined,
    mapsUrl: place.googleMapsUri || undefined,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    rating: typeof place.rating === 'number' ? place.rating : undefined,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined,
    hours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours!.weekdayDescriptions
      : undefined,
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
          // Expanded mask: pulls website, formatted address, category,
          // hours, rating, status and the Maps URL alongside NAP so the
          // operator sees the full "source of truth" the audit was built
          // against. Adding fields is free as long as the cost-tier
          // budget tolerates it — Text Search Pro covers everything
          // here.
          'X-Goog-FieldMask': [
            'places.displayName',
            'places.nationalPhoneNumber',
            'places.internationalPhoneNumber',
            'places.addressComponents',
            'places.formattedAddress',
            'places.websiteUri',
            'places.googleMapsUri',
            'places.businessStatus',
            'places.primaryType',
            'places.primaryTypeDisplayName',
            'places.types',
            'places.rating',
            'places.userRatingCount',
            'places.regularOpeningHours',
            'places.location',
          ].join(','),
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
    return Response.json({ canonical, extras: toExtras(place) });
  } catch (e) {
    logger.error('nap_audits.gbp_lookup_parse_failed', { err: (e as Error).message });
    return Response.json({ error: 'Google lookup returned an unexpected response.' }, { status: 502 });
  }
}
