/**
 * GET /api/brands/[id]/connections/edge/availability   (authenticated)
 *
 * Tells the connect UI whether to offer the Edge Pro flow at all. `available` is
 * true when live Cloudflare creds are configured OR the EDGE_PRO_PREVIEW flag is
 * set; `mode` is 'live' with real creds, else 'mock'. When not available the UI
 * keeps the plain "coming soon" stub — normal users never see a dead flow.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { edgeProAvailable, edgeCredsConfigured } from '@/lib/connect/edge-provider';
import { getSiteConnectionByBrandMethod } from '@/lib/connect/schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const available = edgeProAvailable();
  const connection = available ? await getSiteConnectionByBrandMethod(id, 'edge') : null;
  return Response.json(
    { available, mode: edgeCredsConfigured() ? 'live' : 'mock', connection },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
