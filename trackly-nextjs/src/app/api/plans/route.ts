import { PLAN_LIMITS, getEffectivePlan } from '@/lib/constants';
import { verifyRequestAuth } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  try {
    const result = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const plan = getEffectivePlan(result.rows[0]?.plan || 'free', result.rows[0]?.trial_ends_at);
    return Response.json({ plan, limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free, allPlans: PLAN_LIMITS });
  } catch {
    return Response.json({ plan: 'free', limits: PLAN_LIMITS.free, allPlans: PLAN_LIMITS });
  }
}
