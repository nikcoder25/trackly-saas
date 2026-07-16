/**
 * Fix Engine - the "SEO brain".
 *
 * A codified SEO/GEO playbook that every module's generation is grounded
 * in (prepended to each module's system prompt in generate.ts). So a title
 * rewrite, a comparison page, a schema block, and a passage rewrite all
 * follow the same principles.
 *
 * Resolution order for the ACTIVE brain (first non-empty wins):
 *   1. Per-brand brain saved by the user from the dashboard (DB).
 *   2. FIX_ENGINE_SEO_BRAIN env (inline playbook text).
 *   3. A repo file — FIX_ENGINE_SEO_BRAIN_PATH, else
 *      `growth-atlas-seo-brain.md` at the project root.
 *   4. The codified DEFAULT_SEO_BRAIN below.
 *
 * Users can also one-click load a built-in preset (e.g. the Matt Diggity
 * playbook) from the editor and save it as their brain.
 */

import fs from 'fs';
import path from 'path';
import { pool } from '@/lib/db';

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
  unverifiable superlatives.

FORMATTING (hard rule)
- Never use an em dash (—) or en dash (–) in any output. Use a plain hyphen
  "-", a comma, a colon, or two shorter sentences instead.`;

/**
 * Distilled from Matt Diggity / The Search Initiative's published SEO
 * playbooks. A codified preset users can load as their brain.
 */
export const MATT_DIGGITY_SEO_BRAIN = `SEO & GEO PLAYBOOK — Matt Diggity / The Search Initiative method:

INTENT & PRIORITISATION
- Optimise for search intent, not just keyword volume. Prioritise by
  commercial value first, then ranking opportunity.
- Hammer the USP and customisation intent into commercial pages (e.g.
  "custom", "made-to-order"); generic descriptions lose ready buyers.

CONTENT THAT RANKS AND GETS CITED
- Lead each section with an "answer capsule": a concise, self-contained
  120-150 character answer placed right after a question-style H2. Keep the
  answer capsule itself LINK-FREE (links signal the answer lives elsewhere
  and hurt LLM citation); put any links in supporting paragraphs.
- Add original, proprietary value wherever possible — data, benchmarks,
  test results, a branded stat. Original data amplifies citations.
- Write deeper, more useful content than an AI Overview can summarise;
  bring unique human perspective and real experience. Aim to be THE
  definitive source on a specific topic, not generic coverage.
- Never fabricate facts, stats, prices, or quotes.

TOPICAL CLUSTERS & INTERNAL LINKING
- Replace ad-hoc blogging with structured topic clusters on a content
  calendar; give each piece a brief (intent, depth, internal-link targets).
- Use hub-and-sibling internal linking so related pages reinforce each
  other; link informational content into commercial product/category pages
  so authority flows to money pages.
- Keep anchor text consistent with slight natural variants — relevant, not
  over-optimised. Link new pages from relevant hubs the moment they go live.

E-E-A-T & TRUST
- Clear business info (name, address, contact) in the footer.
- Real author pages + bios with credentials/experience across content.
- Human, story-led About copy and value proposition over corporate speak.

TECHNICAL & STRUCTURED DATA
- Category/commercial pages need intro copy, FAQs, schema markup, internal
  links, media, and a minimum content depth to compete and show in AI
  summaries. Validate structured data. Avoid thin or over-optimised pages.

MULTI-PLATFORM (AI ERA)
- Build for Search, AI Overviews, Gemini, ChatGPT, and Perplexity together.
  Real authority, quality content, and brand signals travel across all of
  them. Favour specificity that helps niche queries find you.

FORMATTING (hard rule)
- Never use an em dash (—) or en dash (–) in any output. Use a plain hyphen
  "-", a comma, a colon, or two shorter sentences instead.`;

export interface SeoBrainPreset { key: string; title: string; description: string; content: string }

export const SEO_BRAIN_PRESETS: SeoBrainPreset[] = [
  { key: 'default', title: 'Livesov default', description: 'Balanced SEO + GEO best practices.', content: DEFAULT_SEO_BRAIN },
  { key: 'matt-diggity', title: 'Matt Diggity (Diggity Marketing / TSI)', description: "Diggity's intent-first, cluster + E-E-A-T playbook.", content: MATT_DIGGITY_SEO_BRAIN },
];

// ── base (env / file / default) ──────────────────────────────────

let cachedFileBrain: string | null = null;

/** Sync base brain: env → repo file → default (no DB). */
export function getBaseSeoBrain(): string {
  const env = process.env.FIX_ENGINE_SEO_BRAIN?.trim();
  if (env) return env;
  if (cachedFileBrain !== null) return cachedFileBrain;
  let fromFile = '';
  try {
    const file = process.env.FIX_ENGINE_SEO_BRAIN_PATH
      || path.join(process.cwd(), 'growth-atlas-seo-brain.md');
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8').trim();
      if (text) fromFile = text;
    }
  } catch { /* unreadable — fall through to default */ }
  cachedFileBrain = fromFile || DEFAULT_SEO_BRAIN;
  return cachedFileBrain;
}

export function resetSeoBrainCache(): void {
  cachedFileBrain = null;
  brandCache.clear();
}

// ── per-brand (DB) storage ───────────────────────────────────────

let schemaEnsured = false;
async function ensureSeoBrainSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_seo_brains (
      brand_id   TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fix_seo_brains_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  schemaEnsured = true;
}

export async function getBrandSeoBrain(brandId: string): Promise<string | null> {
  await ensureSeoBrainSchema();
  const res = await pool.query(`SELECT content FROM fix_seo_brains WHERE brand_id = $1`, [brandId]);
  const c = res.rows[0]?.content as string | undefined;
  return c && c.trim() ? c : null;
}

export async function setBrandSeoBrain(brandId: string, content: string): Promise<void> {
  await ensureSeoBrainSchema();
  await pool.query(
    `INSERT INTO fix_seo_brains (brand_id, content) VALUES ($1, $2)
     ON CONFLICT (brand_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [brandId, content],
  );
  brandCache.delete(brandId);
}

export async function clearBrandSeoBrain(brandId: string): Promise<void> {
  await ensureSeoBrainSchema();
  await pool.query(`DELETE FROM fix_seo_brains WHERE brand_id = $1`, [brandId]);
  brandCache.delete(brandId);
}

// ── active brain (used by generation) ────────────────────────────

const brandCache = new Map<string, { at: number; val: string }>();
const TTL_MS = 30_000;

/**
 * The active brain for a brand: per-brand DB value if set, else the base
 * (env/file/default). Short-cached per brand so a scan's many generations
 * don't re-query. Falls back gracefully if the DB is unavailable.
 */
export async function getSeoBrain(brandId?: string): Promise<string> {
  if (!brandId) return getBaseSeoBrain();
  const hit = brandCache.get(brandId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
  let val = getBaseSeoBrain();
  try {
    const custom = await getBrandSeoBrain(brandId);
    if (custom) val = custom;
  } catch { /* DB hiccup — use base */ }
  brandCache.set(brandId, { at: Date.now(), val });
  return val;
}

/** Public view for the editor: the effective brain + whether it's custom. */
export async function getSeoBrainStatus(brandId: string): Promise<{ content: string; isCustom: boolean; base: string }> {
  const base = getBaseSeoBrain();
  let custom: string | null = null;
  try { custom = await getBrandSeoBrain(brandId); } catch { /* ignore */ }
  return { content: custom ?? base, isCustom: !!custom, base };
}
