/**
 * Fix Engine - per-brand integration connections.
 *
 * Stores credentials for the three integration providers behind the
 * engine (cms, gsc, connector) in `fix_connections`, encrypted at rest
 * with the same AES-256-GCM helper used for tenant AI keys
 * (helpers.encryptValue / decryptValue, keyed by ENCRYPTION_KEY).
 *
 * Credentials are NEVER returned to the client. Read paths return a
 * masked/public view; only the engine's ship path decrypts.
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { encryptValue, decryptValue } from '@/lib/helpers';
import { ensureFixEngineSchema } from './schema';

export type ConnectionProvider = 'cms' | 'gsc' | 'connector' | 'linear' | 'jira' | 'kwe' | 'sheet' | 'cloudflare';

export interface ConnectionPublic {
  id: string;
  provider: ConnectionProvider;
  cmsType: string | null;
  siteUrl: string | null;
  status: 'active' | 'revoked' | 'error';
  meta: Record<string, unknown>;
  expiresAt: string | null;
  /** Last time the Connector polled (heartbeat); null until first poll. */
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedConnection extends ConnectionPublic {
  creds: Record<string, unknown> | null;
}

function toPublic(r: Record<string, unknown>): ConnectionPublic {
  return {
    id: String(r.id),
    provider: r.provider as ConnectionProvider,
    cmsType: (r.cms_type as string | null) ?? null,
    siteUrl: (r.site_url as string | null) ?? null,
    status: r.status as ConnectionPublic['status'],
    meta: (r.meta as Record<string, unknown>) ?? {},
    expiresAt: (r.expires_at as string | null) ?? null,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function upsertConnection(args: {
  userId: string;
  brandId: string;
  provider: ConnectionProvider;
  cmsType?: string | null;
  siteUrl?: string | null;
  creds: Record<string, unknown>;
  meta?: Record<string, unknown>;
  expiresAt?: string | null;
}): Promise<ConnectionPublic> {
  await ensureFixEngineSchema();
  const id = crypto.randomUUID();
  const encrypted = encryptValue(JSON.stringify(args.creds));
  const res = await pool.query(
    `INSERT INTO fix_connections
       (id, user_id, brand_id, provider, cms_type, site_url, encrypted_creds, meta, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
     ON CONFLICT (brand_id, provider) DO UPDATE
       SET cms_type        = EXCLUDED.cms_type,
           site_url        = EXCLUDED.site_url,
           encrypted_creds = EXCLUDED.encrypted_creds,
           meta            = EXCLUDED.meta,
           status          = 'active',
           expires_at      = EXCLUDED.expires_at,
           updated_at      = NOW()
     RETURNING *`,
    [
      id, args.userId, args.brandId, args.provider, args.cmsType ?? null,
      args.siteUrl ?? null, encrypted, JSON.stringify(args.meta ?? {}),
      args.expiresAt ?? null,
    ],
  );
  return toPublic(res.rows[0]);
}

export async function listConnections(brandId: string): Promise<ConnectionPublic[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fix_connections WHERE brand_id = $1 ORDER BY created_at DESC`,
    [brandId],
  );
  return res.rows.map(toPublic);
}

export async function getConnection(
  brandId: string,
  provider: ConnectionProvider,
): Promise<DecryptedConnection | null> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fix_connections WHERE brand_id = $1 AND provider = $2`,
    [brandId, provider],
  );
  const row = res.rows[0];
  if (!row) return null;
  let creds: Record<string, unknown> | null = null;
  if (row.encrypted_creds) {
    const dec = decryptValue(String(row.encrypted_creds));
    if (dec) {
      try { creds = JSON.parse(dec); } catch { creds = null; }
    }
  }
  return { ...toPublic(row), creds };
}

/**
 * The user's most recent active connection of a provider across ALL their
 * brands. Lets an account-level credential (e.g. the Cloudflare API token)
 * be entered once and reused for every website the user adds later.
 */
export async function getLatestUserConnection(
  userId: string,
  provider: ConnectionProvider,
): Promise<DecryptedConnection | null> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fix_connections
      WHERE user_id = $1 AND provider = $2 AND status = 'active'
      ORDER BY updated_at DESC LIMIT 1`,
    [userId, provider],
  );
  const row = res.rows[0];
  if (!row) return null;
  let creds: Record<string, unknown> | null = null;
  if (row.encrypted_creds) {
    const dec = decryptValue(String(row.encrypted_creds));
    if (dec) { try { creds = JSON.parse(dec); } catch { creds = null; } }
  }
  return { ...toPublic(row), creds };
}

// ── Connector pairing ────────────────────────────────────────────

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export interface ConnectorPairing {
  /** Raw token — shown to the user ONCE, never stored. */
  token: string;
  /** HMAC secret the plugin uses to verify instruction signatures. */
  hmacSecret: string;
}

/**
 * Create (or rotate) the Connector pairing for a brand. Stores only the
 * token HASH (queryable) and the HMAC secret (encrypted); returns the raw
 * token + secret to show the user once.
 */
export async function createConnectorPairing(userId: string, brandId: string, expiresInDays?: number): Promise<ConnectorPairing> {
  await ensureFixEngineSchema();
  const token = crypto.randomBytes(24).toString('hex');
  const hmacSecret = crypto.randomBytes(24).toString('hex');
  const id = crypto.randomUUID();
  const encrypted = encryptValue(JSON.stringify({ hmacSecret }));
  // Default: no expiry (the plugin polls indefinitely). Re-pairing rotates
  // the token (the old hash is overwritten); revoke is the kill switch.
  const expiresAt = expiresInDays && expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;
  await pool.query(
    `INSERT INTO fix_connections
       (id, user_id, brand_id, provider, token_hash, encrypted_creds, meta, status, expires_at)
     VALUES ($1,$2,$3,'connector',$4,$5,$6,'active',$7)
     ON CONFLICT (brand_id, provider) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           encrypted_creds = EXCLUDED.encrypted_creds,
           status = 'active',
           expires_at = EXCLUDED.expires_at,
           last_seen_at = NULL,
           updated_at = NOW()`,
    [id, userId, brandId, sha256(token), encrypted, JSON.stringify({ pairedBy: userId }), expiresAt],
  );
  return { token, hmacSecret };
}

export interface ResolvedConnector {
  brandId: string;
  userId: string;
  hmacSecret: string | null;
}

/** Resolve a raw bearer token to its (active) connector connection. */
export async function getConnectorByToken(rawToken: string): Promise<ResolvedConnector | null> {
  if (!rawToken) return null;
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT user_id, brand_id, encrypted_creds, expires_at FROM fix_connections
      WHERE provider = 'connector' AND token_hash = $1 AND status = 'active'
      LIMIT 1`,
    [sha256(rawToken)],
  );
  const row = res.rows[0];
  if (!row) return null;
  // Honour an optional expiry (revocable, time-boxed tokens).
  if (row.expires_at && Date.parse(String(row.expires_at)) <= Date.now()) return null;
  let hmacSecret: string | null = null;
  if (row.encrypted_creds) {
    const dec = decryptValue(String(row.encrypted_creds));
    if (dec) { try { hmacSecret = (JSON.parse(dec) as { hmacSecret?: string }).hmacSecret ?? null; } catch { /* ignore */ } }
  }
  return { brandId: String(row.brand_id), userId: String(row.user_id), hmacSecret };
}

