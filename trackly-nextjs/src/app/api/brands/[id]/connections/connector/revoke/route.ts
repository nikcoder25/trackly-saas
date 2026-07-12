/**
 * POST /api/brands/[id]/connections/connector/revoke
 *
 * Kill switch for a leaked/old Connector token. Marks the connection
 * revoked so the pull/ack endpoints immediately reject the token. Re-pair
 * to issue a fresh token.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { setConnectionStatus } from '@/lib/fix-engine/connections';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot revoke connections.' }, { status: 403 });
    await setConnectionStatus(id, 'connector', 'revoked');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.connector_revoke_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to revoke', message: (e as Error).message }, { status: 500 });
  }
}
