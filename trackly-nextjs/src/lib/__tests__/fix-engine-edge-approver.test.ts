/**
 * Edge delivery serves an 'approved' llms.txt / robots fix straight to a
 * Worker-fronted site, so approval there is publication. The query behind
 * /api/edge/serve must only count an approval made by a real user: a row
 * approved with a null approver (the old autopilot path) is never served.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ sql: [] as string[], params: [] as unknown[][] }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.sql.push(sql);
      calls.params.push(params);
      return { rows: [], rowCount: 0 };
    }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getLatestRootFileContent } from '@/lib/fix-engine/schema';

function rootFileQuery(): string {
  const sql = calls.sql.find((q) => /SELECT generated, after_snapshot FROM fixes/.test(q));
  if (!sql) throw new Error('root-file query not issued');
  return sql.replace(/\s+/g, ' ');
}

beforeEach(() => { calls.sql = []; calls.params = []; });

describe('getLatestRootFileContent approver gate', () => {
  it('does not treat a bare approved status as servable', async () => {
    await getLatestRootFileContent('b1', 'llms-txt', 'content');
    // First call runs the (memoised) schema migration, which adds the column.
    expect(calls.sql.some((q) => /ADD COLUMN IF NOT EXISTS approved_by TEXT/.test(q))).toBe(true);
    const sql = rootFileQuery();
    expect(sql).not.toMatch(/status IN \('approved'/);
    expect(sql).toMatch(/status IN \('shipped','verified'\)/);
  });

  it('requires a real approver for an approved row', async () => {
    await getLatestRootFileContent('b1', 'llms-txt', 'content');
    const sql = rootFileQuery();
    expect(sql).toMatch(/status = 'approved' AND \( approved_by IS NOT NULL/);
    // Legacy rows (approved before approved_by existed) count only when the
    // latest 'approved' audit event names a user.
    expect(sql).toMatch(/e\.event = 'approved' ORDER BY e\.created_at DESC LIMIT 1\) IS NOT NULL/);
  });
});
