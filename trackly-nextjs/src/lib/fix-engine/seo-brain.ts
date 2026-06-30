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
 * The active SEO brain. Resolution order (first non-empty wins):
 *   1. FIX_ENGINE_SEO_BRAIN env (inline playbook text)
 *   2. a repo file — FIX_ENGINE_SEO_BRAIN_PATH, else `growth-atlas-seo-brain.md`
 *      at the project root (drop your Growth Atlas brain there and commit it)
 *   3. the codified DEFAULT_SEO_BRAIN
 *
 * The file is read once per process and memoised. Server-only (this module
 * is only imported by the generation path, never by client code).
 */
let cachedBrain: string | null = null;

export function getSeoBrain(): string {
  const env = process.env.FIX_ENGINE_SEO_BRAIN?.trim();
  if (env) return env;
  if (cachedBrain !== null) return cachedBrain;

  let fromFile = '';
  try {
    // Lazy require so bundlers never pull `fs` into a client chunk.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const file = process.env.FIX_ENGINE_SEO_BRAIN_PATH
      || path.join(process.cwd(), 'growth-atlas-seo-brain.md');
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8').trim();
      if (text) fromFile = text;
    }
  } catch {
    // No filesystem (edge) or unreadable file — fall through to default.
  }

  cachedBrain = fromFile || DEFAULT_SEO_BRAIN;
  return cachedBrain;
}

/** Test/hot-reload seam: clear the memoised file-loaded brain. */
export function resetSeoBrainCache(): void {
  cachedBrain = null;
}
