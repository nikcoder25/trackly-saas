/**
 * Module: Schema markup (crawl, Channel A).
 *
 * Detect: crawl pages and find ones missing the schema.org type that best
 *   fits them — Organization/LocalBusiness for the homepage, BlogPosting
 *   for blog/article pages — when that type isn't already present.
 * Generate: LLM produces valid JSON-LD grounded in the page's real facts.
 * Ship: append the JSON-LD <script> to the page body via the CMS.
 * Recheck: re-crawl and confirm the schema type is now present.
 */

import { crawlPage, resolveCrawlTargets, jsonLdHasType } from '../crawl';
import { generateJson } from '../generate';
import { SCHEMA_SYSTEM, schemaUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

function pathOf(url: string): string {
  try { return new URL(url).pathname.replace(/\/+$/, '') || '/'; } catch { return '/'; }
}

/** Decide the most valuable schema type for a page, or null to skip. */
function expectedType(url: string, hasCity: boolean): string | null {
  const p = pathOf(url).toLowerCase();
  if (p === '/' || p === '') return hasCity ? 'LocalBusiness' : 'Organization';
  if (/(^|\/)(blog|article|news|post|guide|learn)(\/|$)/.test(p)) return 'BlogPosting';
  if (/(^|\/)(product|products|shop|store|item)(\/|$)/.test(p)) return 'Product';
  if (/(^|\/)(service|services|solutions)(\/|$)/.test(p)) return 'Service';
  return null;
}

export const schemaMarkupModule: FixModule = {
  key: 'schema-markup',
  title: 'Schema markup',
  description: 'Add Organization/LocalBusiness and Article schema where missing.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 15);
    const hasCity = !!ctx.brand.city;
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      const type = expectedType(url, hasCity);
      if (!type) continue;
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      if (jsonLdHasType(page.jsonLd, type)) continue;
      issues.push({
        key: `${url}#${type}`,
        targetUrl: url,
        severity: 'low',
        summary: `Missing ${type} schema`,
        detected: { url, schemaType: type, title: page.title, pageText: page.text },
        before: { hasType: false },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; schemaType: string; title: string | null; pageText: string };
    const { data } = await generateJson<Record<string, unknown>>({
      ctx,
      system: SCHEMA_SYSTEM,
      user: schemaUserPrompt({ brand: ctx.brand, url: d.url, schemaType: d.schemaType, title: d.title, pageText: d.pageText || '' }),
      maxTokens: 900,
    });
    // Ensure @context/@type are present even if the model omitted them.
    const jsonLd: Record<string, unknown> = { '@context': 'https://schema.org', '@type': d.schemaType, ...data };
    return { generated: { schemaType: d.schemaType, jsonLd, schema: JSON.stringify(jsonLd) }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return {
      kind: 'code-block',
      label: `${draft.generated.schemaType} JSON-LD`,
      language: 'json',
      addNote: `No ${draft.generated.schemaType} structured data on this page today — this adds it.`,
      after: JSON.stringify(draft.generated.jsonLd, null, 2),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.injectSchema(cms.creds, { url: issue.targetUrl! }, String(draft.generated.schema));
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { schemaType: draft.generated.schemaType },
      error: result.ok ? undefined : (result.error ?? 'CMS write failed'),
    };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const type = String(draft.generated.schemaType);
      const ok = jsonLdHasType(page.jsonLd, type);
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? `${type} schema is live` : `${type} schema not detected yet` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
