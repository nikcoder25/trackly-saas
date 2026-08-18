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

/** What's currently ranking for the page's query — the SERP to beat. */
export interface SerpCompetitor { title: string; description: string; url?: string }

function competitorBlock(query: string | null | undefined, competitors: SerpCompetitor[] | undefined): string {
  if (!query || !competitors?.length) return '';
  const rows = competitors.slice(0, 8).map((c, i) =>
    `${i + 1}. "${c.title}"${c.description ? `\n   snippet: ${c.description.slice(0, 180)}` : ''}`,
  ).join('\n');
  return `\n\nCurrently ranking for "${query}" (the SERP you must beat):\n${rows}\n`;
}

// Differentiation rules shared by the title/meta/CTR prompts.
const BEAT_THE_SERP = `- When "currently ranking" competitor results are supplied, study them and write something MORE clickable: cover the angle they all miss, be more specific/concrete, and never echo their exact phrasing. If every competitor leads with the same formula, break the pattern. Still: never fabricate claims to out-promise them.`;

// ── Title tag rewrite ────────────────────────────────────────────

export const TITLE_SYSTEM = `You are an expert SEO and GEO copywriter. You rewrite HTML <title> tags so they rank in classic search AND get cited by AI answer engines (ChatGPT, Perplexity, Gemini).

Hard rules:
- 50-60 characters, never over 60.
- Lead with the primary keyword/intent; brand name last after a "|" or "-".
- Specific and factual. Never invent claims, awards, or numbers not in the context.
${BEAT_THE_SERP}
- One title only. No quotes around it.

Return ONLY a JSON object: {"title": "<new title>", "rationale": "<one sentence>"}`;

/**
 * This brand's own measured winners and losers for the module being run.
 *
 * A model told "write a compelling title" guesses at the house style. A model
 * shown three titles that measurably lifted CTR on this exact site, and two
 * that measurably cost it, has evidence. The losers matter as much as the
 * winners: the ways a title fails are site-specific and unguessable — a
 * length that truncates in this brand's SERP, a phrasing their audience
 * reads as spam.
 *
 * Deltas are baseline-adjusted (see outcomes.ts), so they say "beat the
 * site's own trend" rather than "went up in a good month". Renders to an
 * empty string when the brand has no measured history, leaving the prompt
 * byte-identical to what it was before any of this existed.
 */
export function learnedBlock(
  learned: {
    winners: Array<{ delta: number; generated: Record<string, unknown> | null }>;
    losers: Array<{ delta: number; generated: Record<string, unknown> | null }>;
  } | undefined,
  field: string,
): string {
  if (!learned) return '';
  const line = (e: { delta: number; generated: Record<string, unknown> | null }) => {
    const v = e.generated?.[field];
    if (typeof v !== 'string' || !v.trim()) return null;
    const pct = Math.round(e.delta * 100);
    return `- "${v.trim().slice(0, 160)}" (${pct >= 0 ? '+' : ''}${pct}% CTR vs site trend)`;
  };
  const won = learned.winners.map(line).filter(Boolean);
  const lost = learned.losers.map(line).filter(Boolean);
  if (!won.length && !lost.length) return '';

  return `

What has actually worked on THIS site (measured 28 days after publishing, adjusted for the site's overall trend):${
    won.length ? `\n\nThese lifted click-through — match their register and structure:\n${won.join('\n')}` : ''
  }${
    lost.length ? `\n\nThese lost click-through — do not repeat these patterns:\n${lost.join('\n')}` : ''
  }`;
}

export function titleUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  currentTitle: string | null;
  h1: string | null;
  pageSummary: string;
  query?: string | null;
  competitors?: SerpCompetitor[];
  learned?: Parameters<typeof learnedBlock>[0];
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current <title>: ${args.currentTitle ?? '(missing)'}
Page H1: ${args.h1 ?? '(none)'}
Page content summary: ${args.pageSummary.slice(0, 1200)}${competitorBlock(args.query, args.competitors)}${learnedBlock(args.learned, 'title')}

Rewrite the <title> for this page${args.competitors?.length ? ' so it wins the click against the results above' : ''}.`;
}

// ── Meta description rewrite ─────────────────────────────────────

export const META_SYSTEM = `You are an expert SEO and GEO copywriter rewriting HTML meta descriptions to lift click-through rate and give AI engines a clean, quotable summary.

Hard rules:
- 140-155 characters, never over 160.
- Active voice, include the primary intent + one concrete benefit or differentiator.
- Include a soft call to action where natural.
- Never invent facts, prices, or guarantees not present in the context.
${BEAT_THE_SERP}
- One description only.

