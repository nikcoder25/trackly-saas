/**
 * Trial nurture email sequence.
 *
 * Every verified trial user gets a short run of emails timed against their
 * signup and trial-end dates, with copy that reacts to what they have done
 * so far (no brand yet / brand but no scan / real results). Behavioural
 * emails convert trials far better than a fixed drip, so each step reads the
 * user's own data before it renders.
 *
 * Sequence (offsets in hours):
 *   welcome      signup +1   .. +20      add your brand / run your first scan
 *   results      signup +24  .. +48      your first numbers, or a setup nudge
 *   competitors  signup +72  .. +96      who AI recommends instead of you
 *   ending_soon  trialEnd -48 .. -24     2 days left + annual price
 *   last_day     trialEnd -24 .. 0       trial ends today
 *   expired      trialEnd 0  .. +72      tracking paused, data kept
 *   winback      trialEnd +168 .. +240   one last nudge a week later
 *
 * A step only fires inside its window, so a user who signed up before this
 * shipped joins at their current step instead of receiving the backlog. At
 * most one email per user per tick. Sent steps are recorded in
 * users.settings.trialNurture and the outbox idempotency key backs that up.
 *
 * Users stop receiving these the moment they leave the 'trial' plan (paid
 * upgrade) or opt out via the unsubscribe link in every email.
 */
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { enqueueEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/sanitize';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const HOUR = 60 * 60 * 1000;
const BATCH_LIMIT = 500;

export type NurtureStep =
  | 'welcome'
  | 'results'
  | 'competitors'
  | 'ending_soon'
  | 'last_day'
  | 'expired'
  | 'winback';

interface StepWindow {
  step: NurtureStep;
  anchor: 'signup' | 'trialEnd';
  fromH: number;
  toH: number;
}

const STEPS: StepWindow[] = [
  { step: 'welcome', anchor: 'signup', fromH: 1, toH: 20 },
  { step: 'results', anchor: 'signup', fromH: 24, toH: 48 },
  { step: 'competitors', anchor: 'signup', fromH: 72, toH: 96 },
  { step: 'ending_soon', anchor: 'trialEnd', fromH: -48, toH: -24 },
  { step: 'last_day', anchor: 'trialEnd', fromH: -24, toH: 0 },
  { step: 'expired', anchor: 'trialEnd', fromH: 0, toH: 72 },
  { step: 'winback', anchor: 'trialEnd', fromH: 168, toH: 240 },
];

/**
 * Pick the step due right now, or null. When windows overlap (a short
 * trial), the later step wins so the user never gets a stale "day 1" email
 * after the trial-ending one.
 */
export function pickDueStep(
  now: Date,
  signupAt: Date,
  trialEndsAt: Date,
  sent: Record<string, unknown>,
): NurtureStep | null {
  let due: NurtureStep | null = null;
  let dueIdx = -1;
  const t = now.getTime();
  STEPS.forEach((w, idx) => {
    const base = w.anchor === 'signup' ? signupAt.getTime() : trialEndsAt.getTime();
    if (t >= base + w.fromH * HOUR && t < base + w.toH * HOUR) {
      if (idx > dueIdx) {
        due = w.step;
        dueIdx = idx;
      }
    }
  });
  if (!due) return null;
  // Never send a step, or an earlier one, once a later step went out.
  const lastSentIdx = STEPS.reduce((acc, w, idx) => (sent[w.step] ? idx : acc), -1);
  if (dueIdx <= lastSentIdx) return null;
  return due;
}

export function unsubscribeToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return crypto.createHmac('sha256', secret).update(`unsub:${userId}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  return token.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function unsubscribeUrl(userId: string): string {
  return `${APP_URL}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

export interface NurtureContext {
  userId: string;
  firstName: string;
  brandName: string | null;
  totalAnswers: number;
  mentions: number;
  recommended: number;
  topCompetitor: string | null;
  trialEndsAt: Date;
}

interface Rendered {
  subject: string;
  html: string;
}

const BTN = 'display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;';
const P = 'color:#374151;line-height:1.6;';

function wrap(ctx: NurtureContext, body: string): string {
  return `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      ${body}
      <p style="${P}">- The Livesov Team</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
        You're getting this because you started a Livesov trial.
        <a href="${unsubscribeUrl(ctx.userId)}" style="color:#9ca3af;">Unsubscribe</a> from trial tips.
      </p>
    </div>
  `;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="${BTN}">${escapeHtml(label)}</a>`;
}

function mentionRate(ctx: NurtureContext): number {
  return ctx.totalAnswers > 0 ? Math.round((ctx.mentions / ctx.totalAnswers) * 100) : 0;
}

export function renderStep(step: NurtureStep, ctx: NurtureContext): Rendered {
  const hi = `Hi ${escapeHtml(ctx.firstName)},`;
  const brand = ctx.brandName ? escapeHtml(ctx.brandName) : 'your brand';
  const dash = `${APP_URL}/dashboard`;
  const setup = `${APP_URL}/dashboard/setup`;
  const billing = `${APP_URL}/dashboard/billing`;
  const hasBrand = !!ctx.brandName;
  const hasRuns = ctx.totalAnswers > 0;

  switch (step) {
    case 'welcome':
      if (!hasBrand) {
        return {
          subject: 'Does ChatGPT know your brand? Find out in 2 minutes',
          html: wrap(ctx, `
            <p style="${P}">${hi}</p>
            <p style="${P}">Thanks for starting your Livesov trial. You have 7 days with all 5 AI engines: ChatGPT, Gemini, Perplexity, Claude and Grok.</p>
            <p style="${P}">The first step takes about 2 minutes: add your brand and a few prompts your customers would ask. We'll show you exactly where AI mentions you, and where it recommends someone else.</p>
            ${btn(setup, 'Add your brand')}
            <p style="${P}">Stuck on anything? Just reply to this email.</p>
          `),
        };
      }
      return {
        subject: `${ctx.brandName} is set up. Run your first AI scan`,
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">Nice, <strong>${brand}</strong> is in Livesov. ${hasRuns ? 'Your first scan is already in.' : 'Now run your first scan to see how the AI engines talk about you.'}</p>
          <p style="${P}">One scan checks every prompt on every engine and shows mentions, recommendations, sentiment and the sources AI cites.</p>
          ${btn(dash, hasRuns ? 'See your results' : 'Run your first scan')}
        `),
      };

    case 'results':
      if (!hasBrand) {
        return {
          subject: 'Your AI visibility report is still empty',
          html: wrap(ctx, `
            <p style="${P}">${hi}</p>
            <p style="${P}">You haven't added a brand yet, so we can't show you what ChatGPT and the other AI engines say about you.</p>
            <p style="${P}">Most people are surprised by the first result. Some are invisible, some are being described wrong. It takes 2 minutes to find out.</p>
            ${btn(setup, 'Add your brand now')}
          `),
        };
      }
      if (!hasRuns) {
        return {
          subject: `You're one click from seeing ${ctx.brandName} in AI answers`,
          html: wrap(ctx, `
            <p style="${P}">${hi}</p>
            <p style="${P}"><strong>${brand}</strong> is set up but hasn't been scanned yet. Hit "Run" on your dashboard and in a few minutes you'll know how often AI engines mention and recommend you.</p>
            ${btn(dash, 'Run your scan')}
          `),
        };
      }
      return {
        subject: `${ctx.brandName} was mentioned in ${mentionRate(ctx)}% of AI answers`,
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">Your first results are in for <strong>${brand}</strong>:</p>
          <ul style="${P}">
            <li><strong>${ctx.totalAnswers}</strong> AI answers checked</li>
            <li>Mentioned in <strong>${ctx.mentions}</strong> (${mentionRate(ctx)}%)</li>
            <li>Recommended in <strong>${ctx.recommended}</strong></li>
          </ul>
          <p style="${P}">${mentionRate(ctx) < 50
            ? 'That leaves a lot of answers where a buyer asks AI and never hears your name. The Recommendations page shows what to fix first.'
            : 'A solid start. Now the job is keeping it there and turning mentions into recommendations. The Recommendations page shows where to push.'}</p>
          ${btn(`${APP_URL}/dashboard/recommendations`, 'See what to fix')}
        `),
      };

    case 'competitors':
      return {
        subject: ctx.topCompetitor
          ? `AI keeps recommending ${ctx.topCompetitor}. Here's why`
          : 'Who does AI recommend instead of you?',
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">When someone asks ChatGPT for the best option in your space, it usually names 3 to 5 brands. ${ctx.topCompetitor
            ? `In your scans so far, <strong>${escapeHtml(ctx.topCompetitor)}</strong> shows up most often.`
            : 'If you are not one of them, a competitor is getting that buyer.'}</p>
          <p style="${P}">The Competitors and Citations pages show who AI picks and which websites it is reading to make that call. Getting mentioned on those same sources is the fastest way in.</p>
          ${btn(`${APP_URL}/dashboard/competitors`, 'Compare against competitors')}
        `),
      };

    case 'ending_soon':
      return {
        subject: 'Your Livesov trial ends in 2 days',
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">Your trial ends in 2 days. ${hasRuns
            ? `So far <strong>${brand}</strong> was mentioned in ${mentionRate(ctx)}% of ${ctx.totalAnswers} AI answers.`
            : 'There is still time to run a full scan across all 5 AI engines.'}</p>
          <p style="${P}">AI answers change every week. A paid plan keeps your scans running on autopilot so you see drops before they cost you customers.</p>
          <ul style="${P}">
            <li><strong>Starter</strong> $9/mo ($7/mo billed yearly)</li>
            <li><strong>Pro</strong> $29/mo ($23/mo billed yearly), daily scans</li>
            <li><strong>Agency</strong> $89/mo ($71/mo billed yearly), all 5 engines</li>
          </ul>
          ${btn(billing, 'Choose a plan')}
        `),
      };

    case 'last_day':
      return {
        subject: 'Last day of your Livesov trial',
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">Your trial ends today. After that, scheduled scans for <strong>${brand}</strong> stop and you drop to the free plan.</p>
          <p style="${P}">Upgrade now and nothing changes: same brand, same prompts, same history, tracking keeps running.</p>
          ${btn(billing, 'Keep tracking')}
          <p style="${P}">Not sure which plan fits? Reply and tell me what you're tracking. I'll point you to the right one.</p>
        `),
      };

    case 'expired':
      return {
        subject: 'Your trial ended. Your data is still here',
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">Your Livesov trial has ended and scheduled tracking for <strong>${brand}</strong> is paused.</p>
          <p style="${P}">We've kept your brand, prompts and results. Pick a plan any time and you'll continue right where you left off, starting at $9/month.</p>
          ${btn(billing, 'Resume tracking')}
        `),
      };

    case 'winback':
      return {
        subject: `What is AI saying about ${ctx.brandName || 'you'} this week?`,
        html: wrap(ctx, `
          <p style="${P}">${hi}</p>
          <p style="${P}">It's been a week since your trial ended. In that time ChatGPT, Gemini and Perplexity have updated their answers again, and you haven't been watching.</p>
          <p style="${P}">Your setup is still saved. One click restarts tracking for <strong>${brand}</strong>.</p>
          ${btn(billing, 'Restart tracking')}
          <p style="${P}">If Livesov wasn't the right fit, a one-line reply on why would really help us.</p>
        `),
      };
  }
}

