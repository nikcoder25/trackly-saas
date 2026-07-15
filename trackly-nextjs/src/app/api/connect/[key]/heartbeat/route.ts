/**
 * POST /api/connect/[key]/heartbeat   (PUBLIC, no auth)
 *
 * Pinged by the `/c.js` snippet once it has loaded on the customer's live site
 * (via navigator.sendBeacon, falling back to a no-cors fetch). Flips the
 * connection to 'connected' and stamps the seen timestamps. Cross-origin, so it
 * sends permissive CORS. Always responds 204 — an unknown key is indistinguish-
 * able from a known one, so the endpoint can't be used to probe key validity.
 *
 * NB: this prefix (`/api/connect/`) is CSRF-exempt in middleware.ts — these are
 * anonymous, cookieless, cross-origin-by-design endpoints keyed by a public id,
 * so the classic cookie-riding CSRF threat doesn't apply.
 */

import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { recordHeartbeat } from '@/lib/connect/schema';
import { logger } from '@/lib/logger';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const rl = await rateLimit(`connect:hb:${getClientIp(request)}`, 60_000, 60);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const { key } = await params;
    await recordHeartbeat(String(key).trim());
  } catch (e) {
    logger.warn('connect.heartbeat_failed', { err: (e as Error).message });
  }
  // Always 204, regardless of whether the key existed.
  return new Response(null, { status: 204, headers: CORS });
}