Return ONLY a JSON object: {"description": "<new meta description>", "rationale": "<one sentence>"}`;

export function metaUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  currentMeta: string | null;
  title: string | null;
  pageSummary: string;
  query?: string | null;
  competitors?: SerpCompetitor[];
  learned?: Parameters<typeof learnedBlock>[0];
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current meta description: ${args.currentMeta ?? '(missing)'}
Page title: ${args.title ?? '(none)'}
Page content summary: ${args.pageSummary.slice(0, 1500)}${competitorBlock(args.query, args.competitors)}${learnedBlock(args.learned, 'description')}

Rewrite the meta description for this page${args.competitors?.length ? ' so it wins the click against the results above' : ''}.`;
}

// ── GEO page rewrite ─────────────────────────────────────────────

export const GEO_REWRITE_SYSTEM = `You are a GEO (Generative Engine Optimisation) specialist. You restructure web page content so large language models can easily extract, quote, and cite it when answering user questions.

Apply these GEO principles:
- Open with a direct, self-contained answer to the page's core question (the "inverted pyramid" / quotable lede).
- Use clear question-style H2s that match how people ask AI assistants.
- Add short, fact-dense, standalone passages an LLM can lift verbatim.
- Prefer specific facts, numbers, and named entities over vague marketing language.
- Statistics density (adding stats measurably lifts AI visibility): work one concrete number, date, or measurable fact into roughly every 150-200 words — drawn ONLY from the supplied content. If the source has no numbers, use concrete specifics (named entities, versions, locations) instead; NEVER invent statistics.
- The lede must be a 40-60 word "answer capsule": a self-contained answer an assistant can quote whole.
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

export const STRIKING_SYSTEM = `You are an SEO specialist optimising a page that already ranks on the edge of page 1 (positions ~6-15) for several queries. Small, targeted on-page improvements can push it up.

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

Give the reviewer a real choice: THREE title options and THREE meta description options, each pulling a DIFFERENT psychological lever, so they can pick the angle that fits the business rather than accept or reject a single guess.

Levers to draw from — use a different one for each option, and name the one you used:
- "specificity": a concrete number, timeframe or detail that proves the page delivers.
- "loss aversion": what the searcher risks by choosing wrong.
- "authority": credentials, track record, or scale that makes this the safe click.
- "speed": how fast the searcher gets the outcome.
- "curiosity gap": name the answer's existence without giving it away — only when the page genuinely delivers it.
- "objection handling": defuse the unspoken worry (price, hassle, commitment).
- "local proximity": being the nearby option, for queries where that decides the click.

Hard rules:
- Title 50-60 chars; meta description 140-155 chars. Every option, not just the first.
- Lead with the searcher's intent + a concrete, specific hook (benefit, number, differentiator) — but never fabricate facts. A lever you have no evidence for is a lever you must not use; pick another.
- The three options must be genuinely different approaches, not three rewordings of one idea.
- Order them best-first: option 1 is your recommendation and is what ships unless the reviewer picks another.
${BEAT_THE_SERP}
- The pair should feel like the obviously-best result for the query.

Return ONLY a JSON object:
{
  "titles": [
    { "text": "<title option>", "lever": "<lever name from the list>", "strategy": "<one sentence on why this makes the searcher click>" }
  ],
  "descriptions": [
    { "text": "<meta description option>", "lever": "<lever name from the list>", "strategy": "<one sentence on why this makes the searcher click>" }
  ],
  "rationale": "<one sentence diagnosing why the current pair is losing the click>"
}
Exactly three entries in "titles" and three in "descriptions".`;

export function ctrUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  meta: string | null;
  queries: { query: string; impressions: number; ctr: number }[];
  competitors?: SerpCompetitor[];
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
${q}${competitorBlock(args.queries[0]?.query ?? null, args.competitors)}

Give three title options and three meta description options to win more clicks${args.competitors?.length ? ' against the results above' : ''}, each on a different lever, best first.`;
}

// ── Internal linking ─────────────────────────────────────────────

export const INTERNAL_LINKING_SYSTEM = `You are an SEO specialist adding contextual internal links from one page to other relevant pages on the same site, to strengthen topical authority and crawl paths.

Hard rules:
- Only link to pages from the supplied list (real URLs on this site).
- Choose 2-4 links that are genuinely relevant to the source page's topic.
- Anchor text must be natural, descriptive, and specific (never "click here").
- Do not link a page to itself.

Return ONLY a JSON object:
{ "links": [{ "anchor": "<anchor text>", "url": "<target url>", "reason": "<why relevant, one phrase>" }], "rationale": "<one sentence>" }`;

