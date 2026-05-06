#!/usr/bin/env node
/**
 * Read-only inspection of the production response_cache schema.
 *
 * Confirms the actual column shape (including any pre-existing NOT NULL
 * constraints not declared in src/lib/db.ts) so the cache writer in
 * src/lib/response-cache.ts can be adapted to match prod.
 *
 * Run with the same DATABASE_URL the app uses (DigitalOcean app secret):
 *
 *   cd trackly-nextjs
 *   DATABASE_URL='postgresql://...' \
 *   DATABASE_CA_CERT='<base64-or-PEM>' \
 *   npx tsx scripts/inspect-response-cache-schema.mjs
 *
 * Only issues SELECT statements. No INSERT/UPDATE/DELETE/ALTER/CREATE.
 * Does NOT trigger the runMigrations() side-effect (importing `pool`
 * alone constructs the pool but runs no DDL).
 */

// Dynamic import via tsx so this .mjs file can pull the pool/SSL/CA logic
// straight from src/lib/db.ts without duplicating the DigitalOcean
// managed-Postgres CA handling. Static `import` from .mjs to .ts trips
// over tsx's ESM loader; the runtime `await import()` form works because
// tsx hooks the dynamic-import resolver.
// Run as: `npx tsx scripts/inspect-response-cache-schema.mjs`.

async function main() {
  const { pool } = await import('../src/lib/db.ts');
  try {
    const columnsRes = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'response_cache'
        ORDER BY ordinal_position`
    );

    const sampleRes = await pool.query(
      `SELECT * FROM response_cache ORDER BY created_at DESC LIMIT 3`
    );

    const output = {
      columns: columnsRes.rows,
      sampleRowCount: sampleRes.rows.length,
      sampleRows: sampleRes.rows,
    };
    console.log(JSON.stringify(output, null, 2));
  } finally {
    // Without explicit pool teardown the script hangs for ~30s on the
    // idleTimeoutMillis before exiting. End the pool so CI / local runs
    // return promptly.
    await pool.end();
  }
}

main().catch((err) => {
  console.error('inspect-response-cache-schema failed:', err);
  process.exit(1);
});
