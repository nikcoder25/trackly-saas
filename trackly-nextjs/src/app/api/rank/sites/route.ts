/** GET /api/rank/sites[?domain=] - every tracked site: keyword count, high, low, net change, improved/dropped counts. */
import { logger } from '@/lib/logger';
import { rankCaller, noStore, scopeDomain } from '@/lib/rank-tracking/http';
import { rankSites } from '@/lib/rank-tracking/sites';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  try {
    return Response.json({ sites: await rankSites(c.accountId, scopeDomain(request)) }, noStore);
  } catch (e) {
    logger.error('rank.sites_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to load sites' }, { status: 500 });
  }
}
