/** GET /api/rank-tracking/locations?q=aus - city autocomplete from the cached location list. */
import { rankCaller } from '@/lib/rank-tracking/http';
import { searchLocations } from '@/lib/rank-tracking/locations';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const q = new URL(request.url).searchParams.get('q') || '';
  const locations = await searchLocations(q.slice(0, 80), 10);
  return Response.json({ locations }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
