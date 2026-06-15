/**
 * Credit reservation, refund, cooldown, and rollover for the v2
 * pricing system. One LLM call = one credit.
 *
 * Two stores cooperate:
 *   - `usage_counters` (this module) — the *reservation ceiling*. It is
 *     incremented up-front by `reserveCredits` and decremented by
 *     `refundCredits` when a run finishes with `received < reserved`.
 *     Its `monthly_used` is what `reserveCredits` checks against the
 *     plan cap, so a hot click-storm can't sneak past the cap while the
 *     ledger is still being written to.
 *   - `tenant_cost_events` (see lib/cost-tracker.ts) — the *committed
 *     ledger*. One row per actually-dispatched LLM call, written by
 *     `recordCostEvent` after the provider responds. This is the
 *     source of truth for "credits used this period" displayed to the
 *     user (see issue #453).
 *
 * The two diverge whenever there are in-flight reservations or a refund
 * path failed to fire (e.g. process killed mid-run). `getCreditStatus`
 * reads both: `monthlyUsed` comes from the ledger and is what the UI
 * shows; `reservedCredits` is the (counter − ledger) delta and lets the
 * UI surface in-flight holds without confusing them with committed
 * spend. The plan-cap `remaining` is computed against the *counter*
 * (i.e. against committed + reserved) so the headline tile and the
 * reservation gate never disagree about how much room is left.
 *
 * Mutation paths for `usage_counters.monthly_used` (audit per #453):
 *   - `reserveCredits` (this file) — only increment.
 *   - `refundCredits` (this file) — only decrement, paired with
 *     `recordCostEvent` rows already inserted by the worker for the
 *     calls that *did* dispatch.
 *   - There is no admin path that bumps the counter without also
 *     producing a ledger row; the admin cost endpoint reads
 *     `tenant_cost_events` directly.
 * Anything new touching the counter MUST either also write a paired
 * ledger row or document why the divergence is intentional, otherwise
 * the headline tile will silently understate spend.
 *
 * Storage shape (`usage_counters`):
 *   - `period_month` (DATE): start-of-UTC-month the monthly counter is
 *     scoped to. We compare against the current UTC month and reset the
 *     row in-place when it rolls over instead of inserting a new row,
 *     so the table grows O(users) not O(users × months).
 *   - `monthly_used` (INT): reservation ceiling for the current period.
 *     NOT the displayed "credits used" number — that comes from the
 *     `tenant_cost_events` ledger via `getCreditStatus`.
 *   - `daily_date` (DATE): UTC date `manual_daily_used` is scoped to.
 *   - `manual_daily_used` (INT): manual ("Run Query") credits spent
 *     today. Auto/cron credits don't count against the daily cap, only
 *     the monthly one — daily is a UX speed-bump for impatient clicks,
 *     not an anti-abuse gate.
 *   - `last_low_balance_notify_at` (TIMESTAMPTZ): de-dupes the 20%
 *     warning email.
 *   - `last_reset_notify_at` (TIMESTAMPTZ): de-dupes the monthly-reset
 *     confirmation email.
 *
 * Cooldowns live in a separate `prompt_cooldowns` table keyed by
 * (user_id, prompt_hash) with a TTL column so they survive process
 * restarts. The table is pruned opportunistically.
 *
 * All public functions are best-effort against transient DB errors
 * but FAIL CLOSED on credit reservation: if we can't read counters we
 * refuse to spend credits rather than risk an unbounded charge.
 */

import crypto from 'crypto';
import { pool } from './db';
import {
  getPlanCredits,
  isLowBalance,
  type PlanCreditConfig,
} from './plan-config';

let _tableReady = false;
let _tablePromise: Promise<void> | null = null;

