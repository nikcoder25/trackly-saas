/**
 * Module: Meta description rewrite (Channel A).
 *
 * Detect: flag pages with missing or sub-optimal-length meta descriptions.
 * Generate: LLM writes a 140-155 char description.
 * Ship: CMS adapter writes the SEO-plugin meta field.
 * Recheck: re-crawl and confirm.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { META_SYSTEM, metaUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue,
  FixContext,
  FixModule,
  GeneratedDraft,
  PreviewBlock,
  RecheckVerdict,
  ShipResult,
} from '../types';

const MIN = 110;
const MAX = 160;

export const metaRewriteModule: FixModule = {
  key: 'meta-rewrite',
  title: 'Meta description rewrite',
  description: 'Fix missing or low-CTR meta descriptions.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 1,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      const meta = page.metaDescription?.trim() ?? '';
      let problem: string | null = null;
      if (!meta) problem = 'Meta description is missing';
      else if (meta.length > MAX) problem = `Meta description is ${meta.length} chars (too long)`;
      else if (meta.length < MIN) problem = `Meta description is ${meta.length} chars (too short)`;
      if (!problem) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: !meta ? 'high' : 'low',
        summary: problem,
        detected: { url, currentMeta: meta, title: page.title, pageSummary: page.text.slice(0, 1500) },
        before: { description: meta },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; currentMeta: string | null; title: string | null; pageSummary: string };
    const { data } = await generateJson<{ description: string; rationale: string }>({
      ctx,
      system: META_SYSTEM,
      user: metaUserPrompt({
        brand: ctx.brand,
        url: d.url,
        currentMeta: d.currentMeta,
        title: d.title,
        pageSummary: d.pageSummary || '',
      }),
      maxTokens: 400,
    });
    return { generated: { description: data.description.trim(), rationale: data.rationale }, creditsUsed: 1 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return {
      kind: 'text-diff',
      label: 'Meta description',
      before: (issue.before as { description?: string })?.description ?? '',
      after: String(draft.generated.description ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateMetaDescription(cms.creds, { url: issue.targetUrl! }, String(draft.generated.description));
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { description: draft.generated.description },
      error: result.ok ? undefined : 'CMS write failed',
    };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const live = page.metaDescription?.trim() ?? '';
      const want = String(draft.generated.description).trim();
      return {
        verified: live === want,
        scoreAfter: live && live.length >= MIN && live.length <= MAX ? 100 : live ? 60 : 0,
        note: live === want ? 'Live meta matches' : `Live meta: "${live.slice(0, 80)}"`,
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },

  // Undo: restore the meta description that was live before we shipped.
  async revert(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const prev = (issue.before as { description?: string })?.description;
    if (prev == null) return { ok: false, detail: { reason: 'no_before_snapshot' }, error: 'No prior meta recorded to restore' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateMetaDescription(cms.creds, { url: issue.targetUrl! }, prev);
    return { ok: result.ok, detail: result.detail ?? {}, after: { description: prev }, error: result.ok ? undefined : 'CMS write failed' };
  },
};
