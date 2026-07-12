/**
 * GET /api/connector/instructions
 *
 * Pulled by the Connector plugin on a schedule. Authenticated by the
 * per-brand bearer token issued at pairing. Returns the brand's pending,
 * validated, signed Channel-B instructions. The plugin applies each and
 * acks via POST .../instructions/[id]/ack.
 */

import { NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { getConnectorByToken, touchConnectorSeen } from '@/lib/fix-engine/connections';
import { listPendingConnectorInstructions } from '@/lib/fix-engine/schema';
import { toWireInstruction } from '@/lib/fix-engine/connector';
import { logger } from '@/lib/logger';

function bearer(request: Request): string {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export async function GET(request: Request): Promise<Response> {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });

  // Rate-limit per client IP to blunt token-guessing before the DB lookup.
  const rl = await rateLimit(`connector:pull:${getClientIp(request)}`, 60_000, 60);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const conn = await getConnectorByToken(token);
  if (!conn) return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 });

  // Heartbeat — lets the dashboard show the connector as online.
  await touchConnectorSeen(conn.brandId);

  try {
    const rows = await listPendingConnectorInstructions(conn.brandId);
    const issuedAt = new Date().toISOString();
    const instructions = rows
      .map((r) => toWireInstruction(r, conn.hmacSecret, issuedAt))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json(
      { instructions, count: instructions.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.connector_pull_failed', { brandId: conn.brandId, err: (e as Error).message });
    return NextResponse.json({ error: 'Failed to load instructions' }, { status: 500 });
  }
}
