/**
 * Fix Engine - targeted passage-rewrite tests (in-place edit).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({ url: 'u', status: 200, title: 't', metaDescription: null, h1s: [], headings: [], text: 'the rewritten concise passage about CRMs', jsonLd: [], wordCount: 6, hasFaqSchema: false, metaRobots: null, xRobotsTag: null, hasOgTags: false })),
}));
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: { rewritten: 'the rewritten concise passage about CRMs', rationale: 'tighter' }, platform: 'Claude', model: 'x' })),
}));

const cmsState = vi.hoisted(() => ({ result: { ok: true, found: true, detail: {} } as any }));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  resolveCmsForBrand: vi.fn(async () => ({ adapter: { replaceInBody: vi.fn(async () => cmsState.result) }, creds: {}, siteUrl: 'https://acme.test' })),
}));

import { passageRewriteModule } from '@/lib/fix-engine/modules/passage-rewrite';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;
const issue = {
  key: 'k', targetUrl: 'https://acme.test/p', severity: 'low' as const, summary: '',
  detected: { url: 'https://acme.test/p', passage: 'the old wordy passage about CRMs', instruction: 'make it concise' },
  before: { passage: 'the old wordy passage about CRMs' },
};

beforeEach(() => { cmsState.result = { ok: true, found: true, detail: {} }; vi.clearAllMocks(); });

describe('passage-rewrite', () => {
  it('is manual-only (never surfaced by a scan)', async () => {
    expect(await passageRewriteModule.detect()).toEqual([]);
  });

  it('generates a replacement and previews a before/after diff', async () => {
    const draft = await passageRewriteModule.generate(issue, ctx);
    expect(draft.generated.rewritten).toContain('concise');
    const preview = passageRewriteModule.preview(issue, draft);
    expect(preview.kind).toBe('text-diff');
    expect(preview.before).toBe('the old wordy passage about CRMs');
  });

  it('ships via in-place replaceInBody', async () => {
    const draft = await passageRewriteModule.generate(issue, ctx);
    const res = await passageRewriteModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
  });

  it('reports a clear error when the passage is not found in the body', async () => {
    cmsState.result = { ok: false, found: false, detail: { reason: 'passage_not_found_in_body' } };
    const draft = await passageRewriteModule.generate(issue, ctx);
    const res = await passageRewriteModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it('verifies the rewrite is live on recheck', async () => {
    const draft = await passageRewriteModule.generate(issue, ctx);
    const verdict = await passageRewriteModule.recheck(issue, draft, ctx);
    expect(verdict.verified).toBe(true);
  });
});
