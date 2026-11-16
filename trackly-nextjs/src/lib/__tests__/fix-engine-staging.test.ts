/**
 * Fix Engine - ship-as-draft (staged preview) state machine: stageFix and
 * publishStagedFix, against an in-memory store + a stageable fake module.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixRow } from '@/lib/fix-engine/types';

const store = vi.hoisted(() => ({
  fixes: new Map<string, Record<string, unknown>>(),
  connectorActive: true,
  events: [] as string[],
  resetCalls: [] as string[],
  failReset: false,
}));

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn; } }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('@/lib/credits', () => ({ reserveCredits: vi.fn(async () => ({ ok: true })), refundCredits: vi.fn(async () => {}) }));
vi.mock('@/lib/helpers', () => ({ getUserEffectivePlan: vi.fn(async () => 'pro') }));
vi.mock('@/lib/fix-engine/ai-visibility', () => ({ getBrandAiVisibility: vi.fn(async () => null) }));

vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_b: string, provider: string) =>
    provider === 'connector' && store.connectorActive ? { status: 'active', creds: {} } : null),
}));

const stageableModule = {
  key: 'title-rewrite', title: 'Title', description: '', channel: 'A', trigger: 'crawl', minPlan: 'starter', phase: 1,
  detect: vi.fn(), generate: vi.fn(), preview: vi.fn(),
  ship: vi.fn(async () => ({ ok: true, detail: {} })),
  recheck: vi.fn(async () => ({ verified: true, scoreAfter: 100 })),
  contentPatch: (issue: { targetUrl: string | null }, draft: { generated: Record<string, unknown> }) =>
    issue.targetUrl ? { url: issue.targetUrl, title: String(draft.generated.title) } : null,
};
const plainModule = { ...stageableModule, key: 'llms-txt', channel: 'B', contentPatch: undefined };

vi.mock('@/lib/fix-engine/registry', () => ({
  getModule: (k: string) => (k === 'title-rewrite' ? stageableModule : k === 'llms-txt' ? plainModule : undefined),
  listModules: () => [stageableModule],
  generateCost: () => 1,
}));

vi.mock('@/lib/fix-engine/schema', () => ({
  ensureFixEngineSchema: vi.fn(async () => {}),
  getFix: vi.fn(async (id: string) => { const r = store.fixes.get(id); return r ? { ...r } : null; }),
  updateFix: vi.fn(async (id: string, patch: Record<string, unknown>) => { const r = store.fixes.get(id); if (r) Object.assign(r, patch); }),
  claimFixTransition: vi.fn(async (id: string, from: string, to: string) => {
    const r = store.fixes.get(id);
    if (r && r.status === from) { r.status = to; return true; }
    return false;
  }),
  resetConnectorDelivery: vi.fn(async (id: string) => {
    if (store.failReset) throw new Error('db down');
    store.resetCalls.push(id);
  }),
  listFixes: vi.fn(async (_b: string, f: { status?: string } = {}) =>
    [...store.fixes.values()].filter((r) => !f.status || r.status === f.status).map((r) => ({ ...r }))),
  createBatch: vi.fn(async () => 'b'),
  logFixEvent: vi.fn(async (_f: string, _b: string, _u: unknown, event: string) => { store.events.push(event); }),
  getBatch: vi.fn(async () => null), claimBatchForRunning: vi.fn(async () => true), finalizeBatch: vi.fn(async () => {}),
  upsertDetectedFix: vi.fn(async () => 'x'), createBatch: vi.fn(async () => 'b'), findStuckQueuedBatches: vi.fn(async () => []),
}));

import { stageFix, publishStagedFix, approveFix } from '@/lib/fix-engine/engine';
import { applyAutopilot } from '@/lib/fix-engine/automation';

function seed(over: Partial<FixRow> = {}): string {
  const id = 'fix1';
  store.fixes.set(id, {
    id, userId: 'owner1', brandId: 'brand1', moduleKey: 'title-rewrite', channel: 'A',
    targetUrl: 'https://acme.test/p', status: 'approved', severity: 'medium', dedupeKey: 'k',
    summary: 's', detected: {}, generated: { title: 'New title' }, beforeSnapshot: null,
    afterSnapshot: null, shipResult: null, scoreBefore: null, scoreAfter: null, error: null,
    createdAt: 'now', updatedAt: 'now', ...over,
  });
  return id;
}

beforeEach(() => { store.fixes.clear(); store.connectorActive = true; store.events = []; store.resetCalls = []; store.failReset = false; vi.clearAllMocks(); });

describe('stageFix', () => {
  it('stages an approved, stageable fix as a draft (queues stage_content)', async () => {
    const id = seed();
    const fix = await stageFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('staged');
    expect((fix.shipResult as Record<string, unknown>).op).toBe('stage_content');
    const snap = fix.afterSnapshot as { patch?: { title?: string }; content?: string };
    expect(snap.patch?.title).toBe('New title');
    // `content` is the exact string both sides HMAC-sign over (cross-language
    // parity with the PHP plugin) — must equal the JSON of the patch.
    expect(snap.content).toBe(JSON.stringify(snap.patch));
    expect(store.resetCalls).toContain(id);
    expect(store.events).toContain('staged');
  });

  it('refuses when no Connector is active', async () => {
    store.connectorActive = false;
    const id = seed();
    await expect(stageFix(id, 'brand1', 'owner1')).rejects.toThrow(/Connector/);
    expect(store.fixes.get(id)!.status).toBe('approved'); // unchanged
  });

  it('refuses a module that cannot produce a content patch', async () => {
    const id = seed({ moduleKey: 'llms-txt', channel: 'B' });
    await expect(stageFix(id, 'brand1', 'owner1')).rejects.toThrow(/staged/i);
  });

  it('refuses from a non-approved status', async () => {
    const id = seed({ status: 'detected' });
    await expect(stageFix(id, 'brand1', 'owner1')).rejects.toThrow(/Cannot stage/);
  });
});

describe('publishStagedFix', () => {
  it('re-queues a staged fix for publish_content', async () => {
    const id = seed({ status: 'staged', afterSnapshot: { url: 'https://acme.test/p', patch: { url: 'https://acme.test/p', title: 'New title' } } });
    const fix = await publishStagedFix(id, 'brand1', 'owner1');
    expect((fix.shipResult as Record<string, unknown>).op).toBe('publish_content');
    expect(store.resetCalls).toContain(id);
    expect(store.events).toContain('publish.requested');
    expect(fix.status).toBe('staged'); // flips to shipped only on the connector ack
  });

  it('refuses to publish a fix that is not staged', async () => {
    const id = seed({ status: 'approved' });
    await expect(publishStagedFix(id, 'brand1', 'owner1')).rejects.toThrow(/staged/);
  });
});

describe('stageFix rollback and the approval gate', () => {
  it('stages straight from generated without an approval', async () => {
    const id = seed({ status: 'generated' });
    const fix = await stageFix(id, 'brand1', null);
    expect(fix.status).toBe('staged');
    expect(store.events).not.toContain('approved');
  });

  it('restores the previous status and fields when a stage write fails', async () => {
    const id = seed({ status: 'generated', shipResult: null, afterSnapshot: null, shipMode: 'live', previewUrl: null } as Partial<FixRow>);
    store.failReset = true;
    await expect(stageFix(id, 'brand1', null)).rejects.toThrow(/db down/);
    const row = store.fixes.get(id)!;
    expect(row.status).toBe('generated');
    expect(row.shipResult).toBeNull();
    expect(row.afterSnapshot).toBeNull();
    expect(row.shipMode).toBe('live');
    expect(store.events).not.toContain('staged');
  });

  it('refuses an approval with no human behind it', async () => {
    const id = seed({ status: 'generated' });
    await expect(approveFix(id, 'brand1', null)).rejects.toThrow(/needs a person/);
    expect(store.fixes.get(id)!.status).toBe('generated');
  });

  it('records who approved a fix', async () => {
    const id = seed({ status: 'generated' });
    await approveFix(id, 'brand1', 'owner1');
    expect(store.fixes.get(id)!.status).toBe('approved');
    expect(store.fixes.get(id)!.approvedBy).toBe('owner1');
  });
});

describe('autopilot against the real engine', () => {
  const auto = {
    brandId: 'brand1', scanEnabled: true, scanFrequency: 'weekly' as const, scanModules: [],
    autopilotGenerate: false, autopilotStage: true, lastScanAt: null, nextScanAt: null,
  };

  it('leaves an llms-txt fix generated: never approved, never served', async () => {
    const id = seed({ moduleKey: 'llms-txt', channel: 'B', status: 'generated', generated: { content: 'User-agent: *' } });
    const r = await applyAutopilot('brand1', auto);
    expect(r.staged).toBe(0);
    expect(store.fixes.get(id)!.status).toBe('generated');
    expect(store.events).not.toContain('approved');
  });

  it('stages a stageable fix as a draft without approving it', async () => {
    const id = seed({ status: 'generated' });
    const r = await applyAutopilot('brand1', auto);
    expect(r.staged).toBe(1);
    expect(store.fixes.get(id)!.status).toBe('staged');
    expect(store.events).not.toContain('approved');
  });

  it('without a Connector leaves fixes generated instead of approved', async () => {
    store.connectorActive = false;
    const id = seed({ status: 'generated' });
    await applyAutopilot('brand1', auto);
    expect(store.fixes.get(id)!.status).toBe('generated');
  });

  it('a failed stage during autopilot leaves the fix where it was', async () => {
    const id = seed({ status: 'generated' });
    store.failReset = true;
    const r = await applyAutopilot('brand1', auto);
    expect(r.staged).toBe(0);
    expect(store.fixes.get(id)!.status).toBe('generated');
  });
});
