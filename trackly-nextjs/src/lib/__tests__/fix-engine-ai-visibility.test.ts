/**
 * Fix Engine - AI visibility snapshot (SOV from the brand's latest run).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({ data: null as any }));
vi.mock('@/lib/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: dbState.data === undefined ? [] : [{ data: dbState.data }] })) },
}));

import { getBrandAiVisibility } from '@/lib/fix-engine/ai-visibility';

beforeEach(() => { dbState.data = null; vi.clearAllMocks(); });

describe('getBrandAiVisibility', () => {
  it('returns the latest run SOV', async () => {
    dbState.data = { runs: [{ sov: 20, date: '2026-06-01' }, { sov: 45, date: '2026-06-20' }] };
    const snap = await getBrandAiVisibility('b1');
    expect(snap).toMatchObject({ sov: 45, at: '2026-06-20', source: 'run' });
  });
  it('returns null when the brand has no runs', async () => {
    dbState.data = { runs: [] };
    expect(await getBrandAiVisibility('b1')).toBeNull();
  });
  it('recomputes SOV from results when stored sov is 0', async () => {
    dbState.data = { runs: [{ sov: 0, date: '2026-06-20', allResults: [{ mentioned: true }, { mentioned: false }, { error: true }] }] };
    const snap = await getBrandAiVisibility('b1');
    expect(snap?.sov).toBe(50); // 1 of 2 non-error results mentioned
  });
});
