/**
 * Module: GEO page rewrite (Channel A).
 *
 * Detect: flag pages that are poorly structured for generative engines -
 * no quotable lede, weak/heading-less structure, or thin body.
 * Generate: LLM produces a quotable lede + question-style sections.
 * Ship: append the restructured GEO block to the page body via the CMS.
 * Recheck: re-crawl and confirm the new content + headings are live.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { GEO_REWRITE_SYSTEM, geoRewriteUserPrompt } from '../prompts';
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

const THIN_WORDS = 300;

interface GeoSection { heading: string; body: string }
interface GeoDraft { lede: string; sections: GeoSection[]; rationale: string }

function renderHtml(draft: GeoDraft): string {
  const parts = [`<p>${draft.lede}</p>`];
  for (const s of draft.sections) {
    parts.push(`<h2>${s.heading}</h2>`);
    parts.push(`<p>${s.body}</p>`);
  }
  return parts.join('\n');
}

export const geoPageRewriteModule: FixModule = {
  key: 'geo-page-rewrite',
  title: 'GEO page rewrite',
  description: 'Restructure content for how LLMs read, quote, and cite.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'pro',
  phase: 1,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 10);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      const h2count = page.headings.filter((h) => h.level === 2).length;
      const reasons: string[] = [];
      if (page.wordCount < THIN_WORDS) reasons.push('thin content');
      if (h2count < 2) reasons.push('weak heading structure');
      if (reasons.length === 0) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'medium',
        summary: `Not GEO-optimised: ${reasons.join(', ')}`,
        detected: {
          url,
          title: page.title,
          headings: page.headings.map((h) => h.text),
          pageText: page.text,
          wordCount: page.wordCount,
        },
        before: { wordCount: page.wordCount, h2count },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; headings: string[]; pageText: string; instruction?: string };
    let user = geoRewriteUserPrompt({
      brand: ctx.brand,
      url: d.url,
      title: d.title,
      headings: d.headings || [],
      pageText: d.pageText || '',
    });
    if (typeof d.instruction === 'string' && d.instruction.trim()) user += `\n\nUser preference (honor this): ${d.instruction.trim()}`;
    const { data } = await generateJson<GeoDraft>({
      ctx,
      system: GEO_REWRITE_SYSTEM,
      user,
      maxTokens: 2200,
    });
    const html = renderHtml(data);
    return { generated: { ...data, html }, creditsUsed: 2 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return {
      kind: 'code-block',
      label: 'GEO-optimised content (appended to page body)',
      language: 'html',
      addNote: 'This GEO-optimised answer section is appended to the page — not present today.',
      after: String(draft.generated.html ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { html: draft.generated.html },
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
      const lede = String((draft.generated as unknown as GeoDraft).lede || '').slice(0, 40);
      const verified = lede.length > 0 && page.text.includes(lede.slice(0, 30));
      const h2count = page.headings.filter((h) => h.level === 2).length;
      return {
        verified,
        scoreAfter: page.wordCount >= THIN_WORDS && h2count >= 2 ? 100 : 70,
        note: verified ? 'GEO content detected on live page' : 'Could not confirm content live yet',
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
