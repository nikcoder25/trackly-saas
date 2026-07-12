/**
 * Module: Citable passage blocks (crawl, Channel A).
 *
 * Detect: substantial content pages that lack a quotable answer block.
 * Generate: a TL;DR + 2-4 fact-dense, standalone passages an LLM can quote.
 * Ship: append a "Key facts" citable block to the page body.
 * Recheck: re-crawl and confirm the block is present.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { CITABLE_SYSTEM, citableUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  ContentPatch, DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MIN_WORDS = 400;
const MAX_PAGES = 8;
const MARKER = 'Key facts';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderHtml(tldr: string, passages: string[]): string {
  const items = passages.map((p) => `<li>${escapeHtml(p)}</li>`).join('\n');
  return `<section class="key-facts"><h2>${MARKER}</h2>\n<p><strong>${escapeHtml(tldr)}</strong></p>\n<ul>\n${items}\n</ul>\n</section>`;
}

export const citablePassagesModule: FixModule = {
  key: 'citable-passages',
  title: 'Citable passage blocks',
  description: 'Add quotable, fact-dense answer chunks LLMs can cite.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'pro',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 20);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      if (issues.length >= MAX_PAGES) break;
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      if (page.wordCount < MIN_WORDS) continue;
      // Skip pages that already have a citable "Key facts" block.
      if (page.text.includes(MARKER)) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'low',
        summary: 'No citable answer block on this content page',
        detected: { url, title: page.title, pageText: page.text },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; pageText: string };
    const { data } = await generateJson<{ tldr: string; passages: string[]; rationale: string }>({
      ctx,
      system: CITABLE_SYSTEM,
      user: citableUserPrompt({ brand: ctx.brand, url: d.url, title: d.title, pageText: d.pageText || '' }),
      maxTokens: 1200,
    });
    const passages = (data.passages || []).filter(Boolean);
    return { generated: { tldr: data.tldr, passages, rationale: data.rationale, html: renderHtml(data.tldr, passages) }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as { tldr?: string; passages?: string[] };
    return {
      kind: 'key-values',
      label: 'Citable passages',
      after: `TL;DR: ${g.tldr ?? ''}\n\n${(g.passages || []).map((p) => `• ${p}`).join('\n\n')}`,
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return { ok: result.ok, detail: result.detail ?? {}, after: { tldr: draft.generated.tldr }, error: result.ok ? undefined : 'CMS write failed' };
  },

  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    return { url: issue.targetUrl, bodyAppend: String(draft.generated.html) };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const ok = page.text.includes(MARKER);
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? 'Key facts block is live' : 'Block not detected yet' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
