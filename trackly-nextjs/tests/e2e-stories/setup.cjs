/**
 * Extra fixtures for the story suite, on top of tests/e2e-v3/seed.cjs.
 * Creates throwaway users (a stranger with their own brand, a team viewer of
 * the owner, accounts used by the lockout and password-change stories) and
 * resets the per-user state the stories mutate. Idempotent.
 */
const { Client: Pg } = require('pg');
const bcrypt = require('bcryptjs');

const PASSWORD = 'Passw0rd!Passw0rd';
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/livesov';

const USERS = [
  { id: 'story_stranger', email: 'stranger@test.dev', plan: 'pro' },
  { id: 'story_viewer', email: 'viewer@test.dev', plan: 'free' },
  { id: 'story_lock', email: 'lock@test.dev', plan: 'free' },
  { id: 'story_pw', email: 'pw@test.dev', plan: 'free' },
  { id: 'story_sess', email: 'sess@test.dev', plan: 'free' },
  { id: 'story_del', email: 'del@test.dev', plan: 'free' },
  { id: 'story_unverified', email: 'unverified@test.dev', plan: 'trial', unverified: true },
];

async function setup() {
  const db = new Pg({ connectionString: DB_URL });
  await db.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    await db.query('DELETE FROM brands WHERE user_id = $1', [u.id]);
    await db.query('DELETE FROM team_members WHERE owner_id = $1 OR member_id = $1', [u.id]);
    await db.query('DELETE FROM users WHERE id = $1 OR LOWER(email) = LOWER($2)', [u.id, u.email]);
    await db.query(
      `INSERT INTO users (id, email, username, name, password_hash, plan, role, email_verified, settings, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'user', $7, '{}'::jsonb, NOW() + interval '7 days')`,
      [u.id, u.email, u.id, u.id.replace('story_', 'Story '), hash, u.plan, !u.unverified],
    );
  }
  await db.query(
    `INSERT INTO brands (id, user_id, data, created_at) VALUES ('story_brand_x', 'story_stranger', $1, NOW())`,
    [JSON.stringify({ name: 'Stranger Plumbing', website: 'https://strangerplumbing.example', city: 'Austin', queries: ['best plumber austin'], competitors: [], runs: [] })],
  );
  await db.query(`INSERT INTO team_members (owner_id, member_id, role) VALUES ('seed_owner_1', 'story_viewer', 'viewer')`);
  await db.query('DELETE FROM rate_limits').catch(() => {});
  // Owner state the stories mutate.
  await db.query(`UPDATE users SET settings = '{}'::jsonb WHERE id = 'seed_owner_1'`);
  await db.query(`DELETE FROM api_keys WHERE user_id IN ('seed_owner_1', 'story_stranger')`).catch(() => {});
  await db.query(`DELETE FROM alert_rules WHERE user_id IN ('seed_owner_1', 'story_stranger')`).catch(() => {});
  await db.end();
}

async function sql(text, params) {
  const db = new Pg({ connectionString: DB_URL });
  await db.connect();
  try { return await db.query(text, params); } finally { await db.end(); }
}

module.exports = { setup, sql, PASSWORD, USERS };
