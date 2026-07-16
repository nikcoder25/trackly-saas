/**
 * Fix Engine — viewer role gates on the write paths that used to lack them.
 *
 * approve is the human gate before anything ships, recheck mutates
 * verified↔shipped, and the scan POST writes fix rows and spends crawl
 * budget — all three must 403 read-only team members, matching the other
 * fix mutation routes (ship/revert/stage/publish/dismiss/generate).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'owner' as string }));

vi.mock('@/lib/db', () => ({ pool: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ requireVerifiedAuth: vi.fn(async () => ({ id: 'user1' })) }));
vi.mock('@/lib/helpers', () => ({
  getBrandWithAccess: vi.fn(async () => ({ role: state.role, brand: { id: 'brand1', userId: 'user1', website: 'https://acme.test' } })),
  getUserEffectivePlan: vi.fn(async () => 'pro'),
}));
vi.mock('@/lib/fix-engine/engine', () => ({
  approveFix: vi.fn(async () => ({ id: 'fix1', status: 'approved' })),
  recheckFix: vi.fn(async () => ({ id: 'fix1', status: 'verified' })),
  dispatchScan: vi.fn(async () => 'batch1'),
}));
vi.mock('@/lib/fix-engine/schema', () => ({
  listFixes: vi.fn(async () => []),
  ensureFixEngineSchema: vi.fn(async () => undefined),
  getAttentionSummary: vi.fn(async () => ({ failed: 0, stuck: 0, regressed: 0 })),
}));
vi.mock('@/lib/fix-engine/registry', () => ({
  moduleCatalog: vi.fn(() => [{ key: 'llms-txt', minPlan: 'starter' }]),
  getModule: vi.fn(() => ({ key: 'llms-txt', minPlan: 'starter' })),
  meetsPlan: vi.fn(() => true),
}));
vi.mock('@/lib/fix-engine/ai-visibility', () => ({ getBrandAiVisibility: vi.fn(async () => null) }));
vi.mock('@/lib/fix-engine/health', () => ({ computeGeoHealthScore: vi.fn(() => 0) }));
vi.mock('@/lib/fix-engine/page-metrics', () => ({
  getPageMetrics: vi.fn(async () => []),
  refreshPageMetrics: vi.fn(async () => undefined),
  normUrl: vi.fn((u: string) => u),
}));

import { POST as approvePOST } from '@/app/api/brands/[id]/fixes/[fixId]/approve/route';
import { POST as recheckPOST } from '@/app/api/brands/[id]/fixes/[fixId]/recheck/route';
import { POST as scanPOST } from '@/app/api/brands/[id]/fixes/route';
import { approveFix, recheckFix, dispatchScan } from '@/lib/fix-engine/engine';

const fixParams = { params: Promise.resolve({ id: 'brand1', fixId: 'fix1' }) };
const brandParams = { params: Promise.resolve({ id: 'brand1' }) };
const req = (path: string) => new Request(`https://livesov.com/api/brands/brand1/${path}`, { method: 'POST' });

beforeEach(() => { state.role = 'owner'; vi.clearAllMocks(); });

describe('viewer gates', () => {
  it('403s a viewer on approve (and never calls the engine)', async () => {
    state.role = 'viewer';
    const res = await approvePOST(req('fixes/fix1/approve'), fixParams);
    expect(res.status).toBe(403);
    expect(approveFix).not.toHaveBeenCalled();
  });

  it('lets an owner approve', async () => {
    const res = await approvePOST(req('fixes/fix1/approve'), fixParams);
    expect(res.status).toBe(200);
    expect(approveFix).toHaveBeenCalledWith('fix1', 'brand1', 'user1');
  });

  it('403s a viewer on recheck', async () => {
    state.role = 'viewer';
    const res = await recheckPOST(req('fixes/fix1/recheck'), fixParams);
    expect(res.status).toBe(403);
    expect(recheckFix).not.toHaveBeenCalled();
  });

  it('lets an editor recheck', async () => {
    state.role = 'editor';
    const res = await recheckPOST(req('fixes/fix1/recheck'), fixParams);
    expect(res.status).toBe(200);
  });

  it('403s a viewer starting a scan (and never dispatches)', async () => {
    state.role = 'viewer';
    const res = await scanPOST(req('fixes'), brandParams);
    expect(res.status).toBe(403);
    expect(dispatchScan).not.toHaveBeenCalled();
  });

  it('lets an owner start a scan', async () => {
    const res = await scanPOST(req('fixes'), brandParams);
    expect(res.status).toBe(202);
    expect(dispatchScan).toHaveBeenCalledWith('user1', 'brand1', ['llms-txt']);
  });
});
