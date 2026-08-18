/**
 * POST /api/brands/[id]/fixes/[fixId]/verify
 *
 * "Is the change actually on my page?" - fetches the live URL and looks for
 * the exact value that was shipped, then stores the verdict on the fix.
 *
 * Distinct from /recheck on purpose. Recheck runs the module's own success
 * measure, which for the GSC-driven modules is a Search Console metric that
 * takes weeks to move and can never confirm a publish landed. This endpoint
 * answers the immediate question and returns reproducible evidence: the URL
 * fetched, the strings searched for, and what is on the page instead.
 *
 * Viewers are allowed: it reads the customer's own public page and changes
 * nothing about the fix's status, so it is not an edit.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { verifyFixOnPage } from '@/lib/fix-engine/engine';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; fixId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id, fixId } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const fix = await verifyFixOnPage(fixId, id, user.id);
    return Response.json({ fix }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.verify_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
