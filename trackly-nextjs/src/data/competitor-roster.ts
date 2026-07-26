// ─────────────────────────────────────────────────────────────────────────────
// Shared roster of AI visibility / GEO tools.
//
// This is the single source of truth for every competitor we name anywhere on
// the marketing site. The "[tool] alternative" pages build their ranked
// shortlist from it, so a list entry can never drift from the dedicated page
// that describes the same tool.
//
// EDITORIAL RULES - read before adding or editing an entry:
//   1. Blurbs describe POSITIONING, not unverifiable specifics. We do not
//      publish a competitor's pricing, platform count, or feature list as
//      fact here, because those change without notice and a stale number
//      published as fact is worse than no number.
//   2. Every claim about Livesov must be true today and checkable in-product.
//   3. `bestFor` is the honest reason a buyer might legitimately choose that
//      tool OVER Livesov. If we cannot write one, the tool does not belong on
//      a shortlist - a list where every rival is strawmanned converts worse
//      and reads as marketing, not research.
//   4. Keep punctuation ASCII/Unicode (no HTML entities): these strings render
//      as plain React children.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompetitorProfile {
  /** Display name as the vendor writes it. */
  name: string;
  /** Vendor domain, used for the "verify on their site" disclaimer. */
  domain: string;
  /** One-line positioning statement. */
  blurb: string;
  /** The buyer this tool genuinely serves better than the alternatives. */
  bestFor: string;
  /** Slug of our dedicated alternative page, when one exists. */
  alternativeSlug?: string;
  /** Path to our head-to-head /vs/ page, when one exists. */
  vsHref?: string;
}

/**
 * Ordered by how often the tool shows up in buyer research, which is also the
 * default ranking order for the shortlists. Livesov is handled separately and
 * is never in this array.
 */
export const COMPETITOR_ROSTER: CompetitorProfile[] = [
  {
    name: 'Profound',
    domain: 'tryprofound.com',
    blurb:
      'The best-funded enterprise platform in the category, sold through a demo-led motion and bundled with content generation and automation agents.',
    bestFor: 'Enterprise teams with procurement, SSO requirements, and budget for a managed rollout.',
    alternativeSlug: 'profound-alternative',
    vsHref: '/vs/profound',
  },
  {
    name: 'Peec AI',
    domain: 'peec.ai',
    blurb:
      'An AI visibility tracker popular with agencies, built around client reporting across answer engines.',
    bestFor: 'Agencies that want a reporting-first workflow and are happy to buy engine coverage as add-ons.',
    alternativeSlug: 'peec-ai-alternative',
    vsHref: '/vs/peec-ai',
  },
  {
    name: 'Otterly.ai',
    domain: 'otterly.ai',
    blurb:
      'A lightweight SMB-focused monitor for AI search results, with a simple setup and a narrow engine focus.',
    bestFor: 'Small teams who only care about ChatGPT and Google AI surfaces and want the simplest possible tool.',
    alternativeSlug: 'otterly-ai-alternative',
    vsHref: '/vs/otterly',
  },
  {
    name: 'Scrunch AI',
    domain: 'scrunchai.com',
    blurb:
      'An AI search visibility platform aimed at content and brand teams, leaning toward the enterprise end.',
    bestFor: 'Content teams that want visibility data tied closely to a content production workflow.',
    alternativeSlug: 'scrunch-ai-alternative',
  },
  {
    name: 'Rankscale',
    domain: 'rankscale.ai',
    blurb:
      'An AI search analytics tool focused on rank-style scoring of brand presence in answer engines.',
    bestFor: 'SEOs who want AI visibility framed in familiar rank-tracking terms.',
    alternativeSlug: 'rankscale-alternative',
  },
  {
    name: 'AthenaHQ',
    domain: 'athenahq.ai',
    blurb:
      'A GEO platform positioned around agentic optimization workflows rather than measurement alone.',
    bestFor: 'Teams that want recommendations and execution bundled with the tracking.',
    alternativeSlug: 'athenahq-alternative',
  },
  {
    name: 'Knowatoa',
    domain: 'knowatoa.com',
    blurb:
      'An AI search console that checks how a site is read and represented across assistants.',
    bestFor: 'Technical SEOs who want crawler-and-representation diagnostics alongside mention tracking.',
    alternativeSlug: 'knowatoa-alternative',
  },
  {
    name: 'LLMrefs',
    domain: 'llmrefs.com',
    blurb:
      'A keyword-and-ranking oriented LLM visibility tracker with a free tier used widely for first checks.',
    bestFor: 'Anyone who wants a zero-cost first look before committing to a paid tool.',
    alternativeSlug: 'llmrefs-alternative',
  },
  {
    name: 'Waikay',
    domain: 'waikay.io',
    blurb:
      'A knowledge-and-entity focused tool that looks at what AI models know about a brand, not just whether they mention it.',
    bestFor: 'Brand teams whose main worry is entity understanding and knowledge-graph accuracy.',
    alternativeSlug: 'waikay-alternative',
  },
  {
    name: 'Promptwatch',
    domain: 'promptwatch.io',
    blurb:
      'A prompt-monitoring tool that logs how answers to tracked prompts change over time.',
    bestFor: 'Teams that mainly want prompt-level change logging on a small set of queries.',
    alternativeSlug: 'promptwatch-alternative',
  },
  {
    name: 'Bluefish',
    domain: 'bluefish.ai',
    blurb:
      'An enterprise AI-agent visibility and brand-management platform aimed at large organizations.',
    bestFor: 'Large brands treating AI representation as a governance problem rather than a marketing metric.',
    alternativeSlug: 'bluefish-ai-alternative',
  },
  {
    name: 'Evertune',
    domain: 'evertune.ai',
    blurb:
      'An AI brand analytics platform built around model-level brand association research.',
    bestFor: 'Brand and insights teams that want model-association research more than day-to-day tracking.',
    alternativeSlug: 'evertune-alternative',
  },
  {
    name: 'Daydream',
    domain: 'withdaydream.com',
    blurb:
      'An AI-native marketing platform where search visibility sits inside a broader growth toolset.',
    bestFor: 'Teams looking to consolidate several marketing functions into one AI-native platform.',
    alternativeSlug: 'daydream-alternative',
  },
  {
    name: 'Xfunnel',
    domain: 'xfunnel.ai',
    blurb:
      'A buyer-journey oriented AI visibility tool that maps mentions to funnel stages.',
    bestFor: 'B2B teams that want AI visibility segmented by where a buyer is in the journey.',
    alternativeSlug: 'xfunnel-alternative',
  },
  {
    name: 'Goodie',
    domain: 'higoodie.com',
    blurb:
      'An AI search optimization platform combining monitoring with content recommendations.',
    bestFor: 'Marketers who want the tool to also tell them what to publish next.',
    alternativeSlug: 'goodie-alternative',
  },
  {
    name: 'Semrush AI Toolkit',
    domain: 'semrush.com',
    blurb:
      'An AI visibility module added on top of the established Semrush SEO suite.',
    bestFor: 'Teams already paying for Semrush who want AI data in the same login as their SEO data.',
    vsHref: '/vs/semrush',
  },
  {
    name: 'Ahrefs Brand Radar',
    domain: 'ahrefs.com',
    blurb:
      "Ahrefs' brand-mention tracking across AI answers, bundled into the wider Ahrefs toolset.",
    bestFor: 'Existing Ahrefs customers who want AI mentions next to their backlink and keyword data.',
    vsHref: '/vs/ahrefs',
  },
];

