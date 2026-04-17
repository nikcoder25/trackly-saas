/**
 * Anti-abuse checks for the signup and trial flows.
 *
 * - Duplicate-identity detection via normalised email (Gmail dots, +tags)
 * - Hourly signup caps per /24 IP block
 * - Optional datacenter / VPN IP check via IPQualityScore or IPHub
 * - Trial prompt budgets (per-user per-day and global per-day)
 *
 * Every check degrades gracefully: if the DB write/read or external API
 * call fails, we return `allowed: true` so anti-abuse failures never
 * block legitimate users during a partial outage. Denials are always
 * logged via auditLog for offline review.
 */
import { pool, auditLog } from './db';
import { ipBlockKey, normaliseEmail } from './helpers';
import {
  SIGNUP_IP_BLOCK_HOURLY_LIMIT,
  TRIAL_DAILY_PROMPT_CAP_PER_USER,
  TRIAL_DAILY_GLOBAL_PROMPT_CAP,
} from './constants';

export type AbuseCheckResult = { allowed: true } | { allowed: false; reason: string; code: string };

export async function checkDuplicateEmailIdentity(email: string): Promise<AbuseCheckResult> {
  const normalised = normaliseEmail(email);
  if (!normalised) return { allowed: true };
  try {
    const res = await pool.query('SELECT id FROM users WHERE email_normalized = $1 LIMIT 1', [normalised]);
    if (res.rows.length > 0) {
      return { allowed: false, code: 'duplicate_identity', reason: 'An account already exists for this email address.' };
    }
  } catch (e) {
    console.error('[AntiAbuse] checkDuplicateEmailIdentity failed:', (e as Error).message);
  }
  return { allowed: true };
}

export async function checkSignupIpFrequency(ip: string): Promise<AbuseCheckResult> {
  if (!ip || ip === 'unknown') return { allowed: true };
  const block = ipBlockKey(ip);
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE signup_ip IS NOT NULL
         AND (signup_ip = $1 OR signup_ip LIKE $2)
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [ip, block.endsWith('/24') ? block.replace('.0/24', '.%') : `${block}%`]
    );
    const count = res.rows[0]?.n || 0;
    if (count >= SIGNUP_IP_BLOCK_HOURLY_LIMIT) {
      return {
        allowed: false,
        code: 'ip_frequency',
        reason: 'Too many signups from this network recently. Please try again later.',
      };
    }
  } catch (e) {
    console.error('[AntiAbuse] checkSignupIpFrequency failed:', (e as Error).message);
  }
  return { allowed: true };
}

/**
 * Optional datacenter / VPN check. Triggered only when IPQUALITYSCORE_KEY or
 * IPHUB_KEY is configured. Without a key, skipped silently.
 */
export async function checkDatacenterIp(ip: string): Promise<AbuseCheckResult> {
  if (!ip || ip === 'unknown') return { allowed: true };
  const iqsKey = process.env.IPQUALITYSCORE_KEY;
  const iphubKey = process.env.IPHUB_KEY;
  try {
    if (iqsKey) {
      const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(iqsKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as { proxy?: boolean; vpn?: boolean; tor?: boolean; fraud_score?: number };
        if (data.vpn || data.tor || data.proxy || (data.fraud_score ?? 0) >= 85) {
          return { allowed: false, code: 'datacenter_ip', reason: 'Signups from VPN/proxy networks are not allowed.' };
        }
      }
    } else if (iphubKey) {
      const res = await fetch(`https://v2.api.iphub.info/ip/${encodeURIComponent(ip)}`, {
        headers: { 'X-Key': iphubKey },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json() as { block?: number };
        // block === 1 means hosting/datacenter/VPN per IPHub docs
        if (data.block === 1) {
          return { allowed: false, code: 'datacenter_ip', reason: 'Signups from VPN/proxy networks are not allowed.' };
        }
      }
    }
  } catch (e) {
    // Treat timeouts / network errors as allowed to avoid false-positive denials
    console.warn('[AntiAbuse] checkDatacenterIp failed (allowing):', (e as Error).message);
  }
  return { allowed: true };
}

export interface SignupContext {
  email: string;
  ip: string;
  name?: string;
}

/**
 * Run the full signup gauntlet. Stops at the first deny and returns the
 * reason; logs the event for offline review.
 */
export async function runSignupAbuseChecks(ctx: SignupContext): Promise<AbuseCheckResult> {
  const checks: Array<[string, Promise<AbuseCheckResult>]> = [
    ['duplicate_email', checkDuplicateEmailIdentity(ctx.email)],
    ['ip_frequency', checkSignupIpFrequency(ctx.ip)],
    ['datacenter_ip', checkDatacenterIp(ctx.ip)],
  ];
  for (const [_label, promise] of checks) {
    const result = await promise;
    if (!result.allowed) {
      auditLog('system', 'signup_blocked', 'user', undefined, {
        email: ctx.email, ip: ctx.ip, code: result.code,
      }, ctx.ip);
      return result;
    }
  }
  return { allowed: true };
}

export async function logSuspiciousSignupPattern(ip: string, email: string): Promise<void> {
  // /24 block burst check — warn if we've seen >5 signups from this block in the last hour
  const block = ipBlockKey(ip);
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE signup_ip LIKE $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [block.endsWith('/24') ? block.replace('.0/24', '.%') : `${block}%`]
    );
    const count = res.rows[0]?.n || 0;
    if (count >= 5) {
      auditLog('system', 'signup_burst_alert', 'ip_block', block, {
        count, ip, email,
      }, ip);
      console.warn(`[AntiAbuse] signup burst from ${block}: ${count} in last hour`);
    }
  } catch (e) {
    console.error('[AntiAbuse] logSuspiciousSignupPattern failed:', (e as Error).message);
  }
}

