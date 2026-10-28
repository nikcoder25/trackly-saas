/**
 * OAuth 2.1 authorization server for the Livesov MCP endpoint.
 *
 * Lets AI apps that only speak OAuth (claude.ai connectors, ChatGPT
 * connectors) connect to /api/mcp: the app registers itself (RFC 7591
 * dynamic client registration), sends the user to /oauth/authorize, the
 * signed-in user approves, and the app swaps the code for tokens with PKCE.
 *
 * Public clients only (no client secrets), S256 PKCE required, exact
 * redirect URI match, single-use 10-minute codes, 1-hour access tokens and
 * rotating 30-day refresh tokens. Every code and token is stored as a sha256
 * digest. Follows the per-module `ensure*Schema()` convention.
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { hashToken } from '@/lib/auth';

export const OAUTH_SCOPE = 'livesov';
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_PREFIX = 'lsva_';
const REFRESH_PREFIX = 'lsvr_';

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

let schemaEnsured = false;

export async function ensureOAuthSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id     TEXT PRIMARY KEY,
      client_name   TEXT NOT NULL,
      redirect_uris JSONB NOT NULL,
      client_uri    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code_hash      TEXT PRIMARY KEY,
      client_id      TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      redirect_uri   TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      scope          TEXT NOT NULL,
      resource       TEXT,
      expires_at     TIMESTAMPTZ NOT NULL,
      used_at        TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id           UUID PRIMARY KEY,
      token_hash   TEXT NOT NULL UNIQUE,
      kind         TEXT NOT NULL CHECK (kind IN ('access','refresh')),
      client_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      scope        TEXT NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS oauth_tokens_user_client_idx ON oauth_tokens(user_id, client_id) WHERE revoked_at IS NULL');
  schemaEnsured = true;
}

/* ─────────────────────────── pure helpers (unit-tested) ─────────────────────────── */

/**
 * Redirect URIs we accept at registration: https anywhere, or http only on
 * the loopback host (desktop apps and local tools). No fragments, no
 * embedded credentials, no custom schemes.
 */
export function isAllowedRedirectUri(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2000) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

/** base64url(sha256(verifier)) — the PKCE S256 transform. */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** RFC 7636: 43-128 chars of [A-Z a-z 0-9 - . _ ~]. */
export function isValidVerifier(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

export function isValidChallenge(c: unknown): c is string {
  return typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);
}

export function looksLikeAccessToken(raw: string): boolean {
  return raw.startsWith(ACCESS_PREFIX) && raw.length === ACCESS_PREFIX.length + 43;
}

function newToken(prefix: string): string {
  return prefix + crypto.randomBytes(32).toString('base64url');
}

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return s || 'AI app';
}

/* ─────────────────────────── clients ─────────────────────────── */

export interface OAuthClient { clientId: string; clientName: string; redirectUris: string[]; clientUri: string | null }

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown; client_uri?: unknown; token_endpoint_auth_method?: unknown }): Promise<OAuthClient> {
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 URIs');
  }
  for (const u of uris) {
    if (!isAllowedRedirectUri(u)) throw new OAuthError('invalid_redirect_uri', `Redirect URI not allowed: ${String(u).slice(0, 200)}`);
  }
  const method = input.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') {
    throw new OAuthError('invalid_client_metadata', 'Only public clients are supported (token_endpoint_auth_method "none")');
  }
  const clientUri = typeof input.client_uri === 'string' && /^https:\/\//.test(input.client_uri) ? input.client_uri.slice(0, 500) : null;
  await ensureOAuthSchema();
  const clientId = 'lsvc_' + crypto.randomBytes(16).toString('base64url');
  const name = cleanName(input.client_name);
  await pool.query(
    'INSERT INTO oauth_clients (client_id, client_name, redirect_uris, client_uri) VALUES ($1, $2, $3, $4)',
    [clientId, name, JSON.stringify(uris), clientUri],
  );
  return { clientId, clientName: name, redirectUris: uris as string[], clientUri };
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== 'string' || !/^lsvc_[A-Za-z0-9_-]{22}$/.test(clientId)) return null;
  await ensureOAuthSchema();
  const { rows } = await pool.query('SELECT client_id, client_name, redirect_uris, client_uri FROM oauth_clients WHERE client_id = $1', [clientId]);
  const r = rows[0];
  if (!r) return null;
  const uris = typeof r.redirect_uris === 'string' ? JSON.parse(r.redirect_uris) : r.redirect_uris;
  return { clientId: String(r.client_id), clientName: String(r.client_name), redirectUris: Array.isArray(uris) ? uris : [], clientUri: (r.client_uri as string) || null };
}

