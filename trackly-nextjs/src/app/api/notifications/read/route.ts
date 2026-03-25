import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const { ids } = await request.json();
  if (Array.isArray(ids) && ids.length) {
    await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2::int[])', [user.id, ids]);
  } else {
    await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [user.id]);
  }
  return Response.json({ success: true });
}
