/**
 * Module: Comparison / alternatives pages (crawl, Channel A).
 *
 * The format LLMs cite most for "X vs Y" / "alternatives to X" questions.
 *
 * Detect: for each of the brand's competitors that has no comparison page
 *   on the site yet, propose creating one.
 * Generate: LLM writes a fair, citable "<Brand> vs <Competitor>" page.
 * Ship: create a NEW page via the CMS adapter.
 * Recheck: fetch the new page and confirm it's live with both names.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { COMPARISON_SYSTEM, comparisonUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MAX_COMPETITORS = 5;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

interface CompDraft {
  title: string; slug: string; answer: string; tableMarkdown: string;
  chooseBrand: string; chooseCompetitor: string; faqs: { question: string; answer: string }[]; rationale: string;
}

function renderHtml(brandName: string, competitor: string, d: CompDraft): string {
  const faqs = (d.faqs || []).map((f) => `<h3>${f.question}</h3>\n<p>${f.answer}</p>`).join('\n');
  return [
    `<p>${d.answer}</p>`,
    `<h2>${brandName} vs ${competitor}: at a glance</h2>`,
    `<div class="comparison-table">${d.tableMarkdown}</div>`,
    `<h2>Choose ${brandName} if…</h2>\n<p>${d.chooseBrand}</p>`,
    `<h2>Choose ${competitor} if…</h2>\n<p>${d.chooseCompetitor}</p>`,
    faqs ? `<h2>FAQ</h2>\n${faqs}` : '',
  ].filter(Boolean).join('\n');
}

export const comparisonPagesModule: FixModule = {
  key: 'comparison-pages',
  title: 'Comparison & alternatives pages',
  description: 'Create "Brand vs Competitor" pages — the format LLMs cite most.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'pro',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const competitors = (ctx.brand.competitors || []).filter(Boolean).slice(0, MAX_COMPETITORS);
    if (competitors.length === 0) return [];

    // Build a haystack of existing page URLs + titles to see which
    // competitors are already covered.
    const targets = await resolveCrawlTargets(ctx.brand.website, 25);
    const haystacks: string[] = [];
    for (const url of targets) {
      haystacks.push(url.toLowerCase());
      try { const p = await crawlPage(url, ctx.signal); if (p.title) haystacks.push(p.title.toLowerCase()); }
      catch { /* url alone is enough */ }
    }
    const corpus = haystacks.join(' \n ');

    const issues: DetectedIssue[] = [];
    for (const competitor of competitors) {
      const c = competitor.toLowerCase();
      const covered = corpus.includes(`vs-${slugify(competitor)}`)
        || corpus.includes(`vs ${c}`)
        || (corpus.includes(c) && (corpus.includes('compare') || corpus.includes('alternative')));
      if (covered) continue;
      issues.push({
        key: `vs:${slugify(competitor)}`,
        targetUrl: null,
        severity: 'medium',
        summary: `No comparison page for "${competitor}"`,
        detected: { competitor },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const { competitor } = issue.detected as { competitor: string };
    const { data } = await generateJson<CompDraft>({
      ctx,
      system: COMPARISON_SYSTEM,
      user: comparisonUserPrompt({ brand: ctx.brand, competitor }),
      maxTokens: 2600,
    });
    const brandName = ctx.brand.name || 'Us';
    const slug = data.slug?.trim() || `${slugify(brandName)}-vs-${slugify(competitor)}`;
    const html = renderHtml(brandName, competitor, data);
    return { generated: { ...data, slug, html, competitor }, creditsUsed: 3 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as { title?: string; html?: string };
    return { kind: 'code-block', label: `New page: ${g.title ?? ''}`, language: 'html', after: String(g.html ?? '') };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const g = draft.generated as { title: string; slug: string; html: string };
    // Pass the site origin through creds so the adapter can target the API.
    const result = await cms.adapter.createPage(
      { ...cms.creds, site: cms.siteUrl } as Record<string, unknown>,
      { title: g.title, slug: g.slug, html: g.html, status: 'publish' },
    );
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { url: result.url, slug: g.slug },
      error: result.ok ? undefined : 'CMS page creation failed',
    };
  },

  async recheck(_issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    // The created page lives at <site-origin>/<slug>. Derive it rather than
    // depending on the ship result (recheck only receives the draft).
    const slug = String((draft.generated as { slug?: string }).slug || '');
    const website = ctx.brand.website;
    if (!slug || !website) return { verified: false, scoreAfter: null, note: 'Cannot derive page URL' };
    let origin: string;
    try { origin = new URL(website.startsWith('http') ? website : `https://${website}`).origin; }
    catch { return { verified: false, scoreAfter: null, note: 'Invalid brand website' }; }
    const url = `${origin}/${slug}`;
    try {
      const page = await crawlPage(url, ctx.signal);
      const comp = String((draft.generated as { competitor?: string }).competitor || '').toLowerCase();
      const ok = page.status === 200 && page.text.toLowerCase().includes(comp);
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? 'Comparison page is live' : `Not confirmed at ${url}` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
