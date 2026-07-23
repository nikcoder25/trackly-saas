/**
 * Fix Engine — explicit archiving.
 *
 * Shipping no longer moves a fix to the Archive tab; the user does, via
 * PATCH { archived: true/false }. These tests lock in the gates: only a
 * live (shipped/verified) fix can be archived, only an archived fix can be
 * unarchived, and viewers can't touch it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'owner' as string,
  fix: { id: 'fix1', status: 'shipped', archivedAt: null as string | null, moduleKey: 'title-rewrite', generated: null, dedupeKey: 'k', targetUrl: 'u', severity: 'low', summary: 's', detected: {}, beforeSnapshot: null },
  patches: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/db', () => ({ pool: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ requireVerifiedAuth: vi.fn(async () => ({ id: 'user1' })) }));
vi.mock('@/lib/helpers', () => ({
  getBrandWithAccess: vi.fn(async () => ({ role: state.role, brand: { id: 'brand1', userId: 'user1' } })),
}));
vi.mock('@/lib/fix-engine/schema', () => ({
  getFix: vi.fn(async () => ({ ...state.fix })),
  getFixEvents: vi.fn(async () => []),
  updateFix: vi.fn(async (_id: string, patch: Record<string, unknown>) => { state.patches.push(patch); }),
  logFixEvent: vi.fn(),
}));
vi.mock('@/lib/fix-engine/registry', () => ({ getModule: vi.fn(() => undefined) }));
vi.mock('@/lib/fix-engine/automation', () => ({ getAutomation: vi.fn(async () => null) }));
vi.mock('@/lib/fix-engine/rules', () => ({ applyBrandRules: vi.fn((g: unknown) => ({ generated: g })) }));

import { PATCH } from '@/app/api/brands/[id]/fixes/[fixId]/route';
import { updateFix, logFixEvent } from '@/lib/fix-engine/schema';

const params = { params: Promise.resolve({ id: 'brand1', fixId: 'fix1' }) };
const patchReq = (body: unknown) => new Request('https://livesov.com/api/brands/brand1/fixes/fix1', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  state.role = 'owner';
  state.fix.status = 'shipped';
  state.fix.archivedAt = null;
  state.patches = [];
  vi.clearAllMocks();
});

describe('PATCH { archived }', () => {
  it('archives a shipped fix', async () => {
    const res = await PATCH(patchReq({ archived: true }), params);
    expect(res.status).toBe(200);
    expect(updateFix).toHaveBeenCalledWith('fix1', expect.objectContaining({ archived: true }));
    expect(logFixEvent).toHaveBeenCalledWith('fix1', 'brand1', 'user1', 'fix.archived', {});
  });

  it('archives a verified fix', async () => {
    state.fix.status = 'verified';
    const res = await PATCH(patchReq({ archived: true }), params);
    expect(res.status).toBe(200);
    expect(state.patches[0]).toMatchObject({ archived: true });
  });

  it('rejects archiving a fix that is not live yet', async () => {
    state.fix.status = 'detected';
    const res = await PATCH(patchReq({ archived: true }), params);
    expect(res.status).toBe(400);
    expect(updateFix).not.toHaveBeenCalled();
  });

  it('unarchives an archived fix', async () => {
    state.fix.archivedAt = '2026-07-01T00:00:00Z';
    const res = await PATCH(patchReq({ archived: false }), params);
    expect(res.status).toBe(200);
    expect(state.patches[0]).toMatchObject({ archived: false });
    expect(logFixEvent).toHaveBeenCalledWith('fix1', 'brand1', 'user1', 'fix.unarchived', {});
  });

  it('rejects unarchiving a fix that is not archived', async () => {
    const res = await PATCH(patchReq({ archived: false }), params);
    expect(res.status).toBe(400);
    expect(updateFix).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean archived value', async () => {
    const res = await PATCH(patchReq({ archived: 'yes' }), params);
    expect(res.status).toBe(400);
  });

  it('403s a viewer', async () => {
    state.role = 'viewer';
    const res = await PATCH(patchReq({ archived: true }), params);
    expect(res.status).toBe(403);
    expect(updateFix).not.toHaveBeenCalled();
  });
});
