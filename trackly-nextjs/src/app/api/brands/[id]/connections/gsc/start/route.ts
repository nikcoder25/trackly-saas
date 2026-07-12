/**
 * GET /api/brands/[id]/connections/gsc/start
 *
 * Returns the Google consent URL to begin connecting Google Search
 * Console for this brand. The client redirects the browser to it; Google
 * sends the user back to the fixed callback with a code + our signed state.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { buildAuthUrl, gscConfigured } from '@/lib/fix-engine/gsc';
import { signState } from '@/lib/fix-engine/gsc-state';

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
  if (access.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot connect integrations.' }, { status: 403 });
  }
  if (!gscConfigured()) {
    return Response.json({ error: 'Google Search Console is not configured on this server.' }, { status: 400 });
  }
  const state = signState(id, user.id);
  return Response.json({ url: buildAuthUrl(state) }, { headers: { 'Cache-Control': 'no-store' } });
}