export function internalLinkingUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  pageText: string;
  candidates: { url: string; title: string | null }[];
}): string {
  const list = args.candidates
    .slice(0, 40)
    .map((c) => `- ${c.url}${c.title ? ` — ${c.title}` : ''}`)
    .join('\n');
  return `${brandBlock(args.brand)}

Source page: ${args.url}
Source title: ${args.title ?? '(none)'}

Source content:
"""
${args.pageText.slice(0, 3500)}
"""

Other pages on the site you may link to:
${list}

Suggest the best contextual internal links to add to the source page.`;
}

// ── Schema markup ────────────────────────────────────────────────

export const SCHEMA_SYSTEM = `You generate valid schema.org JSON-LD for a web page, grounded ONLY in the facts provided. Never invent data (ratings, prices, addresses, dates) that isn't supplied or clearly present in the page content.

Return ONLY a JSON object that is the JSON-LD itself (starting with "@context"). It must be valid schema.org for the requested @type. Omit fields you don't have real data for rather than guessing.`;

export function schemaUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  schemaType: string;
  title: string | null;
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Generate JSON-LD of @type "${args.schemaType}" for this page.
Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}

Page content:
"""
${args.pageText.slice(0, 3500)}
"""

Return only the JSON-LD object for @type ${args.schemaType}.`;
}

// ── Content expansion (indexing repair: crawled-not-indexed) ──────

export const CONTENT_EXPAND_SYSTEM = `You are an SEO content specialist. A page is too thin for Google to index ("Crawled - currently not indexed"). Add genuinely useful, original depth so it earns indexing.

Produce one or more focused sections (question-style H2 + fact-dense paragraphs) that materially expand the page's coverage of its topic. Be specific and accurate; never fabricate facts about the business.

Return ONLY a JSON object:
{ "sections": [{ "heading": "<H2>", "body": "<markdown, 2-4 paragraphs>" }], "rationale": "<one sentence>" }`;

export function contentExpandUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}

Current (thin) page content:
"""
${args.pageText.slice(0, 3000)}
"""

Expand this page with genuinely useful depth so it earns indexing.`;
}

// ── GEO: comparison / alternatives page ──────────────────────────

export const COMPARISON_SYSTEM = `You are a GEO specialist writing a "<Brand> vs <Competitor>" comparison page — the format LLMs cite most when users ask which tool/service to choose.

Structure (the LLM-citable shape):
- A direct 2-3 sentence answer to "Which is better, and for whom?" (balanced, credible).
- A comparison table covering the dimensions buyers care about.
- "Choose <Brand> if…" and "Choose <Competitor> if…" sections (honest, specific).
- A short FAQ.

Hard rules:
- Be fair and factual; do NOT fabricate features, pricing, or claims about either side. If a fact is unknown, speak generally rather than inventing specifics.
- Write so a model can quote any section standalone.

Return ONLY a JSON object:
{ "title": "<page title, ~55 chars>", "slug": "<url-slug>", "answer": "<2-3 sentence lede>",
  "tableMarkdown": "<markdown comparison table>",
  "chooseBrand": "<when to choose the brand>", "chooseCompetitor": "<when to choose the competitor>",
  "faqs": [{"question":"<q>","answer":"<a>"}], "rationale": "<one sentence>" }`;

export function comparisonUserPrompt(args: {
  brand: BrandPromptContext;
  competitor: string;
}): string {
  return `${brandBlock(args.brand)}

Write a comparison page: ${args.brand.name || 'the brand'} vs ${args.competitor}.

Focus on what someone evaluating both would want to know. Stay factual; where you lack specifics about ${args.competitor}, keep claims general and neutral.`;
}

// ── GEO: citable passage blocks ──────────────────────────────────

export const CITABLE_SYSTEM = `You write citable passage blocks — short, fact-dense, self-contained statements an AI assistant can quote verbatim when answering a user. Each passage stands alone (no "as mentioned above"), leads with the fact, and is specific.

Hard rules:
- 2-4 passages, each 1-3 sentences.
- Ground every passage in the supplied page content; never invent facts.
- Lead with numbers: every passage that CAN carry a concrete statistic, date, or measurable fact from the source MUST (stats are the strongest measured driver of AI citations). When the source has none, use concrete specifics instead — never invent a number.
- The TL;DR must be a 40-60 word answer capsule: a self-contained answer to the page's core question that an assistant can quote whole.

Return ONLY a JSON object:
{ "tldr": "<one-sentence answer>", "passages": ["<passage>", ...], "rationale": "<one sentence>" }`;

export function citableUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}

Page content:
"""
${args.pageText.slice(0, 4000)}
"""

Write citable passage blocks + a TL;DR for this page.`;
}

// ── GEO: hallucination correction ────────────────────────────────

export const HALLUCINATION_SYSTEM = `You write a correction passage that publicly and factually states the correct information, so AI assistants stop repeating a false claim about a business. The passage must be clear, quotable, and authoritative — the kind of statement a model will pick up as ground truth.

