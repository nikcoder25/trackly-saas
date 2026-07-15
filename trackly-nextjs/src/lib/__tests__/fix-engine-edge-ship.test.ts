/**
 * Fix Engine - edge-fronted ship path.
 *
 * On a custom / edge-fronted CMS (peptidesolver.com is cms_type 'custom' with a
 * Cloudflare Worker in front), an edge-serveable Channel-A fix is delivered by
 * the Worker rewriting the page in transit — the shipped row IS the per-path
 * override (getEdgeSeoOverrides). There is no origin write to make, and the
 * site's endpoint usually can't make one (a static/custom endpoint 422s on
 * update_body / inject_schema). So shipFix must publish to the edge (mark
 * shipped, skip the CMS write) for these modules, and the shipped fix must then
 * appear in the served per-path override. Real CMS APIs (WordPress) must still
 * take the origin CMS write — no regression.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixRow } from '@/lib/fix-engine/types';

const store = vi.hoisted(() => ({
  fixes: new Map<string, Record<string, unknown>>(),
  afterCalls: [] as Array<() => unknown>,
  cmsType: 'custom' as string | null,
  cmsActive: true,
  workerRouted: true,
  shipCalls: [] as string[], // module keys whose real CMS-write ship() ran
}));

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { store.afterCalls.push(fn); } }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM brands')) return { rows: [{ id: 'brand1', user_id: 'owner1', data: { name: 'Acme', website: 'https://acme.test' } }] };
      if (sql.includes('api_keys')) return { rows: [{ api_keys: {} }] };
      return { rows: [] };
    }),
  },
}));

// Real buildEdgeSeoOverrides / isEdgeServeableModule (pure); only the
// DB-touching helpers shipFix calls are stubbed against an in-memory store.
vi.mock('@/lib/fix-engine/schema', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    ensureFixEngineSchema: vi.fn(async () => {}),
    getFix: vi.fn(async (id: string) => { const r = store.fixes.get(id); return r ? { ...r } : null; }),
    updateFix: vi.fn(async (id: string, patch: Record<string, unknown>) => { const r = store.fixes.get(id); if (r) Object.assign(r, patch); }),
    claimFixTransition: vi.fn(async (id: string, from: string, to: string) => {
      const r = store.fixes.get(id);
      if (r && r.status === from) { r.status = to; return true; }
      return false;
    }),
    logFixEvent: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_brandId: string, provider: string) => {
    if (provider !== 'cms' || store.cmsType == null) return null;
    return { provider: 'cms', cmsType: store.cmsType, status: store.cmsActive ? 'active' : 'revoked', siteUrl: 'https://acme.test', creds: {} };
  }),
}));

// probeEdgeMarker controls whether the Worker is "live" on the page; the rest of
// cms/edge (edgeAdapter) stays real.
vi.mock('@/lib/fix-engine/cms/edge', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  probeEdgeMarker: vi.fn(async () => ({ routed: store.workerRouted, status: 200 })),
}));

vi.mock('@/lib/fix-engine/ai-visibility', () => ({ getBrandAiVisibility: vi.fn(async () => null) }));
vi.mock('@/lib/fix-engine/page-metrics', () => ({ getPageMetrics: vi.fn(async () => new Map()), normUrl: (u: string) => u }));

// Fake modules keyed by the real module key so isEdgeServeableModule (real)
// classifies them correctly. ship() records that the CMS-write path ran, so a
// test can assert it did NOT for the edge fast-path.
vi.mock('@/lib/fix-engine/registry', () => ({
  getModule: (k: string) => ({
    key: k,
    channel: 'A',
    ship: vi.fn(async () => { store.shipCalls.push(k); return { ok: true, detail: { wrote: true }, after: { via: 'cms' } }; }),
    recheck: vi.fn(async () => ({ verified: true, scoreAfter: 100 })),
  }),
  listModules: () => [],
  generateCost: () => 1,
}));

import { shipFix } from '@/lib/fix-engine/engine';
import { buildEdgeSeoOverrides, isEdgeServeableModule } from '@/lib/fix-engine/schema';
import { probeEdgeMarker } from '@/lib/fix-engine/cms/edge';

// One representative shipped-fix generated payload per edge-serveable Channel-A
// module, with the override field the Worker serves it under.
const EDGE_MODULES: Array<{ key: string; generated: Record<string, unknown>; overrideField: keyof import('@/lib/fix-engine/schema').EdgeSeoOverride }> = [
  { key: 'title-rewrite', generated: { title: 'New Title' }, overrideField: 'title' },
  { key: 'meta-rewrite', generated: { description: 'New meta' }, overrideField: 'description' },
  { key: 'canonical-fix', generated: { canonical: 'https://acme.test/p' }, overrideField: 'canonical' },
  { key: 'schema-markup', generated: { schema: '{"@type":"Organization"}' }, overrideField: 'jsonLd' },
  { key: 'noindex-removal', generated: { action: 'set-indexable' }, overrideField: 'indexable' },
  { key: 'internal-linking', generated: { links: [{ anchor: 'Guide', url: 'https://acme.test/guide' }] }, overrideField: 'links' },
  { key: 'external-citations', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x' }] }, overrideField: 'citations' },
  { key: 'citable-passages', generated: { tldr: 'Acme makes peptides.', passages: ['Founded 2019.'] }, overrideField: 'citable' },
  { key: 'faq-schema', generated: { faqs: [{ question: 'Is it safe?', answer: 'Yes.' }] }, overrideField: 'faq' },
];

function seed(moduleKey: string, generated: Record<string, unknown>, over: Partial<FixRow> = {}): string {
  const id = 'fix1';
  store.fixes.set(id, {
    id, userId: 'owner1', brandId: 'brand1', moduleKey, channel: 'A',
    targetUrl: 'https://acme.test/about', status: 'approved', severity: 'medium',
    dedupeKey: 'https://acme.test/about', summary: 's', detected: {},
    generated, beforeSnapshot: null, afterSnapshot: null, shipResult: null,
    scoreBefore: null, scoreAfter: null, error: null, createdAt: 'now', updatedAt: 'now', ...over,
  });
  return id;
}

beforeEach(() => {
  store.fixes.clear();
  store.afterCalls = [];
  store.cmsType = 'custom';
  store.cmsActive = true;
  store.workerRouted = true;
  store.shipCalls = [];
  vi.clearAllMocks();
});

describe('edge-fronted ship (custom CMS + Worker live)', () => {
  it('every edge-serveable module is correctly classified', () => {
    for (const m of EDGE_MODULES) expect(isEdgeServeableModule(m.key)).toBe(true);
    // A body-replacement module is NOT edge-serveable (append-only Worker).
    expect(isEdgeServeableModule('content-freshness')).toBe(false);
    expect(isEdgeServeableModule('passage-rewrite')).toBe(false);
  });

  it('ships each edge module WITHOUT a CMS write and it appears in the served override', async () => {
    for (const m of EDGE_MODULES) {
      store.fixes.clear();
      store.shipCalls = [];
      const id = seed(m.key, m.generated);

      const fix = await shipFix(id, 'brand1', 'owner1');

      // Shipped via the edge — no origin CMS write ran.
      expect(fix.status).toBe('shipped');
      expect((fix.shipResult as Record<string, unknown>).delivery).toBe('edge');
      expect(store.shipCalls).toEqual([]); // module.ship() (CMS write) never called

      // The shipped row builds a per-path override the Worker serves.
      const over = buildEdgeSeoOverrides([{ moduleKey: m.key, targetUrl: 'https://acme.test/about', generated: m.generated }]);
      expect(over['/about']).toBeDefined();
      expect(over['/about'][m.overrideField]).toBeDefined();
    }
  });

  it('probes the Worker marker before publishing (truthfulness)', async () => {
    const id = seed('schema-markup', { schema: '{"@type":"Organization"}' });
    await shipFix(id, 'brand1', 'owner1');
    expect(probeEdgeMarker).toHaveBeenCalledWith('https://acme.test/about');
  });

  it('schedules the Channel-A auto-recheck after an edge publish', async () => {
    const id = seed('internal-linking', { links: [{ anchor: 'Guide', url: 'https://acme.test/guide' }] });
    await shipFix(id, 'brand1', 'owner1');
    expect(store.afterCalls).toHaveLength(1);
  });
});

describe('fallbacks preserve the CMS-write path', () => {
  it('a WordPress-API site still writes to the CMS (no edge fast-path, no probe)', async () => {
    store.cmsType = 'wordpress';
    const id = seed('schema-markup', { schema: '{"@type":"Organization"}' });
    const fix = await shipFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('shipped');
    expect(store.shipCalls).toEqual(['schema-markup']); // CMS write ran
    expect((fix.shipResult as Record<string, unknown>).wrote).toBe(true);
    expect(probeEdgeMarker).not.toHaveBeenCalled();
  });

  it('a custom site whose Worker is NOT live falls through to the CMS write', async () => {
    store.cmsType = 'custom';
    store.workerRouted = false;
    const id = seed('meta-rewrite', { description: 'D' });
    const fix = await shipFix(id, 'brand1', 'owner1');
    expect(probeEdgeMarker).toHaveBeenCalled(); // it checked…
    expect(store.shipCalls).toEqual(['meta-rewrite']); // …then fell back to the CMS write
    expect(fix.status).toBe('shipped');
  });

  it('a body-replacement module on a custom site is not force-published to the edge', async () => {
    // content-freshness (updateBody replace) isn't edge-serveable — the
    // append-only Worker can't rewrite existing body — so it takes the normal
    // CMS-write path even on an edge-fronted site.
    store.cmsType = 'custom';
    const id = seed('content-freshness', { html: '<p>fresh</p>' });
    await shipFix(id, 'brand1', 'owner1');
    expect(store.shipCalls).toEqual(['content-freshness']);
    expect(probeEdgeMarker).not.toHaveBeenCalled();
  });
});
