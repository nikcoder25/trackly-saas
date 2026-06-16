/**
 * Idempotent backfill from audit_logs into billing_events.
 *
 * Why this exists:
 *   The new `billing_events` table is the source of truth for the
 *   user-facing Billing History on /dashboard/account. Pre-migration,
 *   plan lifecycle events were only ever written to `audit_logs`, and
 *   the user-scoped history query couldn't see the webhook-emitted
 *   rows (those were filed under user_id=NULL because db.ts auditLog()
 *   rewrites userId='system' to NULL). This script reconstructs each
 *   user's plan history from the audit trail and inserts the missing
 *   billing_events rows so existing users see their full history
 *   immediately after deploy, instead of starting from a clean slate.
 *
 * Inputs read from audit_logs:
 *   - 'subscription_cancelled' - written by /api/payments/cancel under
 *     the real user_id. details.previousPlan and previousSubscriptionId
 *     are present.
 *   - 'webhook_plan_change' - written by the dodopayments webhook
 *     handler under user_id=NULL but with target_id=<userId>. We pivot
 *     on target_id when target_type='user'. details has eventType,
 *     subscription_id, product_id but NO from/to plan; we synthesise
 *     from/to from the user's current plan and the productId map.
 *   - 'old_subscription_cancelled' - orphan-cancel rows from the
 *     upgrade flow. Become superseded_sub_cancelled rows.
 *
 * Idempotency:
 *   - audit_logs has no stable row id we can reuse (id column varies
 *     by env), so we synthesise an idempotency key per source row:
 *     `backfill:audit_logs:<audit_id>`. The partial unique index on
 *     billing_events.dodo_event_id covers it. Re-runs are no-ops.
 *   - The script will NOT touch any billing_events row whose
 *     dodo_event_id starts with anything other than 'backfill:'.
 *     Live webhook rows are owned by the webhook handler and must
 *     never be overwritten.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/backfill-billing-events.ts            # dry-run (default)
 *   DATABASE_URL=postgresql://... npx tsx scripts/backfill-billing-events.ts --apply    # commit
 *   DATABASE_URL=postgresql://... npx tsx scripts/backfill-billing-events.ts --user=<userId> --apply
 *
 * IMPORTANT: This script is intentionally NOT auto-run by any deploy or
 * cron. Run it manually after deploying the migration; the safe order
 * is (1) deploy migration -> (2) verify billing_events table exists
 * and is being written by live traffic -> (3) run this in --apply mode
 * once.
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';

const APPLY = process.argv.includes('--apply');
const userArg = process.argv.find((a) => a.startsWith('--user='));
const SCOPED_USER_ID = userArg ? userArg.slice('--user='.length) : null;

try {
  const envPath = resolve(__dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {
  // no .env file
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const PLAN_RANK: Record<string, number> = {
  free: 0,
  trial: 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
};

function comparePlans(from: string, to: string): 'upgrade' | 'downgrade' | 'same' {
  const a = PLAN_RANK[from] ?? 0;
  const b = PLAN_RANK[to] ?? 0;
  if (b > a) return 'upgrade';
  if (b < a) return 'downgrade';
  return 'same';
}

function planFromProductId(productId: string | null | undefined): string | null {
  if (!productId) return null;
  const map: Record<string, string> = {};
  if (process.env.DODO_STARTER_PRODUCT_ID) map[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
  if (process.env.DODO_PRO_PRODUCT_ID) map[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
  if (process.env.DODO_AGENCY_PRODUCT_ID) map[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
  if (process.env.DODO_ENTERPRISE_PRODUCT_ID) map[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';
  return map[productId] ?? null;
}

interface AuditRow {
  id: number | string;
  user_id: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface BillingInsert {
  audit_id: string;
  userId: string;
  eventType: string;
  fromPlan: string | null;
  toPlan: string | null;
  subscriptionId: string | null;
  source: string;
  details: Record<string, unknown>;
  createdAt: string;
}

async function loadAuditRows(): Promise<AuditRow[]> {
  const params: unknown[] = [];
  let where = `action IN ('subscription_cancelled', 'webhook_plan_change', 'old_subscription_cancelled')`;
  if (SCOPED_USER_ID) {
    params.push(SCOPED_USER_ID);
    where += ` AND (user_id = $1 OR target_id = $1)`;
  }
  const sql = `
    SELECT id, user_id, action, target_id, target_type, details, created_at
      FROM audit_logs
      WHERE ${where}
      ORDER BY created_at ASC
  `;
  const res = await pool.query<AuditRow>(sql, params);
  return res.rows;
}

function resolveUserId(row: AuditRow): string | null {
  if (row.user_id) return row.user_id;
  if (row.target_type === 'user' && row.target_id) return row.target_id;
  return null;
}

/**
 * Walk the audit history per-user in chronological order, maintaining a
 * running `currentPlan` so that webhook_plan_change rows (which don't
 * record from/to) can be turned into upgrade/downgrade/renewal rows.
 * Starting plan: 'free' for safety - the first paid event will record
 * from='free' to='paid' which over-counts conversions but never
 * under-counts. Live webhook rows landing after the script will use
 * the real plan transitions.
 */
