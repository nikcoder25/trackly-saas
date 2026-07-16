/**
 * POST /api/brands/[id]/connections/edge/verify   (authenticated)
 *
 * Edge Pro: verify the brand's site is now served through the edge — fetch the
 * homepage and assert the Worker's `x-livesov-edge` marker. On success the edge
 * connection flips to 'connected'. Retryable: a failure records a reason and
 * leaves the connection pending.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getSiteConnectionByBrandMethod } from '@/lib/connect/schema';
import { verifyEdgeLive } from '@/lib/connect/edge-flow';
import { edgeProAvailable } from '@/lib/connect/edge-provider';

function verifyUrl(website: unknown): string | null {
  if (typeof website !== 'string' || !website.trim()) return null;
  const s = website.trim();
  try { const u = new URL(s.startsWith('http') ? s : `https://${s}`); return `${u.protocol}//${u.host}/`; } catch { return null; }
}

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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot connect a site.' }, { status: 403 });

    const conn = await getSiteConnectionByBrandMethod(id, 'edge');
    if (!conn) return Response.json({ error: 'No edge connection to verify — provision it first.' }, { status: 400 });
    const url = verifyUrl((access.brand as { website?: unknown }).website);
    if (!url) return Response.json({ error: 'This brand has no website set.' }, { status: 400 });

    const result = await verifyEdgeLive(conn.id, url);
    return Response.json(
      { ok: result.ok, verified: result.verified, sawInject: result.sawInject, connection: result.connection, reason: result.reason },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('connect.edge_verify_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
