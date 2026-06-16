/**
 * One-time backfill for watchdog-reaped run entries written before
 * PR-C-1 with `sov: 0` hardcoded.
 *
 * What it does (--apply mode):
 *   For each scoped brand, walk `data.runs` looking for entries
 *   matching all of:
 *       watchdogReap === true
 *       sov === 0
 *       totalM > 0
 *       allResults is a non-empty array
 *   For each match, recompute `sov` from `allResults` using the same
 *   formula as src/lib/run-sov.ts::computeSovFromResults (Mentions-page
 *   formula: round(found / non-error * 100)). Stamp the prior value
 *   into `sovBackfilledFrom` so the down-migration can revert.
 *
 * Idempotent:
 *   The match condition includes `sov === 0`, so an entry already
 *   backfilled (sov rewritten to a positive number) won't match on a
 *   second --apply. The dry-run report makes this obvious.
 *
 * Reversible (--down):
 *   Walks for entries with `sovBackfilledFrom === 0` and restores
 *   sov: 0 / removes the marker. Idempotent on its own - entries
 *   without the marker are left alone.
 *
 * Default scope: the three brands that hit the bug after the
 * 11:17 / 11:44 EST 2026-04-28 deploys (REIF, Jensen, Easypump).
 * Pass --brand <id> to add others; --all-brands to scan every brand.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-watchdog-sov.ts                # dry-run, default brands
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-watchdog-sov.ts --apply        # commit forward migration
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-watchdog-sov.ts --down --apply # revert
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-watchdog-sov.ts --apply --brand <id> --brand <id>
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-watchdog-sov.ts --apply --all-brands
 *
 * Safety:
 *   - Dry-run by default; --apply flag required to write.
 *   - Wraps each brand's UPDATE in a transaction; one bad brand can't
 *     leave another half-written.
 *   - Logs every entry it touches with brand id, run id, prior sov,
 *     new sov so the operator can verify the diff before committing.
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeSovFromResults } from '../src/lib/run-sov';

const APPLY = process.argv.includes('--apply');
const DOWN = process.argv.includes('--down');
const ALL_BRANDS = process.argv.includes('--all-brands');

// Default scope - the three brands the operator confirmed hit the
// bug. Passing additional --brand flags appends to this set.
const DEFAULT_BRANDS = [
  'mnlcj7859d9c8e1b5ff1', // REIF Loans
  'mnrnfvgz4e3b65c80fa7', // Jensen Moving and Storage
  'mo4de94ob235e3bc77d8', // Easypump Concrete Ltd
];

function parseBrandFlags(): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--brand' && argv[i + 1]) {
      out.push(argv[i + 1]);
      i++;
    }
  }
  return out;
}

// Load .env if present (matches scripts/migrate-v3-pricing.ts).
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
  // no .env, rely on environment
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Pass it as an env var or create a .env file.');
  process.exit(1);
}

if (ALL_BRANDS && parseBrandFlags().length > 0) {
  console.error('ERROR: --all-brands and --brand are mutually exclusive.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

interface RunEntry {
  id?: string;
  sov?: number;
  totalM?: number;
  watchdogReap?: boolean;
  sovBackfilledFrom?: number;
  allResults?: Array<{ error?: boolean; mentioned?: boolean }>;
  [k: string]: unknown;
}

interface BrandRow {
  id: string;
  data: { runs?: RunEntry[]; [k: string]: unknown } | null;
}

interface RunDiff {
  index: number;
  runId: string | null;
  priorSov: number;
  newSov: number;
  totalM: number;
  resultsLen: number;
}

interface BrandDiff {
  brandId: string;
  diffs: RunDiff[];
}

async function main(): Promise<void> {
  const customBrands = parseBrandFlags();
  const direction = DOWN ? 'DOWN (revert)' : 'UP (backfill)';
  console.log(`\n=== Watchdog SOV backfill - ${direction} ${APPLY ? '(--apply, COMMITTING)' : '(dry-run)'} ===\n`);

  // Resolve scope.
  let brandIds: string[];
  if (ALL_BRANDS) {
    const r = await pool.query<{ id: string }>(`SELECT id FROM brands`);
    brandIds = r.rows.map(row => row.id);
    console.log(`Scope: ALL brands (${brandIds.length})`);
  } else {
    brandIds = Array.from(new Set([...DEFAULT_BRANDS, ...customBrands]));
    console.log(`Scope: ${brandIds.length} brand(s) - ${brandIds.join(', ')}`);
  }

  let touchedBrands = 0;
  let touchedRuns = 0;
  const allDiffs: BrandDiff[] = [];

  for (const brandId of brandIds) {
    const r = await pool.query<BrandRow>(
      `SELECT id, data FROM brands WHERE id = $1`,
      [brandId],
    );
    if (!r.rows.length) {
      console.log(`  [skip] brand ${brandId} not found`);
      continue;
    }

    const row = r.rows[0];
    const data = (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) || {};
    const runs: RunEntry[] = Array.isArray(data.runs) ? data.runs : [];
    if (!runs.length) continue;

    const diffs: RunDiff[] = [];
    const updatedRuns = runs.map((run, index) => {
      if (DOWN) {
        // Revert: must have a sovBackfilledFrom marker we wrote.
        if (typeof run.sovBackfilledFrom !== 'number') return run;
        const restored: RunEntry = { ...run, sov: run.sovBackfilledFrom };
        delete restored.sovBackfilledFrom;
        diffs.push({
          index,
          runId: typeof run.id === 'string' ? run.id : null,
          priorSov: typeof run.sov === 'number' ? run.sov : 0,
          newSov: run.sovBackfilledFrom,
          totalM: typeof run.totalM === 'number' ? run.totalM : 0,
          resultsLen: Array.isArray(run.allResults) ? run.allResults.length : 0,
        });
        return restored;
      }
      // UP: only touch entries matching the bug signature.
      if (run.watchdogReap !== true) return run;
      if (run.sov !== 0) return run;
      if (typeof run.totalM !== 'number' || run.totalM <= 0) return run;
      if (!Array.isArray(run.allResults) || run.allResults.length === 0) return run;
      // Recompute using the same helper the dashboard + reaper use.
      const newSov = computeSovFromResults(run.allResults);
      // Don't emit a no-op entry. If the recompute also yields 0 (no
      // mentions in allResults, despite totalM > 0 - corrupt data),
      // skip it rather than write `sov: 0, sovBackfilledFrom: 0`
      // which would be both pointless and confuse the down path.
      if (newSov <= 0) return run;
      diffs.push({
        index,
        runId: typeof run.id === 'string' ? run.id : null,
        priorSov: 0,
        newSov,
        totalM: run.totalM,
        resultsLen: run.allResults.length,
      });
      return { ...run, sov: newSov, sovBackfilledFrom: 0 };
    });

    if (!diffs.length) continue;

    touchedBrands++;
    touchedRuns += diffs.length;
    allDiffs.push({ brandId, diffs });

    // Per-brand logging - operator-readable diff.
    console.log(`\n  brand ${brandId} - ${diffs.length} entr${diffs.length === 1 ? 'y' : 'ies'} ${DOWN ? 'to revert' : 'to backfill'}:`);
    for (const d of diffs) {
      console.log(
        `    [${d.index}] run ${d.runId ?? '(no id)'} - sov ${d.priorSov}% → ${d.newSov}%`
        + ` (totalM=${d.totalM}, allResults.length=${d.resultsLen})`,
      );
    }

    if (APPLY) {
      const newData = { ...data, runs: updatedRuns };
      // Single-row UPDATE inside an implicit transaction (one
      // statement = one txn). brand-by-brand granularity means a
      // bad row can't pollute the rest of the run.
      await pool.query(
        `UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(newData), brandId],
      );
    }
  }

  console.log(
    `\n=== Summary === ${APPLY ? '(committed)' : '(dry-run, no writes)'}\n`
    + `  brands touched: ${touchedBrands} / ${brandIds.length}\n`
    + `  run entries touched: ${touchedRuns}`,
  );
  if (!APPLY && touchedRuns > 0) {
    console.log(`\nRe-run with --apply to commit the changes above.`);
  }
  if (DOWN && APPLY) {
    console.log(`\nRevert complete. The forward migration may be re-run safely.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
