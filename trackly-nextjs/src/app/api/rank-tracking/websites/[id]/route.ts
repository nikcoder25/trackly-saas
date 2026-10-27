/**
 * GET    /api/rank-tracking/websites/:id?period= - the website's keywords with ranks, AI status and groups.
 * DELETE /api/rank-tracking/websites/:id - stop tracking the website and delete its history.
 */
import { logger } from '@/lib/logger';
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { parsePeriod, websiteDetail } from '@/lib/rank-tracking/queries';
import { deleteWebsite } from '@/lib/rank-tracking/keywords';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  try {
    const d = await websiteDetail(c.accountId, id, parsePeriod(new URL(request.url).searchParams.get('period')));
    if (!d) return Response.json({ error: 'Website not found' }, { status: 404 });
    return Response.json(d, noStore);
  } catch (e) {
    logger.error('rank.website_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to load the website' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  const ok = await deleteWebsite(c.accountId, id);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Website not found' }, { status: 404 });
}