/**
 * Reserve N prompts against the trial budgets. Checks both per-user daily and
 * global daily caps. If either would be exceeded, returns allowed:false with
 * reason. On success, increments both counters atomically. Non-trial users
 * short-circuit to allowed:true.
 */
export async function reserveTrialPromptBudget(
  userId: string,
  effectivePlan: string,
  promptsRequested: number
): Promise<AbuseCheckResult> {
  if (effectivePlan !== 'trial' || promptsRequested <= 0) return { allowed: true };
  try {
    // Run as a single transaction with row locks to avoid race conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Per-user daily cap
      const userRes = await client.query(
        `INSERT INTO trial_usage (user_id, usage_date, prompts_used)
         VALUES ($1, CURRENT_DATE, 0)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING prompts_used`,
        [userId]
      );
      const userUsed = userRes.rows[0]?.prompts_used || 0;
      if (userUsed + promptsRequested > TRIAL_DAILY_PROMPT_CAP_PER_USER) {
        await client.query('ROLLBACK');
        auditLog(userId, 'trial_user_cap_hit', 'user', userId, {
          userUsed, promptsRequested, cap: TRIAL_DAILY_PROMPT_CAP_PER_USER,
        });
        return {
          allowed: false,
          code: 'trial_user_daily_cap',
          reason: `Trial accounts can run up to ${TRIAL_DAILY_PROMPT_CAP_PER_USER} prompts per day. Upgrade for higher limits.`,
        };
      }

      // Global daily cap across all trial users
      const globalRes = await client.query(
        `INSERT INTO trial_global_usage (usage_date, prompts_used)
         VALUES (CURRENT_DATE, 0)
         ON CONFLICT (usage_date) DO UPDATE SET usage_date = EXCLUDED.usage_date
         RETURNING prompts_used`
      );
      const globalUsed = globalRes.rows[0]?.prompts_used || 0;
      if (globalUsed + promptsRequested > TRIAL_DAILY_GLOBAL_PROMPT_CAP) {
        await client.query('ROLLBACK');
        auditLog('system', 'trial_global_cap_hit', 'trial_global_usage', undefined, {
          globalUsed, promptsRequested, cap: TRIAL_DAILY_GLOBAL_PROMPT_CAP, userId,
        });
        return {
          allowed: false,
          code: 'trial_global_daily_cap',
          reason: 'The daily free-trial capacity has been reached. Please try again tomorrow or upgrade your plan.',
        };
      }

      await client.query(
        `UPDATE trial_usage SET prompts_used = prompts_used + $1 WHERE user_id = $2 AND usage_date = CURRENT_DATE`,
        [promptsRequested, userId]
      );
      await client.query(
        `UPDATE trial_global_usage SET prompts_used = prompts_used + $1 WHERE usage_date = CURRENT_DATE`,
        [promptsRequested]
      );

      // Flag unusually fast burn
      if (userUsed + promptsRequested >= TRIAL_DAILY_PROMPT_CAP_PER_USER * 0.9) {
        auditLog(userId, 'trial_high_burn_alert', 'user', userId, {
          userUsed: userUsed + promptsRequested, cap: TRIAL_DAILY_PROMPT_CAP_PER_USER,
        });
      }

      await client.query('COMMIT');
      return { allowed: true };
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[AntiAbuse] reserveTrialPromptBudget failed:', (e as Error).message);
    // Fail-open to avoid blocking legitimate users during DB hiccups
    return { allowed: true };
  }
}