function buildInserts(rows: AuditRow[]): BillingInsert[] {
  const byUser = new Map<string, AuditRow[]>();
  for (const r of rows) {
    const uid = resolveUserId(r);
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(r);
  }
  const out: BillingInsert[] = [];
  for (const [userId, userRows] of byUser.entries()) {
    let currentPlan = 'free';
    for (const r of userRows) {
      const auditKey = `backfill:audit_logs:${r.id}`;
      const details = r.details ?? {};
      if (r.action === 'subscription_cancelled') {
        const previousPlan = (details.previousPlan as string) || currentPlan;
        const subscriptionId = (details.previousSubscriptionId as string) || null;
        out.push({
          audit_id: auditKey,
          userId,
          eventType: 'plan_cancelled',
          fromPlan: previousPlan,
          toPlan: 'free',
          subscriptionId,
          source: 'backfill',
          details: { ...details, original_action: r.action },
          createdAt: r.created_at,
        });
        currentPlan = 'free';
      } else if (r.action === 'webhook_plan_change') {
        const productId = (details.product_id as string) || null;
        const targetPlan = planFromProductId(productId);
        const subscriptionId = (details.subscription_id as string) || null;
        const eventType = (details.eventType as string) || '';
        // Cancellation-class webhook (subscription.cancelled / .expired
        // / refund.succeeded) lands here too - recognise by eventType.
        if (/cancel|expired|refund/i.test(eventType)) {
          out.push({
            audit_id: auditKey,
            userId,
            eventType: 'plan_cancelled',
            fromPlan: currentPlan,
            toPlan: 'free',
            subscriptionId,
            source: 'backfill',
            details: { ...details, original_action: r.action },
            createdAt: r.created_at,
          });
          currentPlan = 'free';
          continue;
        }
        if (!targetPlan) {
          // Can't infer a plan from product_id; record as informational
          // payment_succeeded so the user still sees the row.
          out.push({
            audit_id: auditKey,
            userId,
            eventType: 'payment_succeeded',
            fromPlan: null,
            toPlan: null,
            subscriptionId,
            source: 'backfill',
            details: { ...details, original_action: r.action },
            createdAt: r.created_at,
          });
          continue;
        }
        const direction = comparePlans(currentPlan, targetPlan);
        const billingEventType =
          direction === 'upgrade'
            ? 'plan_upgraded'
            : direction === 'downgrade'
              ? 'plan_downgraded'
              : eventType === 'subscription.renewed'
                ? 'plan_renewed'
                : null;
        if (billingEventType) {
          out.push({
            audit_id: auditKey,
            userId,
            eventType: billingEventType,
            fromPlan: currentPlan,
            toPlan: targetPlan,
            subscriptionId,
            source: 'backfill',
            details: { ...details, original_action: r.action },
            createdAt: r.created_at,
          });
        }
        currentPlan = targetPlan;
      } else if (r.action === 'old_subscription_cancelled') {
        const oldSubscriptionId = (details.oldSubscriptionId as string) || null;
        out.push({
          audit_id: auditKey,
          userId,
          eventType: 'superseded_sub_cancelled',
          fromPlan: null,
          toPlan: null,
          subscriptionId: oldSubscriptionId,
          source: 'backfill',
          details: { ...details, original_action: r.action },
          createdAt: r.created_at,
        });
      }
    }
  }
  return out;
}

async function applyInserts(inserts: BillingInsert[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const ins of inserts) {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO billing_events
         (id, user_id, event_type, from_plan, to_plan, subscription_id,
          dodo_event_id, source, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (dodo_event_id)
         WHERE dodo_event_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        id,
        ins.userId,
        ins.eventType,
        ins.fromPlan,
        ins.toPlan,
        ins.subscriptionId,
        ins.audit_id,
        ins.source,
        JSON.stringify(ins.details),
        ins.createdAt,
      ],
    );
    if (result.rows.length > 0) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (SCOPED_USER_ID) console.log(`Scope: user_id=${SCOPED_USER_ID}`);

  const rows = await loadAuditRows();
  console.log(`Loaded ${rows.length} audit_logs rows`);

  const inserts = buildInserts(rows);
  console.log(`Computed ${inserts.length} billing_events inserts (idempotent)`);

  const sampleByType = new Map<string, BillingInsert>();
  for (const i of inserts) {
    if (!sampleByType.has(i.eventType)) sampleByType.set(i.eventType, i);
  }
  for (const [type, sample] of sampleByType) {
    console.log(`  ${type}: ${inserts.filter(i => i.eventType === type).length} (sample user=${sample.userId} from=${sample.fromPlan} to=${sample.toPlan})`);
  }

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to commit.');
    await pool.end();
    return;
  }

  const { inserted, skipped } = await applyInserts(inserts);
  console.log(`Inserted ${inserted}, skipped ${skipped} (already present).`);
  await pool.end();
}

main().catch((e) => {
  console.error('backfill failed:', (e as Error).message);
  process.exit(1);
});
