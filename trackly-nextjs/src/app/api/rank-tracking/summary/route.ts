/** GET /api/rank-tracking/summary?period=last|7|30|90 - all websites: tiles, spread, websites and groups. */
import { logger } from '@/lib/logger';
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { parsePeriod, rankSummary } from '@/lib/rank-tracking/queries';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  try {
    const period = parsePeriod(new URL(request.url).searchParams.get('period'));
    return Response.json(await rankSummary(c.accountId, c.plan, period), noStore);
  } catch (e) {
    logger.error('rank.summary_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to load rankings' }, { status: 500 });
  }
}
