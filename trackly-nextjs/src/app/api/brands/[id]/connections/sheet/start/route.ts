/**
 * GET /api/brands/[id]/connections/sheet/start
 *
 * Returns the Google consent URL to begin the one-click "auto-create Google
 * Sheet" flow for this brand. The client redirects the browser to it; Google
 * sends the user back to the fixed callback with a code + our signed state,
 * where we create the sheet and store the connection.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { buildSheetAuthUrl, sheetOauthConfigured } from '@/lib/fix-engine/sheet-google';
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
  if (!sheetOauthConfigured()) {
    return Response.json(
      { error: 'Google auto-create is not configured on this server. Use the manual Apps Script setup instead.' },
      { status: 400 },
    );
  }
  const state = signState(id, user.id);
  return Response.json({ url: buildSheetAuthUrl(state) }, { headers: { 'Cache-Control': 'no-store' } });
}
