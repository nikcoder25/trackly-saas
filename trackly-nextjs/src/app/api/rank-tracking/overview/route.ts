/** GET /api/rank-tracking/overview?period=last|30|90 - gainers, losers, sites, activity. */
import { logger } from '@/lib/logger';
import { rankCaller, noStore, scopeDomain } from '@/lib/rank-tracking/http';
import { parsePeriod, rankOverview } from '@/lib/rank-tracking/queries';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  try {
    const period = parsePeriod(new URL(request.url).searchParams.get('period'));
    return Response.json(await rankOverview(c.accountId, period, scopeDomain(request)), noStore);
  } catch (e) {
    logger.error('rank.overview_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to load the overview' }, { status: 500 });
  }
}
