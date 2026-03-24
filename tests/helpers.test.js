import { describe, it, expect, vi } from 'vitest';

process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-16-chars-long';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars-long-32chars';
process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

vi.mock('../config/db', () => ({
  pool: { query: vi.fn() }
}));

vi.mock('../lib/plans', () => ({
  getPlanLimits: vi.fn(() => ({ brands: 1, queries: 10 }))
}));

const { uid, encryptValue, decryptValue, encryptApiKeys, decryptApiKeys, safeUser } = await import('../lib/helpers.js');

describe('uid', () => {
  it('generates a string', () => {
    const id = uid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });
});

describe('encryptValue / decryptValue', () => {
  it('roundtrips a plain text value', () => {
    const original = 'sk-secret-api-key-12345';
    const encrypted = encryptValue(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // iv:tag:ciphertext format
    const decrypted = decryptValue(encrypted);
    expect(decrypted).toBe(original);
  });

  it('returns null for null/empty input', () => {
    expect(encryptValue(null)).toBeNull();
    expect(encryptValue('')).toBeNull();
    expect(decryptValue(null)).toBeNull();
    expect(decryptValue('')).toBeNull();
  });

  it('returns null for invalid encrypted format', () => {
    expect(decryptValue('not-valid-encrypted')).toBeNull();
  });
});

describe('encryptApiKeys / decryptApiKeys', () => {
  it('roundtrips an object of API keys', () => {
    const keys = {
      openai: 'sk-openai-key-123',
      gemini: 'gemini-key-456',
    };
    const encrypted = encryptApiKeys(keys);
    expect(encrypted.openai).not.toBe(keys.openai);
    expect(encrypted.gemini).not.toBe(keys.gemini);

    const decrypted = decryptApiKeys(encrypted);
    expect(decrypted.openai).toBe(keys.openai);
    expect(decrypted.gemini).toBe(keys.gemini);
  });

  it('handles null values in keys object', () => {
    const keys = { openai: 'sk-key', perplexity: null };
    const encrypted = encryptApiKeys(keys);
    expect(encrypted.perplexity).toBeNull();

    const decrypted = decryptApiKeys(encrypted);
    expect(decrypted.openai).toBe('sk-key');
    expect(decrypted.perplexity).toBeNull();
  });

  it('returns empty object for null/undefined input', () => {
    expect(encryptApiKeys(null)).toEqual({});
    expect(decryptApiKeys(undefined)).toEqual({});
  });
});

describe('safeUser', () => {
  it('strips sensitive fields and returns safe user object', () => {
    const user = {
      id: '123',
      email: 'test@example.com',
      username: 'testuser',
      name: 'Test User',
      plan: 'pro',
      role: 'user',
      created_at: '2025-01-01',
      email_verified: true,
      avatar_url: null,
      google_id: null,
      api_keys: {},
      settings: {
        theme: 'dark',
        totp_secret: 'should-be-removed',
        totp_secret_pending: 'should-be-removed',
        totp_backup_codes: ['code1'],
      },
    };

    const safe = safeUser(user);

    expect(safe.id).toBe('123');
    expect(safe.email).toBe('test@example.com');
    expect(safe.plan).toBe('pro');
    expect(safe.emailVerified).toBe(true);
    expect(safe.settings.theme).toBe('dark');
    // Sensitive fields must be stripped
    expect(safe.settings.totp_secret).toBeUndefined();
    expect(safe.settings.totp_secret_pending).toBeUndefined();
    expect(safe.settings.totp_backup_codes).toBeUndefined();
    // Should not expose raw user fields
    expect(safe.password).toBeUndefined();
    expect(safe.google_id).toBeUndefined();
  });

  it('defaults plan to starter when not provided', () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', settings: {} };
    const safe = safeUser(user);
    expect(safe.plan).toBe('starter');
  });
});
