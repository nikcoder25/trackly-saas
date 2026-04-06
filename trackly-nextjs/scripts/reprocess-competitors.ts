/**
 * Reprocess competitor_mentions for a brand's prompt_runs.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/reprocess-competitors.ts
 *
 * Or create a .env file in trackly-nextjs/ with DATABASE_URL and run:
 *   npx tsx scripts/reprocess-competitors.ts
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildBrandMatcher, detectCompetitors } from '../src/lib/parser';

// ── Config ──────────────────────────────────────────────────────────────────
const BRAND_ID = 'mnlcj7859d9c8e1b5ff1';
const DRY_RUN = process.argv.includes('--dry-run');
// ─────────────────────────────────────────────────────────────────────────────

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

async function main() {
  // Step 1: Fetch brand details
  const brandResult = await pool.query(
    `SELECT id, name, website, data FROM brands WHERE id = $1`,
    [BRAND_ID]
  );
  if (!brandResult.rows.length) {
    console.error(`Brand ${BRAND_ID} not found!`);
    process.exit(1);
  }
  const brand = brandResult.rows[0];
  const brandData = typeof brand.data === 'string' ? JSON.parse(brand.data) : brand.data;
  const competitors: string[] = brandData?.competitors || [];
  const aliases: string[] = brandData?.aliases || [];
  const city: string = brandData?.city || '';
  const nearbyAreas: string[] = brandData?.nearbyAreas || [];

  console.log(`Brand: ${brand.name} (${BRAND_ID})`);
  console.log(`Competitors: ${competitors.join(', ')}`);

  if (!competitors.length) {
    console.error('No competitors configured for this brand!');
    process.exit(1);
  }

  // Step 2: Check prompt_runs with response_raw
  const countResult = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE response_raw IS NOT NULL) as with_raw,
       COUNT(*) FILTER (WHERE competitor_mentions != '[]'::jsonb) as with_comps
     FROM prompt_runs WHERE brand_id = $1`,
    [BRAND_ID]
  );
  const counts = countResult.rows[0];
  console.log(`\nPrompt runs: ${counts.total} total, ${counts.with_raw} with response_raw, ${counts.with_comps} with existing competitor_mentions`);

  // Step 3: Spot-check a few response_raw entries for competitor mentions
  const sampleResult = await pool.query(
    `SELECT id, response_raw FROM prompt_runs
     WHERE brand_id = $1 AND response_raw IS NOT NULL
     LIMIT 5`,
    [BRAND_ID]
  );

  const competitorKeywords = ['griffin', 'neighbors bank', 'newfi', 'offer market', 'offermarket'];
  console.log(`\n── Spot-checking ${sampleResult.rows.length} response_raw entries ──`);
  for (const row of sampleResult.rows) {
    const text = (row.response_raw || '').toLowerCase();
    const found = competitorKeywords.filter(kw => text.includes(kw));
    console.log(`  ${row.id}: ${found.length ? `FOUND: ${found.join(', ')}` : 'no keyword matches'}`);
  }

  // Step 4: Build matcher and reprocess
  const matcher = buildBrandMatcher({
    name: brand.name,
    website: brand.website,
    aliases,
    city,
    nearbyAreas,
    competitors,
  });

  const runsResult = await pool.query(
    `SELECT id, response_raw, batch_id, prompt, platform FROM prompt_runs
     WHERE brand_id = $1 AND response_raw IS NOT NULL`,
    [BRAND_ID]
  );

  console.log(`\n── Reprocessing ${runsResult.rows.length} prompt_runs ──`);

  let updated = 0;
  let withComps = 0;
  const compCounts: Record<string, number> = {};
  const BATCH_SIZE = 100;
  const batchLookup = new Map<string, Map<string, string[]>>();

  for (let i = 0; i < runsResult.rows.length; i += BATCH_SIZE) {
    const batch = runsResult.rows.slice(i, i + BATCH_SIZE);
    const cases: string[] = [];
    const vals: unknown[] = [];
    let pi = 1;

    for (const row of batch) {
      const newComps = detectCompetitors(row.response_raw, matcher);
      cases.push(`WHEN id = $${pi} THEN $${pi + 1}::jsonb`);
      vals.push(row.id, JSON.stringify(newComps));
      pi += 2;
      updated++;

      if (newComps.length) {
        withComps++;
        for (const c of newComps) compCounts[c] = (compCounts[c] || 0) + 1;
      }

      if (row.batch_id) {
        if (!batchLookup.has(row.batch_id)) batchLookup.set(row.batch_id, new Map());
        batchLookup.get(row.batch_id)!.set(`${row.platform}|${row.prompt}`, newComps);
      }
    }

    if (cases.length > 0 && !DRY_RUN) {
      const ids = batch.map((_: unknown, idx: number) => `$${idx * 2 + 1}`).join(',');
      await pool.query(
        `UPDATE prompt_runs SET competitor_mentions = CASE ${cases.join(' ')} END WHERE id IN (${ids})`,
        vals
      );
    }
  }

  console.log(`\nResults: ${updated} runs processed, ${withComps} had competitor mentions`);
  console.log('Competitor counts:', compCounts);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No database changes were made. Remove --dry-run to apply.');
    await pool.end();
    return;
  }

  // Step 5: Update brand's stored data (same logic as reprocess-competitors route)
  const brandRow = await pool.query('SELECT data FROM brands WHERE id = $1', [BRAND_ID]);
  const storedData = typeof brandRow.rows[0]?.data === 'string'
    ? JSON.parse(brandRow.rows[0].data) : brandRow.rows[0]?.data;

  if (storedData) {
    let brandChanged = false;

    if (storedData.runs?.length) {
      for (const run of storedData.runs) {
        if (!run.allResults?.length) continue;
        const lookup = run.id ? batchLookup.get(run.id) : null;
        const runCompCounts: Record<string, number> = {};
        for (const result of run.allResults) {
          const key = `${result.platform}|${result.query}`;
          const comps = lookup?.get(key) || [];
          result.competitorMentions = comps;
          for (const c of comps) runCompCounts[c] = (runCompCounts[c] || 0) + 1;
        }
        run.competitors = runCompCounts;
      }
      brandChanged = true;
    }

    if (storedData.mentions?.length) {
      const mentionRuns = await pool.query(
        `SELECT prompt, platform, competitor_mentions FROM prompt_runs
         WHERE brand_id = $1 AND success = true AND competitor_mentions != '[]'::jsonb`,
        [BRAND_ID]
      );
      const compLookup = new Map<string, string[]>();
      for (const row of mentionRuns.rows) {
        const key = `${row.platform}|${row.prompt}`;
        const comps = typeof row.competitor_mentions === 'string'
          ? JSON.parse(row.competitor_mentions) : row.competitor_mentions;
        if (comps.length) compLookup.set(key, comps);
      }
      for (const mention of storedData.mentions) {
        const key = `${mention.platform}|${mention.query}`;
        const comps = compLookup.get(key);
        if (comps) mention.competitorMentions = comps;
      }
      brandChanged = true;
    }

    if (brandChanged) {
      await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(storedData), BRAND_ID]);
      console.log('\nBrand data updated with reprocessed competitor mentions.');
    }
  }

  console.log('\nDone!');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
