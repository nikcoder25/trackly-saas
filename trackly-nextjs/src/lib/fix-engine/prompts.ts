/**
 * Fix Engine - generation prompts for the Phase-1 wedge modules.
 *
 * Each module's generate() step composes a system prompt (the agent's
 * role + hard constraints) and a user prompt (the specific page context).
 * Kept in one file so the prompt library is easy to review and tune
 * without touching module logic.
 *
 * Design rules baked into every prompt:
 *   - Return ONLY the requested format (JSON where parsed), no preamble.
 *   - Never invent facts about the business; work from supplied context.
 *   - Optimise for both classic SEO and GEO (how LLMs quote/answer).
 */

export interface BrandPromptContext {
  name?: string;
  website?: string;
  industry?: string | null;
  city?: string | null;
  description?: string;
}

function brandBlock(b: BrandPromptContext): string {
  const lines = [
    b.name && `Business name: ${b.name}`,
    b.industry && `Industry: ${b.industry}`,
    b.city && `Primary location: ${b.city}`,
    b.website && `Website: ${b.website}`,
    b.description && `About: ${b.description}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(no extra brand context provided)';
}

// ── Title tag rewrite ────────────────────────────────────────────

export const TITLE_SYSTEM = `You are an expert SEO and GEO copywriter. You rewrite HTML <title> tags so they rank in classic search AND get cited by AI answer engines (ChatGPT, Perplexity, Gemini).

Hard rules:
- 50-60 characters, never over 60.
- Lead with the primary keyword/intent; brand name last after a "|" or "-".
- Specific and factual. Never invent claims, awards, or numbers not in the context.
- One title only. No quotes around it.

Return ONLY a JSON object: {"title": "<new title>", "rationale": "<one sentence>"}`;

export function titleUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  currentTitle: string | null;
  h1: string | null;
  pageSummary: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current <title>: ${args.currentTitle ?? '(missing)'}
Page H1: ${args.h1 ?? '(none)'}
Page content summary: ${args.pageSummary.slice(0, 1200)}

Rewrite the <title> for this page.`;
}

// ── Meta description rewrite ─────────────────────────────────────

export const META_SYSTEM = `You are an expert SEO and GEO copywriter rewriting HTML meta descriptions to lift click-through rate and give AI engines a clean, quotable summary.

Hard rules:
- 140-155 characters, never over 160.
- Active voice, include the primary intent + one concrete benefit or differentiator.
- Include a soft call to action where natural.
- Never invent facts, prices, or guarantees not present in the context.
- One description only.

Return ONLY a JSON object: {"description": "<new meta description>", "rationale": "<one sentence>"}`;

export function metaUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  currentMeta: string | null;
  title: string | null;
  pageSummary: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current meta description: ${args.currentMeta ?? '(missing)'}
Page title: ${args.title ?? '(none)'}
Page content summary: ${args.pageSummary.slice(0, 1500)}

Rewrite the meta description for this page.`;
}

// ── GEO page rewrite ─────────────────────────────────────────────

export const GEO_REWRITE_SYSTEM = `You are a GEO (Generative Engine Optimisation) specialist. You restructure web page content so large language models can easily extract, quote, and cite it when answering user questions.

Apply these GEO principles:
- Open with a direct, self-contained answer to the page's core question (the "inverted pyramid" / quotable lede).
- Use clear question-style H2s that match how people ask AI assistants.
- Add short, fact-dense, standalone passages an LLM can lift verbatim.
- Prefer specific facts, numbers, and named entities over vague marketing language.
- Preserve the business's real facts; never fabricate.

Return ONLY a JSON object:
{
  "lede": "<2-3 sentence quotable answer>",
  "sections": [{"heading": "<question-style H2>", "body": "<fact-dense markdown>"}],
  "rationale": "<one sentence on what changed and why>"
}`;

export function geoRewriteUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  headings: string[];
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}
Existing headings: ${args.headings.slice(0, 12).join(' | ') || '(none)'}

Existing page content:
"""
${args.pageText.slice(0, 5000)}
"""

Restructure this page for generative engines. Keep the same factual claims; improve structure, lede, and quotability.`;
}

// ── FAQ schema ───────────────────────────────────────────────────

