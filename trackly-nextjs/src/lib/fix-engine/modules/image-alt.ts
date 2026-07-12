/**
 * Module: Image alt text (Channel A).
 *
 * Detect: crawl the brand's pages; one issue per page that has <img> tags
 *   with no alt attribute at all (empty alt="" is valid decorative markup
 *   per WCAG and is left alone).
 * Generate: context-grounded alt text per image (filename + page topic —
 *   we can't see pixels, and the prompt is honest about that).
 * Ship: per-image in-place body edit inserting the alt attribute
 *   (src="X" → src="X" alt="…"). Images whose tag isn't in the stored body
 *   (theme/builder-rendered) are reported as skipped, not failed.
 * Recheck: re-crawl and confirm the targeted images now carry alt text.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { IMAGE_ALT_SYSTEM, imageAltUserPrompt } from '../prompts';
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

const MAX_IMAGES_PER_PAGE = 10;

type AltPair = { src: string; alt: string };

export const imageAltModule: FixModule = {
  key: 'image-alt',
  title: 'Image alt text',
  description: 'Add descriptive alt text to images that have none (accessibility + image SEO).',
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
      const images = page.imagesMissingAlt.slice(0, MAX_IMAGES_PER_PAGE);
      if (images.length === 0) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: images.length >= 5 ? 'medium' : 'low',
        summary: `${images.length} image${images.length === 1 ? '' : 's'} missing alt text`,
        detected: { url, images, title: page.title, pageSummary: page.text.slice(0, 1500) },
        before: { missingAlt: images.length },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; images: string[]; title: string | null; pageSummary: string };
    const { data } = await generateJson<{ alts: AltPair[]; rationale: string }>({
      ctx,
      system: IMAGE_ALT_SYSTEM,
      user: imageAltUserPrompt({
        brand: ctx.brand, url: d.url, title: d.title,
        pageText: d.pageSummary || '', images: d.images,
      }),
      maxTokens: 900,
    });
    // Keep only pairs for images we actually asked about.
    const wanted = new Set(d.images);
    const alts = (data.alts || []).filter((a) => a && wanted.has(a.src) && typeof a.alt === 'string' && a.alt.trim());
    return { generated: { alts, rationale: data.rationale }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const alts = (draft.generated.alts as AltPair[] | undefined) ?? [];
    return {
      kind: 'key-values',
      label: `Alt text for ${alts.length} image${alts.length === 1 ? '' : 's'}`,
      after: alts.map((a) => `${a.src.split('/').pop()}\n  → "${a.alt}"`).join('\n'),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const alts = (draft.generated.alts as AltPair[] | undefined) ?? [];
    if (alts.length === 0) return { ok: false, detail: { reason: 'no_alts_generated' }, error: 'No alt text to apply' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;

    let applied = 0;
    const skipped: string[] = [];
    for (const a of alts) {
      const escaped = a.alt.replace(/"/g, '&quot;');
      try {
        const r = await cms.adapter.replaceInBody(
          cms.creds,
          { url: issue.targetUrl! },
          `src="${a.src}"`,
          `src="${a.src}" alt="${escaped}"`,
        );
        if (r.ok) applied++;
        else skipped.push(a.src); // not in the stored body (theme-rendered)
      } catch {
        skipped.push(a.src);
      }
    }
    if (applied === 0) {
      return {
        ok: false,
        detail: { applied, skipped },
        error: 'None of these images are in the editable page body (they may be theme/builder-rendered) — add the alt text in your page builder.',
      };
    }
    return { ok: true, detail: { applied, skipped }, after: { alts } };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const targeted = new Set(((draft.generated.alts as AltPair[] | undefined) ?? []).map((a) => a.src));
      const stillMissing = page.imagesMissingAlt.filter((s) => targeted.has(s));
      const verified = stillMissing.length === 0 && targeted.size > 0;
      return {
        verified,
        scoreAfter: verified ? 100 : null,
        note: verified ? 'All targeted images now have alt text' : `${stillMissing.length} targeted image(s) still missing alt`,
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