/* ─────────────────────────── authorize ─────────────────────────── */

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string | null;
}

/**
 * Validates an /oauth/authorize request. Errors that must not bounce back to
 * an unverified redirect URI (bad client, bad redirect) throw with
 * `status: 400` so the page shows them instead.
 */
export async function validateAuthorizeRequest(q: Record<string, string | null | undefined>): Promise<{ client: OAuthClient; params: AuthorizeParams }> {
  const client = await getClient(q.client_id);
  if (!client) throw new OAuthError('invalid_client', 'This app is not registered with Livesov. Reconnect it from the app.');
  const redirectUri = q.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : '');
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError('invalid_request', 'The redirect address does not match what this app registered.');
  }
  if (q.response_type !== 'code') throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported.');
  if (q.code_challenge_method !== 'S256' || !isValidChallenge(q.code_challenge)) {
    throw new OAuthError('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  const scope = (q.scope || OAUTH_SCOPE).split(/\s+/).filter(Boolean);
  if (scope.some(s => s !== OAUTH_SCOPE && s !== 'offline_access')) throw new OAuthError('invalid_scope', `Supported scope: ${OAUTH_SCOPE}`);
  return { client, params: { clientId: client.clientId, redirectUri, codeChallenge: q.code_challenge as string, scope: OAUTH_SCOPE, resource: q.resource || null } };
}

/** Issues a single-use authorization code after the user approves. */
export async function createAuthorizationCode(userId: string, p: AuthorizeParams): Promise<string> {
  await ensureOAuthSchema();
  const code = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [hashToken(code), p.clientId, userId, p.redirectUri, p.codeChallenge, p.scope, p.resource, new Date(Date.now() + CODE_TTL_MS)],
  );
  return code;
}

/* ─────────────────────────── tokens ─────────────────────────── */

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(clientId: string, userId: string, scope: string): Promise<TokenResponse> {
  const access = newToken(ACCESS_PREFIX);
  const refresh = newToken(REFRESH_PREFIX);
  const now = Date.now();
  await pool.query(
    `INSERT INTO oauth_tokens (id, token_hash, kind, client_id, user_id, scope, expires_at) VALUES
       ($1, $2, 'access',  $5, $6, $7, $8),
       ($3, $4, 'refresh', $5, $6, $7, $9)`,
    [crypto.randomUUID(), hashToken(access), crypto.randomUUID(), hashToken(refresh), clientId, userId, scope,
      new Date(now + ACCESS_TOKEN_TTL_S * 1000), new Date(now + REFRESH_TOKEN_TTL_S * 1000)],
  );
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope };
}

