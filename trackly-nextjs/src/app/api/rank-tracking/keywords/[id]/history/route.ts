/** GET /api/rank-tracking/keywords/:id/history?range=30|90|365|all - every check in the range. */
import { rankCaller, noStore } from '@/lib/rank-tracking/http';
import { keywordHistory } from '@/lib/rank-tracking/queries';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  const range = new URL(request.url).searchParams.get('range');
  const days = range === '30' || range === '90' || range === '365' ? Number(range) : null;
  const h = await keywordHistory(c.accountId, id, days);
  if (!h) return Response.json({ error: 'Keyword not found' }, { status: 404 });
  return Response.json(h, noStore);
}
