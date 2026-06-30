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

export type ConnectionProvider = 'cms' | 'gsc' | 'connector';

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
export async function createConnectorPairing(userId: string, brandId: string): Promise<ConnectorPairing> {
  await ensureFixEngineSchema();
  const token = crypto.randomBytes(24).toString('hex');
  const hmacSecret = crypto.randomBytes(24).toString('hex');
  const id = crypto.randomUUID();
  const encrypted = encryptValue(JSON.stringify({ hmacSecret }));
  await pool.query(
    `INSERT INTO fix_connections
       (id, user_id, brand_id, provider, token_hash, encrypted_creds, meta, status)
     VALUES ($1,$2,$3,'connector',$4,$5,$6,'active')
     ON CONFLICT (brand_id, provider) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           encrypted_creds = EXCLUDED.encrypted_creds,
           status = 'active',
           updated_at = NOW()`,
    [id, userId, brandId, sha256(token), encrypted, JSON.stringify({ pairedBy: userId })],
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
    `SELECT user_id, brand_id, encrypted_creds FROM fix_connections
      WHERE provider = 'connector' AND token_hash = $1 AND status = 'active'
      LIMIT 1`,
    [sha256(rawToken)],
  );
  const row = res.rows[0];
  if (!row) return null;
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
