import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { ids } = body;
    if (Array.isArray(ids) && ids.length) {
      const validIds = ids.filter((id: unknown) => Number.isInteger(id) && (id as number) > 0);
      if (validIds.length === 0) return Response.json({ error: 'Invalid notification IDs' }, { status: 400 });
      await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2::int[])', [user.id, validIds]);
    } else {
      await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [user.id]);
    }
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
}