/** Idempotently create `usage_counters` + `prompt_cooldowns`. */
export async function ensureCreditsSchema(): Promise<void> {
  if (_tableReady) return;
  if (_tablePromise) return _tablePromise;
  _tablePromise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usage_counters (
          user_id TEXT PRIMARY KEY,
          period_month DATE NOT NULL,
          monthly_used INT NOT NULL DEFAULT 0,
          daily_date DATE NOT NULL,
          manual_daily_used INT NOT NULL DEFAULT 0,
          last_low_balance_notify_at TIMESTAMPTZ,
          last_reset_notify_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS prompt_cooldowns (
          user_id TEXT NOT NULL,
          prompt_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (user_id, prompt_hash)
        );
        CREATE INDEX IF NOT EXISTS prompt_cooldowns_expires_idx
          ON prompt_cooldowns(expires_at);
      `);
      _tableReady = true;
    } catch (e) {
      _tablePromise = null;
      throw e;
    }
  })();
  return _tablePromise;
}

// ── Date boundaries (UTC) ─────────────────────────────────────────

export function currentMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function currentDayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function nextDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  ));
}

// ── Cooldowns ─────────────────────────────────────────────────────

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 32);
}

export interface CooldownStatus {
  active: boolean;
  remainingSeconds: number;
}

/**
 * Returns whether the (user, prompt) pair is currently cooling down.
 * Always returns `{active:false}` when cooldownSeconds is 0 (free
 * cooldown plans like Enterprise).
 */
export async function checkCooldown(
  userId: string,
  prompt: string,
  cooldownSeconds: number,
  now: Date = new Date(),
): Promise<CooldownStatus> {
  if (cooldownSeconds <= 0) return { active: false, remainingSeconds: 0 };
  await ensureCreditsSchema();
  const hash = hashPrompt(prompt);
  try {
    const res = await pool.query(
      `SELECT expires_at FROM prompt_cooldowns
       WHERE user_id = $1 AND prompt_hash = $2 AND expires_at > $3
       LIMIT 1`,
      [userId, hash, now.toISOString()],
    );
    if (!res.rows.length) return { active: false, remainingSeconds: 0 };
    const expires = new Date(res.rows[0].expires_at as string).getTime();
    const remaining = Math.max(0, Math.ceil((expires - now.getTime()) / 1000));
    return { active: remaining > 0, remainingSeconds: remaining };
  } catch {
    // Best-effort: a DB hiccup shouldn't block the user. The reserve
    // path will still enforce monthly/daily caps.
    return { active: false, remainingSeconds: 0 };
  }
}

/** Stamp a cooldown for the (user, prompt) pair. */
export async function setCooldown(
  userId: string,
  prompt: string,
  cooldownSeconds: number,
  now: Date = new Date(),
): Promise<void> {
  if (cooldownSeconds <= 0) return;
  await ensureCreditsSchema();
  const hash = hashPrompt(prompt);
  const expires = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
  try {
    await pool.query(
      `INSERT INTO prompt_cooldowns (user_id, prompt_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, prompt_hash)
       DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [userId, hash, expires],
    );
  } catch {
    // Cooldowns are advisory; never fail the run because we couldn't write one.
  }
}

// ── Counter row read/upsert (with auto-rollover) ──────────────────

interface UsageCounterRow {
  user_id: string;
  period_month: string;
  monthly_used: number;
  daily_date: string;
  manual_daily_used: number;
  last_low_balance_notify_at: string | null;
  last_reset_notify_at: string | null;
}

/**
 * Read (or initialize) the user's counter row, rolling over the
 * monthly/daily fields if the stored period is stale. The roll happens
 * in-place inside a single UPSERT so concurrent readers see consistent
 * counters even if two requests land in the same instant the month
 * flipped.
 */
async function readOrInitCounter(
  userId: string,
  now: Date = new Date(),
): Promise<UsageCounterRow & { rolledOverMonth: boolean }> {
  await ensureCreditsSchema();
  const monthStart = currentMonthStart(now);
  const today = currentDayUtc(now);

  const res = await pool.query(
    `INSERT INTO usage_counters (user_id, period_month, daily_date, monthly_used, manual_daily_used)
     VALUES ($1, $2, $3, 0, 0)
     ON CONFLICT (user_id) DO UPDATE
       SET period_month = CASE
             WHEN usage_counters.period_month < EXCLUDED.period_month
               THEN EXCLUDED.period_month
             ELSE usage_counters.period_month
           END,
           monthly_used = CASE
             WHEN usage_counters.period_month < EXCLUDED.period_month
               THEN 0
             ELSE usage_counters.monthly_used
           END,
           daily_date = CASE
             WHEN usage_counters.daily_date < EXCLUDED.daily_date
               THEN EXCLUDED.daily_date
             ELSE usage_counters.daily_date
           END,
           manual_daily_used = CASE
             WHEN usage_counters.daily_date < EXCLUDED.daily_date
               THEN 0
             ELSE usage_counters.manual_daily_used
           END,
           updated_at = NOW()
     RETURNING *,
       (period_month = $2 AND monthly_used = 0) AS rolled_over_month`,
    [userId, monthStart.toISOString().slice(0, 10), today],
  );
  const row = res.rows[0] as UsageCounterRow & { rolled_over_month: boolean };
  return {
    ...row,
    rolledOverMonth: Boolean(row.rolled_over_month),
  };
}

