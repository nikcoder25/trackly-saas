/** GET /api/rank/sites/:id/keywords - the site's keywords: current, previous, best, last 30 positions, volume, URL, AI, checked_at. */
import { logger } from '@/lib/logger';
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { rankSiteKeywords } from '@/lib/rank-tracking/sites';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  try {
    const d = await rankSiteKeywords(c.accountId, id);
    if (!d) return Response.json({ error: 'Site not found' }, { status: 404 });
    return Response.json(d, noStore);
  } catch (e) {
    logger.error('rank.site_keywords_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to load keywords' }, { status: 500 });
  }
}
