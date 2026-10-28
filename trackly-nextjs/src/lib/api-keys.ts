/**
 * Personal API keys — long-lived credentials a customer creates in Account
 * settings so tools outside the browser (the MCP server at /api/mcp, scripts)
 * can act as them.
 *
 * Only the sha256 digest of a key is stored; the plaintext is shown once at
 * creation. Keys look like `lsv_<43 base64url chars>` so they are easy to spot
 * in logs and secret scanners. Follows the repo's per-module `ensure*Schema()`
 * convention (idempotent CREATE TABLE IF NOT EXISTS, run lazily).
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { hashToken } from '@/lib/auth';

export const API_KEY_PREFIX = 'lsv_';
/** Active (not revoked) keys a single user may hold at once. */
export const MAX_ACTIVE_KEYS = 10;
/** last_used_at is refreshed at most this often per key, to spare writes. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface ApiKeyRow {
  id: string;
  name: string;
  /** First characters of the key, safe to display ("lsv_AbC1…"). */
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyOwner {
  keyId: string;
  userId: string;
  email: string;
  role: string | null;
  plan: string | null;
  emailVerified: boolean;
}

let schemaEnsured = false;

export async function ensureApiKeySchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           UUID PRIMARY KEY,
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      hint         TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id) WHERE revoked_at IS NULL');
  schemaEnsured = true;
}

/** A fresh key in the `lsv_…` format. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

/** True when the string has the shape of one of our keys (cheap pre-check before a DB hit). */
export function looksLikeApiKey(raw: string): boolean {
  return /^lsv_[A-Za-z0-9_-]{43}$/.test(raw);
}

/** Display hint: prefix plus the first four secret characters. */
export function keyHint(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 4) + '…';
}

/** Trimmed, length-capped key name; falls back to a dated default. */
export function cleanKeyName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return name || `Key created ${new Date().toISOString().slice(0, 10)}`;
}

function toRow(r: Record<string, unknown>): ApiKeyRow {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return { id: String(r.id), name: String(r.name), hint: String(r.hint), createdAt: iso(r.created_at) as string, lastUsedAt: iso(r.last_used_at) };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  await ensureApiKeySchema();
  const { rows } = await pool.query(
    'SELECT id, name, hint, created_at, last_used_at FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(toRow);
}

/**
 * Creates a key and returns the plaintext once. Throws `limit` when the user
 * already holds {@link MAX_ACTIVE_KEYS} active keys.
 */
export async function createApiKey(userId: string, name: string): Promise<{ key: string; row: ApiKeyRow }> {
  await ensureApiKeySchema();
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
  if ((countRows[0]?.n ?? 0) >= MAX_ACTIVE_KEYS) throw new Error('limit');
  const key = generateApiKey();
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO api_keys (id, user_id, name, key_hash, hint) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, hint, created_at, last_used_at`,
    [id, userId, name, hashToken(key), keyHint(key)],
  );
  return { key, row: toRow(rows[0]) };
}

/** Revokes one of the user's keys. Returns false when it was not theirs or already gone. */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  await ensureApiKeySchema();
  const res = await pool.query(
    'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [keyId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Looks up the owner of a plaintext key. Returns null for unknown, revoked or
 * malformed keys and for deleted users.
 */
export async function resolveApiKey(raw: string): Promise<ApiKeyOwner | null> {
  if (!looksLikeApiKey(raw)) return null;
  await ensureApiKeySchema();
  const { rows } = await pool.query(
    `SELECT k.id AS key_id, k.last_used_at, u.id AS user_id, u.email, u.role, u.plan, u.email_verified
       FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
    [hashToken(raw)],
  );
  const r = rows[0];
  if (!r) return null;
  const last = r.last_used_at ? new Date(r.last_used_at as string).getTime() : 0;
  if (Date.now() - last > TOUCH_INTERVAL_MS) {
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [r.key_id]).catch(() => { /* best effort */ });
  }
  return {
    keyId: String(r.key_id),
    userId: String(r.user_id),
    email: String(r.email),
    role: (r.role as string) ?? null,
    plan: (r.plan as string) ?? null,
    emailVerified: !!r.email_verified,
  };
}
