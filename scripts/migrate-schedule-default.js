#!/usr/bin/env node
/**
 * One-time migration: set schedule:24 on all brands where schedule is null or missing.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/migrate-schedule-default.js
 *
 * Or, if .env is configured:
 *   node scripts/migrate-schedule-default.js
 */
require('dotenv/config');
const { Pool } = require('pg');

const sslConfig = process.env.DATABASE_URL
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 5,
  connectionTimeoutMillis: 10000,
});

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Pass it via environment or .env file.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Preview: count affected rows
    const preview = await client.query(`
      SELECT COUNT(*) AS cnt FROM brands
      WHERE data->>'schedule' IS NULL
         OR data->'schedule' = 'null'::jsonb
         OR data->'schedule' = '0'::jsonb
         OR (data->>'schedule')::int <= 0
    `);
    const affected = parseInt(preview.rows[0].cnt, 10);
    console.log(`Brands with schedule null, missing, or zero: ${affected}`);

    if (affected === 0) {
      console.log('Nothing to update. Exiting.');
      return;
    }

    // Update: set schedule to 24 (hours) where null, missing, or zero
    const result = await client.query(`
      UPDATE brands
      SET data = jsonb_set(data, '{schedule}', '24'),
          updated_at = NOW()
      WHERE data->>'schedule' IS NULL
         OR data->'schedule' = 'null'::jsonb
         OR data->'schedule' = '0'::jsonb
         OR (data->>'schedule')::int <= 0
    `);

    console.log(`Updated ${result.rowCount} brand(s) — schedule set to 24 (every 24 hours).`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
