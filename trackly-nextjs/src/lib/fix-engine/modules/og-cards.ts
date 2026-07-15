/**
 * Module: Open Graph & Twitter cards (Channel B - Connector).
 *
 * Detect: homepage missing Open Graph / Twitter card meta.
 * Generate: LLM writes og:title + og:description; combined with
 *   deterministic site-level tags (og:type, og:url, og:site_name,
 *   twitter:card) into a <head> block.
 * Ship: queue a Connector `set_header_block` instruction (head injection).
 * Recheck: re-crawl the homepage and confirm OG tags are present.
 *
 * Note: the reference Connector applies one site-wide head block, so this
 * targets homepage/default social meta. Per-page OG would need a per-URL
 * head channel (future Connector op).
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { OG_SYSTEM, ogUserPrompt } from '../prompts';
import { queueConnectorInstruction } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

function homepageOf(website: string | undefined): string | null {
  if (!website) return null;
  try { return new URL(website.startsWith('http') ? website : `https://${website}`).origin + '/'; } catch { return null; }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHead(args: { url: string; siteName: string; ogTitle: string; ogDescription: string }): string {
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeAttr(args.url)}">`,
    `<meta property="og:site_name" content="${escapeAttr(args.siteName)}">`,
    `<meta property="og:title" content="${escapeAttr(args.ogTitle)}">`,
    `<meta property="og:description" content="${escapeAttr(args.ogDescription)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(args.ogTitle)}">`,
    `<meta name="twitter:description" content="${escapeAttr(args.ogDescription)}">`,
  ];
  return `<!-- Open Graph / Twitter (Livesov) -->\n${tags.join('\n')}`;
}

export const ogCardsModule: FixModule = {
  key: 'og-cards',
  title: 'Open Graph & Twitter cards',
  description: 'Add social share meta so links render with a title, description, and card.',
  channel: 'B',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const home = homepageOf(ctx.brand.website);
    if (!home) return [];
    let page;
    try { page = await crawlPage(home, ctx.signal); } catch { return []; }
    if (page.hasOgTags) return [];
    return [{
      key: home,
      targetUrl: home,
      severity: 'low',
      summary: 'Homepage is missing Open Graph / Twitter card meta',
      detected: { url: home, title: page.title, pageText: page.text },
      before: { hasOgTags: false },
    }];
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; title: string | null; pageText: string };
    const { data } = await generateJson<{ ogTitle: string; ogDescription: string; rationale: string }>({
      ctx,
      system: OG_SYSTEM,
      user: ogUserPrompt({ brand: ctx.brand, title: d.title, pageText: d.pageText || '' }),
      maxTokens: 400,
    });
    const head = buildHead({
      url: d.url,
      siteName: ctx.brand.name || d.title || d.url,
      ogTitle: data.ogTitle,
      ogDescription: data.ogDescription,
    });
    return { generated: { ...data, head }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return { kind: 'code-block', label: 'Head block (Open Graph + Twitter)', language: 'html', addNote: 'No Open Graph / Twitter card tags on the homepage today — this adds them.', after: String(draft.generated.head ?? '') };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    return queueConnectorInstruction(ctx, issue.key, {
      op: 'set_header_block',
      payload: { content: String(draft.generated.head) },
    });
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      return { verified: page.hasOgTags, scoreAfter: page.hasOgTags ? 100 : 0, note: page.hasOgTags ? 'OG tags are live' : 'Not live yet (Connector pending)' };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
