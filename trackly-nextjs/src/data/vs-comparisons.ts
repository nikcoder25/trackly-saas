import type { Metadata } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// Head-to-head "/vs/{tool}" comparison pages — data-driven cohort.
//
// These target "livesov vs {tool}" intent (a buyer choosing between the two,
// with us already in the query) and are deliberately SEPARATE from the
// "{tool} alternative" pages, which target replacement intent. Keyword
// ownership is enforced by tests/keyword-ownership.test.ts via
// src/data/seo-registry.ts — a vs page owns "livesov vs {tool}" and must never
// reach back for "{tool} alternative / review / pricing".
//
// The five ORIGINAL vs pages (profound, peec-ai, otterly, semrush, ahrefs) are
// hand-written bespoke routes and stay as-is. This module powers the NEWER
// cohort through a shared VsPage component, the same way alternatives.ts powers
// AlternativePage — so a sixth, seventh, etc. is a data entry, not a 260-line
// copy-paste.
//
// EDITORIAL RULES (identical to alternatives.ts):
//   - Livesov's own capabilities are the load-bearing, verifiable claims.
//   - Competitor claims are kept general/hedged; uncertain cells read
//     "Verify on site", never an invented feature or price.
//   - `competitorFit` is the honest case for choosing the competitor over us.
//     If we can't write one, the comparison is a strawman and converts worse.
//   - ASCII/Unicode punctuation only (no HTML entities) — plain React children.
// ─────────────────────────────────────────────────────────────────────────────

export interface VsFit {
  icon: string;
  title: string;
  description: string;
}

export interface VsFaq {
  question: string;
  answer: string;
}

export interface VsComparison {
  /** URL slug under /vs/, e.g. "scrunch-ai" -> /vs/scrunch-ai */
  slug: string;
  /** Display name of the competitor. */
  name: string;
  /** Vendor domain for the "verify on their site" disclaimer. */
  domain: string;
  /** Owned search term, registered + guarded in seo-registry.ts. */
  primaryKeyword: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  heroSubtitle: string;
  /** Four hero stats. Keep Livesov-focused and verifiable. */
  stats: { value: string; label: string }[];
  /** [capability, livesov value, competitor value] — competitor col hedged. */
  comparisonRows: [string, string, string][];
  /** Honest reasons a buyer might pick the competitor over Livesov (2-3). */
  competitorFit: VsFit[];
  /** "How to choose" intro sentence. */
  chooseIntro: string;
  /** Bullet points for the choose section: [boldLead, rest]. */
  chooseBullets: [string, string][];
  calloutBody: string;
  faqs: VsFaq[];
  /** The matching "{tool} alternative" page to cross-link. */
  alternativeHref: string;
}

const DISCLAIMER = 'Competitor details reflect public information and change frequently. Verify current features and pricing on';

