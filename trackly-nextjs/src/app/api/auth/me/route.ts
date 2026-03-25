import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { safeUser } from '@/lib/helpers';

export async function GET(request: Request) {
  const authUser = verifyRequestAuth(request);
  if (!authUser) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query(
      'SELECT id, email, username, name, plan, role, api_keys, settings, created_at, google_id, avatar_url FROM users WHERE id = $1',
      [authUser.id]
    );
    const user = result.rows[0];
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    if (user.role === 'admin' && user.plan !== 'owner') {
      await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['owner', user.id]);
      user.plan = 'owner';
    }

    return Response.json({ user: safeUser(user) });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
