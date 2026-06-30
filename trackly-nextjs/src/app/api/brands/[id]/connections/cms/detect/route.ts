/**
 * GET /api/brands/[id]/connections/cms/detect?site=<url>
 *
 * Fingerprints the brand's site so the connect UI can guide the user to the
 * right path (native adapter vs. the plugin-free edge/manual route). Falls
 * back to the brand website when no ?site is given.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { detectCms } from '@/lib/fix-engine/cms/detect';

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

  const site = new URL(request.url).searchParams.get('site') || (access.brand.website as string | undefined) || '';
  if (!site) return Response.json({ error: 'No site URL to detect.' }, { status: 400 });

  try {
    const detection = await detectCms(site);
    return Response.json({ detection }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.cms_detect_failed', { err: (e as Error).message });
    return Response.json({ error: 'Detection failed', message: (e as Error).message }, { status: 500 });
  }
}
