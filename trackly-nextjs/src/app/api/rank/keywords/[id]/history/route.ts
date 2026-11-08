/** GET /api/rank/keywords/:id/history?range=30d|90d|1y|all - [{date, position|null, url}], oldest first. */
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { parseHistoryRange, rankKeywordHistory } from '@/lib/rank-tracking/sites';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  const range = parseHistoryRange(new URL(request.url).searchParams.get('range'));
  const h = await rankKeywordHistory(c.accountId, id, range);
  if (!h) return Response.json({ error: 'Keyword not found' }, { status: 404 });
  return Response.json({ range, depth: h.depth, history: h.points }, noStore);
}
