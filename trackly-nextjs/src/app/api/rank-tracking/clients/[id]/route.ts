/** DELETE /api/rank-tracking/clients/:id - revoke a client login (its link stops working at once). */
import { rankCaller } from '@/lib/rank-tracking/http';
import { revokeClientUser } from '@/lib/rank-tracking/clients';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  return (await revokeClientUser(c.accountId, id)) ? Response.json({ ok: true }) : Response.json({ error: 'Client not found' }, { status: 404 });
}
