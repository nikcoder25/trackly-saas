/**
 * GET /api/connect/serve?key=PUBLIC_KEY&path=/p   (PUBLIC, no auth)
 *
 * Called by the `/c.js` snippet on the customer's live site. Resolves the
 * public key → brand, then returns the PUBLIC per-path SEO override for `path`
 * — the SAME shipped-fix data the edge Worker serves (getEdgeSeoOverrides),
 * projected through the public allowlist (see connect/overrides). Cross-origin
 * (the snippet runs on the customer's domain), so it sends permissive CORS and
 * a short public cache. Unknown/invalid keys return `{ override: null }` with
 * 200 so the response can't be used to probe key validity.
 */

import { NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { getSiteConnectionByKey } from '@/lib/connect/schema';
import { publicOverrideForPath } from '@/lib/connect/overrides';
import { getEdgeSeoOverrides, normalizeEdgeOverrideKeys } from '@/lib/fix-engine/schema';
import { logger } from '@/lib/logger';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const rl = await rateLimit(`connect:serve:${getClientIp(request)}`, 60_000, 120);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const url = new URL(request.url);
  const key = (url.searchParams.get('key') || '').trim();
  const path = url.searchParams.get('path') || '/';
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400, headers: CORS });

  try {
    const conn = await getSiteConnectionByKey(key);
    // Unknown key: 200 + null (don't disclose whether a key exists), short cache.
    if (!conn) {
      return NextResponse.json({ override: null }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } });
    }
    const overrides = normalizeEdgeOverrideKeys(await getEdgeSeoOverrides(conn.brandId));
    const override = publicOverrideForPath(overrides, path);
    return NextResponse.json(
      { override },
      { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (e) {
    logger.error('connect.serve_failed', { err: (e as Error).message });
    // Never break the customer's page — degrade to "no overrides".
    return NextResponse.json({ override: null }, { headers: CORS });
  }
}