// ── reserveCredits ────────────────────────────────────────────────

export type ReserveKind = 'manual' | 'auto';

export type ReserveFailureCode =
  | 'monthly_exhausted'
  | 'daily_cap_reached'
  | 'cooldown'
  | 'plan_disallows_auto';

export interface ReserveSuccess {
  ok: true;
  reserved: number;
  remaining: number;
  monthlyCap: number;
  manualRemainingToday: number;
  manualDailyCap: number;
  nextResetAt: string;
}

export interface ReserveFailure {
  ok: false;
  code: ReserveFailureCode;
  message: string;
  remaining: number;
  monthlyCap: number;
  manualRemainingToday: number;
  manualDailyCap: number;
  nextResetAt: string;
  cooldownRemainingSeconds?: number;
}

export type ReserveResult = ReserveSuccess | ReserveFailure;

/**
 * Atomically reserve `amount` credits for the given user. Returns
 * `{ok:false}` if monthly is exhausted, the manual daily cap is
 * reached (manual kind only), or the plan disallows auto runs.
 *
 * Cooldown is checked separately via `reserveWithCooldown` because
 * cooldowns are per-prompt, not global. `reserveCredits` itself is
 * prompt-agnostic.
 */
export async function reserveCredits(
  userId: string,
  plan: string,
  amount: number,
  kind: ReserveKind,
  now: Date = new Date(),
  opts: { bypassDailyCap?: boolean } = {},
): Promise<ReserveResult> {
  const cfg = getPlanCredits(plan);

  // A brand's *first* run after creation is guaranteed (the "Create Brand &
  // Run" flow auto-dispatches it). We exempt that one run from the per-day
  // manual cap so a brand-new account can't land on "Daily manual cap
  // reached (10/10)" with zero runs to its name. The monthly credit ceiling
  // still applies, and the caller (run route) gates this to one claim per
  // brand via an atomic `brands.first_run_at` flag, so it can't be abused to
  // bypass the cap repeatedly.
  const bypassDaily = kind === 'manual' && opts.bypassDailyCap === true;

  // Plan gate: free/no-scheduled plans can't reserve auto credits.
  if (kind === 'auto' && !cfg.scheduledRuns) {
    return failure(cfg, 0, 0, now, 'plan_disallows_auto',
      `The ${cfg.label} plan does not include scheduled runs.`);
  }

  // Reserving 0 is a no-op success — used by the status endpoint to
  // peek at counters without spending.
  if (amount <= 0) {
    const row = await readOrInitCounter(userId, now);
    return success(cfg, row, 0, now);
  }

  await ensureCreditsSchema();

  // Single statement does the rollover, the cap check, and the
  // increment. If any cap would be exceeded, the WHERE clause filters
  // the row out and the UPDATE returns zero rows — we then read back
  // the (rolled-over) counters to build the failure response.
  const monthStart = currentMonthStart(now).toISOString().slice(0, 10);
  const today = currentDayUtc(now);
  // A bypassed first run neither counts toward nor is gated by the daily cap.
  const dailyIncrement = (kind === 'manual' && !bypassDaily) ? amount : 0;
  // Effective daily ceiling used by the conditional UPDATE below. When the
  // first-run exemption is active we widen it to "unlimited" so the daily
  // guard can never filter the row out.
  const dailyCapForQuery = bypassDaily ? Number.MAX_SAFE_INTEGER : cfg.manualDailyCap;

  // Step 1: ensure the row exists & is rolled-over.
  const initial = await readOrInitCounter(userId, now);

  // Step 2: conditional increment.
  const updateRes = await pool.query(
    `UPDATE usage_counters
        SET monthly_used = monthly_used + $2,
            manual_daily_used = manual_daily_used + $3,
            updated_at = NOW()
      WHERE user_id = $1
        AND period_month = $4
        AND daily_date = $5
        AND monthly_used + $2 <= $6
        AND manual_daily_used + $3 <= $7
      RETURNING monthly_used, manual_daily_used`,
    [
      userId,
      amount,
      dailyIncrement,
      monthStart,
      today,
      cfg.monthlyCredits,
      dailyCapForQuery,
    ],
  );

  if (updateRes.rows.length === 0) {
    // Determine which cap blocked us. Fresh read so the response shows
    // the exact remaining numbers.
    const remainingMonthly = Math.max(0, cfg.monthlyCredits - initial.monthly_used);
    const remainingDaily = Math.max(0, cfg.manualDailyCap - initial.manual_daily_used);
    if (kind === 'manual' && !bypassDaily && initial.manual_daily_used + amount > cfg.manualDailyCap) {
      return failure(cfg, initial.monthly_used, initial.manual_daily_used, now,
        'daily_cap_reached',
        `Daily manual run limit reached (${initial.manual_daily_used}/${cfg.manualDailyCap}). ` +
        `Resets at midnight UTC.`);
    }
    return failure(cfg, initial.monthly_used, initial.manual_daily_used, now,
      'monthly_exhausted',
      `Out of credits (${initial.monthly_used}/${cfg.monthlyCredits} used). ` +
      `Upgrade your plan or wait for the monthly reset.`,
      undefined,
      { remainingMonthly, remainingDaily });
  }

  const row = updateRes.rows[0] as { monthly_used: number; manual_daily_used: number };
  return success(cfg, {
    monthly_used: row.monthly_used,
    manual_daily_used: row.manual_daily_used,
  }, amount, now);
}

