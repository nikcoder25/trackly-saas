/**
 * Module: Internal linking (crawl, Channel A).
 *
 * Detect: crawl the site, build a candidate pool of pages; for each page
 *   with enough peers, propose adding contextual internal links.
 * Generate: LLM picks 2-4 relevant target pages + natural anchor text.
 * Ship: append a contextual "Related" links block to the page body.
 * Recheck: re-crawl and confirm the links are present.
 */

import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateJson } from '../generate';
import { INTERNAL_LINKING_SYSTEM, internalLinkingUserPrompt } from '../prompts';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MIN_PEERS = 3;
const MAX_PAGES = 8;

interface LinkSuggestion { anchor: string; url: string; reason?: string }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderLinksHtml(links: LinkSuggestion[]): string {
  const items = links
    .map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.anchor)}</a></li>`)
    .join('\n');
  return `<section class="related-links"><h2>Related</h2>\n<ul>\n${items}\n</ul>\n</section>`;
}

export const internalLinkingModule: FixModule = {
  key: 'internal-linking',
  title: 'Internal linking',
  description: 'Insert contextual links between related pages to build topical authority.',
  channel: 'A',
  trigger: 'crawl',
  minPlan: 'pro',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 25);
    if (targets.length < MIN_PEERS + 1) return [];

    // Crawl once; build a url → {title, text} map.
    const pages = new Map<string, { title: string | null; text: string }>();
    for (const url of targets) {
      try {
        const p = await crawlPage(url, ctx.signal);
        pages.set(url, { title: p.title, text: p.text });
      } catch { /* skip unreachable */ }
    }
    const all = Array.from(pages.keys());
    const issues: DetectedIssue[] = [];
    for (const url of all.slice(0, MAX_PAGES)) {
      const candidates = all.filter((u) => u !== url).map((u) => ({ url: u, title: pages.get(u)!.title }));
      if (candidates.length < MIN_PEERS) continue;
      const page = pages.get(url)!;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'low',
        summary: `Could add contextual internal links (${candidates.length} candidate pages)`,
        detected: { url, title: page.title, pageText: page.text, candidates },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; pageText: string; candidates: { url: string; title: string | null }[]; instruction?: string };
    let user = internalLinkingUserPrompt({ brand: ctx.brand, url: d.url, title: d.title, pageText: d.pageText || '', candidates: d.candidates });
    // A user-initiated request can steer the anchor text / which pages to
    // prioritise (e.g. "link to /pricing using the anchor 'AI visibility
    // pricing'"). Scan-detected issues carry no instruction — behaviour is
    // unchanged for them.
    if (typeof d.instruction === 'string' && d.instruction.trim()) {
      user += `\n\nUser preference (honor this when choosing targets and anchor text): ${d.instruction.trim()}`;
    }
    const { data } = await generateJson<{ links: LinkSuggestion[]; rationale: string }>({
      ctx,
      system: INTERNAL_LINKING_SYSTEM,
      user,
      maxTokens: 800,
    });
    // Guard: never link the page to itself; only keep candidate URLs.
    const candidateUrls = new Set(d.candidates.map((c) => c.url));
    const links = (data.links || []).filter((l) => l.url && l.url !== d.url && candidateUrls.has(l.url));
    return { generated: { links, rationale: data.rationale, html: renderLinksHtml(links) }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const links = (draft.generated.links as LinkSuggestion[]) ?? [];
    return {
      kind: 'key-values',
      label: `Internal links (${links.length})`,
      after: links.map((l) => `→ ${l.anchor}\n  ${l.url}${l.reason ? `  (${l.reason})` : ''}`).join('\n\n'),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const links = (draft.generated.links as LinkSuggestion[]) ?? [];
    if (links.length === 0) return { ok: false, detail: { reason: 'no_links_generated' }, error: 'No internal links to ship' };
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { links },
      error: result.ok ? undefined : 'CMS write failed',
    };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const links = (draft.generated.links as LinkSuggestion[]) ?? [];
      const present = links.filter((l) => page.text.includes(l.anchor)).length;
      const verified = links.length > 0 && present >= Math.ceil(links.length / 2);
      return { verified, scoreAfter: links.length ? Math.round((present / links.length) * 100) : 0, note: `${present}/${links.length} links detected on live page` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
