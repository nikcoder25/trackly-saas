/**
 * Module: Indexing repair (GSC URL Inspection, Channel A).
 *
 * Scope: the content/quality cause of non-indexing — "Crawled/Discovered -
 * currently not indexed" where indexing is otherwise allowed (not blocked
 * by robots or a noindex tag; those are handled by dedicated Phase-3
 * modules). The fix is to add genuine depth so the page earns indexing.
 *
 * Detect: inspect crawl-target URLs via GSC; flag content-cause non-indexed.
 * Generate: LLM expands the page with useful sections.
 * Ship: append the new sections to the page body via the CMS.
 * Recheck: re-inspect and confirm the page is now indexed.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { CONTENT_EXPAND_SYSTEM, contentExpandUserPrompt } from '../prompts';
import { getValidAccessToken, inspectUrl, parseInspection } from '../gsc';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MAX_INSPECT = 15; // URL Inspection has per-day quota; keep it modest

function isContentCauseNotIndexed(s: { verdict: string | null; coverageState: string | null; robotsTxtState: string | null; indexingState: string | null }): boolean {
  const cov = (s.coverageState || '').toLowerCase();
  const notIndexed = cov.includes('not indexed') || cov.includes('discovered');
  const blockedByRobots = (s.robotsTxtState || '').toUpperCase() === 'DISALLOWED';
  const blockedByMeta = (s.indexingState || '').toUpperCase().includes('BLOCKED');
  // Only the content cause: not indexed, but crawling/indexing is allowed.
  return notIndexed && !blockedByRobots && !blockedByMeta;
}

interface ExpandSection { heading: string; body: string }

export const indexingRepairModule: FixModule = {
  key: 'indexing-repair',
  title: 'Indexing repair',
  description: 'Fix "crawled — currently not indexed" pages by adding genuine depth.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const targets = (await resolveCrawlTargets(ctx.brand.website, MAX_INSPECT));
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let status;
      try {
        const raw = await inspectUrl({ accessToken: token.accessToken, siteUrl: token.siteUrl, inspectionUrl: url });
        status = parseInspection(raw);
      } catch { continue; }
      if (!isContentCauseNotIndexed(status)) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'high',
        summary: `Not indexed: ${status.coverageState || 'crawled, not indexed'}`,
        detected: { url, coverageState: status.coverageState },
        before: { coverageState: status.coverageState },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string };
    let title: string | null = null;
    let pageText = '';
    try { const p = await crawlPage(d.url, ctx.signal); title = p.title; pageText = p.text; } catch { /* expand from URL alone */ }
    const { data } = await generateJson<{ sections: ExpandSection[]; rationale: string }>({
      ctx,
      system: CONTENT_EXPAND_SYSTEM,
      user: contentExpandUserPrompt({ brand: ctx.brand, url: d.url, title, pageText }),
      maxTokens: 2000,
    });
    const sections = (data.sections || []).filter((s) => s.heading && s.body);
    const html = sections.map((s) => `<h2>${s.heading}</h2>\n<p>${s.body}</p>`).join('\n');
    return { generated: { sections, rationale: data.rationale, html }, creditsUsed: 2 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return { kind: 'code-block', label: 'Content expansion (appended to page)', language: 'html', addNote: 'The page is too thin to index — this depth is appended to earn indexing.', after: String(draft.generated.html ?? '') };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return { ok: result.ok, detail: result.detail ?? {}, after: { html: draft.generated.html }, error: result.ok ? undefined : (result.error ?? 'CMS write failed') };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    try {
      const raw = await inspectUrl({ accessToken: token.accessToken, siteUrl: token.siteUrl, inspectionUrl: issue.targetUrl! });
      const status = parseInspection(raw);
      const indexed = (status.coverageState || '').toLowerCase().includes('indexed') && !(status.coverageState || '').toLowerCase().includes('not indexed');
      return { verified: indexed, scoreAfter: indexed ? 100 : 0, note: `Coverage: ${status.coverageState || 'unknown'} (re-indexing can take days)` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
