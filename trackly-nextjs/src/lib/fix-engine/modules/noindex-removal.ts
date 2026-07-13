/**
 * Module: Noindex removal (crawl, Channel A).
 *
 * Detect: crawl pages; flag ones serving a `noindex` (meta robots or
 *   X-Robots-Tag) that should be indexable. The homepage and primary
 *   pages with noindex are almost always accidental.
 * Generate: deterministic — no content, just the intent to make it
 *   indexable. No LLM, no credit cost.
 * Ship: clear the SEO plugin's per-post noindex via the CMS adapter.
 * Recheck: re-crawl and confirm the noindex is gone.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

function hasNoindex(metaRobots: string | null, xRobots: string | null): boolean {
  return (metaRobots?.includes('noindex') ?? false) || (xRobots?.includes('noindex') ?? false);
}

export const noindexRemovalModule: FixModule = {
  key: 'noindex-removal',
  title: 'Noindex removal',
  description: 'Strip accidental noindex on pages that should rank.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 20);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      if (!hasNoindex(page.metaRobots, page.xRobotsTag)) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'critical', // a noindex on a rankable page is severe
        summary: `Page is set to noindex (${page.metaRobots || page.xRobotsTag})`,
        detected: { url, metaRobots: page.metaRobots, xRobotsTag: page.xRobotsTag },
        before: { metaRobots: page.metaRobots, xRobotsTag: page.xRobotsTag },
      });
    }
    return issues;
  },

  // Deterministic: the fix is "make indexable"; no model call.
  async generate(): Promise<GeneratedDraft> {
    return { generated: { action: 'set-indexable' }, creditsUsed: 0 };
  },

  preview(issue: DetectedIssue): PreviewBlock {
    const b = issue.before as { metaRobots?: string | null };
    return { kind: 'text-diff', label: 'Robots directive', before: b?.metaRobots || 'noindex', after: 'index, follow' };
  },

  async ship(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.setIndexable(cms.creds, { url: issue.targetUrl! });
    return { ok: result.ok, detail: result.detail ?? {}, after: { indexable: true }, error: result.ok ? undefined : (result.error ?? 'CMS write failed') };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const stillBlocked = hasNoindex(page.metaRobots, page.xRobotsTag);
      return { verified: !stillBlocked, scoreAfter: stillBlocked ? 0 : 100, note: stillBlocked ? 'Still noindex (may be theme-hardcoded)' : 'Page is now indexable' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
