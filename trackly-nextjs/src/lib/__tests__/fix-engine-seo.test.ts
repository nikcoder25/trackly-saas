/**
 * Fix Engine - SEO brain grounding + external-citations (with URL
 * verification so hallucinated links are never shipped).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Per-brand brain reads/writes go through pool.query — mock it.
const dbState = vi.hoisted(() => ({ brandBrain: null as string | null }));
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (/SELECT content FROM fix_seo_brains/i.test(sql)) {
        return { rows: dbState.brandBrain ? [{ content: dbState.brandBrain }] : [] };
      }
      return { rows: [] };
    }),
  },
}));

// ── SEO brain ──
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getSeoBrain, getBaseSeoBrain, getSeoBrainStatus, DEFAULT_SEO_BRAIN, MATT_DIGGITY_SEO_BRAIN,
  SEO_BRAIN_PRESETS, resetSeoBrainCache,
} from '@/lib/fix-engine/seo-brain';

describe('seo-brain', () => {
  beforeEach(() => {
    delete process.env.FIX_ENGINE_SEO_BRAIN;
    delete process.env.FIX_ENGINE_SEO_BRAIN_PATH;
    dbState.brandBrain = null;
    resetSeoBrainCache();
  });

  it('base returns the default playbook when no override is set', () => {
    expect(getBaseSeoBrain()).toBe(DEFAULT_SEO_BRAIN);
    expect(getBaseSeoBrain()).toMatch(/E-E-A-T/);
  });
  it('base honours an env override (e.g. a Growth Atlas brain)', () => {
    process.env.FIX_ENGINE_SEO_BRAIN = 'MY CUSTOM PLAYBOOK';
    expect(getBaseSeoBrain()).toBe('MY CUSTOM PLAYBOOK');
  });
  it('base loads a Growth Atlas brain from a repo file (drop-in path)', () => {
    const file = path.join(os.tmpdir(), `ga-brain-${process.pid}.md`);
    fs.writeFileSync(file, 'GROWTH ATLAS SEO BRAIN — custom rules');
    process.env.FIX_ENGINE_SEO_BRAIN_PATH = file;
    resetSeoBrainCache();
    expect(getBaseSeoBrain()).toBe('GROWTH ATLAS SEO BRAIN — custom rules');
    fs.unlinkSync(file);
  });

  it('per-brand DB brain wins over the base for active generation', async () => {
    dbState.brandBrain = 'PER-BRAND USER BRAIN';
    expect(await getSeoBrain('brand1')).toBe('PER-BRAND USER BRAIN');
  });
  it('falls back to base when the brand has no custom brain', async () => {
    dbState.brandBrain = null;
    resetSeoBrainCache();
    expect(await getSeoBrain('brand2')).toBe(DEFAULT_SEO_BRAIN);
  });
  it('status reports custom vs default', async () => {
    dbState.brandBrain = 'X'; resetSeoBrainCache();
    expect((await getSeoBrainStatus('b')).isCustom).toBe(true);
    dbState.brandBrain = null; resetSeoBrainCache();
    expect((await getSeoBrainStatus('b')).isCustom).toBe(false);
  });
  it('ships a Matt Diggity preset', () => {
    const matt = SEO_BRAIN_PRESETS.find((p) => p.key === 'matt-diggity');
    expect(matt?.content).toBe(MATT_DIGGITY_SEO_BRAIN);
    expect(MATT_DIGGITY_SEO_BRAIN).toMatch(/answer capsule/i);
  });
});

// ── external-citations ──
const state = vi.hoisted(() => ({
  targets: [] as string[],
  pages: new Map<string, any>(),
  resolvable: new Set<string>(),
}));

vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(async (url: string) => ({
    status: state.resolvable.has(url) ? 200 : 404,
    ok: state.resolvable.has(url),
    text: async () => '',
    headers: { get: () => null },
  })),
  SSRFError: class extends Error {},
}));
vi.mock('@/lib/fix-engine/crawl', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    resolveCrawlTargets: vi.fn(async () => state.targets),
    crawlPage: vi.fn(async (url: string) => {
      const p = state.pages.get(url);
      if (!p) throw new Error('unreachable');
      return { url, status: 200, title: null, metaDescription: null, h1s: [], headings: [], text: '', jsonLd: [], wordCount: 0, hasFaqSchema: false, metaRobots: null, xRobotsTag: null, hasOgTags: false, externalLinkCount: 0, ...p };
    }),
  };
});
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: { citations: [
    { claim: 'c1', anchor: 'Official docs', url: 'https://good.example/doc', source: 'Example' },
    { claim: 'c2', anchor: 'Invented', url: 'https://hallucinated.example/nope', source: 'Nope' },
  ], rationale: 'r' }, platform: 'Claude', model: 'x' })),
  generateContent: vi.fn(async () => ({ text: '{}', platform: 'Claude', model: 'x' })),
}));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  resolveCmsForBrand: vi.fn(async () => ({ adapter: { updateBody: vi.fn(async () => ({ ok: true, detail: {} })) }, creds: {}, siteUrl: 'https://acme.test' })),
}));

import { externalCitationsModule } from '@/lib/fix-engine/modules/external-citations';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;

beforeEach(() => { state.targets = []; state.pages.clear(); state.resolvable = new Set(); vi.clearAllMocks(); });

describe('external-citations', () => {
  it('flags substantial pages with no outbound citations, skips well-cited ones', async () => {
    state.targets = ['https://acme.test/guide', 'https://acme.test/cited', 'https://acme.test/thin'];
    state.pages.set('https://acme.test/guide', { wordCount: 600, externalLinkCount: 0 });
    state.pages.set('https://acme.test/cited', { wordCount: 600, externalLinkCount: 3 });
    state.pages.set('https://acme.test/thin', { wordCount: 100, externalLinkCount: 0 });
    const issues = await externalCitationsModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/guide']);
  });

  it('keeps only URLs that resolve and drops invented ones', async () => {
    state.resolvable = new Set(['https://good.example/doc']); // the hallucinated one 404s
    const issue = { key: 'k', targetUrl: 'https://acme.test/guide', severity: 'low' as const, summary: '', detected: { url: 'https://acme.test/guide', title: 't', pageText: 'x' } };
    const draft = await externalCitationsModule.generate(issue, ctx);
    const cites = draft.generated.citations as any[];
    expect(cites).toHaveLength(1);
    expect(cites[0].url).toBe('https://good.example/doc');
    expect(draft.generated.dropped).toBe(1);
  });

  it('refuses to ship when no citations verified', async () => {
    state.resolvable = new Set(); // nothing resolves
    const issue = { key: 'k', targetUrl: 'https://acme.test/guide', severity: 'low' as const, summary: '', detected: { url: 'https://acme.test/guide', title: 't', pageText: 'x' } };
    const draft = await externalCitationsModule.generate(issue, ctx);
    const res = await externalCitationsModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(false);
  });
});
