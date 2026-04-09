import { PLAN_LIMITS } from '@/lib/constants';
import { verifyRequestAuth } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  try {
    const result = await pool.query('SELECT plan FROM users WHERE id = $1', [user.id]);
    const plan = result.rows[0]?.plan || 'free';
    return Response.json({ plan, limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free, allPlans: PLAN_LIMITS });
  } catch {
    return Response.json({ plan: 'free', limits: PLAN_LIMITS.free, allPlans: PLAN_LIMITS });
  }
}
