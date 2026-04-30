/**
 * Backfill a missing plan-change confirmation email.
 *
 * Use case: the DodoPayments webhook updated `users.plan` and wrote
 * the `webhook_plan_change` audit row, but the confirmation email was
 * never delivered (e.g. the change happened before this branch shipped,
 * or Resend was down at the time and Dodo's retry window has lapsed).
 *
 * The script never trusts CLI args alone — it always:
 *   1. Looks up the user by email and reads the live `users.plan`.
 *   2. Refuses to send unless the live plan matches `--to`, so we
 *      can't email a stale upgrade to a customer who's since
 *      downgraded.
 *   3. Looks for prior `manual_plan_email_sent` audit rows so reruns
 *      are idempotent. Pass `--force` to override.
 *   4. Picks the correct template (upgrade / downgrade / cancellation)
 *      using comparePlans — the same classifier the live webhook uses.
 *
 * Usage:
 *   # Dry-run (default): prints what it would send, makes no DB writes
 *   #                    and does not call Resend.
 *   DATABASE_URL=... npx tsx scripts/sendMissingUpgradeEmail.ts \
 *       --email user@example.com --from pro --to agency
 *
 *   # Apply: sends via Resend and writes an audit_log row so reruns
 *   #        are blocked unless --force is passed.
 *   DATABASE_URL=... EMAIL_API_KEY=... \
 *       npx tsx scripts/sendMissingUpgradeEmail.ts \
 *       --email user@example.com --from pro --to agency --apply
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PLAN_CREDITS, comparePlans } from '../src/lib/plan-config';
import {
  sendPlanUpgradeEmail,
  sendPlanDowngradeEmail,
  sendPlanCancellationEmail,
} from '../src/lib/email';

interface Args {
  email: string;
  from: string;
  to: string;
  apply: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--force') out.force = true;
    else if (a === '--email') out.email = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: sendMissingUpgradeEmail.ts --email <addr> --from <plan> --to <plan> [--apply] [--force]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!out.email || !out.from || !out.to) {
    console.error('Required: --email <addr> --from <plan> --to <plan>');
    process.exit(2);
  }
  return out as Args;
}

// Load .env if present (mirrors scripts/migrate-v3-pricing.ts)
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
  // no .env file, rely on environment
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (!PLAN_CREDITS[args.from]) {
  console.error(`ERROR: --from "${args.from}" is not a known plan. Known: ${Object.keys(PLAN_CREDITS).join(', ')}`);
  process.exit(2);
}
if (!PLAN_CREDITS[args.to]) {
  console.error(`ERROR: --to "${args.to}" is not a known plan. Known: ${Object.keys(PLAN_CREDITS).join(', ')}`);
  process.exit(2);
}
if (args.from === args.to) {
  console.error('ERROR: --from and --to are identical; nothing to confirm.');
  process.exit(2);
}

// Refuse to "apply" without an EMAIL_API_KEY: sendEmail() silently
// no-ops in that branch and returns sent=true, which would write a
// successful audit row even though no email actually left the box.
if (args.apply && !process.env.EMAIL_API_KEY) {
  console.error('ERROR: --apply requires EMAIL_API_KEY. Without it, sendEmail() returns sent=true without contacting Resend, which would falsely record a successful send. Set EMAIL_API_KEY or drop --apply.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function main() {
  console.log(`sendMissingUpgradeEmail — ${args.apply ? 'APPLY mode (will send + audit)' : 'DRY-RUN (no send, no DB writes)'}`);
  console.log(`Started ${new Date().toISOString()}`);
  console.log(`Target: ${args.email}  ${args.from} → ${args.to}`);
  console.log('');

  // 1. Look up the user by email.
  const userRes = await pool.query(
    'SELECT id, email, plan FROM users WHERE LOWER(email) = LOWER($1)',
    [args.email],
  );
  if (userRes.rows.length === 0) {
    console.error(`No user found with email=${args.email}.`);
    process.exit(1);
  }
  if (userRes.rows.length > 1) {
    console.error(`Multiple users found with email=${args.email} (${userRes.rows.length}). Disambiguate manually before re-running.`);
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log(`Resolved user: id=${user.id} plan=${user.plan}`);

  // 2. Live plan must match --to. Otherwise we'd email a confirmation
  //    for a plan the customer no longer holds.
  if (user.plan !== args.to) {
    console.error(`ABORT: live users.plan = "${user.plan}", expected "${args.to}". The customer is no longer on the target plan; sending an upgrade email would mislead them. If this is intentional, fix --to and re-run.`);
    process.exit(1);
  }

  // 3. Idempotency. The webhook records `webhook_plan_change` rows;
  //    this script writes `manual_plan_email_sent` rows. If one
  //    already exists for this transition, refuse unless --force.
  const dupRes = await pool.query(
    `SELECT id, created_at, details
       FROM audit_logs
      WHERE target_id = $1
        AND action = 'manual_plan_email_sent'
        AND details->>'from' = $2
        AND details->>'to' = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.id, args.from, args.to],
  );
  if (dupRes.rows.length > 0 && !args.force) {
    const prev = dupRes.rows[0];
    console.error(`ABORT: a manual_plan_email_sent row already exists for this transition (id=${prev.id}, created_at=${prev.created_at}). Pass --force to send anyway.`);
    process.exit(1);
  }
  if (dupRes.rows.length > 0 && args.force) {
    console.log(`WARNING: --force in use. Prior manual_plan_email_sent row id=${dupRes.rows[0].id} will be ignored.`);
  }

  // 4. Pick the right template by rank, the same way the webhook does.
  const direction = comparePlans(args.from, args.to);
  if (direction === 'same') {
    // Already filtered by the from!=to check, but be paranoid: ranks
    // can collapse (free <-> trial) even when the strings differ.
    console.error(`ABORT: comparePlans("${args.from}", "${args.to}") = "same". No plan-change email is appropriate for this transition.`);
    process.exit(1);
  }
  const isCancellation = direction === 'downgrade' && args.to === 'free';
  const templateName = isCancellation ? 'cancellation' : direction;
  console.log(`Direction: ${direction} → template="${templateName}"`);

  const fromLabel = PLAN_CREDITS[args.from].label;
  const toLabel = PLAN_CREDITS[args.to].label;
  console.log(`Will send "${templateName}" email to ${user.email} (${fromLabel} → ${toLabel}).`);

  if (!args.apply) {
    console.log('');
    console.log('DRY-RUN complete. Re-run with --apply (and EMAIL_API_KEY set) to actually send.');
    return;
  }

  // 5. Send via the same helper the live webhook uses, so the
  //    rendered template, sender address, and Resend call shape are
  //    identical to a normal real-time confirmation.
  const sendResult = isCancellation
    ? await sendPlanCancellationEmail(user.email, { previousPlan: args.from })
    : direction === 'upgrade'
      ? await sendPlanUpgradeEmail(user.email, { previousPlan: args.from, newPlan: args.to })
      : await sendPlanDowngradeEmail(user.email, { previousPlan: args.from, newPlan: args.to });

  if (!sendResult.sent) {
    console.error(`SEND FAILED: ${sendResult.reason || '(no reason returned)'}`);
    process.exit(1);
  }
  console.log('Resend accepted the message.');

  // 6. Audit the send so reruns are blocked unless --force.
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      null,
      'manual_plan_email_sent',
      'user',
      user.id,
      JSON.stringify({
        from: args.from,
        to: args.to,
        template: templateName,
        recipient: user.email,
        triggeredBy: 'scripts/sendMissingUpgradeEmail.ts',
        forced: args.force,
      }),
      'script',
    ],
  );
  console.log('Wrote audit_logs row (action=manual_plan_email_sent).');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('FAILED:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
