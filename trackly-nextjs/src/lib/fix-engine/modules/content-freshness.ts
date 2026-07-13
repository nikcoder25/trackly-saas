/**
 * Module: Content freshness (Channel A).
 *
 * AI answer engines strongly prefer recently-updated sources (~76% of
 * ChatGPT's most-cited pages were updated within 30 days; 12+ months stale
 * roughly halves citation likelihood). This module:
 *
 * Detect: crawl the brand's pages and flag ones whose last-modified date
 *   (article meta → JSON-LD → HTTP header) is older than STALE_DAYS.
 *   Pages with NO detectable date are skipped — unknown is not stale.
 * Generate: a 40-60 word dated "freshness update" block grounded in the
 *   page's own facts (never invented).
 * Ship: append the block via the CMS adapter — which also bumps the CMS's
 *   modified date (WordPress sets post_modified on any update), refreshing
 *   the signal itself.
 * Recheck: confirm the update text is live.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { FRESHNESS_SYSTEM, freshnessUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  ContentPatch,
  DetectedIssue,
  FixContext,
  FixModule,
  GeneratedDraft,
  PreviewBlock,
  RecheckVerdict,
  ShipResult,
} from '../types';

export const STALE_DAYS = 180;
const VERY_STALE_DAYS = 365;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

/** The dated block we append; recheck looks for the update text itself. */
function updateBlockHtml(update: string): string {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return `<div class="lvx-fresh"><strong>Updated ${month}:</strong> ${update}</div>`;
}

export const contentFreshnessModule: FixModule = {
  key: 'content-freshness',
  title: 'Content freshness',
  description: 'Refresh stale pages — AI engines strongly prefer recently-updated sources.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      // Unknown date ≠ stale: only flag pages that positively report an old one.
      if (!page.lastModified) continue;
      const age = daysSince(page.lastModified);
      if (age < STALE_DAYS) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: age >= VERY_STALE_DAYS ? 'high' : 'medium',
        summary: `Not updated in ${age} days (${page.lastModified.slice(0, 10)})`,
        detected: {
          url, lastModified: page.lastModified, daysOld: age,
          title: page.title, pageSummary: page.text.slice(0, 2500),
        },
        before: { lastModified: page.lastModified },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; lastModified: string; title: string | null; pageSummary: string };
    const { data } = await generateJson<{ update: string; rationale: string }>({
      ctx,
      system: FRESHNESS_SYSTEM,
      user: freshnessUserPrompt({
        brand: ctx.brand, url: d.url, title: d.title,
        lastModified: d.lastModified, pageText: d.pageSummary || '',
      }),
      maxTokens: 500,
    });
    const update = data.update.trim();
    return { generated: { update, html: updateBlockHtml(update), rationale: data.rationale }, creditsUsed: 1 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const d = issue.detected as { daysOld?: number; lastModified?: string };
    return {
      kind: 'text-diff',
      label: 'Freshness update',
      before: `Last updated ${d.daysOld ?? '?'} days ago (${(d.lastModified ?? '').slice(0, 10)})`,
      after: String(draft.generated.update ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { update: draft.generated.update },
      error: result.ok ? undefined : (result.error ?? 'CMS write failed'),
    };
  },

  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    return { url: issue.targetUrl, bodyAppend: String(draft.generated.html) };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const want = String(draft.generated.update ?? '').replace(/\s+/g, ' ').slice(0, 60);
      const live = page.text.replace(/\s+/g, ' ');
      const verified = !!want && live.includes(want);
      return { verified, scoreAfter: verified ? 100 : null, note: verified ? 'Freshness update is live' : 'Update block not found on the page yet' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