export async function exchangeCode(input: { code?: unknown; client_id?: unknown; redirect_uri?: unknown; code_verifier?: unknown }): Promise<TokenResponse> {
  if (typeof input.code !== 'string' || !input.code) throw new OAuthError('invalid_request', 'code is required');
  if (!isValidVerifier(input.code_verifier)) throw new OAuthError('invalid_request', 'A valid code_verifier is required');
  await ensureOAuthSchema();
  // Claim the code atomically so a replay can never mint a second token pair.
  const { rows } = await pool.query(
    `UPDATE oauth_codes SET used_at = NOW()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING client_id, user_id, redirect_uri, code_challenge, scope`,
    [hashToken(input.code)],
  );
  const c = rows[0];
  if (!c) throw new OAuthError('invalid_grant', 'The code is invalid, expired or already used');
  if (input.client_id !== undefined && input.client_id !== c.client_id) throw new OAuthError('invalid_grant', 'The code was issued to another client');
  if (input.redirect_uri !== undefined && input.redirect_uri !== c.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri does not match');
  if (pkceChallenge(input.code_verifier) !== c.code_challenge) throw new OAuthError('invalid_grant', 'PKCE verification failed');
  return issueTokens(String(c.client_id), String(c.user_id), String(c.scope));
}

export async function refreshTokens(input: { refresh_token?: unknown; client_id?: unknown }): Promise<TokenResponse> {
  if (typeof input.refresh_token !== 'string' || !input.refresh_token.startsWith(REFRESH_PREFIX)) {
    throw new OAuthError('invalid_grant', 'Invalid refresh token');
  }
  await ensureOAuthSchema();
  // Rotation: the presented refresh token is revoked as it is used.
  const { rows } = await pool.query(
    `UPDATE oauth_tokens SET revoked_at = NOW()
      WHERE token_hash = $1 AND kind = 'refresh' AND revoked_at IS NULL AND expires_at > NOW()
      RETURNING client_id, user_id, scope`,
    [hashToken(input.refresh_token)],
  );
  const t = rows[0];
  if (!t) throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired or revoked');
  if (input.client_id !== undefined && input.client_id !== t.client_id) throw new OAuthError('invalid_grant', 'The refresh token was issued to another client');
  return issueTokens(String(t.client_id), String(t.user_id), String(t.scope));
}

/** RFC 7009: always succeeds from the caller's point of view. */
export async function revokeToken(raw: unknown): Promise<void> {
  if (typeof raw !== 'string' || !raw) return;
  await ensureOAuthSchema();
  await pool.query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(raw)]);
}

export interface TokenOwner { tokenId: string; clientId: string; userId: string; email: string; role: string | null; plan: string | null; emailVerified: boolean }

/** Owner of a live access token, or null. */
export async function resolveAccessToken(raw: string): Promise<TokenOwner | null> {
  if (!looksLikeAccessToken(raw)) return null;
  await ensureOAuthSchema();
  const { rows } = await pool.query(
    `SELECT t.id, t.client_id, t.last_used_at, u.id AS user_id, u.email, u.role, u.plan, u.email_verified
       FROM oauth_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.kind = 'access' AND t.revoked_at IS NULL AND t.expires_at > NOW()`,
    [hashToken(raw)],
  );
  const r = rows[0];
  if (!r) return null;
  const last = r.last_used_at ? new Date(r.last_used_at as string).getTime() : 0;
  if (Date.now() - last > 5 * 60 * 1000) {
    pool.query('UPDATE oauth_tokens SET last_used_at = NOW() WHERE id = $1', [r.id]).catch(() => { /* best effort */ });
  }
  return {
    tokenId: String(r.id), clientId: String(r.client_id), userId: String(r.user_id), email: String(r.email),
    role: (r.role as string) ?? null, plan: (r.plan as string) ?? null, emailVerified: !!r.email_verified,
  };
}

/* ─────────────────────────── connected apps (Account page) ─────────────────────────── */

export interface ConnectedApp { clientId: string; name: string; connectedAt: string; lastUsedAt: string | null }

export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  await ensureOAuthSchema();
  const { rows } = await pool.query(
    `SELECT t.client_id, c.client_name, MIN(t.created_at) AS connected_at, MAX(t.last_used_at) AS last_used_at
       FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
      WHERE t.user_id = $1 AND t.revoked_at IS NULL AND t.expires_at > NOW()
      GROUP BY t.client_id, c.client_name
      ORDER BY MIN(t.created_at) DESC`,
    [userId],
  );
  return rows.map(r => ({
    clientId: String(r.client_id),
    name: String(r.client_name),
    connectedAt: new Date(r.connected_at as string).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string).toISOString() : null,
  }));
}

/** Revokes every token a user granted to one app. */
export async function disconnectApp(userId: string, clientId: string): Promise<boolean> {
  await ensureOAuthSchema();
  const res = await pool.query(
    'UPDATE oauth_tokens SET revoked_at = NOW() WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL',
    [userId, clientId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Public base URL used in metadata documents (APP_URL when set, else the request origin). */
export function issuerFor(request: Request): string {
  const env = process.env.APP_URL;
  if (env) { try { return new URL(env).origin; } catch { /* fall through */ } }
  return new URL(request.url).origin;
}
