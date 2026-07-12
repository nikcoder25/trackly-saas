/**
 * Module: External citations (crawl, Channel A).
 *
 * Strengthens E-E-A-T + GEO by citing authoritative, official sources for
 * a page's factual claims. The critical guardrail: every LLM-suggested
 * URL is VERIFIED to actually resolve (safeFetch) before it's offered or
 * shipped, so hallucinated links never reach the live site.
 *
 * Detect: substantial content pages with no/low authoritative outbound
 *   links.
 * Generate: LLM proposes citations → each URL is verified → only live
 *   ones are kept.
 * Ship: append a "Sources" block of verified links to the page body.
 * Recheck: re-crawl and confirm the links are present.
 */

import { safeFetch } from '@/lib/safe-fetch';
import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { CITATIONS_SYSTEM, citationsUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import { logger } from '@/lib/logger';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MIN_WORDS = 350;
const MAX_PAGES = 8;

interface Citation { claim: string; anchor: string; url: string; source: string }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function sameHost(a: string, b: string | undefined): boolean {
  if (!b) return false;
  try {
    const hb = new URL(b.startsWith('http') ? b : `https://${b}`).host.replace(/^www\./, '');
    return new URL(a).host.replace(/^www\./, '') === hb;
  } catch { return false; }
}

/** Verify a URL actually resolves (<400) so we never ship invented links. */
async function urlResolves(url: string): Promise<boolean> {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const res = await safeFetch(url, { timeoutMs: 8000, maxBytes: 256 * 1024 });
    return res.status > 0 && res.status < 400;
  } catch {
    return false;
  }
}

function renderHtml(citations: Citation[]): string {
  const items = citations
    .map((c) => `<li><a href="${escapeAttr(c.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(c.anchor)}</a> — ${escapeHtml(c.source)}</li>`)
    .join('\n');
  return `<section class="sources"><h2>Sources</h2>\n<ul>\n${items}\n</ul>\n</section>`;
}

export const externalCitationsModule: FixModule = {
  key: 'external-citations',
  title: 'External citations',
  description: 'Cite authoritative official sources for your claims (verified, never invented).',
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
      if (page.externalLinkCount >= 2) continue; // already cites outward
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'low',
        summary: `Content page with no authoritative external citations`,
        detected: { url, title: page.title, pageText: page.text },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; pageText: string };
    const { data } = await generateJson<{ citations: Citation[]; rationale: string }>({
      ctx,
      system: CITATIONS_SYSTEM,
      user: citationsUserPrompt({ brand: ctx.brand, url: d.url, title: d.title, pageText: d.pageText || '' }),
      maxTokens: 900,
    });
    const proposed = (data.citations || []).filter((c) => c.url && c.anchor && !sameHost(c.url, ctx.brand.website));

    // Verify each URL resolves; drop invented / dead links.
    const verified: Citation[] = [];
    for (const c of proposed) {
      if (await urlResolves(c.url)) verified.push(c);
      else logger.info('fix_engine.citation_dropped_unresolvable', { url: c.url });
    }
    return {
      generated: { citations: verified, dropped: proposed.length - verified.length, rationale: data.rationale, html: verified.length ? renderHtml(verified) : '' },
      creditsUsed: 1,
    };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const cites = (draft.generated.citations as Citation[]) ?? [];
    const dropped = Number(draft.generated.dropped || 0);
    const body = cites.map((c) => `• ${c.anchor} → ${c.url}\n  supports: ${c.claim}`).join('\n\n')
      + (dropped ? `\n\n(${dropped} suggested link(s) dropped as unverifiable)` : '');
    return { kind: 'key-values', label: `Verified citations (${cites.length})`, after: body || 'No verifiable citations found.' };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cites = (draft.generated.citations as Citation[]) ?? [];
    if (cites.length === 0) return { ok: false, detail: { reason: 'no_verified_citations' }, error: 'No verified citations to ship' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return { ok: result.ok, detail: result.detail ?? {}, after: { citations: cites }, error: result.ok ? undefined : 'CMS write failed' };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const cites = (draft.generated.citations as Citation[]) ?? [];
      const present = cites.filter((c) => page.text.includes(c.anchor)).length;
      const verified = cites.length > 0 && present >= Math.ceil(cites.length / 2);
      return { verified, scoreAfter: cites.length ? Math.round((present / cites.length) * 100) : 0, note: `${present}/${cites.length} citations detected on live page` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
