/**
 * v3 pricing migration - auto-upgrade accounts that no longer fit
 * their current plan under the v3 (account-wide) tracked-prompt cap.
 *
 * The owner has confirmed that affected accounts are internal test
 * accounts; this script logs every change so the upgrade trail is
 * reviewable post-hoc.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate-v3-pricing.ts            # dry-run (default)
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate-v3-pricing.ts --apply    # commit upgrades
 *
 * What it does:
 *   - Sums tracked prompts (data->'queries' length) across every brand
 *     each owner holds.
 *   - Compares against the v3 trackedPromptsPerAccount cap for the
 *     owner's current plan AND brandsCap for the owner's brand count.
 *   - If the account exceeds either cap, picks the lowest paid tier
 *     that fits (starter → pro → agency). 'enterprise' / 'owner' are
 *     never auto-assigned - those are operator decisions.
 *   - In --apply mode, updates `users.plan` and inserts an audit_log
 *     row with the old plan, new plan, and reason.
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PLAN_CREDITS } from '../src/lib/plan-config';

const APPLY = process.argv.includes('--apply');

// Load .env if present
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
  console.error('ERROR: DATABASE_URL is not set. Pass it as an env var or create a .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// Auto-upgrade ladder. enterprise/owner are intentionally excluded -
// auto-upgrading anyone to enterprise is a billing/contract decision,
// not a script decision.
const UPGRADE_LADDER = ['free', 'starter', 'pro', 'agency'] as const;

interface Candidate {
  userId: string;
  email: string;
  currentPlan: string;
  promptCount: number;
  brandCount: number;
  promptCap: number;
  brandsCap: number;
  exceedsPrompts: boolean;
  exceedsBrands: boolean;
  targetPlan: string | null;
  targetReason: string;
}

function pickFittingPlan(promptCount: number, brandCount: number, currentPlan: string): { plan: string | null; reason: string } {
  // Special-case: owner / enterprise / trial accounts are never auto-
  // adjusted. Trial expiry already drops them to 'free' on its own.
  if (currentPlan === 'owner' || currentPlan === 'enterprise' || currentPlan === 'trial') {
    return { plan: null, reason: 'special-case plan, skipped' };
  }
  const currentIdx = UPGRADE_LADDER.indexOf(currentPlan as typeof UPGRADE_LADDER[number]);
  const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
  for (let i = startIdx; i < UPGRADE_LADDER.length; i++) {
    const candidate = UPGRADE_LADDER[i];
    const cfg = PLAN_CREDITS[candidate];
    if (!cfg) continue;
    if (promptCount <= cfg.trackedPromptsPerAccount && brandCount <= cfg.brandsCap) {
      return { plan: candidate, reason: `fits at ${candidate}: ${promptCount}/${cfg.trackedPromptsPerAccount} prompts, ${brandCount}/${cfg.brandsCap} brands` };
    }
  }
  return { plan: null, reason: `no plan in the ${UPGRADE_LADDER.join('/')} ladder fits ${promptCount} prompts × ${brandCount} brands - manual review needed` };
}

async function main() {
  console.log(`v3 pricing migration - ${APPLY ? 'APPLY mode (will mutate DB)' : 'DRY-RUN (no changes)'}`);
  console.log(`Started ${new Date().toISOString()}`);
  console.log('');

  const usersResult = await pool.query(
    `SELECT u.id, u.email, u.plan,
            COALESCE(SUM(jsonb_array_length(COALESCE(b.data->'queries', '[]'::jsonb))), 0)::int AS prompt_count,
            COUNT(b.id)::int AS brand_count
       FROM users u
       LEFT JOIN brands b ON b.user_id = u.id
      GROUP BY u.id, u.email, u.plan
      ORDER BY u.email`,
  );

  const candidates: Candidate[] = [];
  for (const row of usersResult.rows) {
    const plan: string = row.plan || 'free';
    const cfg = PLAN_CREDITS[plan] || PLAN_CREDITS.free;
    const promptCount = Number(row.prompt_count) || 0;
    const brandCount = Number(row.brand_count) || 0;
    const exceedsPrompts = promptCount > cfg.trackedPromptsPerAccount;
    const exceedsBrands = brandCount > cfg.brandsCap;
    if (!exceedsPrompts && !exceedsBrands) continue;

    const pick = pickFittingPlan(promptCount, brandCount, plan);
    candidates.push({
      userId: row.id,
      email: row.email,
      currentPlan: plan,
      promptCount,
      brandCount,
      promptCap: cfg.trackedPromptsPerAccount,
      brandsCap: cfg.brandsCap,
      exceedsPrompts,
      exceedsBrands,
      targetPlan: pick.plan,
      targetReason: pick.reason,
    });
  }

  if (candidates.length === 0) {
    console.log('No accounts exceed v3 caps. Nothing to do.');
    await pool.end();
    return;
  }

  console.log(`Found ${candidates.length} account(s) exceeding their plan's v3 caps:`);
  console.log('');
  for (const c of candidates) {
    const reasons: string[] = [];
    if (c.exceedsPrompts) reasons.push(`prompts ${c.promptCount}/${c.promptCap}`);
    if (c.exceedsBrands) reasons.push(`brands ${c.brandCount}/${c.brandsCap}`);
    const arrow = c.targetPlan ? `→ ${c.targetPlan}` : '→ (no fit, manual)';
    console.log(`  ${c.email.padEnd(40)}  ${c.currentPlan.padEnd(8)} ${arrow}  [${reasons.join(', ')}]`);
    console.log(`    ${c.targetReason}`);
  }
  console.log('');

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with --apply to commit upgrades.');
    await pool.end();
    return;
  }

  // Apply upgrades. Each account gets its own short transaction so a
  // single bad row doesn't roll back the rest. The audit_log row
  // captures the migration for post-hoc review.
  let upgraded = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (!c.targetPlan) {
      console.warn(`SKIP ${c.email}: ${c.targetReason}`);
      skipped++;
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET plan = $1 WHERE id = $2', [c.targetPlan, c.userId]);
      await client.query(
        `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata, ip)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          c.userId,
          'v3_pricing.auto_upgrade',
          'user',
          c.userId,
          JSON.stringify({
            old_plan: c.currentPlan,
            new_plan: c.targetPlan,
            prompt_count: c.promptCount,
            brand_count: c.brandCount,
            old_prompt_cap: c.promptCap,
            old_brands_cap: c.brandsCap,
            reason: c.targetReason,
            migration: 'v3_pricing',
            timestamp: new Date().toISOString(),
          }),
          'migration-script',
        ],
      );
      await client.query('COMMIT');
      console.log(`OK   ${c.email}  ${c.currentPlan} → ${c.targetPlan}  (${c.targetReason})`);
      upgraded++;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`FAIL ${c.email}: ${(e as Error).message}`);
      skipped++;
    } finally {
      client.release();
    }
  }

  console.log('');
  console.log(`Done. Upgraded ${upgraded}; skipped ${skipped}.`);
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
