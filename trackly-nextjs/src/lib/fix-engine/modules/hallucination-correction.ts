/**
 * Module: Hallucination correction package (Channel A).
 *
 * Detection source is the repo's existing accuracy monitor: the
 * fact-checker already finds false claims AI assistants make about the
 * brand and stores them in `accuracy_issues`. This module turns each open
 * issue into a published correction passage that establishes the correct
 * fact as ground truth so models stop repeating the falsehood.
 *
 * Detect: read open accuracy_issues (one per distinct fact).
 * Generate: LLM writes a clear, citable correction passage.
 * Ship: append the correction to the homepage via the CMS adapter.
 * Recheck: confirm the passage is live (whether models stop hallucinating
 *   is tracked over time by the accuracy monitor itself).
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { HALLUCINATION_SYSTEM, hallucinationUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const SEV_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function homepageOf(website: string | undefined): string | null {
  if (!website) return null;
  try { return new URL(website.startsWith('http') ? website : `https://${website}`).origin + '/'; }
  catch { return null; }
}

export const hallucinationCorrectionModule: FixModule = {
  key: 'hallucination-correction',
  title: 'Hallucination correction',
  description: 'Detect false AI claims (via the accuracy monitor) and publish corrections.',
  channel: 'A',
  trigger: 'manual',
  minPlan: 'pro',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    let rows: Array<{ fact_key: string; expected: string; found: string; severity: string; explanation: string | null }> = [];
    try {
      const res = await ctx.pool.query(
        `SELECT fact_key, expected, found, severity, explanation
           FROM accuracy_issues
          WHERE brand_id = $1 AND fixed = FALSE
          ORDER BY date DESC NULLS LAST
          LIMIT 200`,
        [ctx.brand.id],
      );
      rows = res.rows as typeof rows;
    } catch {
      // accuracy_issues may not exist for brands that never ran the monitor.
      return [];
    }

    // One fix per distinct fact_key, keeping the worst-severity instance.
    const best = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      if (!r.fact_key || !r.expected) continue;
      const prev = best.get(r.fact_key);
      if (!prev || (SEV_RANK[r.severity] ?? 0) > (SEV_RANK[prev.severity] ?? 0)) best.set(r.fact_key, r);
    }

    const home = homepageOf(ctx.brand.website);
    const issues: DetectedIssue[] = [];
    for (const [factKey, r] of best) {
      issues.push({
        key: `fact:${factKey}`,
        targetUrl: home,
        severity: (['critical', 'high', 'medium', 'low'].includes(r.severity) ? r.severity : 'medium') as DetectedIssue['severity'],
        summary: `AI claims "${r.found}" for ${factKey} — correct is "${r.expected}"`,
        detected: { factKey, expected: r.expected, found: r.found, explanation: r.explanation },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { factKey: string; expected: string; found: string };
    const { data } = await generateJson<{ heading: string; passage: string; rationale: string }>({
      ctx,
      system: HALLUCINATION_SYSTEM,
      user: hallucinationUserPrompt({ brand: ctx.brand, fact: d.factKey, correctValue: d.expected, falseClaim: d.found }),
      maxTokens: 500,
    });
    const html = `<section class="fact-correction"><h3>${data.heading}</h3>\n<p>${data.passage}</p>\n</section>`;
    return { generated: { ...data, html }, creditsUsed: 1 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const d = issue.detected as { found?: string };
    const g = draft.generated as { passage?: string };
    return { kind: 'text-diff', label: 'Correction', before: `AI claim: ${d.found ?? ''}`, after: String(g.passage ?? '') };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    if (!issue.targetUrl) return { ok: false, detail: { reason: 'no_homepage' }, error: 'Brand has no website to publish the correction to' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl }, String(draft.generated.html), 'append');
    return { ok: result.ok, detail: result.detail ?? {}, after: { heading: draft.generated.heading }, error: result.ok ? undefined : (result.error ?? 'CMS write failed') };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    if (!issue.targetUrl) return { verified: false, scoreAfter: null, note: 'No homepage' };
    try {
      const page = await crawlPage(issue.targetUrl, ctx.signal);
      const heading = String((draft.generated as { heading?: string }).heading || '');
      const ok = heading.length > 0 && page.text.includes(heading);
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? 'Correction published; accuracy monitor will track AI uptake over time' : 'Correction not detected on page yet' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
