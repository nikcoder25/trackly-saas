/**
 * Fix Engine - Google Search Console client.
 *
 * Server-side OAuth 2.0 Authorization-Code flow with offline access so the
 * engine can pull Search Analytics + URL Inspection data on a schedule
 * (the refresh token is stored, encrypted, on the brand's `gsc`
 * fix_connection). Scope is read-only (`webmasters.readonly`).
 *
 * Reuses GOOGLE_CLIENT_ID (already used by sign-in) plus a new
 * GOOGLE_CLIENT_SECRET, and APP_URL for the fixed redirect URI.
 */

import { getConnection, upsertConnection, setConnectionStatus } from './connections';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WMX_BASE = 'https://www.googleapis.com/webmasters/v3';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

export function gscRedirectUri(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/connections/gsc/callback`;
}

export function gscConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/** Build the consent URL the user is redirected to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: gscRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent', // force a refresh_token even on re-consent
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: gscRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

interface GscCreds {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

/**
 * Get a valid access token for a brand's GSC connection, refreshing (and
 * persisting the new token) when the cached one is within 60s of expiry.
 * Returns null when there's no usable connection.
 */
export async function getValidAccessToken(
  brandId: string,
  userId: string,
): Promise<{ accessToken: string; siteUrl: string | null } | null> {
  const conn = await getConnection(brandId, 'gsc');
  if (!conn || conn.status !== 'active' || !conn.creds) return null;
  const creds = conn.creds as GscCreds;
  const siteUrl = (conn.meta?.siteUrl as string | undefined) ?? null;

  const fresh = creds.expiresAt && creds.expiresAt - Date.now() > 60_000;
  if (fresh && creds.accessToken) return { accessToken: creds.accessToken, siteUrl };

  if (!creds.refreshToken) {
    await setConnectionStatus(brandId, 'gsc', 'error');
    return null;
  }
  try {
    const t = await refreshAccessToken(creds.refreshToken);
    const newCreds: GscCreds = {
      accessToken: t.access_token,
      refreshToken: creds.refreshToken, // Google omits refresh_token on refresh
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await upsertConnection({
      userId, brandId, provider: 'gsc',
      siteUrl: conn.siteUrl, creds: newCreds as unknown as Record<string, unknown>, meta: conn.meta,
    });
    return { accessToken: t.access_token, siteUrl };
  } catch {
    await setConnectionStatus(brandId, 'gsc', 'error');
    return null;
  }
}

export interface GscSite { siteUrl: string; permissionLevel: string }

export async function listSites(accessToken: string): Promise<GscSite[]> {
  const res = await fetch(`${WMX_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listSites failed: HTTP ${res.status}`);
  const data = (await res.json()) as { siteEntry?: GscSite[] };
  return data.siteEntry || [];
}

/**
 * Pick the GSC property that best matches a brand website. Prefers an
 * exact URL-prefix origin match, then a matching sc-domain property.
 */
export function matchSite(sites: GscSite[], website: string | undefined): string | null {
  if (!website) return sites[0]?.siteUrl ?? null;
  let host: string;
  try { host = new URL(website.startsWith('http') ? website : `https://${website}`).host; }
  catch { return sites[0]?.siteUrl ?? null; }
  const origin = `https://${host}`;
  const prefix = sites.find((s) => s.siteUrl.replace(/\/$/, '') === origin);
  if (prefix) return prefix.siteUrl;
  const domain = sites.find((s) => s.siteUrl === `sc-domain:${host.replace(/^www\./, '')}`);
  if (domain) return domain.siteUrl;
  return sites[0]?.siteUrl ?? null;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Query the Search Analytics API. dimensions e.g. ['query','page']. */
export async function searchAnalytics(args: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
}): Promise<SearchAnalyticsRow[]> {
  const res = await fetch(
    `${WMX_BASE}/sites/${encodeURIComponent(args.siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: args.startDate,
        endDate: args.endDate,
        dimensions: args.dimensions,
        rowLimit: args.rowLimit ?? 1000,
      }),
    },
  );
  if (!res.ok) throw new Error(`searchAnalytics failed: HTTP ${res.status}`);
  const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
  return data.rows || [];
}

/** Inspect a URL's index status (cause of not-indexed, canonical, etc.). */
export async function inspectUrl(args: {
  accessToken: string;
  siteUrl: string;
  inspectionUrl: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(INSPECT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: args.inspectionUrl, siteUrl: args.siteUrl }),
  });
  if (!res.ok) throw new Error(`urlInspection failed: HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export interface IndexStatus {
  verdict: string | null;            // PASS | NEUTRAL | FAIL | null
  coverageState: string | null;      // e.g. "Submitted and indexed", "Crawled - currently not indexed"
  robotsTxtState: string | null;     // ALLOWED | DISALLOWED
  indexingState: string | null;      // INDEXING_ALLOWED | BLOCKED_BY_META_TAG | ...
  googleCanonical: string | null;
  userCanonical: string | null;
}

/** Normalise a URL Inspection API response to the fields the modules use. */
export function parseInspection(raw: Record<string, unknown>): IndexStatus {
  const result = (raw.inspectionResult as Record<string, unknown> | undefined) || {};
  const idx = (result.indexStatusResult as Record<string, unknown> | undefined) || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    verdict: str(idx.verdict),
    coverageState: str(idx.coverageState),
    robotsTxtState: str(idx.robotsTxtState),
    indexingState: str(idx.indexingState),
    googleCanonical: str(idx.googleCanonical),
    userCanonical: str(idx.userCanonical),
  };
}

/** Helper: dates for the trailing N days (GSC data lags ~2 days). */
export function trailingDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}