interface CandidateRow {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  created_at: Date;
  trial_ends_at: Date;
  settings: Record<string, unknown> | null;
}

async function loadContext(row: CandidateRow): Promise<NurtureContext> {
  const brandRes = await pool.query(
    `SELECT id, data->>'name' AS name FROM brands WHERE user_id = $1 ORDER BY created_at ASC`,
    [row.id],
  );
  const brandIds = brandRes.rows.map((b: { id: string }) => b.id);
  let totalAnswers = 0;
  let mentions = 0;
  let recommended = 0;
  let topCompetitor: string | null = null;
  if (brandIds.length) {
    const stats = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE mentioned)::int AS mentions,
              COUNT(*) FILTER (WHERE recommended)::int AS recommended
         FROM prompt_runs
        WHERE brand_id = ANY($1::text[]) AND success = TRUE`,
      [brandIds],
    );
    totalAnswers = stats.rows[0]?.total ?? 0;
    mentions = stats.rows[0]?.mentions ?? 0;
    recommended = stats.rows[0]?.recommended ?? 0;
    try {
      const comp = await pool.query(
        `SELECT c.value AS name, COUNT(*)::int AS n
           FROM prompt_runs pr,
                LATERAL jsonb_array_elements(
                  CASE WHEN jsonb_typeof(pr.competitor_mentions) = 'array'
                       THEN pr.competitor_mentions ELSE '[]'::jsonb END
                ) e,
                LATERAL (SELECT COALESCE(e->>'name', CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' END) AS value) c
          WHERE pr.brand_id = ANY($1::text[]) AND c.value IS NOT NULL AND c.value <> ''
          GROUP BY c.value ORDER BY n DESC LIMIT 1`,
        [brandIds],
      );
      topCompetitor = comp.rows[0]?.name ?? null;
    } catch {
      topCompetitor = null;
    }
  }
  const rawName = (row.name || row.username || '').trim();
  const firstName = rawName.split(/\s+/)[0] || 'there';
  return {
    userId: row.id,
    firstName,
    brandName: brandRes.rows[0]?.name || null,
    totalAnswers,
    mentions,
    recommended,
    topCompetitor,
    trialEndsAt: new Date(row.trial_ends_at),
  };
}

export interface TrialNurtureResult {
  ran: boolean;
  scanned: number;
  sent: number;
  steps: Record<string, number>;
}

export async function runTrialNurture(now = new Date()): Promise<TrialNurtureResult> {
  const lock = await acquireCronLock('trial-nurture', 15);
  if (!lock) return { ran: false, scanned: 0, sent: 0, steps: {} };
  const steps: Record<string, number> = {};
  let sent = 0;
  try {
    // Window: anyone still in trial, or whose trial ended within the
    // winback window. plan='trial' drops users as soon as they pay.
    const res = await pool.query(
      `SELECT id, email, name, username, created_at, trial_ends_at, settings
         FROM users
        WHERE plan = 'trial'
          AND email_verified = TRUE
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at > $1::timestamptz - INTERVAL '11 days'
          AND COALESCE(settings->>'marketingEmailsOptOut', 'false') <> 'true'
        ORDER BY created_at ASC
        LIMIT ${BATCH_LIMIT}`,
      [now.toISOString()],
    );
    const rows = res.rows as CandidateRow[];
    for (const row of rows) {
      try {
        const sentMap = ((row.settings || {}).trialNurture || {}) as Record<string, unknown>;
        const step = pickDueStep(now, new Date(row.created_at), new Date(row.trial_ends_at), sentMap);
        if (!step) continue;
        const ctx = await loadContext(row);
        const { subject, html } = renderStep(step, ctx);
        const result = await enqueueEmail({
          to: row.email,
          subject,
          html,
          replyTo: 'hello@livesov.com',
          templateKey: `trial_nurture_${step}`,
          payload: { step },
          idempotencyKey: `trial_nurture:${step}:${row.id}`,
        });
        if (!result.sent) continue;
        await pool.query(
          `UPDATE users
              SET settings = COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('trialNurture',
                     COALESCE(settings->'trialNurture', '{}'::jsonb)
                     || jsonb_build_object($2::text, to_jsonb(NOW())))
            WHERE id = $1`,
          [row.id, step],
        );
        sent++;
        steps[step] = (steps[step] || 0) + 1;
      } catch (e) {
        logger.warn('trial_nurture.user_failed', { userId: row.id, error: (e as Error).message });
      }
    }
    logger.info('trial_nurture.tick', { scanned: rows.length, sent, steps });
    return { ran: true, scanned: rows.length, sent, steps };
  } finally {
    await lock.release();
  }
}
