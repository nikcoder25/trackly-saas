// Apps the signed-in user has connected over OAuth (Account page).
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { listConnectedApps } from '@/lib/oauth';

export async function GET(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  try { return Response.json({ apps: await listConnectedApps(auth.id) }); }
  catch { return Response.json({ error: 'Could not load connected apps' }, { status: 500 }); }
}