/** Heartbeat: stamp the connector's last-poll time (best-effort). */
export async function touchConnectorSeen(brandId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE fix_connections SET last_seen_at = NOW() WHERE brand_id = $1 AND provider = 'connector'`,
      [brandId],
    );
  } catch { /* heartbeat is best-effort */ }
}

// ── One-click connect handshake ──────────────────────────────────

export interface HandshakePayload {
  token: string;
  hmacSecret: string;
  pullUrl: string;
}

/**
 * Mint a short-lived, single-use authorization code that the Connector
 * plugin exchanges (server-to-server) for its credentials. Returns the raw
 * code; only its hash + the encrypted payload are stored.
 */
export async function createHandshakeCode(
  userId: string,
  brandId: string,
  payload: HandshakePayload,
  ttlMinutes = 10,
): Promise<string> {
  await ensureFixEngineSchema();
  const code = crypto.randomBytes(32).toString('hex');
  const encrypted = encryptValue(JSON.stringify(payload));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await pool.query(
    `INSERT INTO fix_connector_handshakes (code_hash, brand_id, user_id, payload, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [sha256(code), brandId, userId, encrypted, expiresAt],
  );
  return code;
}

/**
 * Atomically consume a handshake code: returns the decrypted payload exactly
 * once (single-use), or null if the code is unknown, already used, or
 * expired. The UPDATE ... WHERE used_at IS NULL makes the claim race-safe.
 */
export async function consumeHandshakeCode(code: string): Promise<HandshakePayload | null> {
  if (!code) return null;
  await ensureFixEngineSchema();
  const res = await pool.query(
    `UPDATE fix_connector_handshakes
        SET used_at = NOW()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING payload`,
    [sha256(code)],
  );
  const row = res.rows[0];
  if (!row?.payload) return null;
  const dec = decryptValue(String(row.payload));
  if (!dec) return null;
  try { return JSON.parse(dec) as HandshakePayload; } catch { return null; }
}

export async function setConnectionStatus(
  brandId: string,
  provider: ConnectionProvider,
  status: 'active' | 'revoked' | 'error',
): Promise<void> {
  await pool.query(
    `UPDATE fix_connections SET status = $3, updated_at = NOW()
      WHERE brand_id = $1 AND provider = $2`,
    [brandId, provider, status],
  );
}