Hard rules:
- State the CORRECT fact plainly and prominently; do not repeat the false claim as if it might be true.
- Use only the supplied correct value; never invent supporting details.
- Keep it short (1-3 sentences) and standalone.

Return ONLY a JSON object:
{ "heading": "<short heading>", "passage": "<the correction passage>", "rationale": "<one sentence>" }`;

export function hallucinationUserPrompt(args: {
  brand: BrandPromptContext;
  fact: string;
  correctValue: string;
  falseClaim: string;
}): string {
  return `${brandBlock(args.brand)}

Some AI assistants have stated an incorrect fact about this business.
Fact in question: ${args.fact}
The CORRECT value: ${args.correctValue}
The incorrect claim that has appeared: ${args.falseClaim}

Write a correction passage that establishes the correct value as ground truth.`;
}

// ── External citations (authoritative outbound links) ────────────

export const CITATIONS_SYSTEM = `You add citations to authoritative, official external sources that support the factual claims on a page — strengthening E-E-A-T and making the content more quotable/trustworthy for AI answer engines.

Choose sources like: primary sources, official documentation, government (.gov) and education (.edu) sites, standards bodies, peer-reviewed or well-established reference works, and the official sites of any organisations mentioned.

Hard rules:
- Suggest ONLY real, well-known, stable URLs you are confident exist. Prefer canonical homepages/docs over deep links you're unsure about. Never invent URLs.
- Each citation must genuinely support a specific claim on the page.
- 2-5 citations. Do NOT cite the page's own domain or direct competitors.

Return ONLY a JSON object:
{ "citations": [{ "claim": "<the claim it supports>", "anchor": "<anchor text>", "url": "<https URL>", "source": "<source name>" }], "rationale": "<one sentence>" }`;

export function citationsUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Page title: ${args.title ?? '(none)'}

Page content:
"""
${args.pageText.slice(0, 4000)}
"""

Suggest authoritative external citations that support this page's factual claims.`;
}

// ── Targeted passage rewrite (in-place edit) ─────────────────────

export const PASSAGE_REWRITE_SYSTEM = `You rewrite ONE specific passage of a web page in place, following the user's instruction. You return a drop-in replacement for exactly that passage — same topic, same facts — improved per the instruction.

Hard rules:
- Rewrite ONLY the supplied passage; do not add unrelated content or headings.
- Preserve every real fact; never invent claims, numbers, or names.
- Where the original passage contains numbers, dates, or measurable facts, keep them prominent — lead with them where natural (stats make passages far more quotable by AI engines). Never add a number that isn't in the source.
- Keep roughly the same length unless the instruction says otherwise.
- Return plain text/inline-HTML matching the original's format (no markdown fences, no commentary).

Return ONLY a JSON object: { "rewritten": "<the replacement passage>", "rationale": "<one sentence>" }`;

