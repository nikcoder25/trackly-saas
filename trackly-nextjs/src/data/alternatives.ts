import type { Metadata } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// Competitor "alternative" landing pages.
//
// These target "[tool] alternative" search intent (someone actively looking to
// replace a tool) and are deliberately SEPARATE from the /vs/ comparison pages,
// which target head-to-head "livesov vs [tool]" intent. Where a /vs/ page also
// exists (Profound, Peec AI, Otterly) the alternative page cross-links to it.
//
// All competitor claims are kept general and hedged - the honest position is
// "verify current features and pricing on the vendor's own site." Livesov's own
// capabilities are the verifiable, load-bearing claims. Keep punctuation ASCII/
// Unicode (no HTML entities): these strings render as plain React children.
// ─────────────────────────────────────────────────────────────────────────────

export interface AlternativeStat {
  value: string;
  label: string;
}

export interface AlternativeFaq {
  question: string;
  answer: string;
}

export interface Alternative {
  /** URL slug, e.g. "peec-ai-alternative" -> /peec-ai-alternative */
  slug: string;
  /** Display name of the competitor, e.g. "Peec AI" */
  name: string;
  /** Vendor domain for the "verify on their site" disclaimer */
  domain: string;
  /** One-line description of what the competitor is (kept general/accurate) */
  category: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  heroSubtitle: string;
  stats: AlternativeStat[];
  /** [capability, livesov value, competitor value] */
  comparisonRows: [string, string, string][];
  switchHeading: string;
  switchParagraphs: string[];
  calloutTitle: string;
  calloutBody: string;
  faqs: AlternativeFaq[];
  /** Optional cross-link to an existing /vs/ comparison page */
  vsHref?: string;
  vsLabel?: string;
  vsDescription?: string;
}

const CARD = 'Competitor details change frequently. Always verify current features and pricing on';