/**
 * Reserve credits AND check cooldown for a manual run with a single
 * logical prompt. Used by the manual `/run` path so we can give the
 * client a clean countdown number when the cooldown blocks.
 */
export async function reserveManualWithCooldown(
  userId: string,
  plan: string,
  prompt: string,
  amount: number,
  now: Date = new Date(),
  opts: { bypassDailyCap?: boolean } = {},
): Promise<ReserveResult> {
  const cfg = getPlanCredits(plan);
  const cd = await checkCooldown(userId, prompt, cfg.cooldownSeconds, now);
  if (cd.active) {
    const peek = await readOrInitCounter(userId, now);
    return failure(cfg, peek.monthly_used, peek.manual_daily_used, now,
      'cooldown',
      `Cooldown active. Try again in ${cd.remainingSeconds}s.`,
      cd.remainingSeconds);
  }
  const res = await reserveCredits(userId, plan, amount, 'manual', now, opts);
  if (res.ok) {
    await setCooldown(userId, prompt, cfg.cooldownSeconds, now);
  }
  return res;
}

// ── refundCredits ────────────────────────────────────────────────

/**
 * Return unused credits to the counter when a run dies before
 * consuming all of them. Called from the worker's terminal handler
 * when `received < totalExpected` and the run errored or was aborted.
 *
 * Best-effort: a missed refund is recoverable on the next month roll;
 * a duplicate refund (e.g. from a retry) is impossible because the
 * caller passes the unused delta exactly once.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  kind: ReserveKind = 'manual',
): Promise<void> {
  if (amount <= 0) return;
  await ensureCreditsSchema();
  const dailyDecrement = kind === 'manual' ? amount : 0;
  try {
    await pool.query(
      `UPDATE usage_counters
          SET monthly_used = GREATEST(0, monthly_used - $2),
              manual_daily_used = GREATEST(0, manual_daily_used - $3),
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId, amount, dailyDecrement],
    );
  } catch {
    // Swallow: see contract above.
  }
}

// ── status read ──────────────────────────────────────────────────

export interface CreditStatus {
  plan: string;
  label: string;
  remaining: number;
  monthlyCap: number;
  /**
   * Credits *committed* this period — derived from the
   * `tenant_cost_events` ledger, not the reservation counter. This is
   * the number the headline tile shows and the projection should be
   * built against; see #453.
   */
  monthlyUsed: number;
  /**
   * Credits *reserved but not yet dispatched* — the (counter − ledger)
   * delta. Surfaces in-flight holds (e.g. a Run-All that's still firing
   * sub-tasks) without conflating them with committed spend. Always
   * ≥ 0; in steady state, reservations clear via either a ledger row
   * (call dispatched) or a refund (call never dispatched).
   */
  reservedCredits: number;
  manualRemainingToday: number;
  manualDailyCap: number;
  cooldownSeconds: number;
  modelTier: 'economy' | 'premium';
  scheduledRuns: boolean;
  nextResetAt: string;
  nextDailyResetAt: string;
  lowBalance: boolean;
}

