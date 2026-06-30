/**
 * Module: Targeted passage rewrite (manual, Channel A).
 *
 * In-place editing: rewrite/optimise ONE specific paragraph or line on a
 * page, per a user instruction, and replace exactly that text on the live
 * page (find-and-replace via the CMS) — not an append.
 *
 * This module is user-initiated, not scan-detected: detect() returns []
 * and fixes are created via POST /api/brands/[id]/fixes/targeted with the
 * exact passage + instruction. generate/preview/ship/recheck then run on
 * the normal engine flow.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { PASSAGE_REWRITE_SYSTEM, passageRewriteUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

export const passageRewriteModule: FixModule = {
  key: 'passage-rewrite',
  title: 'Passage rewrite',
  description: 'Rewrite or optimise a specific paragraph/section in place.',
  channel: 'A',
  trigger: 'manual',
  minPlan: 'starter',
  phase: 1,

  // Manual-only: never surfaced by a scan.
  async detect(): Promise<DetectedIssue[]> {
    return [];
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; passage: string; instruction: string };
    const { data } = await generateJson<{ rewritten: string; rationale: string }>({
      ctx,
      system: PASSAGE_REWRITE_SYSTEM,
      user: passageRewriteUserPrompt({ brand: ctx.brand, url: d.url, passage: d.passage, instruction: d.instruction }),
      maxTokens: 1200,
    });
    return { generated: { rewritten: data.rewritten.trim(), rationale: data.rationale, original: d.passage }, creditsUsed: 1 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const d = issue.detected as { passage?: string };
    return {
      kind: 'text-diff',
      label: 'Passage',
      before: d?.passage ?? String((draft.generated as { original?: string }).original ?? ''),
      after: String(draft.generated.rewritten ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const d = issue.detected as { passage: string };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.replaceInBody(cms.creds, { url: issue.targetUrl! }, d.passage, String(draft.generated.rewritten));
    if (!result.ok && result.found === false) {
      return { ok: false, detail: result.detail ?? {}, error: 'Passage not found in the page body (it may be theme-rendered). Edit the source paragraph directly.' };
    }
    return { ok: result.ok, detail: result.detail ?? {}, after: { rewritten: draft.generated.rewritten }, error: result.ok ? undefined : 'CMS write failed' };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      // Compare on a normalised snippet of the rewritten text.
      const want = String(draft.generated.rewritten).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      const ok = want.length > 0 && page.text.includes(want.slice(0, 40));
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? 'Rewritten passage is live' : 'Updated passage not detected yet' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
