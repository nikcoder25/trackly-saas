import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query('SELECT plan, settings FROM users WHERE id = $1', [user.id]);
    const u = result.rows[0];
    if (!u) return Response.json({ error: 'User not found' }, { status: 404 });

    return Response.json({
      plan: u.plan || 'free',
      subscriptionId: u.settings?.subscription_id || null,
      subscriptionStatus: u.settings?.subscription_status || null,
    });
  } catch {
    return Response.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}
