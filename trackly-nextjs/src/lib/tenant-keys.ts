/**
 * Per-tenant API key storage, validation, and health tracking.
 *
 * Why this exists:
 *   The original model put all LLM keys in env vars (OPENAI_API_KEY,
 *   CLAUDE_API_KEY, …) and routed every brand through the same shared pool.
 *   That works for a single-brand product, but the multi-tenant scale work
 *   tracked in #409 needs:
 *
 *     - Tenants (banks etc) bringing their own keys → key per (tenant, platform)
 *     - Bad tenant keys must NOT pollute the global circuit-breaker map in
 *       `ai-platforms.ts`. A misconfigured customer should fail fast for
 *       themselves, not for the rest of the platform.
 *     - Validation at save time so the "Inactive / No Data" UX (PR #406) stops
 *       happening mid-run when a tenant's key is wrong/expired/quota'd.
 *     - Fall back to the platform-wide env keys when a tenant has none
 *       configured - keeps existing single-tenant behavior intact.
 *
 * Storage:
 *   Keys are encrypted at rest with the same AES-256-GCM scheme used for
 *   per-user `users.api_keys` (`helpers.encryptValue`). Decryption happens
 *   only inside this module and at the run-route key-resolution call site;
 *   the plaintext value is NEVER returned by API routes, never logged, and
 *   never serialised to JSON for the client.
 *
 * Health:
 *   `recordTenantKeyResult` updates `last_*` columns per (tenant, platform)
 *   so the dashboard can surface a healthy/inactive indicator without
 *   joining against the global circuit-breaker. Failures are scoped - they
 *   do not call `recordApiKeyFailure` on the global breaker.
 */

import crypto from 'crypto';
import { pool } from './db';
import { encryptValue, decryptValue } from './helpers';
import { logger } from './logger';
import { PROVIDER_SPECS, getProviderSpec, type ProviderSpec, type PlatformId, TENANT_KEY_NAMES } from './provider-specs';
import { validateProviderKey, type KeyValidationResult } from './key-validator';

// ── Schema ──────────────────────────────────────────────────────
// `tenant_id` is a TEXT column so it can hold either a user id (today's
// "tenant === brand owner" model) or a future formal tenants.id without
// a destructive migration. `platform` matches the ProviderSpec.keyName
// values (`openai`, `claude`, ...) so it lines up with the existing
// `users.api_keys` JSONB shape. `encrypted_key` is iv:tag:ciphertext.
//
// `last_validated_at` / `last_validation_status` / `last_validation_error`
// drive the per-tenant health UI. `last_used_at` lets ops see whether a
// tenant key is actually being exercised on every run. `created_by` /
// `updated_by` are user ids so we can audit who rotated a key.
const TENANT_KEYS_DDL = `
  CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    label TEXT,
    last_validated_at TIMESTAMPTZ,
    last_validation_status TEXT,
    last_validation_error TEXT,
    last_validation_latency_ms INT,
    last_used_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT,
    UNIQUE (tenant_id, platform)
  );
  CREATE INDEX IF NOT EXISTS tenant_api_keys_tenant_idx ON tenant_api_keys(tenant_id);
`;

let migratePromise: Promise<void> | null = null;
const _state: { migrated: boolean } = { migrated: false };

export async function ensureTenantKeysSchema(): Promise<void> {
  if (_state.migrated) return;
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    try {
      await pool.query(TENANT_KEYS_DDL);
      _state.migrated = true;
    } catch (e) {
      logger.error('tenant_keys.migration_failed', { error: (e as Error).message });
      migratePromise = null;
    }
  })();
  return migratePromise;
}

// ── Validation: tenant id, platform, raw-key shape ──────────────
const PLATFORM_NAMES = new Set(TENANT_KEY_NAMES);

export function isValidTenantPlatform(platform: string): boolean {
  return PLATFORM_NAMES.has(platform as ProviderSpec['keyName']);
}

// Reject obvious garbage (whitespace, control chars, html) before we
// even hit the provider - saves a round trip and produces a better
// error message in the UI.
const RAW_KEY_RE = /^[A-Za-z0-9._\-:/+=]{12,400}$/;

