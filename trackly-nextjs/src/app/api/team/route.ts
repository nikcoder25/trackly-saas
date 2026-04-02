import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const result = await pool.query(
    `SELECT tm.id, tm.role, tm.created_at, u.email, u.name, u.username
     FROM team_members tm JOIN users u ON u.id = tm.member_id
     WHERE tm.owner_id = $1 ORDER BY tm.created_at`, [user.id]
  );
  return Response.json({ members: result.rows });
}
