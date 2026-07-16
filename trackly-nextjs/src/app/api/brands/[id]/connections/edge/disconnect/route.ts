/**
 * POST /api/brands/[id]/connections/edge/disconnect   (authenticated)
 *
 * Edge Pro: tear down the brand's edge connection — delete the Worker + Custom
 * Hostname via the provider, clear the Cloudflare ids + token, and mark the
 * connection 'stale'. The default snippet connect is unaffected.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getSiteConnectionByBrandMethod } from '@/lib/connect/schema';
import { disconnectEdge } from '@/lib/connect/edge-flow';
import { edgeProAvailable } from '@/lib/connect/edge-provider';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    if (!edgeProAvailable()) return Response.json({ error: 'Edge Pro is not enabled.' }, { status: 404 });
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot manage connections.' }, { status: 403 });

    const conn = await getSiteConnectionByBrandMethod(id, 'edge');
    if (!conn) return Response.json({ ok: true, connection: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });

    const result = await disconnectEdge(conn.id);
    return Response.json(
      { ok: result.ok, connection: result.connection, error: result.error },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('connect.edge_disconnect_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
