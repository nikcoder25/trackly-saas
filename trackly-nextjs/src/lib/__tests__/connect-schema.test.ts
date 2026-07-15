/**
 * Self-Serve Connect — site_connection persistence.
 *
 * Exercises the schema helpers against an in-memory pool mock: creation mints a
 * public key and is idempotent per (brand, method); lookups resolve by key/id;
 * a heartbeat flips status to 'connected' and stamps the seen timestamps.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^CREATE (TABLE|UNIQUE INDEX|INDEX)/i.test(s)) return { rows: [] };

      if (/^SELECT \* FROM site_connection WHERE brand_id = \$1 AND method = \$2/i.test(s)) {
        return { rows: store.rows.filter((r) => r.brand_id === values[0] && r.method === values[1]) };
      }
      if (/^SELECT \* FROM site_connection WHERE public_key = \$1/i.test(s)) {
        return { rows: store.rows.filter((r) => r.public_key === values[0]) };
      }
      if (/^SELECT \* FROM site_connection WHERE id = \$1/i.test(s)) {
        return { rows: store.rows.filter((r) => r.id === values[0]) };
      }
      if (/^SELECT \* FROM site_connection WHERE brand_id = \$1 ORDER BY/i.test(s)) {
        return { rows: store.rows.filter((r) => r.brand_id === values[0]) };
      }
      if (/^INSERT INTO site_connection/i.test(s)) {
        const [id, brandId, method, publicKey] = values as string[];
        const existing = store.rows.find((r) => r.brand_id === brandId && r.method === method);
        if (existing) return { rows: [existing] }; // ON CONFLICT DO UPDATE … RETURNING *
        const row = {
          id, brand_id: brandId, method, public_key: publicKey, status: 'pending',
          first_seen_at: null, last_seen_at: null, created_at: '2026-07-15T00:00:00Z',
        };
        store.rows.push(row);
        return { rows: [row] };
      }
      if (/^UPDATE site_connection SET status = 'connected'/i.test(s)) {
        const row = store.rows.find((r) => r.public_key === values[0]);
        if (!row) return { rows: [] };
        row.status = 'connected';
        row.last_seen_at = '2026-07-15T01:00:00Z';
        row.first_seen_at = row.first_seen_at ?? '2026-07-15T01:00:00Z';
        return { rows: [row] };
      }
      return { rows: [] };
    }),
  },
}));

import {
  createOrGetSiteConnection,
  getSiteConnectionByKey,
  getSiteConnection,
  recordHeartbeat,
  listSiteConnections,
} from '@/lib/connect/schema';

beforeEach(() => { store.rows = []; vi.clearAllMocks(); });

describe('createOrGetSiteConnection', () => {
  it('creates a pending connection with a public lvx_ key', async () => {
    const conn = await createOrGetSiteConnection('brand1', 'snippet');
    expect(conn.brandId).toBe('brand1');
    expect(conn.method).toBe('snippet');
    expect(conn.status).toBe('pending');
    expect(conn.publicKey).toMatch(/^lvx_[0-9a-f]{32}$/);
    expect(conn.firstSeenAt).toBeNull();
    expect(conn.lastSeenAt).toBeNull();
  });

  it('is idempotent per (brand, method): the same key comes back', async () => {
    const a = await createOrGetSiteConnection('brand1', 'snippet');
    const b = await createOrGetSiteConnection('brand1', 'snippet');
    expect(b.id).toBe(a.id);
    expect(b.publicKey).toBe(a.publicKey);
    expect(store.rows).toHaveLength(1);
  });

  it('mints distinct keys for different brands', async () => {
    const a = await createOrGetSiteConnection('brand1', 'snippet');
    const b = await createOrGetSiteConnection('brand2', 'snippet');
    expect(b.publicKey).not.toBe(a.publicKey);
    expect(store.rows).toHaveLength(2);
  });
});

describe('lookups', () => {
  it('resolves by public key and by id', async () => {
    const conn = await createOrGetSiteConnection('brand1', 'snippet');
    expect((await getSiteConnectionByKey(conn.publicKey))?.id).toBe(conn.id);
    expect((await getSiteConnection(conn.id))?.publicKey).toBe(conn.publicKey);
    expect(await getSiteConnectionByKey('lvx_missing')).toBeNull();
    expect(await getSiteConnection('nope')).toBeNull();
  });

  it('lists a brand connections', async () => {
    await createOrGetSiteConnection('brand1', 'snippet');
    expect(await listSiteConnections('brand1')).toHaveLength(1);
    expect(await listSiteConnections('brand2')).toHaveLength(0);
  });
});

describe('recordHeartbeat', () => {
  it('flips status to connected and stamps seen times', async () => {
    const conn = await createOrGetSiteConnection('brand1', 'snippet');
    expect(conn.status).toBe('pending');
    const after = await recordHeartbeat(conn.publicKey);
    expect(after?.status).toBe('connected');
    expect(after?.firstSeenAt).toBe('2026-07-15T01:00:00Z');
    expect(after?.lastSeenAt).toBe('2026-07-15T01:00:00Z');
  });

  it('returns null (no throw) for an unknown key', async () => {
    expect(await recordHeartbeat('lvx_unknown')).toBeNull();
  });
});
