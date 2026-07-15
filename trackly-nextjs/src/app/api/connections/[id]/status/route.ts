/**
 * GET /api/connections/[id]/status   (authenticated)
 *
 * Polled by the connect UI while the customer pastes the snippet, to flip the
 * screen to "Connected ✓" the moment the first heartbeat lands. Scoped: the
 * caller must have access to the brand that owns the connection.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getSiteConnection } from '@/lib/connect/schema';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const conn = await getSiteConnection(id);
    // Same 404 whether the row is missing or the user can't see its brand — no
    // cross-brand existence disclosure.
    if (!conn) return Response.json({ error: 'Not found' }, { status: 404 });
    const access = await getBrandWithAccess(conn.brandId, user.id);
    if (!access) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(
      {
        status: conn.status,
        firstSeenAt: conn.firstSeenAt,
        lastSeenAt: conn.lastSeenAt,
        connection: conn,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('connect.status_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