/** Livesov's own entry, always ranked first on our own shortlists. */
export const LIVESOV_PROFILE: CompetitorProfile = {
  name: 'Livesov',
  domain: 'livesov.com',
  blurb:
    'A self-serve AI visibility tracker covering ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan, with citation capture, hallucination detection, and the full AI response stored as evidence.',
  bestFor:
    'SMBs, startups, and agencies that want complete multi-engine measurement with evidence, from $9/mo, with no demo call.',
};

export function getCompetitor(name: string): CompetitorProfile | undefined {
  return COMPETITOR_ROSTER.find((c) => c.name === name);
}

/**
 * Build the ranked shortlist for a "[subject] alternatives" page.
 *
 * Livesov is always #1 (this is our own site and we say so plainly in the
 * methodology note). The remaining slots come from the roster, excluding the
 * page's own subject - you are not an alternative to yourself.
 *
 * The starting offset is derived from the subject's position in the roster so
 * that the nine alternative pages do not all publish the same six rivals in
 * the same order. Nine near-identical lists would read as templated boilerplate
 * to both readers and search engines; rotating the window keeps each page
 * genuinely distinct while staying fully deterministic (no randomness, so the
 * static build output is stable).
 */
export function buildShortlist(subjectName: string, size = 7): CompetitorProfile[] {
  const pool = COMPETITOR_ROSTER.filter((c) => c.name !== subjectName);
  const slots = Math.max(0, Math.min(size - 1, pool.length));
  const subjectIndex = COMPETITOR_ROSTER.findIndex((c) => c.name === subjectName);
  const offset = subjectIndex >= 0 ? subjectIndex : 0;

  const picked: CompetitorProfile[] = [];
  for (let i = 0; i < slots; i++) {
    picked.push(pool[(offset + i) % pool.length]);
  }
  return [LIVESOV_PROFILE, ...picked];
}