export async function getCreditStatus(
  userId: string,
  plan: string,
  now: Date = new Date(),
): Promise<CreditStatus> {
  const cfg = getPlanCredits(plan);
  const row = await readOrInitCounter(userId, now);

  // Ledger-backed "credits used this period". Counted from
  // `tenant_cost_events` (one row per dispatched LLM call) over the
  // same UTC-month window the reservation counter rolls on. Best-effort
  // against transient DB errors: if the count fails we fall back to
  // the counter so the tile still renders, just with the historical
  // (over-counting) shape — no worse than the pre-#453 behavior.
  const monthStart = currentMonthStart(now);
  let ledgerUsed: number;
  try {
    const ledgerRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM tenant_cost_events
        WHERE tenant_id = $1 AND created_at >= $2`,
      [userId, monthStart.toISOString()],
    );
    ledgerUsed = Number((ledgerRes.rows[0] as { c?: number } | undefined)?.c || 0);
  } catch {
    ledgerUsed = row.monthly_used;
  }

  // Reservation ceiling drives `remaining` so the tile and the
  // reservation gate stay in lock-step on cap math.
  const reservedCredits = Math.max(0, row.monthly_used - ledgerUsed);
  const remaining = Math.max(0, cfg.monthlyCredits - row.monthly_used);
  const manualRemainingToday = Math.max(0, cfg.manualDailyCap - row.manual_daily_used);
  return {
    plan,
    label: cfg.label,
    remaining,
    monthlyCap: cfg.monthlyCredits,
    monthlyUsed: ledgerUsed,
    reservedCredits,
    manualRemainingToday,
    manualDailyCap: cfg.manualDailyCap,
    cooldownSeconds: cfg.cooldownSeconds,
    modelTier: cfg.modelTier,
    scheduledRuns: cfg.scheduledRuns,
    nextResetAt: nextMonthStart(now).toISOString(),
    nextDailyResetAt: nextDayStart(now).toISOString(),
    lowBalance: isLowBalance(remaining, cfg.monthlyCredits),
  };
}

// ── notification de-dupe ─────────────────────────────────────────

/**
 * Atomically claim the right to send a low-balance email. Only one
 * caller per (user, period_month) gets `true`; the rest get `false`.
 * Resets implicitly on month rollover because period_month changes.
 */
export async function tryClaimLowBalanceNotify(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  await ensureCreditsSchema();
  const monthStart = currentMonthStart(now).toISOString().slice(0, 10);
  try {
    const res = await pool.query(
      `UPDATE usage_counters
          SET last_low_balance_notify_at = NOW()
        WHERE user_id = $1
          AND period_month = $2
          AND (last_low_balance_notify_at IS NULL
               OR last_low_balance_notify_at < $3)
        RETURNING user_id`,
      [userId, monthStart, currentMonthStart(now).toISOString()],
    );
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

export async function tryClaimMonthlyResetNotify(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  await ensureCreditsSchema();
  const monthStart = currentMonthStart(now).toISOString().slice(0, 10);
  try {
    const res = await pool.query(
      `UPDATE usage_counters
          SET last_reset_notify_at = NOW()
        WHERE user_id = $1
          AND period_month = $2
          AND (last_reset_notify_at IS NULL
               OR last_reset_notify_at < $3)
        RETURNING user_id`,
      [userId, monthStart, currentMonthStart(now).toISOString()],
    );
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

// ── Cooldown sweep (best-effort, called opportunistically) ───────

export async function pruneExpiredCooldowns(now: Date = new Date()): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM prompt_cooldowns WHERE expires_at < $1`,
      [now.toISOString()],
    );
  } catch {
    // No-op.
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function success(
  cfg: PlanCreditConfig,
  row: { monthly_used: number; manual_daily_used: number },
  reserved: number,
  now: Date,
): ReserveSuccess {
  return {
    ok: true,
    reserved,
    remaining: Math.max(0, cfg.monthlyCredits - row.monthly_used),
    monthlyCap: cfg.monthlyCredits,
    manualRemainingToday: Math.max(0, cfg.manualDailyCap - row.manual_daily_used),
    manualDailyCap: cfg.manualDailyCap,
    nextResetAt: nextMonthStart(now).toISOString(),
  };
}

function failure(
  cfg: PlanCreditConfig,
  monthlyUsed: number,
  manualDailyUsed: number,
  now: Date,
  code: ReserveFailureCode,
  message: string,
  cooldownRemainingSeconds?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _extras?: { remainingMonthly: number; remainingDaily: number },
): ReserveFailure {
  return {
    ok: false,
    code,
    message,
    remaining: Math.max(0, cfg.monthlyCredits - monthlyUsed),
    monthlyCap: cfg.monthlyCredits,
    manualRemainingToday: Math.max(0, cfg.manualDailyCap - manualDailyUsed),
    manualDailyCap: cfg.manualDailyCap,
    nextResetAt: nextMonthStart(now).toISOString(),
    ...(cooldownRemainingSeconds !== undefined ? { cooldownRemainingSeconds } : {}),
  };
}
