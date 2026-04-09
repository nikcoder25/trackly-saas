import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query(
      'SELECT action, target_type, target_id, details, ip, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [user.id]
    );
    return Response.json({ logs: result.rows });
  } catch {
    return Response.json({ logs: [] });
  }
}
