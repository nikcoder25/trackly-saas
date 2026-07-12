/**
 * Fix Engine - one-click connect handshake: single-use, expiring
 * authorization codes (createHandshakeCode / consumeHandshakeCode), against
 * an in-memory store that mimics the UPDATE...WHERE used_at IS NULL claim.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Pass-through "encryption" so we can read the stored payload back.
vi.mock('@/lib/helpers', () => ({
  encryptValue: (s: string) => `enc:${s}`,
  decryptValue: (s: string) => (s.startsWith('enc:') ? s.slice(4) : null),
}));

interface Row { payload: string; expiresAt: number; used: boolean }
const store = vi.hoisted(() => ({ rows: new Map<string, Row>() }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO fix_connector_handshakes')) {
        const [codeHash, , , payload, expiresAt] = params as string[];
        store.rows.set(codeHash, { payload, expiresAt: Date.parse(expiresAt), used: false });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE fix_connector_handshakes')) {
        const codeHash = (params as string[])[0];
        const row = store.rows.get(codeHash);
        if (!row || row.used || row.expiresAt <= Date.now()) return { rows: [], rowCount: 0 };
        row.used = true; // single-use claim
        return { rows: [{ payload: row.payload }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 }; // DDL etc.
    }),
  },
}));

import { createHandshakeCode, consumeHandshakeCode } from '@/lib/fix-engine/connections';

const payload = { token: 'tok', hmacSecret: 'sec', pullUrl: 'https://livesov.com/api/connector/instructions' };

beforeEach(() => { store.rows.clear(); vi.clearAllMocks(); });

describe('connect handshake codes', () => {
  it('round-trips the payload exactly once', async () => {
    const code = await createHandshakeCode('u1', 'b1', payload);
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThanOrEqual(32);

    const first = await consumeHandshakeCode(code);
    expect(first).toEqual(payload);

    // Single-use: a second exchange of the same code fails.
    expect(await consumeHandshakeCode(code)).toBeNull();
  });

  it('rejects an unknown code', async () => {
    expect(await consumeHandshakeCode('deadbeef')).toBeNull();
    expect(await consumeHandshakeCode('')).toBeNull();
  });

  it('rejects an expired code', async () => {
    const code = await createHandshakeCode('u1', 'b1', payload, -1); // already expired
    expect(await consumeHandshakeCode(code)).toBeNull();
  });
});