export const alternatives: Alternative[] = [
  // ── 1. Profound (highest CPC) ─────────────────────────────────────────────
  {
    slug: 'profound-alternative',
    name: 'Profound',
    domain: 'tryprofound.com',
    category:
      'an enterprise answer-engine-optimization platform for large brands, with monitoring, content generation, and automation agents.',
    metaTitle: 'Best Profound Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Profound alternative? Livesov is the self-serve AI visibility tracker - all 5 LLMs, citations, and evidence from $9/mo, no sales call. Compare it to Profound.',
    keywords:
      'profound alternative, best profound alternative, tryprofound alternative, profound alternatives, profound competitor, ai visibility tool, geo tool, answer engine optimization tool',
    heroSubtitle:
      'Profound is the best-funded enterprise platform in AI visibility - and priced for it. Livesov gives you the same core measurement across all five major LLMs, with citations and stored evidence, starting free and self-serve. No demo call, no annual contract.',
    stats: [
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '$99+', label: 'Profound entry price /mo' },
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '0', label: 'Sales calls to start' },
    ],
    comparisonRows: [
      ['Self-serve signup (no sales call)', '✓', '✗ Demo-led'],
      ['Free trial without a credit card', '✓ 7 days', '✗ No self-serve trial'],
      ['Entry price', '$9/mo', '$99/mo (ChatGPT-only, public reports)'],
      ['All 5 major LLMs on entry plan', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', '✗ Single engine at entry'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', '✗ Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Partial'],
      ['Free GEO audit + free tools', '✓ 11 free tools', 'Not the focus'],
      ['Content generation / CMS publishing', '✗', '✓ Growth plan'],
      ['Automation agents', '✗', '✓ GEO Agents'],
      ['Enterprise SSO / procurement', 'Contact us', '✓ Core motion'],
    ],
    switchHeading: 'Should you switch from Profound to Livesov?',
    switchParagraphs: [
      'The AI visibility category has split into two motions. Enterprise platforms like Profound sell high-commitment contracts with content production, automation agents, and managed service attached. Self-serve tools like Livesov let a marketer start measuring today for the price of a lunch.',
      'The measurement core - does ChatGPT mention you, who does Perplexity cite, what does Claude actually say - is remarkably similar across both. What you pay for at the enterprise tier is everything around the measurement: content factories, automation, procurement compatibility, and a dedicated CSM.',
      'If you are a Fortune 500 team that needs bundled content generation, SSO, and white-glove onboarding, Profound is built for exactly that buyer. If you are an SMB, startup, or agency that wants accurate multi-LLM visibility with evidence - without a demo call or a $399+/mo commitment - Livesov is the leaner Profound alternative.',
    ],
    calloutTitle: 'Measure first, commit later',
    calloutBody:
      'Many teams start self-serve to prove the channel - does AI visibility actually move pipeline? - then take that evidence into an enterprise procurement cycle if they outgrow it. Starting at $399+/mo just to answer "do we even have an AI visibility problem?" is backwards.',
    faqs: [
      {
        question: 'Is Livesov a good Profound alternative?',
        answer:
          'For SMBs, startups, and agencies that want self-serve AI visibility tracking across all five major LLMs without a demo call or a $399+/mo commitment, yes. For Fortune 500 teams that need bundled content production, automation agents, SSO, and managed onboarding, Profound is built for that buyer and Livesov is not.',
      },
      {
        question: 'How does pricing compare between Livesov and Profound?',
        answer:
          'Livesov runs $9 (Starter), $29 (Pro), and $89 (Agency) per month, each with a 7-day free trial and no credit card. Public reporting as of 2026 lists Profound Starter at around $99/mo limited to ChatGPT, Growth at around $399/mo for multi-engine coverage, and custom enterprise pricing, with no self-serve trial. Verify current pricing on tryprofound.com.',
      },
      {
        question: 'Does Livesov cover the same AI platforms as Profound?',
        answer:
          'For core measurement, yes - Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan and stores the full AI response as evidence. Profound adds enterprise capabilities on top (content generation, automation agents, CMS publishing) that Livesov does not.',
      },
      {
        question: 'Can I migrate my tracked prompts from Profound to Livesov?',
        answer:
          'Yes. Recreate the same prompts and competitor set in Livesov - onboarding takes a few minutes - and run both in parallel for a week to compare coverage before you switch. Livesov exports every metric and the underlying responses as CSV or PDF.',
      },
    ],
    vsHref: '/vs/profound',
    vsLabel: 'Livesov vs Profound',
    vsDescription: 'The full head-to-head: self-serve vs enterprise.',
  },

  // ── 2. Peec AI (high CPC, 1.2K cluster) ───────────────────────────────────
  {
    slug: 'peec-ai-alternative',
    name: 'Peec AI',
    domain: 'peec.ai',
    category:
      'an AI visibility tracker popular with agencies, focused on reporting across AI answer engines.',
    metaTitle: 'Best Peec AI Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Peec AI alternative? Livesov tracks all 5 LLMs with no per-platform add-ons, from $9/mo with a 7-day no-card trial. See how it compares to Peec AI.',
    keywords:
      'peec ai alternative, best peec ai alternative, peec.ai alternatives, peec ai alternatives, peec ai competitor, ai visibility tracker, geo tool, llm seo tool',
    heroSubtitle:
      'Peec AI is a capable agency-focused AI visibility tracker - but Claude, Gemini, and Grok are listed as paid add-ons on top of the base subscription. Livesov includes all five major LLMs on every plan, starting at $9/mo with a 7-day no-card trial.',
    stats: [
      { value: '5', label: 'LLMs included, every plan' },
      { value: '$0', label: 'Per-platform add-ons' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['All 5 LLMs included (no add-ons)', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Claude / Gemini / Grok as paid add-ons'],
      ['Entry price', '$9/mo', 'Around $100/mo (public reports)'],
      ['Free trial without a credit card', '✓ 7 days', 'Varies - verify on site'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', '✗ Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Partial'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Competitor benchmarking', '✓ Up to 20', '✓'],
      ['GEO audit included', '✓ URL-level scoring', 'Not the focus'],
      ['Free public tools', '✓ 11 free tools', 'Varies'],
    ],
    switchHeading: 'Should you switch from Peec AI to Livesov?',
    switchParagraphs: [
      'Peec AI and Livesov are both self-serve AI visibility trackers, so the decision usually comes down to two things: how many AI engines you actually need, and how the pricing is structured for them.',
      'Peec AI structures Claude, Gemini, and Grok as add-ons on top of a base subscription that starts around $100/mo, which adds up quickly once you want full coverage. Livesov includes all five major LLMs on every plan - the $9 Starter tier is not locked to a single engine - and adds hallucination detection and a URL-level GEO audit that Peec does not center on.',
      'If your team is already committed to Peec AI reporting workflows, that has real value. If you are choosing now, or your add-on bill is climbing, Livesov is the all-platforms-included Peec AI alternative.',
    ],
    calloutTitle: 'Watch the add-on math',
    calloutBody:
      'The sticker price of an entry plan is not the real cost if the engines your buyers use are add-ons. Total up every platform you need before comparing - all-inclusive pricing usually wins once you cover more than one engine.',
    faqs: [
      {
        question: 'Is Livesov a good Peec AI alternative?',
        answer:
          'Yes, especially if you want all five major LLMs (ChatGPT, Claude, Gemini, Perplexity, Grok) included on every plan with no per-platform add-ons, plus hallucination detection and a built-in GEO audit. If you are already invested in Peec AI reporting workflows, that is the main reason to stay.',
      },
      {
        question: 'How does Livesov pricing compare to Peec AI?',
        answer:
          'Livesov is $9 (Starter), $29 (Pro), and $89 (Agency) per month with a 7-day no-card trial, and all five LLMs are included at every tier. Public reports put Peec AI around $100/mo to start, with Claude, Gemini, and Grok as paid add-ons. Confirm current pricing on peec.ai before deciding.',
      },
      {
        question: 'Does Livesov track the same AI engines as Peec AI?',
        answer:
          'Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan. With Peec AI, several of those are add-ons rather than included by default, so effective coverage depends on which add-ons you buy.',
      },
      {
        question: 'Can I move from Peec AI to Livesov without losing my setup?',
        answer:
          'Yes. Recreate your prompts and competitor set in Livesov in a few minutes and run both tools in parallel for a week to compare. Livesov exports all metrics and the underlying AI responses as CSV or PDF.',
      },
    ],
    vsHref: '/vs/peec-ai',
    vsLabel: 'Livesov vs Peec AI',
    vsDescription: 'Add-on pricing vs all-platforms-included.',
  },

  // ── 3. Otterly.ai ─────────────────────────────────────────────────────────
  {
    slug: 'otterly-ai-alternative',
    name: 'Otterly.ai',
    domain: 'otterly.ai',
    category:
      'one of the earliest AI search monitoring tools, with a focus on Google AI Overviews, AI Mode, and Microsoft Copilot.',
    metaTitle: 'Best Otterly.ai Alternative (2026) | Livesov',
    metaDescription:
      'Looking for an Otterly.ai alternative? Livesov tracks all 5 LLMs including Claude and Grok on every plan, with evidence capture, from $9/mo. Compare it to Otterly.',
    keywords:
      'otterly ai alternative, otterly alternative, best otterly ai alternative, otterly.ai alternatives, otterly competitor, ai visibility tool, ai search monitoring tool',
    heroSubtitle:
      'Otterly.ai is a well-established AI search monitor that leans into Google AI Overviews and Microsoft Copilot. Livesov covers all five major LLMs - including Claude and Grok - on every plan, stores full responses as evidence, and flags hallucinated brand facts, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every Livesov plan' },
      { value: '$9', label: 'Livesov entry price /mo' },
      { value: '$29', label: 'Otterly entry price /mo' },
      { value: '7-day', label: 'Free Livesov trial' },
    ],
    comparisonRows: [
      ['ChatGPT tracking', '✓ Every plan', '✓'],
      ['Claude tracking', '✓ Every plan', '✗ Not listed'],
      ['Grok tracking', '✓ Every plan', '✗ Not listed'],
      ['Gemini tracking', '✓ Every plan', 'Paid add-on'],
      ['Perplexity tracking', '✓ Every plan', '✓'],
      ['Google AI Overviews / AI Mode', '✗ Roadmap', '✓ Core focus'],
      ['Microsoft Copilot', '✗', '✓'],
      ['Hallucination / fact-drift detection', '✓', '✗'],
      ['Full AI response stored as evidence', '✓', 'Partial'],
      ['Entry price', '$9/mo (Starter)', '$29/mo (Lite, ~10 prompts)'],
    ],
    switchHeading: 'Should you switch from Otterly to Livesov?',
    switchParagraphs: [
      'This decision usually reduces to one question: which AI surfaces matter most to your buyers?',
      'If your buyers research in ChatGPT, Claude, Perplexity, Gemini, or Grok, Livesov tracks all five on every plan, stores the full responses as evidence, and flags hallucinated facts - and it starts lower, at $9/mo. This is Livesov home turf.',
      'If your biggest traffic risk is Google AI Overviews, Google AI Mode, or Microsoft Copilot, Otterly treats those surfaces as first-class citizens and Livesov does not cover them today. Many teams pick based on that single line.',
    ],
    calloutTitle: 'Run both for a week',
    calloutBody:
      'Both tools have free trials. The fastest evaluation is to configure the same 20 prompts in each, run them for a week, and compare which tool surfaces the platforms, citations, and competitive movements your team actually acts on.',
    faqs: [
      {
        question: 'Is Livesov a good Otterly.ai alternative?',
        answer:
          'If your priority is covering all five major LLMs (including Claude and Grok) on every plan, storing full AI responses as evidence, and a lower entry price, yes. If your priority is Google AI Overviews, Google AI Mode, or Microsoft Copilot tracking, Otterly currently covers those surfaces and Livesov does not.',
      },
      {
        question: 'How do Livesov and Otterly pricing compare?',
        answer:
          'Livesov plans run $9-$89/mo, each with a 7-day no-card trial. Otterly has listed Lite around $29/mo (about 10 prompts), with higher Standard and Pro tiers, on its public pricing page. Pricing changes - always confirm on otterly.ai.',
      },
      {
        question: 'Which AI platforms does each tool track?',
        answer:
          'Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan. Otterly public materials list ChatGPT, Perplexity, Google AI Overviews, Google AI Mode, and Microsoft Copilot, with Gemini as an add-on; Claude and Grok are not listed.',
      },
      {
        question: 'Can I switch from Otterly to Livesov?',
        answer:
          'Yes. Set up the same tracked prompts in Livesov and run both in parallel for a week to compare coverage. Livesov exports everything as CSV or JSON, and onboarding takes a few minutes - add your brand, competitors, and prompts, then run.',
      },
    ],
    vsHref: '/vs/otterly',
    vsLabel: 'Livesov vs Otterly',
    vsDescription: 'Two self-serve tools compared surface by surface.',
  },

  // ── 4. Scrunch AI ─────────────────────────────────────────────────────────
  {
    slug: 'scrunch-ai-alternative',
    name: 'Scrunch AI',
    domain: 'scrunch.ai',
    category:
      'an AI visibility platform used by content teams to track brand presence across AI answer engines.',
    metaTitle: 'Best Scrunch AI Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Scrunch AI alternative? Livesov tracks all 5 LLMs with citations, sentiment, and stored evidence from $9/mo and a 7-day no-card trial.',
    keywords:
      'scrunch ai alternative, best scrunch ai alternative, scrunch alternatives, scrunch ai competitor, ai visibility tool, geo tool, ai brand monitoring',
    heroSubtitle:
      'Scrunch AI helps content teams track brand presence in AI answers. Livesov is the all-platforms-included alternative: ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan, with citation capture, per-platform sentiment, and stored evidence, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['Entry price', '$9/mo', 'Check current plan'],
      ['Free trial without a credit card', '✓ 7 days', 'Check current plan'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Competitor benchmarking', '✓ Up to 20', 'Varies'],
      ['Free GEO audit + free tools', '✓ 11 free tools', 'Varies'],
    ],
    switchHeading: 'Should you switch from Scrunch AI to Livesov?',
    switchParagraphs: [
      'Both tools measure how AI answer engines represent your brand, so the practical question is coverage and evidence: how many engines are included, and can you prove to a stakeholder exactly what the AI said.',
      'Livesov includes all five major LLMs on every plan, stores the complete AI response behind every metric, and adds a canonical facts store that flags when an AI states something untrue about your brand. A free URL-level GEO audit and 11 free tools let you act on findings without buying anything.',
      'If Scrunch AI fits your content workflow today, there may be no reason to move. If you want broad engine coverage and audit-grade evidence at a low entry price, Livesov is a strong Scrunch AI alternative.',
    ],
    calloutTitle: 'Ask for the receipts',
    calloutBody:
      'A mention count is only useful if you can see the answer behind it. When comparing AI visibility tools, check whether each one stores the full AI response as exportable evidence - Livesov does, on every run.',
    faqs: [
      {
        question: 'Is Livesov a good Scrunch AI alternative?',
        answer:
          'Yes, if you want all five major LLMs included on every plan, full AI responses stored as evidence, hallucination detection, and a low entry price with a no-card trial. Confirm the exact features you need against both products before switching.',
      },
      {
        question: 'What does Livesov track that a content-focused tool might not?',
        answer:
          'Livesov captures citations (the ranked source lists on Perplexity and ChatGPT Search), per-platform sentiment tuned to each model style, competitor share of voice across up to 20 brands, and fact-drift against your canonical brand facts - all with the underlying response stored as evidence.',
      },
      {
        question: 'How much does Livesov cost?',
        answer:
          'Livesov starts at $9/mo (Starter), with Pro at $29/mo and Agency at $89/mo, each including all five LLMs and a 7-day free trial with no credit card required.',
      },
      {
        question: 'How do I compare Livesov and Scrunch AI fairly?',
        answer:
          'Set up the same tracked prompts and competitor set in both, run them in parallel for a week, and compare coverage, citation detail, and evidence export. Verify current Scrunch AI features and pricing on scrunch.ai.',
      },
    ],
  },

  // ── 5. Rankscale ──────────────────────────────────────────────────────────
  {
    slug: 'rankscale-alternative',
    name: 'Rankscale',
    domain: 'rankscale.ai',
    category:
      'an AI search rank-tracking and answer-engine-optimization tool for monitoring how brands appear in AI answers.',
    metaTitle: 'Best Rankscale Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Rankscale alternative? Livesov tracks brand mentions and rank across all 5 LLMs with citations and evidence, from $9/mo with a 7-day no-card trial.',
    keywords:
      'rankscale alternative, best rankscale alternative, rankscale.ai alternatives, rankscale competitor, ai rank tracker, ai visibility tool, geo tool',
    heroSubtitle:
      'Rankscale focuses on AI search rank tracking. Livesov gives you rank plus the full visibility picture - mention rate, share of voice, citations, sentiment, and hallucination detection across all five major LLMs - from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '24/7', label: 'Automated tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['Recommendation rank tracking', '✓ Native', '✓'],
      ['Mention rate + share of voice', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Entry price', '$9/mo', 'Check current plan'],
      ['Free GEO audit + free tools', '✓ 11 free tools', 'Varies'],
    ],
    switchHeading: 'Should you switch from Rankscale to Livesov?',
    switchParagraphs: [
      'Rank tracking answers "where do I appear when the AI lists options?" - a genuinely useful metric. But rank alone misses whether you were mentioned at all, how you were described, and which sources the AI cited.',
      'Livesov reports rank alongside mention rate, share of voice against up to 20 competitors, per-platform sentiment, full citation lists, and fact-drift alerts - each traceable to the stored AI response. All five major LLMs are included on every plan from $9/mo.',
      'If you only need a rank number, a focused rank tracker may be enough. If you want the full answer-engine picture with evidence, Livesov is a broader Rankscale alternative.',
    ],
    calloutTitle: 'Rank is one metric, not the whole picture',
    calloutBody:
      'Being ranked #3 tells you less than knowing you were only mentioned in 40% of relevant answers, described with a caveat, and cited from an outdated page. Track all of it, not just position.',
    faqs: [
      {
        question: 'Is Livesov a good Rankscale alternative?',
        answer:
          'Yes, if you want more than rank - mention rate, share of voice, citations, sentiment, and hallucination detection across all five major LLMs, with the underlying AI responses stored as evidence. Verify Rankscale current capabilities on rankscale.ai.',
      },
      {
        question: 'Does Livesov track AI rank like Rankscale?',
        answer:
          'Yes. Livesov tracks your recommendation rank every time an AI engine lists alternatives in your category, across ChatGPT, Claude, Gemini, Perplexity, and Grok, and shows how that rank shifts over time.',
      },
      {
        question: 'What extra signals does Livesov add beyond rank?',
        answer:
          'Mention rate, competitor share of voice (up to 20 brands), per-platform sentiment, full citation capture, and fact-drift detection against your canonical brand facts - all exportable as CSV or PDF.',
      },
      {
        question: 'How much does Livesov cost?',
        answer:
          'From $9/mo (Starter), with Pro at $29/mo and Agency at $89/mo, all five LLMs included, and a 7-day free trial with no credit card.',
      },
    ],
  },

  // ── 6. Knowatoa ───────────────────────────────────────────────────────────
  {
    slug: 'knowatoa-alternative',
    name: 'Knowatoa',
    domain: 'knowatoa.com',
    category:
      'an AI search visibility tool for checking how AI assistants represent your brand.',
    metaTitle: 'Best Knowatoa Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Knowatoa alternative? Livesov tracks all 5 LLMs with citations, sentiment, and stored evidence, on an automated schedule, from $9/mo.',
    keywords:
      'knowatoa alternative, best knowatoa alternative, knowatoa alternatives, knowatoa competitor, ai visibility tool, ai search monitoring, geo tool',
    heroSubtitle:
      'Knowatoa helps you check how AI assistants see your brand. Livesov turns that check into continuous monitoring: all five major LLMs, run on a schedule, with citations, sentiment, evidence, and competitor benchmarking, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '24/7', label: 'Scheduled monitoring' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['Scheduled, automated monitoring', '✓ Daily / 2-day / weekly', 'Varies'],
      ['Mention rate + share of voice', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Competitor benchmarking', '✓ Up to 20', 'Varies'],
      ['Entry price', '$9/mo', 'Check current plan'],
    ],
    switchHeading: 'Should you switch from Knowatoa to Livesov?',
    switchParagraphs: [
      'A one-time check tells you how an AI answered today. Because AI answers are non-deterministic and change as models and the web update, brand visibility is really a monitoring problem, not a spot-check.',
      'Livesov runs your prompts on a schedule across all five major LLMs, several times per prompt, and reports trends in mention rate, share of voice, sentiment, and citations - with the full response stored as evidence and fact-drift alerts when an AI states something untrue about you.',
      'If Knowatoa covers your needs today, keep using it. If you want continuous, multi-engine monitoring with evidence and competitor benchmarking, Livesov is a natural Knowatoa alternative.',
    ],
    calloutTitle: 'One check is a snapshot, not a trend',
    calloutBody:
      'AI answers vary between runs and drift as models update. The only reliable way to measure brand visibility is continuous, multi-run monitoring - which is what Livesov automates on every plan.',
    faqs: [
      {
        question: 'Is Livesov a good Knowatoa alternative?',
        answer:
          'Yes, if you want to move from one-off checks to continuous monitoring across all five major LLMs, with citations, sentiment, competitor benchmarking, and stored evidence. Verify current Knowatoa features on knowatoa.com.',
      },
      {
        question: 'What does Livesov add over a spot-check tool?',
        answer:
          'Scheduled multi-run tracking (daily, every 2 days, or weekly), trend lines for mention rate and share of voice, per-platform sentiment, full citation capture, fact-drift detection, and CSV/PDF evidence export.',
      },
      {
        question: 'Which AI engines does Livesov track?',
        answer:
          'ChatGPT, Claude, Gemini, Perplexity, and Grok - all included on every plan, including the $9/mo Starter tier.',
      },
      {
        question: 'How do I compare the two tools?',
        answer:
          'Configure the same prompts and competitors in Livesov, run for a week, and compare coverage and evidence against Knowatoa. Livesov has a 7-day free trial with no credit card.',
      },
    ],
  },

  // ── 7. AthenaHQ ───────────────────────────────────────────────────────────
  {
    slug: 'athenahq-alternative',
    name: 'AthenaHQ',
    domain: 'athenahq.ai',
    category:
      'a generative-engine-optimization platform for monitoring and improving AI search presence.',
    metaTitle: 'Best AthenaHQ Alternative (2026) | Livesov',
    metaDescription:
      'Looking for an AthenaHQ alternative? Livesov tracks all 5 LLMs with citations, sentiment, hallucination detection, and evidence, from $9/mo with a 7-day trial.',
    keywords:
      'athenahq alternative, best athenahq alternative, athenahq alternatives, athena hq competitor, generative engine optimization tool, ai visibility tool, geo tool',
    heroSubtitle:
      'AthenaHQ is a GEO platform for improving AI search presence. Livesov is the self-serve alternative that measures it across all five major LLMs - mention rate, share of voice, citations, sentiment, and hallucinations - with stored evidence, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '11', label: 'Free tools included' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['Self-serve signup', '✓ Start in minutes', 'Varies'],
      ['Entry price', '$9/mo', 'Check current plan'],
      ['Free trial without a credit card', '✓ 7 days', 'Check current plan'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Free GEO audit + free tools', '✓ 11 free tools', 'Varies'],
    ],
    switchHeading: 'Should you switch from AthenaHQ to Livesov?',
    switchParagraphs: [
      'GEO platforms help you improve how AI engines describe your brand. To know whether that work is paying off, you need clean, continuous measurement across the engines your buyers actually use.',
      'Livesov is that measurement layer: all five major LLMs on every plan, scheduled multi-run tracking, citations, per-platform sentiment, competitor share of voice, and fact-drift alerts - every metric traceable to a stored AI response. It is self-serve from minute one, starting at $9/mo.',
      'If AthenaHQ fits your optimization workflow, Livesov can sit alongside it as the measurement source of truth - or replace it if you want measurement plus a free GEO audit at a lower entry price.',
    ],
    calloutTitle: 'Optimization needs a measurement baseline',
    calloutBody:
      'You cannot tell whether a GEO change worked without a consistent before-and-after baseline across engines. Start by measuring - run a free GEO audit and a week of tracking - then optimize against real numbers.',
    faqs: [
      {
        question: 'Is Livesov a good AthenaHQ alternative?',
        answer:
          'Yes, if you want self-serve, evidence-backed measurement across all five major LLMs at a low entry price, with a built-in GEO audit and free tools. Verify current AthenaHQ features and pricing on athenahq.ai.',
      },
      {
        question: 'Does Livesov help improve AI visibility, or just measure it?',
        answer:
          'Livesov is measurement-first, but it includes a free URL-level GEO audit with prioritized recommendations, plus a GEO optimization guide, so you can act on findings. The core value is accurate, continuous measurement you can trust.',
      },
      {
        question: 'Which AI engines and metrics does Livesov cover?',
        answer:
          'ChatGPT, Claude, Gemini, Perplexity, and Grok, with mention rate, share of voice, recommendation rank, per-platform sentiment, citation capture, and hallucination detection.',
      },
      {
        question: 'How much does Livesov cost?',
        answer:
          'From $9/mo (Starter), $29/mo (Pro), and $89/mo (Agency), all five LLMs included, with a 7-day free trial and no credit card required.',
      },
    ],
  },

  // ── 8. LLMrefs ────────────────────────────────────────────────────────────
  {
    slug: 'llmrefs-alternative',
    name: 'LLMrefs',
    domain: 'llmrefs.com',
    category:
      'an LLM visibility and AI keyword rank tracker for AI search results.',
    metaTitle: 'Best LLMrefs Alternative (2026) | Livesov',
    metaDescription:
      'Looking for an LLMrefs alternative? Livesov tracks brand mentions, rank, citations, and sentiment across all 5 LLMs, with stored evidence, from $9/mo.',
    keywords:
      'llmrefs alternative, best llmrefs alternative, llmrefs alternatives, llmrefs competitor, llm visibility tracker, ai rank tracker, ai visibility tool',
    heroSubtitle:
      'LLMrefs tracks LLM visibility and AI keyword rankings. Livesov adds the full brand picture on top - mention rate, share of voice, citations, sentiment, and hallucination detection across all five major LLMs, with stored evidence, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['AI keyword / rank tracking', '✓ Native', '✓'],
      ['Mention rate + share of voice', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Per-platform sentiment', '✓ Tuned per model', 'Varies'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Entry price', '$9/mo', 'Check current plan'],
    ],
    switchHeading: 'Should you switch from LLMrefs to Livesov?',
    switchParagraphs: [
      'LLMrefs is built around LLM visibility and AI keyword rankings. That is a solid core, but brand teams usually also need to know how they are described, which sources the AI cited, and whether it said anything false.',
      'Livesov reports rank and visibility alongside per-platform sentiment, full citation lists, competitor share of voice across up to 20 brands, and fact-drift alerts - each traceable to the stored AI response. All five major LLMs are included on every plan from $9/mo.',
      'If you want a focused keyword-rank view, LLMrefs may suffice. If you want the complete answer-engine picture with evidence, Livesov is a broader LLMrefs alternative.',
    ],
    calloutTitle: 'Keywords are the start, not the finish',
    calloutBody:
      'AI keyword rank tells you position, but not sentiment, citations, or accuracy. A complete AI visibility tool captures all four - and stores the answer so you can prove it.',
    faqs: [
      {
        question: 'Is Livesov a good LLMrefs alternative?',
        answer:
          'Yes, if you want mention rate, share of voice, citations, sentiment, and hallucination detection in addition to rank, across all five major LLMs, with stored evidence. Verify current LLMrefs capabilities on llmrefs.com.',
      },
      {
        question: 'Does Livesov track AI keyword rankings?',
        answer:
          'Yes. Livesov tracks your recommendation rank and visibility across ChatGPT, Claude, Gemini, Perplexity, and Grok, and shows how they change over time, with the underlying responses stored.',
      },
      {
        question: 'What does Livesov add beyond rank tracking?',
        answer:
          'Competitor share of voice (up to 20 brands), per-platform sentiment, full citation capture, and fact-drift detection against your canonical facts - all exportable as CSV or PDF.',
      },
      {
        question: 'How much does Livesov cost?',
        answer:
          'From $9/mo (Starter), with Pro at $29/mo and Agency at $89/mo, all five LLMs included, and a 7-day free trial with no credit card.',
      },
    ],
  },

  // ── 9. Waikay ─────────────────────────────────────────────────────────────
  {
    slug: 'waikay-alternative',
    name: 'Waikay',
    domain: 'waikay.io',
    category:
      'an answer-engine-optimization tool that analyzes how AI models talk about your brand and topics.',
    metaTitle: 'Best Waikay Alternative (2026) | Livesov',
    metaDescription:
      'Looking for a Waikay alternative? Livesov tracks all 5 LLMs with mention rate, citations, sentiment, and stored evidence, on an automated schedule, from $9/mo.',
    keywords:
      'waikay alternative, best waikay alternative, waikay alternatives, waikay competitor, answer engine optimization tool, ai visibility tool, geo tool',
    heroSubtitle:
      'Waikay analyzes how AI models talk about your brand and topics. Livesov is the all-platforms-included alternative: continuous tracking across ChatGPT, Claude, Gemini, Perplexity, and Grok, with citations, sentiment, evidence, and competitor benchmarking, from $9/mo.',
    stats: [
      { value: '5', label: 'LLMs on every plan' },
      { value: '$9', label: 'Entry price /mo' },
      { value: '24/7', label: 'Automated tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    comparisonRows: [
      ['Tracks all 5 major LLMs', '✓ ChatGPT, Claude, Gemini, Perplexity, Grok', 'Varies by plan'],
      ['Scheduled, automated monitoring', '✓ Daily / 2-day / weekly', 'Varies'],
      ['Mention rate + share of voice', '✓', 'Varies'],
      ['Citation capture', '✓ Full ranked list', 'Varies'],
      ['Per-platform sentiment', '✓ Tuned per model', 'Varies'],
      ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not advertised'],
      ['Full AI response stored as evidence', '✓', 'Varies'],
      ['Entry price', '$9/mo', 'Check current plan'],
    ],
    switchHeading: 'Should you switch from Waikay to Livesov?',
    switchParagraphs: [
      'Both tools analyze how AI engines represent your brand. The practical differences come down to engine coverage, whether tracking is continuous, and whether you can prove what the AI said.',
      'Livesov includes all five major LLMs on every plan, runs your prompts on a schedule several times each, and stores the full AI response behind every metric - plus a canonical facts store that flags untrue statements about your brand. A free GEO audit and 11 free tools let you act on what you find.',
      'If Waikay matches your workflow, there may be no need to move. If you want broad engine coverage, continuous monitoring, and audit-grade evidence at a low entry price, Livesov is a strong Waikay alternative.',
    ],
    calloutTitle: 'Analysis is better with evidence',
    calloutBody:
      'Any analysis of what an AI says about your brand is only as trustworthy as the raw answer behind it. Livesov stores the full response on every run, so every insight is backed by proof you can export.',
    faqs: [
      {
        question: 'Is Livesov a good Waikay alternative?',
        answer:
          'Yes, if you want continuous tracking across all five major LLMs, with citations, sentiment, competitor benchmarking, and stored evidence, at a low entry price. Verify current Waikay features on waikay.io.',
      },
      {
        question: 'What does Livesov measure?',
        answer:
          'Mention rate, share of voice against up to 20 competitors, recommendation rank, per-platform sentiment, full citation capture, and hallucination detection across ChatGPT, Claude, Gemini, Perplexity, and Grok.',
      },
      {
        question: 'Is Livesov continuous or a one-time analysis?',
        answer:
          'Continuous. Livesov re-runs your tracked prompts on a schedule (daily, every 2 days, or weekly) and reports trends over time, not a single snapshot.',
      },
      {
        question: 'How much does Livesov cost?',
        answer:
          'From $9/mo (Starter), $29/mo (Pro), and $89/mo (Agency), all five LLMs included, with a 7-day free trial and no credit card required.',
      },
    ],
  },
];

export function getAlternative(slug: string): Alternative | undefined {
  return alternatives.find((a) => a.slug === slug);
}

export function getAllAlternativeSlugs(): string[] {
  return alternatives.map((a) => a.slug);
}

/** Shared disclaimer sentence builder for the comparison note. */
export function comparisonDisclaimer(a: Alternative): string {
  return `${CARD} ${a.domain}. Comparison reflects public information as of 2026.`;
}

/** Build Next.js metadata for an alternative page from its data entry. */
export function buildAlternativeMetadata(a: Alternative): Metadata {
  const url = `https://livesov.com/${a.slug}`;
  return {
    title: a.metaTitle,
    description: a.metaDescription,
    keywords: a.keywords,
    alternates: { canonical: `/${a.slug}` },
    openGraph: {
      title: a.metaTitle,
      description: a.metaDescription,
      url,
      siteName: 'Livesov',
      type: 'website',
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: `${a.name} alternative - Livesov AI visibility tracker`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: a.metaTitle,
      description: a.metaDescription,
      images: ['https://livesov.com/og-image.png'],
    },
  };
}
