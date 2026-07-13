/**
 * Module: Title tag rewrite (Channel A).
 *
 * Detect: crawl the brand's pages; flag titles that are missing, too
 * long (>60), too short (<30), or duplicated across pages.
 * Generate: LLM rewrites to a 50-60 char SEO+GEO title.
 * Ship: write via the CMS adapter (WordPress reference).
 * Recheck: re-crawl and confirm the live <title> matches.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { TITLE_SYSTEM, titleUserPrompt } from '../prompts';
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

const MIN = 30;
const MAX = 60;

export const titleRewriteModule: FixModule = {
  key: 'title-rewrite',
  title: 'Title tag rewrite',
  description: 'Fix missing, too-long, or weak <title> tags.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 1,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website);
    const issues: DetectedIssue[] = [];
    const seenTitles = new Map<string, string>(); // title → first url

    for (const url of targets) {
      let page;
      try {
        page = await crawlPage(url, ctx.signal);
      } catch {
        continue; // unreachable page - skip, not a title issue
      }
      const title = page.title?.trim() ?? '';
      let problem: string | null = null;
      if (!title) problem = 'Title tag is missing';
      else if (title.length > MAX) problem = `Title is ${title.length} chars (too long)`;
      else if (title.length < MIN) problem = `Title is ${title.length} chars (too short)`;
      else if (seenTitles.has(title.toLowerCase())) problem = 'Duplicate title across pages';

      if (title) seenTitles.set(title.toLowerCase(), url);
      if (!problem) continue;

      issues.push({
        key: url,
        targetUrl: url,
        severity: !title ? 'high' : 'medium',
        summary: problem,
        detected: { url, currentTitle: title, length: title.length, h1: page.h1s[0] ?? null, pageSummary: page.text.slice(0, 1200) },
        before: { title },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; currentTitle: string | null; h1: string | null; pageSummary: string; instruction?: string };
    // Competitive context: what currently ranks for this page's primary
    // query, so the new title is written to beat the live SERP. Best-effort.
    let query: string | null = null;
    let competitors: { title: string; description: string }[] = [];
    try {
      const { getCompetitorContext } = await import('../serp');
      ({ query, competitors } = await getCompetitorContext(ctx, d.url, d.currentTitle, d.h1));
    } catch { /* generate without competitor context */ }
    let user = titleUserPrompt({
      brand: ctx.brand,
      url: d.url,
      currentTitle: d.currentTitle,
      h1: d.h1,
      pageSummary: d.pageSummary || '',
      query,
      competitors,
    });
    // A user-initiated request can add direction (e.g. "make it punchier").
    if (typeof d.instruction === 'string' && d.instruction.trim()) user += `\n\nUser preference (honor this): ${d.instruction.trim()}`;
    const { data } = await generateJson<{ title: string; rationale: string }>({
      ctx,
      system: TITLE_SYSTEM,
      user,
      maxTokens: 400,
    });
    return { generated: { title: data.title.trim(), rationale: data.rationale, serpQuery: query, serpCompared: competitors.length, serpCompetitors: competitors.slice(0, 5) }, creditsUsed: 1 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return {
      kind: 'text-diff',
      label: 'Title tag',
      before: (issue.before as { title?: string })?.title ?? '',
      after: String(draft.generated.title ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateTitle(cms.creds, { url: issue.targetUrl! }, String(draft.generated.title));
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { title: draft.generated.title },
      error: result.ok ? undefined : (result.error ?? 'CMS write failed'),
    };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const live = page.title?.trim() ?? '';
      const want = String(draft.generated.title).trim();
      const verified = live === want;
      const len = live.length;
      const scoreAfter = live && len >= MIN && len <= MAX ? 100 : live ? 60 : 0;
      return { verified, scoreAfter, note: verified ? 'Live title matches' : `Live title: "${live}"` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },

  // Stageable: the title change maps cleanly to a draft-revision patch.
  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    return { url: issue.targetUrl, title: String(draft.generated.title) };
  },

  // Undo: restore the title that was live before we shipped.
  async revert(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const prev = (issue.before as { title?: string })?.title;
    if (prev == null) return { ok: false, detail: { reason: 'no_before_snapshot' }, error: 'No prior title recorded to restore' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateTitle(cms.creds, { url: issue.targetUrl! }, prev);
    return { ok: result.ok, detail: result.detail ?? {}, after: { title: prev }, error: result.ok ? undefined : (result.error ?? 'CMS write failed') };
  },
};
