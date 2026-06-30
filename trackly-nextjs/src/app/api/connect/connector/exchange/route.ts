/**
 * POST /api/connect/connector/exchange
 *
 * The Connector plugin calls this server-to-server with the one-time code it
 * received on the handshake callback, and gets back the credentials to store
 * locally. The code is single-use and short-lived, so the token + HMAC
 * secret never travel through the browser.
 *
 * Body: { code: string }  →  { pullUrl, token, hmacSecret }
 */

import { NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { consumeHandshakeCode } from '@/lib/fix-engine/connections';
import { logger } from '@/lib/logger';

interface Body { code?: unknown }

export async function POST(request: Request): Promise<Response> {
  // Blunt code-guessing before the DB lookup.
  const rl = await rateLimit(`connector:exchange:${getClientIp(request)}`, 60_000, 30);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: Body = {};
  try { body = (await request.json()) as Body; } catch { /* tolerate */ }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  try {
    const payload = await consumeHandshakeCode(code);
    if (!payload) return NextResponse.json({ error: 'Invalid, used, or expired code' }, { status: 400 });
    return NextResponse.json(
      { pullUrl: payload.pullUrl, token: payload.token, hmacSecret: payload.hmacSecret },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.connector_exchange_failed', { err: (e as Error).message });
    return NextResponse.json({ error: 'Exchange failed' }, { status: 500 });
  }
}
