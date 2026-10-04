import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { revokeApiKey } from '@/lib/api-keys';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Key not found' }, { status: 404 });
  try {
    const ok = await revokeApiKey(auth.id, id);
    if (!ok) return Response.json({ error: 'Key not found' }, { status: 404 });
    auditLog(auth.id, 'api_key.revoke', 'api_key', id).catch(() => {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Could not delete the key' }, { status: 500 });
  }
}
