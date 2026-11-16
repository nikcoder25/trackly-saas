/** POST /api/rank/keywords/recheck {ids} - check these keywords again on the next scheduler tick. */
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { rankCaller, jsonBody, strList } from '@/lib/rank-tracking/http';
import { queueRecheck } from '@/lib/rank-tracking/sites';

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const rl = await checkUserIpRateLimit('rank_keywords_recheck', c.userId, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
  const b = await jsonBody(request);
  const ids = strList(b?.ids, 5000);
  if (!ids.length) return Response.json({ error: 'ids is required' }, { status: 400 });
  const r = await queueRecheck(c.accountId, c.plan, ids);
  if (!r.ok) return Response.json({ error: r.error, credit: r.credit }, { status: r.status });
  return Response.json({ queued: r.queued.length });
}
