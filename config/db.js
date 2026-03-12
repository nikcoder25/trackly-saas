/**
 * Database configuration and initialization
 */
const { Pool } = require('pg');

// SECURITY: In production, verify SSL certificates by default.
// Set DB_SSL_REJECT_UNAUTHORIZED=false only if your provider (e.g. Railway)
// uses self-signed certs and you accept the MITM risk.
const sslConfig = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        plan TEXT DEFAULT 'free',
        role TEXT,
        api_keys JSONB DEFAULT '{}',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
    `);
    // Add settings column if missing (migration for existing DBs)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
    `);
    console.log('[DB] PostgreSQL tables ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
