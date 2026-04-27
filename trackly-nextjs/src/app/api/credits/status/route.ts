/**
 * GET /api/credits/status
 *
 * Returns the caller's current credit position:
 *   {
 *     plan, label,
 *     remaining, monthlyCap, monthlyUsed,
 *     manualRemainingToday, manualDailyCap,
 *     cooldownSeconds, modelTier, scheduledRuns,
 *     nextResetAt, nextDailyResetAt,
 *     lowBalance,
 *   }
 *
 * Used by the dashboard hero, the pre-flight Run Query modal, and the
 * billing page meters.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getCreditStatus } from '@/lib/credits';
import { getEffectivePlan } from '@/lib/constants';

export async function GET(request: Request): Promise<Response> {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Resolve effective plan (trial expiry rolls a 'trial' user back to 'free').
  // Mirrors what /api/brands/[id]/run does so the credit numbers the UI
  // shows match what the run handler will actually reserve against.
  const planRow = await pool.query(
    'SELECT plan, trial_ends_at FROM users WHERE id = $1 LIMIT 1',
    [user.id],
  );
  if (!planRow.rows.length) {
    return Response.json({ error: 'User not found' }, { status: 401 });
  }
  const effectivePlan = getEffectivePlan(
    planRow.rows[0].plan,
    planRow.rows[0].trial_ends_at,
  );

  try {
    const status = await getCreditStatus(user.id, effectivePlan);
    return Response.json(status, {
      headers: {
        // Short cache to absorb the Run Query button's pre-flight fetch
        // burst, but never long enough to outlast a single click→run
        // round-trip on the credit counter.
        'Cache-Control': 'private, max-age=2',
      },
    });
  } catch (e) {
    return Response.json({
      error: 'Failed to load credit status',
      detail: (e as Error).message,
    }, { status: 500 });
  }
}