export function isPlausibleRawKey(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  return RAW_KEY_RE.test(raw.trim());
}

// ── Public DTOs ─────────────────────────────────────────────────
// Everything that reaches the client goes through `maskTenantKey`. The
// plaintext is only ever held inside this module + the run-route key
// resolution path.
export interface TenantKeyPublic {
  id: string;
  tenantId: string;
  platform: string;
  label: string | null;
  maskedKey: string;
  lastValidatedAt: string | null;
  lastValidationStatus: 'ok' | 'invalid' | 'error' | null;
  lastValidationError: string | null;
  lastValidationLatencyMs: number | null;
  lastUsedAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantKeyRow {
  id: string;
  tenant_id: string;
  platform: string;
  encrypted_key: string;
  label: string | null;
  last_validated_at: Date | null;
  last_validation_status: string | null;
  last_validation_error: string | null;
  last_validation_latency_ms: number | null;
  last_used_at: Date | null;
  last_failure_at: Date | null;
  consecutive_failures: number;
  created_at: Date;
  updated_at: Date;
}

// ── Masking ─────────────────────────────────────────────────────
// Show enough characters at each end to be useful for support ("the key
// ending in ...abcd was just rejected") without leaking enough to be
// usable. Matches the convention used by Stripe / OpenAI dashboards.
export function maskTenantKey(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return '••••';
  const head = trimmed.slice(0, 4);
  const tail = trimmed.slice(-4);
  return `${head}••••${tail}`;
}

function rowToPublic(row: TenantKeyRow, raw: string | null): TenantKeyPublic {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platform: row.platform,
    label: row.label,
    maskedKey: raw ? maskTenantKey(raw) : '••••',
    lastValidatedAt: row.last_validated_at ? row.last_validated_at.toISOString() : null,
    lastValidationStatus: (row.last_validation_status as TenantKeyPublic['lastValidationStatus']) || null,
    lastValidationError: row.last_validation_error,
    lastValidationLatencyMs: row.last_validation_latency_ms,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    lastFailureAt: row.last_failure_at ? row.last_failure_at.toISOString() : null,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── CRUD ────────────────────────────────────────────────────────
export interface UpsertTenantKeyInput {
  tenantId: string;
  platform: string;
  rawKey: string;
  label?: string | null;
  actorId?: string | null;
}

export interface UpsertTenantKeyResult {
  key: TenantKeyPublic;
  validation: KeyValidationResult;
}

function newKeyId(): string {
  return 'tk_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

export async function listTenantKeys(tenantId: string): Promise<TenantKeyPublic[]> {
  await ensureTenantKeysSchema();
  const result = await pool.query<TenantKeyRow>(
    `SELECT * FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY platform`,
    [tenantId],
  );
  return result.rows.map(row => {
    const raw = decryptValue(row.encrypted_key);
    return rowToPublic(row, raw);
  });
}

export async function getTenantKey(
  tenantId: string,
  platform: string,
): Promise<{ public: TenantKeyPublic; raw: string } | null> {
  await ensureTenantKeysSchema();
  const result = await pool.query<TenantKeyRow>(
    `SELECT * FROM tenant_api_keys WHERE tenant_id = $1 AND platform = $2`,
    [tenantId, platform],
  );
  const row = result.rows[0];
  if (!row) return null;
  const raw = decryptValue(row.encrypted_key);
  if (!raw) return null;
  return { public: rowToPublic(row, raw), raw };
}

/**
 * Resolve the raw plaintext key for a tenant + platform. Returns null
 * when the tenant has no configured key. Callers fall back to the
 * platform-default env keys (`getServerKeys()`) when this returns null.
 *
 * NEVER pass the returned value to a logger, response body, or error
 * message - only to provider HTTP headers via `queryAI`.
 */
export async function resolveTenantKey(
  tenantId: string,
  platform: string,
): Promise<string | null> {
  if (!tenantId) return null;
  const entry = await getTenantKey(tenantId, platform);
  return entry ? entry.raw : null;
}

/**
 * Create or rotate a tenant key. Validates against the upstream provider
 * BEFORE writing, so a bad key never lands in the DB. The first row
 * inserts; subsequent calls overwrite the encrypted_key + reset health
 * counters (a rotated key starts with a clean slate).
 */
export async function upsertTenantKey(
  input: UpsertTenantKeyInput,
): Promise<UpsertTenantKeyResult> {
  await ensureTenantKeysSchema();
  if (!isValidTenantPlatform(input.platform)) {
    throw new Error(`Unknown platform: ${input.platform}`);
  }
  const trimmed = input.rawKey.trim();
  if (!isPlausibleRawKey(trimmed)) {
    throw new Error('API key shape is not valid');
  }
  const validation = await validateProviderKey(input.platform, trimmed);
  if (!validation.ok) {
    return {
      key: {
        id: '',
        tenantId: input.tenantId,
        platform: input.platform,
        label: input.label ?? null,
        maskedKey: maskTenantKey(trimmed),
        lastValidatedAt: new Date().toISOString(),
        lastValidationStatus: validation.status === 'invalid' ? 'invalid' : 'error',
        lastValidationError: validation.error || 'Validation failed',
        lastValidationLatencyMs: validation.latencyMs,
        lastUsedAt: null,
        lastFailureAt: null,
        consecutiveFailures: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      validation,
    };
  }

  const encrypted = encryptValue(trimmed);
  if (!encrypted) throw new Error('Failed to encrypt API key');
  const id = newKeyId();
  // ON CONFLICT bumps everything except the original `id` / `created_*`
  // columns. Rotating a key starts with consecutive_failures=0 and a
  // fresh "last validated ok" stamp.
  const result = await pool.query<TenantKeyRow>(
    `INSERT INTO tenant_api_keys (
       id, tenant_id, platform, encrypted_key, label,
       last_validated_at, last_validation_status, last_validation_error,
       last_validation_latency_ms, consecutive_failures,
       created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, NOW(), 'ok', NULL, $6, 0, $7, $7)
     ON CONFLICT (tenant_id, platform) DO UPDATE SET
       encrypted_key = EXCLUDED.encrypted_key,
       label = COALESCE(EXCLUDED.label, tenant_api_keys.label),
       last_validated_at = NOW(),
       last_validation_status = 'ok',
       last_validation_error = NULL,
       last_validation_latency_ms = EXCLUDED.last_validation_latency_ms,
       last_failure_at = NULL,
       consecutive_failures = 0,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by
     RETURNING *`,
    [
      id,
      input.tenantId,
      input.platform,
      encrypted,
      input.label ?? null,
      validation.latencyMs,
      input.actorId ?? null,
    ],
  );
  const row = result.rows[0];
  return { key: rowToPublic(row, trimmed), validation };
}

export async function deleteTenantKey(
  tenantId: string,
  platform: string,
): Promise<boolean> {
  await ensureTenantKeysSchema();
  const result = await pool.query(
    `DELETE FROM tenant_api_keys WHERE tenant_id = $1 AND platform = $2`,
    [tenantId, platform],
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Per-(tenant,platform) health tracking ───────────────────────
// Scope-isolated from the global `apiKeyFailures` map in
// `ai-platforms.ts`. A bank with a bust key trips ITS row, not the
// shared circuit breaker, so other tenants keep flowing.

// Threshold scales with the global breaker (5 failures in 5 minutes)
// - kept loose because tenant keys also see real provider 5xx noise
// and we don't want to mark a tenant unhealthy on a transient blip.
const TENANT_KEY_FAIL_THRESHOLD = Number(process.env.TENANT_KEY_FAIL_THRESHOLD) || 5;

export async function recordTenantKeyResult(
  tenantId: string,
  platform: string,
  result: { ok: boolean; error?: string },
): Promise<void> {
  if (!tenantId) return;
  await ensureTenantKeysSchema();
  try {
    if (result.ok) {
      await pool.query(
        `UPDATE tenant_api_keys
            SET last_used_at = NOW(),
                consecutive_failures = 0,
                last_failure_at = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1 AND platform = $2`,
        [tenantId, platform],
      );
    } else {
      await pool.query(
        `UPDATE tenant_api_keys
            SET last_failure_at = NOW(),
                consecutive_failures = consecutive_failures + 1,
                last_validation_error = $3,
                updated_at = NOW()
          WHERE tenant_id = $1 AND platform = $2`,
        [tenantId, platform, (result.error || '').slice(0, 500)],
      );
    }
  } catch (e) {
    // Health tracking must never break the run path.
    logger.warn('tenant_keys.health_update_failed', {
      tenant_id: tenantId,
      platform,
      error: (e as Error).message,
    });
  }
}

export async function isTenantKeyUnhealthy(
  tenantId: string,
  platform: string,
): Promise<boolean> {
  await ensureTenantKeysSchema();
  const result = await pool.query<{ consecutive_failures: number }>(
    `SELECT consecutive_failures FROM tenant_api_keys WHERE tenant_id = $1 AND platform = $2`,
    [tenantId, platform],
  );
  const row = result.rows[0];
  if (!row) return false;
  return row.consecutive_failures >= TENANT_KEY_FAIL_THRESHOLD;
}

// ── Re-validation (manual button on /dashboard/platforms) ───────
export async function revalidateTenantKey(
  tenantId: string,
  platform: string,
): Promise<KeyValidationResult | { ok: false; error: string; status: 'invalid' }> {
  await ensureTenantKeysSchema();
  const entry = await getTenantKey(tenantId, platform);
  if (!entry) {
    return { ok: false, error: 'No tenant key configured', status: 'invalid' };
  }
  const validation = await validateProviderKey(platform, entry.raw);
  await pool.query(
    `UPDATE tenant_api_keys
        SET last_validated_at = NOW(),
            last_validation_status = $3,
            last_validation_error = $4,
            last_validation_latency_ms = $5,
            updated_at = NOW()
      WHERE tenant_id = $1 AND platform = $2`,
    [
      tenantId,
      platform,
      validation.ok ? 'ok' : validation.status === 'invalid' ? 'invalid' : 'error',
      validation.ok ? null : (validation.error || '').slice(0, 500),
      validation.latencyMs,
    ],
  );
  return validation;
}

// ── Key resolution chain (tenant → legacy user-keys → server env) ──
// Returns the best raw key for a given platform with provenance so the
// caller can log the source without stamping it on the key itself.
//
// Order:
//   1. Configured tenant key (new `tenant_api_keys` row).
//   2. Legacy per-user `users.api_keys` blob (kept for back-compat -
//      existing single-tenant deployments rely on this).
//   3. Platform-default env keys (`getServerKeys()` pool).
//
// Health (consecutive_failures) only gates step 1: a hot tenant key
// that's blowing up still falls through to the server pool, which keeps
// the platform running for the tenant while their next save replaces
// the bad key.
export type TenantKeySource = 'tenant' | 'user' | 'server';

export interface ResolvedTenantKey {
  key: string;
  source: TenantKeySource;
  /** Pool of additional server keys when source === 'server'. Empty otherwise. */
  pool: string[];
}

export async function resolveKeysForTenant(args: {
  tenantId: string | null;
  platformKeyName: string;
  legacyUserKeys?: Record<string, string | null | undefined>;
  serverKeys: string[];
}): Promise<ResolvedTenantKey | null> {
  const { tenantId, platformKeyName, legacyUserKeys, serverKeys } = args;
  if (tenantId) {
    const tenant = await getTenantKey(tenantId, platformKeyName);
    // Skip a tenant key that's beyond the failure threshold so it does
    // not poison the run forever - falls through to the server pool.
    if (tenant && tenant.public.consecutiveFailures < TENANT_KEY_FAIL_THRESHOLD) {
      return { key: tenant.raw, source: 'tenant', pool: [] };
    }
  }
  const legacy = legacyUserKeys?.[platformKeyName];
  if (legacy) return { key: legacy, source: 'user', pool: [] };
  if (serverKeys.length > 0) {
    const pick = serverKeys[Math.floor(Math.random() * serverKeys.length)];
    return { key: pick, source: 'server', pool: serverKeys };
  }
  return null;
}

// Re-export so callers don't have to know about the spec module.
export { PROVIDER_SPECS, getProviderSpec, type PlatformId };