export const vsComparisons: VsComparison[] = [
  // ── Scrunch AI ────────────────────────────────────────────────────────────
  {
    slug: 'scrunch-ai',
    name: 'Scrunch AI',
    domain: 'scrunchai.com',
    primaryKeyword: 'livesov vs scrunch ai',
    metaTitle: 'Livesov vs Scrunch AI | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs Scrunch AI, side by side: AI platforms covered, citations, evidence, and pricing. A self-serve tracker vs a content-team platform.',
    keywords:
      'livesov vs scrunch ai, scrunch ai vs livesov, ai visibility tool comparison, ai search monitoring tools, geo tool',
    heroSubtitle:
      'Two AI visibility tools with different centers of gravity. Livesov is a self-serve tracker across all five major LLMs with citations and stored evidence, from $9/mo. Scrunch AI leans toward content and brand teams at the enterprise end.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '0', label: 'Sales calls to start' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Self-serve signup (no sales call)', '✓', 'Verify on site'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Per-platform sentiment', '✓', 'Verify on site'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Verify on site'],
      ['Full AI response stored as evidence', '✓', 'Verify on site'],
      ['Free trial without a credit card', '✓ 7 days', 'Verify on site'],
      ['Entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '📝', title: 'Content-team workflow', description: 'Scrunch AI is positioned for content and brand teams that want visibility tied closely to a content production process.' },
      { icon: '🏢', title: 'Enterprise leaning', description: 'If you need an enterprise motion with managed onboarding, Scrunch sits nearer that end than a $9/mo self-serve tool.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Scrunch\'s platform coverage and features move; confirm the current feature set on scrunchai.com against your must-haves.' },
    ],
    chooseIntro: 'The decision usually comes down to how self-serve you want to be, and whether visibility should live inside a content workflow.',
    chooseBullets: [
      ['You want to start measuring today, self-serve:', 'Livesov is $9/mo with a 7-day no-card trial and all five engines from minute one.'],
      ['You want visibility bundled with content production:', 'Scrunch AI is positioned for that content-team workflow - evaluate it directly.'],
      ['You need evidence behind every metric:', 'Livesov stores the full AI response, so each number traces back to the answer a buyer saw.'],
    ],
    calloutBody:
      'Configure the same tracked prompts and competitor set in both, run them in parallel for a week, and compare coverage, citation detail, and evidence export before you commit.',
    faqs: [
      {
        question: 'Is Livesov a good Scrunch AI alternative?',
        answer:
          'For teams that want self-serve, evidence-backed measurement across all five major LLMs at a low entry price, yes. If your priority is a content-team workflow with visibility bundled in, Scrunch AI is built for that - verify its current scope on scrunchai.com.',
      },
      {
        question: 'How do Livesov and Scrunch AI pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month, each with a 7-day free trial and no credit card. Scrunch AI does not publish simple self-serve pricing in the same way - confirm current terms on scrunchai.com.',
      },
      {
        question: 'Which AI platforms does each track?',
        answer:
          'Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan and stores the full response as evidence. Verify Scrunch AI\'s current platform coverage on scrunchai.com.',
      },
    ],
    alternativeHref: '/scrunch-ai-alternative',
  },

  // ── Rankscale ─────────────────────────────────────────────────────────────
  {
    slug: 'rankscale',
    name: 'Rankscale',
    domain: 'rankscale.ai',
    primaryKeyword: 'livesov vs rankscale',
    metaTitle: 'Livesov vs Rankscale | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs Rankscale, side by side: AI platforms, rank scoring, citations, evidence, and pricing. Both track AI visibility - see where each fits.',
    keywords:
      'livesov vs rankscale, rankscale vs livesov, ai visibility tool comparison, ai rank tracker, geo tool',
    heroSubtitle:
      'Rankscale frames AI visibility as rank-style scoring. Livesov reports rank alongside mention rate, citations, per-platform sentiment, and fact-drift - each traceable to the stored AI response - across all five major LLMs from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Rank-style visibility scoring', '✓ Rank + mention rate', '✓ Core framing'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Per-platform sentiment', '✓', 'Verify on site'],
      ['Competitor share of voice', '✓ Up to 20 brands', 'Verify on site'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Verify on site'],
      ['Full AI response stored as evidence', '✓', 'Verify on site'],
      ['Entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '📊', title: 'Rank-first framing', description: 'If you want AI visibility expressed primarily in familiar rank-tracking terms, that framing is Rankscale\'s core.' },
      { icon: '🧮', title: 'Scoring model', description: 'Teams that think in a single score may prefer Rankscale\'s presentation - confirm the methodology on rankscale.ai.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Platform coverage and evidence features move; check rankscale.ai against your must-have list.' },
    ],
    chooseIntro: 'Both tools score AI visibility. The difference is how much sits behind the score.',
    chooseBullets: [
      ['You want a familiar rank-style score:', 'Both provide one - Rankscale centers on it, Livesov reports it alongside citations, sentiment, and evidence.'],
      ['You need to act on the score:', 'Livesov stores the full response and the ranked citation list, so you can see which page beat you, not just that you dropped.'],
      ['You want all five engines and competitor benchmarking:', 'Livesov includes ChatGPT, Claude, Gemini, Perplexity, and Grok plus up to 20 competitors on every plan.'],
    ],
    calloutBody:
      'Run the same prompts through both for a week and compare not just the scores but what each lets you do next - the citation lists and stored evidence are where a score becomes an action.',
    faqs: [
      {
        question: 'Is Livesov a good Rankscale alternative?',
        answer:
          'Yes, if you want rank-style scoring plus the evidence behind it - citations, sentiment, competitor share of voice, and fact-drift across all five major LLMs. If a single rank-style score is all you need, Rankscale centers on that - verify current features on rankscale.ai.',
      },
      {
        question: 'How do Livesov and Rankscale pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day free trial and no credit card. Confirm current Rankscale pricing on rankscale.ai.',
      },
      {
        question: 'Do both tools track the same AI platforms?',
        answer:
          'Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan. Verify Rankscale\'s current platform coverage on rankscale.ai.',
      },
    ],
    alternativeHref: '/rankscale-alternative',
  },

  // ── AthenaHQ ──────────────────────────────────────────────────────────────
  {
    slug: 'athenahq',
    name: 'AthenaHQ',
    domain: 'athenahq.ai',
    primaryKeyword: 'livesov vs athenahq',
    metaTitle: 'Livesov vs AthenaHQ | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs AthenaHQ, side by side: measurement vs agentic GEO workflows, platform coverage, citations, evidence, and pricing.',
    keywords:
      'livesov vs athenahq, athenahq vs livesov, ai visibility tool comparison, generative engine optimization tool, geo tool',
    heroSubtitle:
      'AthenaHQ positions around agentic GEO workflows - optimization bundled with the tracking. Livesov is the measurement layer: accurate, evidence-backed visibility across all five major LLMs, so you decide what to act on, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '✓', label: 'Evidence behind every metric' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Measurement with stored evidence', '✓ Full response saved', 'Verify on site'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Per-platform sentiment', '✓', 'Verify on site'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Verify on site'],
      ['Agentic optimization workflows', 'Free GEO audit + 11 tools', '✓ Core framing'],
      ['Self-serve entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '🤖', title: 'Agentic workflows', description: 'AthenaHQ is positioned around bundled optimization and execution, not measurement alone - useful if you want the tool to also act.' },
      { icon: '🧭', title: 'Recommendations built in', description: 'Teams that want the platform to drive the "what to do next" step may prefer AthenaHQ\'s framing.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Confirm AthenaHQ\'s current platform coverage and workflow features on athenahq.ai against your needs.' },
    ],
    chooseIntro: 'The split is measurement-first vs optimization-bundled.',
    chooseBullets: [
      ['You want accurate measurement you can trust and act on yourself:', 'Livesov stores the full response behind every metric and includes a free GEO audit for recommendations.'],
      ['You want optimization and execution bundled in:', 'AthenaHQ is positioned around agentic GEO workflows - evaluate it directly.'],
      ['You need all five engines and evidence export:', 'Livesov covers ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan with CSV/PDF export.'],
    ],
    calloutBody:
      'If your next action depends on trusting the measurement, start there. Livesov makes every metric checkable against the stored answer; layer optimization on top once you trust the numbers.',
    faqs: [
      {
        question: 'Is Livesov a good AthenaHQ alternative?',
        answer:
          'Yes, if you want measurement-first AI visibility - citations, sentiment, fact-drift, and competitor share of voice across all five major LLMs, with evidence attached, plus a free GEO audit. If you want agentic optimization bundled with tracking, AthenaHQ is built for that - verify its current scope on athenahq.ai.',
      },
      {
        question: 'How do Livesov and AthenaHQ pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day free trial and no credit card. Confirm current AthenaHQ pricing on athenahq.ai.',
      },
      {
        question: 'Does Livesov give optimization recommendations?',
        answer:
          'Livesov\'s free GEO audit scores a URL for AI citation-readiness and returns prioritized recommendations, but the core product is measurement-first. Verify AthenaHQ\'s current optimization features on athenahq.ai.',
      },
    ],
    alternativeHref: '/athenahq-alternative',
  },

  // ── Knowatoa ──────────────────────────────────────────────────────────────
  {
    slug: 'knowatoa',
    name: 'Knowatoa',
    domain: 'knowatoa.com',
    primaryKeyword: 'livesov vs knowatoa',
    metaTitle: 'Livesov vs Knowatoa | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs Knowatoa, side by side: continuous multi-engine monitoring vs AI-search-console checks, citations, evidence, and pricing.',
    keywords:
      'livesov vs knowatoa, knowatoa vs livesov, ai visibility tool comparison, ai search console, geo tool',
    heroSubtitle:
      'Knowatoa checks how AI assistants read and represent your site. Livesov turns that check into continuous monitoring: all five major LLMs on a schedule, with citations, sentiment, evidence, and competitor benchmarking, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Continuous scheduled monitoring', '✓', 'Verify on site'],
      ['Crawler / representation diagnostics', 'Free GEO audit', '✓ Core focus'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Competitor share of voice', '✓ Up to 20 brands', 'Verify on site'],
      ['Full AI response stored as evidence', '✓', 'Verify on site'],
      ['Entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '🛠', title: 'Console-style diagnostics', description: 'Knowatoa is positioned as an AI search console - a natural fit for technical SEOs who want representation-and-crawler diagnostics.' },
      { icon: '🔬', title: 'Read-how-AI-sees-you focus', description: 'If your main question is how assistants read your site rather than continuous mention tracking, that is Knowatoa\'s core.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Confirm Knowatoa\'s current feature set on knowatoa.com against your monitoring needs.' },
    ],
    chooseIntro: 'The question is one-off diagnostics vs continuous monitoring.',
    chooseBullets: [
      ['You want to check how AI reads your site:', 'Knowatoa is built around that console-style diagnostic - evaluate it directly.'],
      ['You want continuous, multi-engine monitoring with evidence:', 'Livesov runs all five engines on a schedule and stores every response as proof.'],
      ['You need competitor benchmarking:', 'Livesov compares share of voice against up to 20 competitors on every plan.'],
    ],
    calloutBody:
      'A one-off representation check and continuous monitoring are complementary. If you need to see week-to-week movement with citations and evidence, that is the job Livesov is built for.',
    faqs: [
      {
        question: 'Is Livesov a good Knowatoa alternative?',
        answer:
          'Yes, if you want to move from one-off checks to continuous, multi-engine monitoring with citations, sentiment, competitor benchmarking, and stored evidence. If your focus is representation-and-crawler diagnostics, Knowatoa is built for that - verify its current features on knowatoa.com.',
      },
      {
        question: 'How do Livesov and Knowatoa pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day free trial and no credit card. Confirm current Knowatoa pricing on knowatoa.com.',
      },
      {
        question: 'Does Livesov check how AI reads my site like Knowatoa?',
        answer:
          'Livesov\'s free GEO audit scores a URL for AI citation-readiness with prioritized recommendations, and the core product then monitors live answers continuously. Verify Knowatoa\'s current diagnostic features on knowatoa.com.',
      },
    ],
    alternativeHref: '/knowatoa-alternative',
  },

  // ── LLMrefs ───────────────────────────────────────────────────────────────
  {
    slug: 'llmrefs',
    name: 'LLMrefs',
    domain: 'llmrefs.com',
    primaryKeyword: 'livesov vs llmrefs',
    metaTitle: 'Livesov vs LLMrefs | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs LLMrefs, side by side: free-tier keyword tracking vs full multi-engine measurement with citations and evidence, plus pricing.',
    keywords:
      'livesov vs llmrefs, llmrefs vs livesov, ai visibility tool comparison, llm visibility tracker, ai rank tracker',
    heroSubtitle:
      'LLMrefs is a keyword-and-ranking LLM visibility tracker with a free tier used widely for first checks. Livesov is the full measurement layer: all five major LLMs, citations, sentiment, evidence, and competitor benchmarking, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '✓', label: 'Citations + evidence' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Free tier for first checks', 'Free GEO audit + 11 tools', '✓ Free tier'],
      ['Rank / visibility tracking', '✓ Rank + mention rate', '✓'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Per-platform sentiment', '✓', 'Verify on site'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Verify on site'],
      ['Full AI response stored as evidence', '✓', 'Verify on site'],
      ['Entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '🆓', title: 'Free first look', description: 'LLMrefs\' free tier is a genuinely useful zero-cost way to run a first visibility check before paying for anything.' },
      { icon: '🔤', title: 'Keyword-and-ranking angle', description: 'If you think in keyword-and-rank terms, LLMrefs is oriented that way - a familiar frame for SEOs.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Confirm LLMrefs\' current engine coverage and evidence features on llmrefs.com.' },
    ],
    chooseIntro: 'The split is free first-check vs full, evidence-backed measurement.',
    chooseBullets: [
      ['You want a zero-cost first look:', 'LLMrefs\' free tier is a good place to start - so is Livesov\'s free GEO audit and free tools, no signup needed.'],
      ['You need evidence and citations to act on:', 'Livesov stores the full response and ranked citation list behind every metric.'],
      ['You need all five engines and competitor share of voice:', 'Livesov includes them on every paid plan from $9/mo.'],
    ],
    calloutBody:
      'Start free on either. When you need the citation lists, stored evidence, and competitor benchmarking that turn a rank number into a decision, that is where Livesov goes further.',
    faqs: [
      {
        question: 'Is Livesov a good LLMrefs alternative?',
        answer:
          'Yes, if you want full measurement - citations, sentiment, fact-drift, and competitor share of voice across all five major LLMs, with evidence attached - beyond a free keyword-and-rank check. LLMrefs\' free tier is a good first look; verify its current paid features on llmrefs.com.',
      },
      {
        question: 'How do Livesov and LLMrefs pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day free trial and no credit card, plus a free GEO audit and free tools. Confirm current LLMrefs pricing and free-tier limits on llmrefs.com.',
      },
      {
        question: 'Does Livesov have a free option like LLMrefs?',
        answer:
          'Livesov offers a 7-day free trial of paid features with no credit card, plus a free GEO audit and eleven free one-off tools that need no signup. Verify LLMrefs\' current free tier on llmrefs.com.',
      },
    ],
    alternativeHref: '/llmrefs-alternative',
  },

  // ── Waikay ────────────────────────────────────────────────────────────────
  {
    slug: 'waikay',
    name: 'Waikay',
    domain: 'waikay.io',
    primaryKeyword: 'livesov vs waikay',
    metaTitle: 'Livesov vs Waikay | AI Visibility Tools Compared (2026)',
    metaDescription:
      'Livesov vs Waikay, side by side: entity-and-knowledge analysis vs continuous multi-engine tracking with citations and evidence, plus pricing.',
    keywords:
      'livesov vs waikay, waikay vs livesov, ai visibility tool comparison, answer engine optimization tool, geo tool',
    heroSubtitle:
      'Waikay analyzes what AI models know about a brand and its topics. Livesov measures what the live engines actually said this week - mentions, citations, sentiment, and share of voice - across all five major LLMs, with evidence, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['All 5 major LLMs on every plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Verify on site'],
      ['Live per-run answer tracking', '✓ Scheduled', 'Verify on site'],
      ['Entity / knowledge analysis', 'Fact-drift vs canonical facts', '✓ Core focus'],
      ['Citation capture (ranked sources)', '✓ Perplexity + ChatGPT Search', 'Verify on site'],
      ['Competitor share of voice', '✓ Up to 20 brands', 'Verify on site'],
      ['Full AI response stored as evidence', '✓', 'Verify on site'],
      ['Entry price', '$9/mo', 'Verify on site'],
    ],
    competitorFit: [
      { icon: '🧠', title: 'Entity & knowledge focus', description: 'Waikay centers on what models know about a brand and topic - a fit if knowledge-graph accuracy is your main worry.' },
      { icon: '📚', title: 'Topic-level understanding', description: 'Teams focused on how AI understands their category, not just whether they are mentioned, may prefer Waikay\'s angle.' },
      { icon: '🔎', title: 'Verify current scope', description: 'Confirm Waikay\'s current engine coverage and features on waikay.io against your needs.' },
    ],
    chooseIntro: 'The split is knowledge/entity analysis vs live answer measurement.',
    chooseBullets: [
      ['Your worry is what models know about your brand:', 'Waikay is oriented around entity and knowledge understanding - evaluate it directly.'],
      ['You want to measure the live answers buyers saw:', 'Livesov tracks mentions, citations, and sentiment per run across five engines, with evidence.'],
      ['You need competitor benchmarking and fact-drift alerts:', 'Livesov flags answers that contradict your canonical facts and compares up to 20 competitors.'],
    ],
    calloutBody:
      'Entity understanding and live measurement answer different questions. If you need to know what the engines said and cited this week, that is the measurement job Livesov is built for.',
    faqs: [
      {
        question: 'Is Livesov a good Waikay alternative?',
        answer:
          'Yes, if you want continuous, live measurement across all five major LLMs - mentions, citations, sentiment, competitor share of voice, and fact-drift - with evidence attached. If your primary need is entity-and-knowledge analysis, Waikay is built for that angle - verify its current features on waikay.io.',
      },
      {
        question: 'How do Livesov and Waikay pricing compare?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day free trial and no credit card. Confirm current Waikay pricing on waikay.io.',
      },
      {
        question: 'Does Livesov analyze what AI knows about my brand like Waikay?',
        answer:
          'Livesov\'s fact-drift detection flags AI answers that contradict your verified brand facts, with the quote attached - a measurement-side view of the same concern. Verify Waikay\'s current knowledge-analysis features on waikay.io.',
      },
    ],
    alternativeHref: '/waikay-alternative',
  },
];

export function getVsComparison(slug: string): VsComparison | undefined {
  return vsComparisons.find((v) => v.slug === slug);
}

export function getAllVsSlugs(): string[] {
  return vsComparisons.map((v) => v.slug);
}

/** Shared "verify on their site" disclaimer for the comparison note. */
export function vsDisclaimer(v: VsComparison): string {
  return `${DISCLAIMER} ${v.domain}. Comparison reflects public information as of 2026.`;
}

/** Build Next.js metadata for a /vs/ page from its data entry. */
export function buildVsMetadata(v: VsComparison): Metadata {
  const url = `https://livesov.com/vs/${v.slug}`;
  return {
    title: v.metaTitle,
    description: v.metaDescription,
    keywords: v.keywords,
    alternates: { canonical: `/vs/${v.slug}` },
    openGraph: {
      title: v.metaTitle,
      description: v.metaDescription,
      url,
      siteName: 'Livesov',
      type: 'website',
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: `Livesov vs ${v.name} - AI visibility tools compared`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: v.metaTitle,
      description: v.metaDescription,
      images: ['https://livesov.com/og-image.png'],
    },
  };
}
