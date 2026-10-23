/**
 * Trial expiry sweep.
 *
 * Every read path resolves the effective plan with getEffectivePlan(), so an
 * expired trial already behaves like 'free' at request time. Nothing ever
 * persisted that transition, though: users.plan stayed 'trial' forever, so
 * the admin panel, plan-filtered SQL and analytics kept counting long-dead
 * trials as live. This sweep writes the transition back to the row.
 *
 * Runs hourly from /api/cron/trial-nurture (before the nurture tick) and is
 * idempotent: the WHERE clause only matches rows still on 'trial' whose end
 * date has passed (or that never had one, which getEffectivePlan already
 * treats as expired). It also catches up every stale trial on its first run.
 *
 * The expiry time is stamped into users.settings.trialExpiredAt so:
 *   - the nurture sequence can still send the "expired" and "winback"
 *     emails to swept users (it used to key purely on plan = 'trial'),
 *   - the dashboard can still show the "trial ended" banner,
 *   - verify-email can still promote a provisional 24h trial that lapsed
 *     before the user clicked the link.
 * trial_ends_at is left untouched so the admin panel keeps the end date.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Pure helper used by the sweep's tests and by callers that already hold a
 * row: true when a stored plan of 'trial' should be moved to 'free'.
 */
export function isTrialExpired(
  plan: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (plan !== 'trial') return false;
  if (!trialEndsAt) return true;
  const end = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (isNaN(end.getTime())) return true;
  return end.getTime() <= now.getTime();
}

export const EXPIRE_TRIALS_SQL = `
  UPDATE users
     SET plan = 'free',
         settings = COALESCE(settings, '{}'::jsonb)
           || jsonb_build_object('trialExpiredAt', to_jsonb($1::timestamptz))
   WHERE plan = 'trial'
     AND (trial_ends_at IS NULL OR trial_ends_at <= $1::timestamptz)
  RETURNING id`;

export interface TrialExpiryResult {
  expired: number;
  userIds: string[];
}

export async function expireStaleTrials(now: Date = new Date()): Promise<TrialExpiryResult> {
  const res = await pool.query(EXPIRE_TRIALS_SQL, [now.toISOString()]);
  const userIds = (res.rows as Array<{ id: string }>).map((r) => r.id);
  if (userIds.length) {
    logger.info('trial_expiry.swept', { expired: userIds.length });
  }
  return { expired: userIds.length, userIds };
}
