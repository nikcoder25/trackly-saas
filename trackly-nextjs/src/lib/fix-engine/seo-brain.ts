/**
 * Fix Engine - the "SEO brain".
 *
 * A single, codified set of SEO/GEO principles that every module's
 * generation is grounded in. It is prepended to each module's system
 * prompt (see generate.ts), so every rewrite, schema block, FAQ, page,
 * and passage the engine produces follows the same playbook.
 *
 * Override it without touching code by setting FIX_ENGINE_SEO_BRAIN (env)
 * to your own playbook text — e.g. paste your "Growth Atlas" SEO brain
 * there and all modules will follow it verbatim.
 */

export const DEFAULT_SEO_BRAIN = `SEO & GEO PLAYBOOK (apply to everything you produce):

INTENT & E-E-A-T
- Match the page to the searcher's actual intent; lead with the answer.
- Demonstrate Experience, Expertise, Authoritativeness, Trust: be specific,
  factual, and verifiable. Never fabricate facts, stats, prices, dates,
  credentials, or quotes. If a fact isn't supplied, stay general and true.

ENTITIES & CLARITY
- Name the entities clearly (brand, product, place, people) and state what
  the business actually is/does. Use plain, concrete language over fluff.

STRUCTURE FOR HUMANS AND LLMs (GEO)
- Open with a self-contained, quotable answer (inverted pyramid).
- Use question-style H2s that mirror how people ask AI assistants.
- Write short, fact-dense, standalone passages an LLM can quote verbatim
  without surrounding context.

LINKS & CITATIONS
- Favour relevant internal links with descriptive, specific anchor text to
  build topical authority (never "click here").
- Support factual claims with citations to authoritative, official sources
  (primary sources, official docs, standards bodies, reputable orgs).
  Only cite real, resolvable URLs — never invent links.

ON-PAGE HYGIENE
- Titles 50-60 chars, meta descriptions 140-155 chars, one clear H1,
  logical heading hierarchy, descriptive image alt text.
- Add appropriate schema.org structured data grounded in real page facts.

TONE
- Helpful, precise, and honest. No keyword stuffing, no clickbait, no
  unverifiable superlatives.`;

/**
 * The active SEO brain — env override wins, else the codified default.
 * Kept as a function so a future DB-backed/per-tenant brain can slot in
 * without changing call sites.
 */
export function getSeoBrain(): string {
  const override = process.env.FIX_ENGINE_SEO_BRAIN?.trim();
  return override && override.length > 0 ? override : DEFAULT_SEO_BRAIN;
}
