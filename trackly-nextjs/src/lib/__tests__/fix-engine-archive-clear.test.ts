/**
 * Fix Engine — archived_at lifecycle in updateFix.
 *
 * Archived is a property of a LIVE fix. Any status transition away from
 * shipped/verified (revert, reopen-for-edit, regenerate) must clear
 * archived_at so a once-archived fix re-enters the normal workflow and
 * doesn't silently jump back into the Archive tab when it ships again.
 * The shipped↔verified recheck transition keeps the flag.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ queries: [] as { sql: string; values: unknown[] }[] }));
vi.mock('@/lib/db', () => ({
  pool: { query: vi.fn(async (sql: string, values: unknown[] = []) => { db.queries.push({ sql, values }); return { rows: [], rowCount: 0 }; }) },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { updateFix } from '@/lib/fix-engine/schema';

const lastSql = () => db.queries[db.queries.length - 1].sql;

beforeEach(() => { db.queries = []; vi.clearAllMocks(); });

describe('updateFix archived_at handling', () => {
  it('explicit archive stamps archived_at', async () => {
    await updateFix('f1', { archived: true });
    expect(lastSql()).toContain('archived_at = NOW()');
  });

  it('explicit unarchive clears archived_at', async () => {
    await updateFix('f1', { archived: false });
    expect(lastSql()).toContain('archived_at = NULL');
  });

  it.each(['reverted', 'generated', 'detected', 'failed'] as const)(
    'transition to %s clears archived_at',
    async (status) => {
      await updateFix('f1', { status });
      expect(lastSql()).toContain('archived_at = NULL');
    },
  );

  it.each(['shipped', 'verified'] as const)(
    'transition to %s (recheck) keeps archived_at',
    async (status) => {
      await updateFix('f1', { status });
      expect(lastSql()).not.toContain('archived_at');
    },
  );

  it('a non-status patch never touches archived_at', async () => {
    await updateFix('f1', { note: 'hello' });
    expect(lastSql()).not.toContain('archived_at');
  });
});
