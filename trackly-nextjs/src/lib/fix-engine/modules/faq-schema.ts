/**
 * Module: FAQ block + FAQPage schema (Channel A).
 *
 * Detect: flag pages with no FAQ section / no FAQPage schema.
 * Generate: LLM produces 4-6 Q/A pairs; we render a visible FAQ block +
 *           valid FAQPage JSON-LD.
 * Ship: append the FAQ HTML and the JSON-LD <script> to the page body.
 * Recheck: re-crawl and confirm FAQPage schema is present.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { FAQ_SYSTEM, faqUserPrompt } from '../prompts';
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

interface Faq { question: string; answer: string }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderFaqHtml(faqs: Faq[]): string {
  const items = faqs
    .map((f) => `<div class="faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`)
    .join('\n');
  return `<section class="faq"><h2>Frequently asked questions</h2>\n${items}\n</section>`;
}

function renderFaqSchema(faqs: Faq[]): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
  return JSON.stringify(schema);
}

export const faqSchemaModule: FixModule = {
  key: 'faq-schema',
  title: 'FAQ block + schema',
  description: 'Add an FAQ section and FAQPage schema targeting real queries.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 1,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 10);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let page;
      try { page = await crawlPage(url, ctx.signal); } catch { continue; }
      if (page.hasFaqSchema) continue; // already has FAQ schema
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'low',
        summary: 'No FAQ schema on this page',
        detected: { url, title: page.title, pageText: page.text, queries: ctx.brand.queries ?? [] },
        before: { hasFaqSchema: false },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; pageText: string; queries: string[]; instruction?: string };
    let user = faqUserPrompt({
      brand: ctx.brand,
      url: d.url,
      title: d.title,
      pageText: d.pageText || '',
      knownQueries: d.queries,
    });
    if (typeof d.instruction === 'string' && d.instruction.trim()) user += `\n\nUser preference (honor this): ${d.instruction.trim()}`;
    const { data } = await generateJson<{ faqs: Faq[]; rationale: string }>({
      ctx,
      system: FAQ_SYSTEM,
      user,
      maxTokens: 1200,
    });
    const faqs = (data.faqs || []).filter((f) => f.question && f.answer);
    return {
      generated: {
        faqs,
        rationale: data.rationale,
        html: renderFaqHtml(faqs),
        schema: renderFaqSchema(faqs),
      },
      creditsUsed: 1,
    };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const faqs = (draft.generated.faqs as Faq[]) ?? [];
    return {
      kind: 'key-values',
      label: `FAQ (${faqs.length} questions) + FAQPage schema`,
      after: faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n'),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const block = `${draft.generated.html}\n<script type="application/ld+json">${draft.generated.schema}</script>`;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, block, 'append');
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { faqs: draft.generated.faqs },
      error: result.ok ? undefined : (result.error ?? 'CMS write failed'),
    };
  },

  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    const block = `${draft.generated.html}\n<script type="application/ld+json">${draft.generated.schema}</script>`;
    return { url: issue.targetUrl, bodyAppend: block };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      return {
        verified: page.hasFaqSchema,
        scoreAfter: page.hasFaqSchema ? 100 : 0,
        note: page.hasFaqSchema ? 'FAQPage schema is live' : 'FAQPage schema not detected yet',
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
