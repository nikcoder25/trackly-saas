/**
 * POST /api/brands/[id]/connections/edge/provision   (authenticated)
 *
 * Edge Pro: create (or reuse) the brand's edge connection and provision it —
 * dispatch the per-tenant Worker + mint the Cloudflare Custom Hostname — then
 * return the CNAME target the customer adds. Idempotent/resumable. Gated by
 * {@link edgeProAvailable}: with no Cloudflare creds and no preview flag this
 * 404s, so the flow is never reachable when it can't work.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { createOrGetSiteConnection } from '@/lib/connect/schema';
import { provisionEdge } from '@/lib/connect/edge-flow';
import { edgeProAvailable } from '@/lib/connect/edge-provider';

/** The bare host of a brand website ("https://acme.test/x" → "acme.test"). */
function hostOf(website: unknown): string | null {
  if (typeof website !== 'string' || !website.trim()) return null;
  const s = website.trim();
  try { return new URL(s.startsWith('http') ? s : `https://${s}`).host.toLowerCase() || null; } catch { return null; }
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

    const host = hostOf((access.brand as { website?: unknown }).website);
    if (!host) return Response.json({ error: 'This brand has no website set — add one first.' }, { status: 400 });

    const conn = await createOrGetSiteConnection(id, 'edge');
    const result = await provisionEdge(conn.id, host);
    return Response.json(
      { ok: result.ok, mode: result.mode, connection: result.connection, cnameTarget: result.cnameTarget, hostname: host, error: result.ok ? undefined : result.error },
      { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('connect.edge_provision_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
