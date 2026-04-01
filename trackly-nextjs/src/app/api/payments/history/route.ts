import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  // Payment history from webhook events linked to user
  try {
    const result = await pool.query(
      `SELECT event_id, event_type, processed_at FROM webhook_events
       WHERE user_id = $1
       ORDER BY processed_at DESC LIMIT 50`,
      [user.id]
    );
    return Response.json({ history: result.rows });
  } catch {
    return Response.json({ history: [] });
  }
}
