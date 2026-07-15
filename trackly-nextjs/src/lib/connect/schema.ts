/**
 * Self-Serve Connect — site_connection persistence.
 *
 * One row per (brand × method) records how a customer's live site is wired to
 * Livesov. Milestone 1 ships the `snippet` method: a one-line <script> the
 * customer pastes once; on load it fetches the brand's per-path SEO overrides
 * and applies them client-side, then pings a heartbeat that flips the row to
 * 'connected'. `wordpress` and `edge` are reserved for later milestones.
 *
 * Follows the repo's per-module `ensure*Schema()` convention (idempotent
 * CREATE TABLE IF NOT EXISTS, lazily invoked at the top of every query helper).
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';

export type ConnectMethod = 'snippet' | 'wordpress' | 'edge';
export type ConnectStatus = 'pending' | 'connected' | 'stale';

/** A site connection row (camelCase view of the DB row). */
export interface SiteConnection {
  id: string;
  brandId: string;
  method: ConnectMethod;
  /** Random, PUBLIC, non-secret site identifier embedded in the page snippet. */
  publicKey: string;
  status: ConnectStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

let schemaEnsured = false;

export async function ensureConnectSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_connection (
      id            UUID PRIMARY KEY,
      brand_id      TEXT NOT NULL,
      method        TEXT NOT NULL DEFAULT 'snippet'
                    CHECK (method IN ('snippet','wordpress','edge')),
      public_key    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','connected','stale')),
      first_seen_at TIMESTAMPTZ,
      last_seen_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT site_connection_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  // The public_key is the lookup key for the public serve/heartbeat routes.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_connection_public_key ON site_connection (public_key)`);
  // One connection per (brand, method) — revisiting the connect screen returns
  // the same key/snippet instead of stacking rows.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_connection_brand_method ON site_connection (brand_id, method)`);
  schemaEnsured = true;
}

type DbRow = Record<string, unknown>;

export function mapSiteConnectionRow(r: DbRow): SiteConnection {
  return {
    id: String(r.id),
    brandId: String(r.brand_id),
    method: r.method as ConnectMethod,
    publicKey: String(r.public_key),
    status: r.status as ConnectStatus,
    firstSeenAt: (r.first_seen_at as string | null) ?? null,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

/** A random, URL-safe, PUBLIC site identifier (not a secret — it ships in the
 *  page source). The `lvx_` prefix makes it recognisable in logs / markup. */
export function generatePublicKey(): string {
  return 'lvx_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Return the brand's connection for `method`, creating it (with a fresh public
 * key) on first call. Idempotent: revisiting the connect screen returns the
 * same row so the pasted snippet stays valid. The ON CONFLICT guard also makes
 * two concurrent creates converge on one row.
 */
export async function createOrGetSiteConnection(brandId: string, method: ConnectMethod): Promise<SiteConnection> {
  await ensureConnectSchema();
  const existing = await pool.query(`SELECT * FROM site_connection WHERE brand_id = $1 AND method = $2`, [brandId, method]);
  if (existing.rows[0]) return mapSiteConnectionRow(existing.rows[0]);
  const res = await pool.query(
    `INSERT INTO site_connection (id, brand_id, method, public_key, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (brand_id, method) DO UPDATE SET method = EXCLUDED.method
     RETURNING *`,
    [crypto.randomUUID(), brandId, method, generatePublicKey()],
  );
  return mapSiteConnectionRow(res.rows[0]);
}

/** Look up a connection by its public key (the public serve/heartbeat routes). */
export async function getSiteConnectionByKey(publicKey: string): Promise<SiteConnection | null> {
  await ensureConnectSchema();
  const res = await pool.query(`SELECT * FROM site_connection WHERE public_key = $1`, [publicKey]);
  return res.rows[0] ? mapSiteConnectionRow(res.rows[0]) : null;
}

/** Look up a connection by id (the authenticated status-poll route). */
export async function getSiteConnection(id: string): Promise<SiteConnection | null> {
  await ensureConnectSchema();
  const res = await pool.query(`SELECT * FROM site_connection WHERE id = $1`, [id]);
  return res.rows[0] ? mapSiteConnectionRow(res.rows[0]) : null;
}

/** List a brand's connections (for the connect UI). */
export async function listSiteConnections(brandId: string): Promise<SiteConnection[]> {
  await ensureConnectSchema();
  const res = await pool.query(`SELECT * FROM site_connection WHERE brand_id = $1 ORDER BY created_at DESC`, [brandId]);
  return res.rows.map(mapSiteConnectionRow);
}

/**
 * Record a heartbeat from the live-site snippet: flip to 'connected', stamp
 * last_seen_at, and set first_seen_at once. Returns the updated row, or null if
 * the key is unknown. Never throws on an unknown key — the caller responds 204
 * either way so it can't be used to probe key validity.
 */
export async function recordHeartbeat(publicKey: string): Promise<SiteConnection | null> {
  await ensureConnectSchema();
  const res = await pool.query(
    `UPDATE site_connection
        SET status = 'connected',
            last_seen_at = NOW(),
            first_seen_at = COALESCE(first_seen_at, NOW())
      WHERE public_key = $1
      RETURNING *`,
    [publicKey],
  );
  return res.rows[0] ? mapSiteConnectionRow(res.rows[0]) : null;
}
