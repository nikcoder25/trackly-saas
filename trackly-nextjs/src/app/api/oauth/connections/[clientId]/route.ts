import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { disconnectApp } from '@/lib/oauth';

export async function DELETE(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { clientId } = await params;
  try {
    const ok = await disconnectApp(auth.id, clientId);
    if (!ok) return Response.json({ error: 'App not found' }, { status: 404 });
    auditLog(auth.id, 'oauth.disconnect', 'oauth_client', clientId).catch(() => {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Could not disconnect the app' }, { status: 500 });
  }
}
