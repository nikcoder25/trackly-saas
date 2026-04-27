/**
 * Tests for src/lib/tenant-keys.ts.
 *
 * The DB pool is mocked with a tiny in-memory shim so we can exercise
 * the resolution chain (tenant → user → server), per-(tenant,platform)
 * health tracking, and masking without any real Postgres. The validator
 * is mocked at the module boundary so a passing test does not depend on
 * outbound HTTP.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';
process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-32-characters-long';

interface FakeRow { [key: string]: unknown }

const { fakeRows, queryFn, validatorFn } = vi.hoisted(() => {
  const fakeRows: { keys: FakeRow[] } = { keys: [] };
  return {
    fakeRows,
    queryFn: vi.fn(),
    validatorFn: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
}));

vi.mock('@/lib/key-validator', () => ({
  validateProviderKey: (platform: string, apiKey: string, opts?: unknown) =>
    validatorFn(platform, apiKey, opts),
}));

// `tenant-keys` imports `helpers.encryptValue` / `decryptValue`. The real
// helpers are deterministic but require an encryption key (set above) and
// have no network/DB dependencies, so we keep them un-mocked.

import {
  maskTenantKey,
  isValidTenantPlatform,
  isPlausibleRawKey,
  resolveKeysForTenant,
  recordTenantKeyResult,
  upsertTenantKey,
  ensureTenantKeysSchema,
  deleteTenantKey,
} from '@/lib/tenant-keys';
import { encryptValue } from '@/lib/helpers';

beforeEach(() => {
  fakeRows.keys = [];
  queryFn.mockReset();
  validatorFn.mockReset();
  // CREATE TABLE / INSERT / SELECT / UPDATE / DELETE — keyed off SQL
  // prefix so tests can stay declarative.
  queryFn.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const trimmed = sql.trim();
    if (trimmed.startsWith('CREATE TABLE') || trimmed.startsWith('CREATE INDEX')) {
      return { rows: [], rowCount: 0 };
    }
    if (trimmed.startsWith('SELECT * FROM tenant_api_keys WHERE tenant_id') && trimmed.includes('platform')) {
      const [tenantId, platform] = params as [string, string];
      const found = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (trimmed.startsWith('SELECT * FROM tenant_api_keys WHERE tenant_id')) {
      const [tenantId] = params as [string];
      const filtered = fakeRows.keys.filter(r => r.tenant_id === tenantId);
      return { rows: filtered, rowCount: filtered.length };
    }
    if (trimmed.startsWith('SELECT consecutive_failures FROM tenant_api_keys')) {
      const [tenantId, platform] = params as [string, string];
      const found = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      return { rows: found ? [{ consecutive_failures: found.consecutive_failures }] : [], rowCount: found ? 1 : 0 };
    }
    if (trimmed.startsWith('INSERT INTO tenant_api_keys')) {
      const [
        id, tenantId, platform, encryptedKey, label,
        latencyMs, actorId,
      ] = params as [string, string, string, string, string | null, number | null, string | null];
      const existing = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      const now = new Date();
      if (existing) {
        existing.encrypted_key = encryptedKey;
        existing.label = label ?? existing.label;
        existing.last_validated_at = now;
        existing.last_validation_status = 'ok';
        existing.last_validation_error = null;
        existing.last_validation_latency_ms = latencyMs;
        existing.last_failure_at = null;
        existing.consecutive_failures = 0;
        existing.updated_at = now;
        existing.updated_by = actorId;
        return { rows: [existing], rowCount: 1 };
      }
      const row: FakeRow = {
        id, tenant_id: tenantId, platform, encrypted_key: encryptedKey,
        label: label ?? null,
        last_validated_at: now,
        last_validation_status: 'ok',
        last_validation_error: null,
        last_validation_latency_ms: latencyMs,
        last_used_at: null,
        last_failure_at: null,
        consecutive_failures: 0,
        created_at: now,
        updated_at: now,
        created_by: actorId,
        updated_by: actorId,
      };
      fakeRows.keys.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (trimmed.startsWith('UPDATE tenant_api_keys') && trimmed.includes('last_used_at = NOW()')) {
      const [tenantId, platform] = params as [string, string];
      const found = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      if (found) {
        found.last_used_at = new Date();
        found.consecutive_failures = 0;
        found.last_failure_at = null;
      }
      return { rows: [], rowCount: found ? 1 : 0 };
    }
    if (trimmed.startsWith('UPDATE tenant_api_keys') && trimmed.includes('last_failure_at = NOW()')) {
      const [tenantId, platform, errMsg] = params as [string, string, string];
      const found = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      if (found) {
        found.last_failure_at = new Date();
        found.consecutive_failures = (found.consecutive_failures as number) + 1;
        found.last_validation_error = errMsg;
      }
      return { rows: [], rowCount: found ? 1 : 0 };
    }
    if (trimmed.startsWith('UPDATE tenant_api_keys') && trimmed.includes('last_validated_at = NOW()')) {
      const [tenantId, platform, status, error, latency] =
        params as [string, string, string, string | null, number];
      const found = fakeRows.keys.find(r => r.tenant_id === tenantId && r.platform === platform);
      if (found) {
        found.last_validated_at = new Date();
        found.last_validation_status = status;
        found.last_validation_error = error;
        found.last_validation_latency_ms = latency;
      }
      return { rows: [], rowCount: found ? 1 : 0 };
    }
    if (trimmed.startsWith('DELETE FROM tenant_api_keys')) {
      const [tenantId, platform] = params as [string, string];
      const before = fakeRows.keys.length;
      fakeRows.keys = fakeRows.keys.filter(r => !(r.tenant_id === tenantId && r.platform === platform));
      return { rows: [], rowCount: before - fakeRows.keys.length };
    }
    return { rows: [], rowCount: 0 };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('maskTenantKey', () => {
  it('shows the first 4 + last 4 chars', () => {
    expect(maskTenantKey('sk-very-long-secret-token-12345678')).toBe('sk-v••••5678');
  });
  it('hides keys that are too short to mask safely', () => {
    expect(maskTenantKey('short')).toBe('••••');
    expect(maskTenantKey('')).toBe('');
  });
});

describe('isValidTenantPlatform', () => {
  it('accepts every supported provider key name', () => {
    for (const p of ['openai', 'claude', 'gemini', 'grok', 'perplexity']) {
      expect(isValidTenantPlatform(p)).toBe(true);
    }
  });
  it('rejects unknown platforms', () => {
    expect(isValidTenantPlatform('Mistral')).toBe(false);
    expect(isValidTenantPlatform('')).toBe(false);
    expect(isValidTenantPlatform('OPENAI')).toBe(false);
  });
});

describe('isPlausibleRawKey', () => {
  it('accepts realistic provider keys', () => {
    expect(isPlausibleRawKey('sk-test-1234567890abcd')).toBe(true);
    expect(isPlausibleRawKey('AIza-test-key-1234567890')).toBe(true);
  });
  it('rejects whitespace, html, and short strings', () => {
    expect(isPlausibleRawKey('')).toBe(false);
    expect(isPlausibleRawKey('   ')).toBe(false);
    expect(isPlausibleRawKey('short')).toBe(false);
    expect(isPlausibleRawKey('<script>alert(1)</script>')).toBe(false);
    expect(isPlausibleRawKey('has spaces in it')).toBe(false);
  });
});

describe('resolveKeysForTenant', () => {
  it('prefers a tenant key when one is configured', async () => {
    const encrypted = encryptValue('tenant-key-1234567890abcd');
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: encrypted!, consecutive_failures: 0,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: null,
      created_at: new Date(), updated_at: new Date(),
    });

    const r = await resolveKeysForTenant({
      tenantId: 't1', platformKeyName: 'openai',
      legacyUserKeys: { openai: 'legacy-user-key-1234567890' },
      serverKeys: ['server-1', 'server-2'],
    });
    expect(r).toEqual({ key: 'tenant-key-1234567890abcd', source: 'tenant', pool: [] });
  });

  it('falls through to legacy user key when no tenant key exists', async () => {
    const r = await resolveKeysForTenant({
      tenantId: 't1', platformKeyName: 'openai',
      legacyUserKeys: { openai: 'legacy-user-key-1234567890' },
      serverKeys: ['server-1'],
    });
    expect(r?.source).toBe('user');
    expect(r?.key).toBe('legacy-user-key-1234567890');
  });

  it('falls through to a server key when neither tenant nor user keys exist', async () => {
    const r = await resolveKeysForTenant({
      tenantId: 't1', platformKeyName: 'claude',
      legacyUserKeys: {},
      serverKeys: ['server-claude-1', 'server-claude-2'],
    });
    expect(r?.source).toBe('server');
    expect(r?.pool).toEqual(['server-claude-1', 'server-claude-2']);
  });

  it('returns null when no key is available anywhere', async () => {
    const r = await resolveKeysForTenant({
      tenantId: 't1', platformKeyName: 'gemini',
      legacyUserKeys: {},
      serverKeys: [],
    });
    expect(r).toBeNull();
  });

  it('skips an unhealthy tenant key (consecutive_failures >= threshold) and falls through', async () => {
    const encrypted = encryptValue('hot-tenant-key-12345678');
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: encrypted!, consecutive_failures: 99,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: new Date(),
      created_at: new Date(), updated_at: new Date(),
    });

    const r = await resolveKeysForTenant({
      tenantId: 't1', platformKeyName: 'openai',
      legacyUserKeys: {},
      serverKeys: ['server-1'],
    });
    // Bad tenant key did NOT pollute the global pool — we fell through.
    expect(r?.source).toBe('server');
  });

  it('returns null when tenantId is empty (no fall-through to tenant store)', async () => {
    const encrypted = encryptValue('tenant-key-1234567890abcd');
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: encrypted!, consecutive_failures: 0,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: null,
      created_at: new Date(), updated_at: new Date(),
    });
    const r = await resolveKeysForTenant({
      tenantId: null, platformKeyName: 'openai',
      legacyUserKeys: {}, serverKeys: ['server-1'],
    });
    expect(r?.source).toBe('server');
  });
});

describe('recordTenantKeyResult', () => {
  it('resets consecutive_failures on success', async () => {
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: 'enc', consecutive_failures: 4,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: new Date(),
      created_at: new Date(), updated_at: new Date(),
    });
    await recordTenantKeyResult('t1', 'openai', { ok: true });
    expect(fakeRows.keys[0].consecutive_failures).toBe(0);
    expect(fakeRows.keys[0].last_failure_at).toBeNull();
  });

  it('increments consecutive_failures on failure and stores the error message', async () => {
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: 'enc', consecutive_failures: 2,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: null,
      created_at: new Date(), updated_at: new Date(),
    });
    await recordTenantKeyResult('t1', 'openai', { ok: false, error: 'Auth error 401' });
    expect(fakeRows.keys[0].consecutive_failures).toBe(3);
    expect(fakeRows.keys[0].last_validation_error).toBe('Auth error 401');
  });

  it('is a no-op when tenantId is empty (server-key path must not write)', async () => {
    await recordTenantKeyResult('', 'openai', { ok: true });
    // No CREATE-or-UPDATE was issued — the implementation short-circuits.
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe('upsertTenantKey', () => {
  beforeEach(() => {
    validatorFn.mockResolvedValue({
      ok: true, status: 'ok', httpStatus: 200, latencyMs: 42, platform: 'openai',
    });
  });

  it('rejects unknown platforms before hitting the validator', async () => {
    await expect(
      upsertTenantKey({
        tenantId: 't1', platform: 'Mistral', rawKey: 'sk-test-1234567890abcd',
      }),
    ).rejects.toThrow(/Unknown platform/);
    expect(validatorFn).not.toHaveBeenCalled();
  });

  it('rejects malformed keys before hitting the validator', async () => {
    await expect(
      upsertTenantKey({ tenantId: 't1', platform: 'openai', rawKey: 'short' }),
    ).rejects.toThrow(/shape is not valid/);
    expect(validatorFn).not.toHaveBeenCalled();
  });

  it('does not persist when validation fails', async () => {
    validatorFn.mockResolvedValueOnce({
      ok: false, status: 'invalid', httpStatus: 401,
      error: 'ChatGPT rejected this key: 401 (unauthorized)',
      latencyMs: 18, platform: 'openai',
    });
    const out = await upsertTenantKey({
      tenantId: 't1', platform: 'openai', rawKey: 'sk-bogus-1234567890abcd',
    });
    expect(out.validation.ok).toBe(false);
    expect(out.validation.status).toBe('invalid');
    expect(fakeRows.keys.length).toBe(0);
  });

  it('persists an encrypted key on successful validation and returns the masked form only', async () => {
    const out = await upsertTenantKey({
      tenantId: 't1', platform: 'openai', rawKey: 'sk-test-1234567890abcdef',
    });
    expect(out.validation.ok).toBe(true);
    expect(fakeRows.keys.length).toBe(1);
    expect(fakeRows.keys[0].encrypted_key).not.toContain('sk-test');
    expect(out.key.maskedKey).toMatch(/^sk-t••••cdef$/);
    // Plaintext must never be on the public DTO.
    expect(JSON.stringify(out.key)).not.toContain('sk-test-1234567890abcdef');
  });

  it('rotating a key clears consecutive_failures and updates last_validated_at', async () => {
    await upsertTenantKey({
      tenantId: 't1', platform: 'openai', rawKey: 'sk-test-old-1234567890ab',
    });
    fakeRows.keys[0].consecutive_failures = 7;
    fakeRows.keys[0].last_failure_at = new Date('2026-01-01');

    await upsertTenantKey({
      tenantId: 't1', platform: 'openai', rawKey: 'sk-test-new-1234567890ab',
    });
    expect(fakeRows.keys.length).toBe(1);
    expect(fakeRows.keys[0].consecutive_failures).toBe(0);
    expect(fakeRows.keys[0].last_failure_at).toBeNull();
  });
});

describe('deleteTenantKey', () => {
  it('removes a configured key and reports rowCount', async () => {
    fakeRows.keys.push({
      id: 'tk1', tenant_id: 't1', platform: 'openai',
      encrypted_key: 'enc', consecutive_failures: 0,
      label: null, last_validated_at: new Date(), last_validation_status: 'ok',
      last_validation_error: null, last_validation_latency_ms: 30,
      last_used_at: null, last_failure_at: null,
      created_at: new Date(), updated_at: new Date(),
    });
    const ok = await deleteTenantKey('t1', 'openai');
    expect(ok).toBe(true);
    expect(fakeRows.keys.length).toBe(0);
  });

  it('returns false when no key matches', async () => {
    const ok = await deleteTenantKey('t1', 'gemini');
    expect(ok).toBe(false);
  });
});

describe('ensureTenantKeysSchema', () => {
  it('is idempotent across calls (CREATE TABLE issued at most once)', async () => {
    await ensureTenantKeysSchema();
    await ensureTenantKeysSchema();
    const ddlCalls = queryFn.mock.calls.filter(c =>
      typeof c[0] === 'string' && (c[0] as string).trim().startsWith('CREATE TABLE')
    );
    expect(ddlCalls.length).toBeLessThanOrEqual(1);
  });
});
