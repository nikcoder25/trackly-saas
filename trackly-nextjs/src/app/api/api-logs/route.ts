import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query(
      'SELECT platform, query, status, error, response_ms, cost, created_at FROM api_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
      [user.id]
    );
    return Response.json({ logs: result.rows });
  } catch {
    return Response.json({ logs: [] });
  }
}

export async function DELETE(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    await pool.query('DELETE FROM api_logs WHERE user_id = $1', [user.id]);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
}
