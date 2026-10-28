/** POST /api/rank-tracking/websites/:id/share - a read-only link to this website's rankings. */
import { rankCaller } from '@/lib/rank-tracking/http';
import { ownWebsite } from '@/lib/rank-tracking/keywords';
import { createClientUser } from '@/lib/rank-tracking/clients';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  const site = await ownWebsite(c.accountId, id);
  if (!site) return Response.json({ error: 'Website not found' }, { status: 404 });
  const r = await createClientUser(c.accountId, { name: `${site.domain} share link`, email: null, scope: 'websites', websiteIds: [site.id], groupIds: [] }, request);
  return Response.json({ url: r.url });
}
