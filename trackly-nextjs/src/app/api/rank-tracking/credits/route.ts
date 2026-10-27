/** GET /api/rank-tracking/credits - the plan's rank credits: allowance, committed, used this month. */
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { creditStatus } from '@/lib/rank-tracking/queries';
import { providerChain } from '@/lib/rank-tracking/providers';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  return Response.json({ ...(await creditStatus(c.accountId, c.plan)), providersConfigured: providerChain().length > 0 }, noStore);
}