export function passageRewriteUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  passage: string;
  instruction: string;
}): string {
  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Instruction: ${args.instruction || 'Improve clarity and SEO/GEO quality.'}

The exact passage to rewrite:
"""
${args.passage.slice(0, 4000)}
"""

Return the improved replacement for this passage only.`;
}

// ── Open Graph / Twitter cards ───────────────────────────────────

export const OG_SYSTEM = `You write Open Graph + Twitter card copy for a website's homepage so links shared to social and surfaced by AI render with a compelling title and description.

Hard rules:
- og:title ≤ 60 chars; og:description ≤ 150 chars.
- Accurate to the business; never invent claims.

Return ONLY a JSON object: { "ogTitle": "<title>", "ogDescription": "<description>", "rationale": "<one sentence>" }`;

export function ogUserPrompt(args: {
  brand: BrandPromptContext;
  title: string | null;
  pageText: string;
}): string {
  return `${brandBlock(args.brand)}

Homepage title: ${args.title ?? '(none)'}
Homepage content:
"""
${args.pageText.slice(0, 1500)}
"""

Write Open Graph + Twitter card title and description for the homepage.`;
}

// ── Content freshness (module: content-freshness) ────────────────

export const FRESHNESS_SYSTEM = `You write a short "freshness update" block for a page that hasn't been updated in a long time. AI answer engines strongly prefer recently-updated sources, so this block gives the page a current, quotable summary — and shipping it also bumps the CMS's modified date.

Hard rules:
- 40-60 words, one paragraph, self-contained (an assistant can quote it whole).
- Ground it ONLY in the supplied page content and brand facts; NEVER invent numbers, dates, or claims.
- Include at least one concrete fact from the source (a number, named entity, or specific capability). If the source has no numbers, use concrete specifics instead.
- Present tense, plain factual tone — no "we're excited", no marketing fluff.

Return ONLY a JSON object: { "update": "<40-60 word current summary>", "rationale": "<one sentence: why refreshing this page matters>" }`;

export function freshnessUserPrompt(args: {
  brand: { name?: string; description?: string };
  url: string;
  title: string | null;
  lastModified: string;
  pageText: string;
}): string {
  return `Brand: ${args.brand.name ?? 'Unknown'}
About: ${args.brand.description ?? '(none)'}
Page: ${args.url}
Title: ${args.title ?? '(none)'}
Last updated: ${args.lastModified}

Page content:
"""
${args.pageText.slice(0, 2500)}
"""

Write the freshness update block for this page.`;
}

// ── Image alt text (module: image-alt) ───────────────────────────

export const IMAGE_ALT_SYSTEM = `You write alt text for images on a web page. You cannot see the images — you infer meaning from each image's filename/path and the page's topic. Alt text serves screen-reader users first and search engines second.

Hard rules:
- 4-14 words per alt, concrete and descriptive; no "image of"/"picture of".
- Use the filename's words when meaningful (e.g. "team-dashboard-dark.png" → describe a team dashboard); when the filename is meaningless (IMG_1234), describe what an image in that spot on THIS page most plausibly shows, staying generic but useful.
- Natural language only — no keyword stuffing, no invented product claims.
- One alt per image, in the same order as supplied.

Return ONLY a JSON object: { "alts": [{"src": "<src>", "alt": "<alt text>"}], "rationale": "<one sentence>" }`;

export function imageAltUserPrompt(args: {
  brand: { name?: string; description?: string };
  url: string;
  title: string | null;
  pageText: string;
  images: string[];
}): string {
  return `Brand: ${args.brand.name ?? 'Unknown'}
About: ${args.brand.description ?? '(none)'}
Page: ${args.url}
Page title: ${args.title ?? '(none)'}
Page content summary:
"""
${args.pageText.slice(0, 1500)}
"""

Images missing alt text (src paths, in order):
${args.images.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Write alt text for each image.`;
}

// ── Keyword opportunity plan (module: keyword-opportunities) ─────

export const KEYWORD_PLAN_SYSTEM = `You are an SEO strategist turning a validated keyword opportunity into an on-page plan plus one ready-to-publish section. The site already ranks on page 2-3 for this keyword (real Search Console data) and third-party data confirms real monthly search volume with low ad competition — a low-competition, high-value target. Only ever target a keyword that has real search volume (the number is supplied below); never optimise for a phrase nobody searches.

Target the EXACT keyword — verbatim, same words in the same order — in every important on-page SEO location. Matching the searcher's exact phrase across these areas is what moves the ranking:
- the <title> tag
- the H1 (main page heading)
- the section's H2 heading
- the first sentence of the body copy (the answer capsule)
- the meta description
- the URL slug (hyphenated)
- at least one image alt text
Place it naturally in each — exact-match, but never keyword-stuff or repeat it awkwardly. A light, close variant is allowed ONLY in supporting body copy for readability; the locations above must carry the exact phrase.

Hard rules:
- The section must directly answer the keyword's search intent: open with a 40-60 word answer capsule that contains the exact keyword, then 2-3 short fact-dense paragraphs or a compact list.
- suggestedTitle (50-60 chars), suggestedH1, the section heading, suggestedMetaDescription, and suggestedSlug MUST each contain the exact keyword verbatim; suggestedTitle leads with it.
- Ground everything in the supplied page content and brand facts; NEVER invent statistics, prices, or claims.
- Each plan item names one on-page location above and the exact change to make there — specific to THIS page, not generic advice.

Return ONLY a JSON object:
{
  "suggestedTitle": "<50-60 char title leading with the exact keyword>",
  "suggestedH1": "<H1 containing the exact keyword>",
  "suggestedMetaDescription": "<140-155 char meta description containing the exact keyword>",
  "suggestedSlug": "<url-slug-with-exact-keyword>",
  "plan": ["<on-page location: the exact change targeting the keyword>", ...],
  "heading": "<question-style H2 containing the exact keyword>",
  "html": "<the section: <h2> + paragraphs/list as clean HTML, with the exact keyword in the first sentence>",
  "rationale": "<one sentence: why this keyword is winnable>"
}`;

export function keywordPlanUserPrompt(args: {
  brand: { name?: string; description?: string };
  url: string;
  keyword: string;
  volume: number;
  competition: number;
  position: number;
  title: string | null;
  pageText: string;
}): string {
  return `Brand: ${args.brand.name ?? 'Unknown'}
About: ${args.brand.description ?? '(none)'}
Target keyword: "${args.keyword}"
Monthly search volume: ${args.volume} · Ad competition: ${args.competition} (0-1, lower = easier)
Current Google position: ${args.position.toFixed(1)}
Page to optimise: ${args.url}
Current title: ${args.title ?? '(none)'}

Current page content:
"""
${args.pageText.slice(0, 3000)}
"""

Produce the targeting plan and the ready-to-publish section for this keyword.`;
}

// ── Search decay diagnosis (GSC period-over-period) ──────────────

/**
 * The closed vocabulary of causes the decay diagnosis must choose from.
 * Exported so the module can validate the model's answer against the same
 * list the prompt offered, rather than trusting free text.
 *
 * The first four are the classic decay vectors. `ai_answer_capture` is the
 * fifth and it is the reason this module is worth building here: a page
 * whose impressions hold while its clicks fall has usually not lost its
 * ranking, it has lost the click to an answer rendered above it. Livesov
 * already measures which engines cite the brand, so that vector can be
 * evidenced rather than guessed at.
 */
export const DECAY_VECTORS = [
  'stale_content',
  'intent_shift',
  'competitor_leapfrog',
  'cannibalization',
  'ai_answer_capture',
  'onpage_friction',
] as const;
export type DecayVector = (typeof DECAY_VECTORS)[number];

export const DECAY_SYSTEM = `You are an SEO forensics analyst diagnosing why one page lost search clicks. You are given a complete evidence file: click and impression movement across two equal windows, query-level detail, ranking movement, the page itself, and (when available) whether AI answer engines cite this page or a competitor's.

Your job is diagnosis, not reassurance. Commit to ONE primary cause.

The six causes you may choose from, and what each looks like in the evidence:
- "stale_content": the page has not been substantively updated, the topic has moved on, and dated or superseded facts remain. Competitors' equivalents are fresher.
- "intent_shift": what searchers want from this query changed. The SERP now favours a different format or angle than this page offers.
- "competitor_leapfrog": one or more competitors published something materially better and took the clicks. Position slipped or the SERP composition changed around a held position.
- "cannibalization": another page on the SAME site now competes for these queries, splitting or stealing the impressions.
- "ai_answer_capture": impressions held or grew while clicks fell, ranking is broadly intact, and the click is being absorbed by an answer surface above the results. Strongest when AI-visibility evidence shows the query being answered without this page being cited.
- "onpage_friction": the page still earns the click but no longer holds the visitor, and the search result has degraded with it. Look for the page-experience signals below - heavy script, pop-up/consent/newsletter overlays, ad slots, or a long run of text before the first heading. Choose this only when those signals are genuinely bad AND the ranking is roughly intact; friction explains a page that got harder to use, not a page that lost its position.

Hard rules:
- Pick exactly one primary cause, from that list, spelled exactly as written.
- Give a confidence score from 1 to 10. Be honest and use the low end: if the evidence is thin or two causes fit equally, say 4, not 8. A confident wrong diagnosis costs the user more than an admitted uncertainty.
- Ground every claim in the supplied evidence. Quote the numbers you relied on. If you did not receive evidence for something, do not assert it.
- "ai_answer_capture" requires impressions to be roughly flat or up while clicks fell. If impressions fell too, the click loss has a more ordinary explanation and you must choose one.
- "onpage_friction" requires the page-experience signals to actually be bad. They are proxies counted from the page's HTML, not lab measurements, so a page with light script and no overlays cannot be diagnosed this way no matter how tempting - and if the signals are merely unremarkable, pick another cause and say why in ruledOut.
- Recommended actions must be specific to this page. No generic SEO advice.

Return ONLY a JSON object:
{
  "primaryCause": "<one of the five keys>",
  "confidence": <integer 1-10>,
  "evidence": "<2-3 sentences citing the specific numbers that led you here>",
  "ruledOut": "<one sentence on the most plausible alternative and why you rejected it>",
  "actions": [
    { "action": "<specific, concrete instruction>", "priority": "high" | "medium" | "low" }
  ]
}`;

export function decayUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  title: string | null;
  windowDays: number;
  recent: { clicks: number; impressions: number; ctr: number; position: number };
  previous: { clicks: number; impressions: number; ctr: number; position: number };
  queries: {
    query: string;
    clicksBefore: number; clicksAfter: number;
    impressionsBefore: number; impressionsAfter: number;
    positionBefore: number; positionAfter: number;
  }[];
  pattern: string;
  pageText: string;
  lastModified: string | null;
  siteTrend: { clicksDelta: number; impressionsDelta: number } | null;
  aiEvidence: string | null;
  competitors?: SerpCompetitor[];
  friction?: {
    htmlKb: number; scriptKb: number; scriptCount: number; iframeCount: number;
    popupMarkers: number; adMarkers: number; wordsBeforeFirstHeading: number;
  } | null;
}): string {
  const pct = (before: number, after: number) =>
    before > 0 ? `${(((after - before) / before) * 100).toFixed(0)}%` : 'n/a';
  const q = args.queries.slice(0, 12).map((x) =>
    `- "${x.query}": clicks ${x.clicksBefore} → ${x.clicksAfter} (${pct(x.clicksBefore, x.clicksAfter)}),`
    + ` impressions ${x.impressionsBefore} → ${x.impressionsAfter} (${pct(x.impressionsBefore, x.impressionsAfter)}),`
    + ` position ${x.positionBefore.toFixed(1)} → ${x.positionAfter.toFixed(1)}`,
  ).join('\n');

  const site = args.siteTrend
    ? `\nWhole-site movement over the same windows (the control - a page that fell less than the site as a whole has not really fallen):\n`
      + `- clicks ${(args.siteTrend.clicksDelta * 100).toFixed(0)}%, impressions ${(args.siteTrend.impressionsDelta * 100).toFixed(0)}%\n`
    : '';

  const ai = args.aiEvidence
    ? `\nAI answer-engine evidence for this brand and these queries:\n${args.aiEvidence}\n`
    : `\nAI answer-engine evidence: none available for this brand. Do not infer AI capture without it; judge on the click/impression pattern alone and lower your confidence accordingly.\n`;

  const f = args.friction;
  const friction = f
    ? `\nPage-experience signals, counted from this page's own HTML (proxies, not lab measurements):\n`
      + `- page weight ${f.htmlKb}KB, of which ${f.scriptKb}KB is script across ${f.scriptCount} tags\n`
      + `- ${f.iframeCount} iframe(s), ${f.adMarkers} ad-network marker(s)\n`
      + `- ${f.popupMarkers} element(s) named as a pop-up, modal, overlay, consent or newsletter wall\n`
      + `- ${f.wordsBeforeFirstHeading} words before the first H2\n`
    : `\nPage-experience signals: unavailable (the page could not be read). Do not diagnose on-page friction without them.\n`;

  return `${brandBlock(args.brand)}

Page URL: ${args.url}
Current <title>: ${args.title ?? '(none)'}
Last substantive update detected: ${args.lastModified ?? 'unknown'}
Observed pattern: ${args.pattern}

Page totals, comparing the last ${args.windowDays} days against the ${args.windowDays} days before that:
- clicks ${args.previous.clicks} → ${args.recent.clicks} (${pct(args.previous.clicks, args.recent.clicks)})
- impressions ${args.previous.impressions} → ${args.recent.impressions} (${pct(args.previous.impressions, args.recent.impressions)})
- CTR ${(args.previous.ctr * 100).toFixed(2)}% → ${(args.recent.ctr * 100).toFixed(2)}%
- average position ${args.previous.position.toFixed(1)} → ${args.recent.position.toFixed(1)}
${site}
Query-level movement:
${q || '- (no query-level detail available)'}
${ai}${friction}${competitorBlock(args.queries[0]?.query ?? null, args.competitors)}
Current page content:
"""
${args.pageText.slice(0, 3500)}
"""

Diagnose the single primary cause of this page's click loss.`;
}

// ── Cannibalisation verdict ──────────────────────────────────────

export const CANNIBALIZATION_SYSTEM = `You are an SEO analyst resolving keyword cannibalisation: two or more pages on the SAME site competing for one query, so Google splits signals between them and neither ranks as well as one page would.

You are given the competing URLs with their Search Console performance for the shared query, plus a summary of each page.

Decide which single page should own the query, then say what happens to the others. Real cannibalisation has a cost; overlap alone does not. If the pages genuinely serve different intents and merely share a phrase, say so and recommend keeping both.

Choose the owner on evidence, in this order: which page already earns the most clicks for the query, which ranks best, and which one's content most directly matches the query's intent. A page with more traffic overall but a worse match for THIS query is not automatically the owner.

For each non-owner, choose exactly one resolution:
- "consolidate": the page has little independent value; merge its useful content into the owner and 301 it.
- "differentiate": the page deserves to exist but should target a different, adjacent query. Say which.
- "deoptimize": keep the page and its topic, but pull the competing query out of its title, H1 and internal anchors so it stops competing.
- "keep": not real cannibalisation; the pages serve different intents.

Return ONLY a JSON object:
{
  "isRealConflict": true | false,
  "owner": "<the URL that should rank for this query>",
  "reasoning": "<2-3 sentences citing the numbers>",
  "resolutions": [
    { "url": "<non-owner URL>", "action": "consolidate" | "differentiate" | "deoptimize" | "keep", "detail": "<what to do, specifically. For differentiate, name the query it should target instead.>" }
  ],
  "internalLinks": "<one sentence on how internal links should point after the change>"
}`;

export function cannibalizationUserPrompt(args: {
  brand: BrandPromptContext;
  query: string;
  pages: {
    url: string; title: string | null; clicks: number; impressions: number; position: number;
    summary: string;
  }[];
}): string {
  const rows = args.pages.map((p, i) =>
    `${i + 1}. ${p.url}\n   title: ${p.title ?? '(none)'}\n`
    + `   for "${args.query}": ${p.clicks} clicks, ${p.impressions} impressions, average position ${p.position.toFixed(1)}\n`
    + `   content summary: ${p.summary.slice(0, 600)}`,
  ).join('\n\n');
  return `${brandBlock(args.brand)}

Shared query: "${args.query}"

Competing pages on this site:

${rows}

Decide which page should own this query and what to do with the others.`;
}

// ── Content depth gap (competitor comparison) ────────────────────

export const CONTENT_GAP_SYSTEM = `You are a content gap analyst and semantic SEO specialist. A page is stalling below the top of page 1. You are given that page and the full text of the pages currently outranking it, plus a structural comparison of both.

Produce a surgical expansion brief for a human writer. You are NOT rewriting the page.

What to look for:
- Topical completeness: entities, subtopics and questions that ALL or MOST competitors cover and this page does not. Coverage every competitor shares is table stakes; coverage only one has is optional.
- Format and intent match: structural elements the winners use that this page lacks - comparison tables, step lists, pricing breakdowns, specification data, calculators, FAQ blocks.
- Answerable questions: direct questions competitors answer explicitly that this page leaves implicit. These win featured snippets and get quoted by AI answer engines.

Hard rules:
- Every recommendation must come from something you actually observed in the competitor content provided. Never pad the brief with generic SEO advice.
- Do not recommend adding word count for its own sake. If the page is genuinely complete and simply outranked on authority, say so - "no meaningful content gap" is a valid and useful finding.
- Headings must be specific to this topic, not templates. "Cost factors" is weak; "What changes the price of a ductless install in a 1950s home" is the standard.
- Do not invent facts, prices, or statistics for the writer to publish. Where a number is needed, say what kind of number and where it should come from.

Return ONLY a JSON object:
{
  "verdict": "gap" | "no_meaningful_gap",
  "summary": "<2-3 sentences: what the winners do that this page does not>",
  "wordCountNote": "<this page's length vs the competitor median, and whether that matters here>",
  "sections": [
    {
      "heading": "<exact H2 or H3 to insert>",
      "level": 2 | 3,
      "placement": "<where it goes, relative to existing headings on the page>",
      "brief": "<what the writer must cover: required concepts, entities, and the angle. 2-4 sentences.>",
      "sourcedFrom": "<which competitor(s) demonstrated this gap>"
    }
  ],
  "faqs": [ { "question": "<high-intent question>", "answerAngle": "<how to answer it and why that wins the snippet>" } ],
  "assetRecommendation": "<one visual or interactive element that would beat the competitors, and what it should contain>"
}`;

export function contentGapUserPrompt(args: {
  brand: BrandPromptContext;
  url: string;
  keyword: string;
  position: number;
  ourPage: { title: string | null; wordCount: number; headings: string[]; text: string };
  competitors: {
    url: string; title: string | null; wordCount: number; headings: string[];
    hasTables: boolean; hasFaqSchema: boolean; hasLists: boolean; text: string;
  }[];
}): string {
  const ours = `OUR PAGE: ${args.url}
title: ${args.ourPage.title ?? '(none)'}
word count: ${args.ourPage.wordCount}
headings:
${args.ourPage.headings.slice(0, 30).map((h) => `  - ${h}`).join('\n') || '  (none)'}
content:
"""
${args.ourPage.text.slice(0, 6000)}
"""`;

  const theirs = args.competitors.map((c, i) => `COMPETITOR ${i + 1} (currently outranking us): ${c.url}
title: ${c.title ?? '(none)'}
word count: ${c.wordCount}
has comparison/data tables: ${c.hasTables ? 'yes' : 'no'} · has FAQ schema: ${c.hasFaqSchema ? 'yes' : 'no'} · uses lists: ${c.hasLists ? 'yes' : 'no'}
headings:
${c.headings.slice(0, 30).map((h) => `  - ${h}`).join('\n') || '  (none)'}
content:
"""
${c.text.slice(0, 6000)}
"""`).join('\n\n');

  return `${brandBlock(args.brand)}

Target keyword: "${args.keyword}"
Our current position: ${args.position.toFixed(1)}

${ours}

${theirs}

Produce the content expansion brief.`;
}