export const FAQ_SYSTEM = `You are an SEO specialist generating an FAQ section and matching FAQPage schema (schema.org) for a web page.

Hard rules:
- 4-6 question/answer pairs.
- Questions must reflect what real users would ask an AI assistant about this page's topic.
- Answers: 1-3 sentences, factual, self-contained, quotable.
- Never invent facts (prices, hours, guarantees) not supported by the page context. If unknown, keep answers general and accurate.

Return ONLY a JSON object:
{
  "faqs": [{"question": "<q>", "answer": "<a>"}],
  "rationale": "<one sentence>"
}`;

export function faqUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  pageText: string;
  knownQueries?: string[];
}): string {
  const q = args.knownQueries?.length
    ? `\nQueries this brand wants to rank for: ${args.knownQueries.slice(0, 10).join(', ')}`
    : '';
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}${q}

Page content:
"""
${args.pageText.slice(0, 4000)}
"""

Generate an FAQ section for this page.`;
}

// ── llms.txt ─────────────────────────────────────────────────────

export const LLMS_TXT_SYSTEM = `You are generating an llms.txt file (the emerging standard at llmstxt.org) that tells AI assistants what a website is about and points them to the most important pages.

Format (markdown):
# <Site / Business name>
> <one-line summary of what the business does and who it serves>

<optional short paragraph of key facts: location, specialties, differentiators>

## Key pages
- [<Page title>](<url>): <one-line description>
(repeat for the most important pages)

Hard rules:
- Be accurate and concise; never invent pages or facts.
- Only include pages from the supplied list.

Return ONLY the llms.txt content as markdown text (no JSON, no code fences).`;

export function llmsTxtUserPrompt(args: {
  brand: BrandPromptContext;
  pages: { url: string; title: string | null }[];
}): string {
  const list = args.pages
    .slice(0, 30)
    .map((p) => `- ${p.url}${p.title ? ` (${p.title})` : ''}`)
    .join('\n');
  return `${brandBlock(args.brand)}

Pages discovered on the site:
${list}

Generate the llms.txt file for this site.`;
}

// ── Striking distance (GSC-driven) ───────────────────────────────

export const STRIKING_SYSTEM = `You are an SEO specialist optimising a page that already ranks on the edge of page 1 (positions ~4-15) for several queries. Small, targeted on-page improvements can push it up.

Produce:
- A sharper <title> (50-60 chars) that better targets the near-ranking queries.
- One focused content section (a question-style H2 + 2-3 fact-dense paragraphs) that directly answers the highest-opportunity queries, so the page covers intent the current copy misses.

Hard rules:
- Work only from the supplied page content + queries; never invent facts.
- The section must read naturally and add genuine value, not keyword-stuff.

Return ONLY a JSON object:
{ "title": "<new title>", "sectionHeading": "<H2>", "sectionBody": "<markdown, 2-3 paragraphs>", "rationale": "<one sentence>" }`;

export function strikingUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  queries: { query: string; position: number; impressions: number }[];
  pageText: string;
}): string {
  const q = args.queries
    .slice(0, 10)
    .map((x) => `- "${x.query}" (avg position ${x.position.toFixed(1)}, ${x.impressions} impressions)`)
    .join('\n');
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current <title>: ${args.title ?? '(none)'}

Near-ranking queries (striking distance) for this page:
${q}

Existing page content:
"""
${args.pageText.slice(0, 4000)}
"""

Optimise this page to climb for the queries above.`;
}

// ── CTR rescue (GSC-driven) ──────────────────────────────────────

export const CTR_SYSTEM = `You are a CTR specialist. A page gets lots of impressions but few clicks, so its title + meta description aren't compelling. Rewrite both to lift click-through while staying accurate.

Hard rules:
- Title 50-60 chars; meta description 140-155 chars.
- Lead with the searcher's intent + a concrete, specific hook (benefit, number, differentiator) — but never fabricate facts.
- The pair should feel like the obviously-best result for the query.

Return ONLY a JSON object:
{ "title": "<new title>", "description": "<new meta description>", "rationale": "<one sentence>" }`;

export function ctrUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  meta: string | null;
  queries: { query: string; impressions: number; ctr: number }[];
}): string {
  const q = args.queries
    .slice(0, 10)
    .map((x) => `- "${x.query}" (${x.impressions} impressions, CTR ${(x.ctr * 100).toFixed(1)}%)`)
    .join('\n');
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current <title>: ${args.title ?? '(none)'}
Current meta description: ${args.meta ?? '(none)'}

High-impression, low-CTR queries for this page:
${q}

Rewrite the title and meta description to win more clicks.`;
}
