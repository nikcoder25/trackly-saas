import type { Metadata } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// AI "rank tracker" landing pages.
//
// These target the large rank-tracker keyword clusters (Perplexity ~17.5K,
// ChatGPT ~13.8K search volume across long-tail variants) with "rank tracker",
// "rank tracking tool", "free ... rank tracker", and "track ... rankings"
// intent. They are deliberately framed around RANK / POSITION tracking over
// time - distinct from the /[engine]-brand-tracking pages, which are framed
// around brand mentions and citations - and cross-link to them to avoid
// keyword cannibalization.
//
// Keep punctuation ASCII/Unicode (no HTML entities): the generic feature/step/
// comparison scaffolding lives in the RankTrackerPage component and these
// strings are rendered as plain React children.
// ─────────────────────────────────────────────────────────────────────────────

export interface RankTrackerStat {
  value: string;
  label: string;
}

export interface RankTrackerFaq {
  question: string;
  answer: string;
}

export interface RankTracker {
  /** URL slug, e.g. "perplexity-rank-tracker" -> /perplexity-rank-tracker */
  slug: string;
  /**
   * Short engine name used ATTRIBUTIVELY, i.e. inside a noun phrase:
   * "Perplexity rank", "Automated ChatGPT runs", "LLM rank tracker".
   */
  engine: string;
  /**
   * The same engine as a standalone noun - the form that reads correctly as the
   * subject or object of a verb ("the URLs <subject> cites"). Defaults to
   * `engine`, which is right for a single named engine. The category-level page
   * needs a plural here ("LLMs") because "the URLs LLM cites" is not English.
   */
  engineSubject?: string;
  /**
   * True when `engineSubject` is plural, so the scaffolding drops the
   * third-person -s ("LLMs cite" vs "ChatGPT cites"). Defaults to false.
   */
  enginePlural?: boolean;
  /** Full engine name, e.g. "Perplexity AI" */
  engineFull: string;
  /** Tailwind gradient stops for the hero accent */
  gradientFrom: string;
  gradientTo: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  heroSubtitle: string;
  stats: RankTrackerStat[];
  /** Model/surface names, woven into a sentence, e.g. ["Sonar", "Sonar Pro"] */
  models: string[];
  /** One engine-specific line appended to the "what we track" intro */
  engineFeatureNote: string;
  whyHeading: string;
  whyParagraphs: string[];
  faqs: RankTrackerFaq[];
  brandTrackingHref: string;
  brandTrackingLabel: string;
  brandTrackingDescription: string;
  otherHref: string;
  otherLabel: string;
  otherDescription: string;
}

export const rankTrackers: RankTracker[] = [
  // ── Perplexity (17.5K cluster) ────────────────────────────────────────────
  {
    slug: 'perplexity-rank-tracker',
    engine: 'Perplexity',
    engineFull: 'Perplexity AI',
    gradientFrom: '#20b8cd',
    gradientTo: '#1a94a5',
    metaTitle: 'Perplexity Rank Tracker | Track AI Rankings | Livesov',
    metaDescription:
      'The Perplexity rank tracker that tracks your position and citations in Perplexity AI answers over time. Track rankings, competitors, and share of voice. Free to start.',
    keywords:
      'perplexity rank tracker, perplexity rank tracker tool, rank tracker tool perplexity, rank tracking tool perplexity, best perplexity rank tracker, free perplexity rank tracker, perplexity rank tracking, track perplexity rankings, perplexity keyword rank tracker, perplexity seo rank tracking, perplexity ai rank tracking',
    heroSubtitle:
      'Livesov is the Perplexity rank tracker that records where your brand lands in Perplexity AI answers for your target prompts - then tracks how that rank moves over time. Capture every cited source, benchmark competitors, and start free with no credit card.',
    stats: [
      { value: '3+', label: 'Perplexity models tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['Sonar', 'Sonar Pro', 'Sonar Reasoning'],
    engineFeatureNote:
      'Perplexity is citation-first - it shows a ranked source list on every answer - so rank tracking here means tracking both your position in the answer and which URLs earned the citations.',
    whyHeading: 'Why track your Perplexity rankings?',
    whyParagraphs: [
      'Perplexity grew past 30 million monthly active users by pairing an LLM with live web search and citing every source. For anyone doing SEO in the AI era, that makes Perplexity the most measurable answer engine: it exposes a ranked list of sources, so you can see exactly where you place and who beats you.',
      'A rank tracker built for Google tells you nothing about this. Perplexity answers are generated and non-deterministic - the same prompt can cite different sources between runs - so a single check is misleading. You need multi-run tracking over time to see your true Perplexity rank and its trend.',
      'Livesov runs your target prompts against Perplexity on a schedule, records your position and the full citation list each time, and charts the trend. When your rank moves, you see it - and the cited sources tell you why.',
    ],
    faqs: [
      {
        question: 'What is a Perplexity rank tracker?',
        answer:
          'A Perplexity rank tracker measures where your brand or pages appear in Perplexity AI answers for a set of target prompts, and how that position changes over time. Unlike a traditional keyword rank tracker built for Google, it tracks generated AI answers and their cited sources, running each prompt multiple times because Perplexity responses are non-deterministic.',
      },
      {
        question: 'Is there a free Perplexity rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and free one-off tools that need no signup. That lets you track your Perplexity rankings and citations before paying anything. Paid plans start at $9/mo.',
      },
      {
        question: 'How does Livesov track Perplexity rankings?',
        answer:
          'Add your brand, competitors, and target prompts. Livesov queries Perplexity (Sonar, Sonar Pro, and Sonar Reasoning) on a schedule, runs each prompt several times, and records your position, the full ranked citation list, sentiment, and where competitors placed - then charts the trend and alerts you when rank moves.',
      },
      {
        question: 'How is this different from Perplexity brand tracking?',
        answer:
          'They overlap. Rank tracking focuses on your position and how it trends over time for specific prompts and keywords; brand tracking focuses on whether and how Perplexity mentions and cites your brand. Livesov does both - see the Perplexity brand tracking page for the mention-and-citation angle.',
      },
      {
        question: 'Can I track competitor rankings in Perplexity?',
        answer:
          'Yes. Livesov benchmarks up to 20 competitors on the same prompts, so you can see who Perplexity ranks above you, on which queries, and how the gap changes over time.',
      },
      {
        question: 'Does Livesov capture the sources Perplexity cites?',
        answer:
          'Yes. Every tracked answer stores the full ranked list of cited URLs, so you can see exactly which of your pages (and which competitor pages) earn Perplexity citations and drive your ranking.',
      },
    ],
    brandTrackingHref: '/perplexity-brand-tracking',
    brandTrackingLabel: 'Perplexity brand tracking',
    brandTrackingDescription: 'Track mentions and citations, not just rank.',
    otherHref: '/chatgpt-rank-tracker',
    otherLabel: 'ChatGPT rank tracker',
    otherDescription: 'Track your rankings in ChatGPT answers too.',
  },

  // ── ChatGPT (13.8K cluster) ───────────────────────────────────────────────
  {
    slug: 'chatgpt-rank-tracker',
    engine: 'ChatGPT',
    engineFull: 'ChatGPT',
    gradientFrom: '#19c37d',
    gradientTo: '#10a37f',
    metaTitle: 'ChatGPT Rank Tracker | Track AI Rankings | Livesov',
    metaDescription:
      'The ChatGPT rank tracker that tracks your position in ChatGPT answers over time. Track rankings, competitors, citations, and share of voice. Free to start.',
    keywords:
      'chatgpt rank tracker, chatgpt rank tracker tool, rank tracker tool chatgpt, rank tracking tool chatgpt, free chatgpt rank tracker, free chatgpt rank tracking, chatgpt rank tracking, chatgpt seo rank tracking, chatgpt keyword rank tracker, best chatgpt rank tracker, track chatgpt rankings',
    heroSubtitle:
      'Livesov is the ChatGPT rank tracker that records where your brand lands when ChatGPT recommends options for your target prompts - then tracks how that rank moves over time. Benchmark competitors, capture ChatGPT Search citations, and start free with no credit card.',
    stats: [
      { value: '4+', label: 'ChatGPT models tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['GPT-5', 'GPT-5 mini', 'ChatGPT Search'],
    engineFeatureNote:
      'ChatGPT answers are highly non-deterministic and vary by model, so rank tracking here means aggregating many runs across GPT-5, GPT-5 mini, and ChatGPT Search to get a stable position.',
    whyHeading: 'Why track your ChatGPT rankings?',
    whyParagraphs: [
      'More than 300 million people a week ask ChatGPT for recommendations and comparisons. When ChatGPT lists options in your category, your position in that list is the new page-one ranking - and traditional rank trackers cannot see it.',
      'ChatGPT answers are non-deterministic and differ across GPT-5, GPT-5 mini, and ChatGPT Search. A one-off check is noise. To know your real ChatGPT rank you need multi-run tracking across models, aggregated into a stable position and charted over time.',
      'Livesov runs your target prompts against ChatGPT on a schedule, records your rank and any ChatGPT Search citations each time, benchmarks competitors, and charts the trend - with alerts when your position moves.',
    ],
    faqs: [
      {
        question: 'What is a ChatGPT rank tracker?',
        answer:
          'A ChatGPT rank tracker measures where your brand or pages appear when ChatGPT lists or recommends options for a set of target prompts, and how that position changes over time. Because ChatGPT answers are non-deterministic and vary by model, it runs each prompt multiple times across models and aggregates the result into a stable rank.',
      },
      {
        question: 'Is there a free ChatGPT rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and free one-off tools with no signup, so you can track your ChatGPT rankings before paying. A free ChatGPT mention checker is also available in the tools hub. Paid plans start at $9/mo.',
      },
      {
        question: 'How does Livesov track ChatGPT rankings?',
        answer:
          'Add your brand, competitors, and target prompts. Livesov queries ChatGPT (GPT-5, GPT-5 mini, and ChatGPT Search) on a schedule, runs each prompt several times to average out variance, and records your position, any cited sources, sentiment, and competitor placement - then charts the trend and alerts you when rank moves.',
      },
      {
        question: 'How is this different from ChatGPT brand tracking?',
        answer:
          'They overlap. Rank tracking focuses on your position and how it trends over time for specific prompts and keywords; brand tracking focuses on whether and how ChatGPT mentions, describes, and recommends your brand. Livesov does both - see the ChatGPT brand tracking page for the mention-and-sentiment angle.',
      },
      {
        question: 'Can I track competitor rankings in ChatGPT?',
        answer:
          'Yes. Livesov benchmarks up to 20 competitors on the same prompts, so you can see who ChatGPT ranks above you, on which queries, and how the gap changes over time.',
      },
      {
        question: 'Does it work with ChatGPT Search citations?',
        answer:
          'Yes. When ChatGPT Search returns source URLs, Livesov logs the full list, so you can see which pages feed the answers that determine your rank.',
      },
    ],
    brandTrackingHref: '/chatgpt-brand-tracking',
    brandTrackingLabel: 'ChatGPT brand tracking',
    brandTrackingDescription: 'Track mentions, sentiment, and recommendations.',
    otherHref: '/perplexity-rank-tracker',
    otherLabel: 'Perplexity rank tracker',
    otherDescription: 'Track your rankings in Perplexity answers too.',
  },

  // ── LLM (category level) ──────────────────────────────────────────────────
  // The parent of the two engine pages above. Live SERP testing (Aug 2026) put
  // "llm rank tracker" at Google Ads competition index 2, with the #1 organic
  // result held by a help-doc subdomain at domain authority 8 - i.e. a
  // documentation page outranking rankscale, mangools, nightwatch and
  // keyword.com. The engine-level SERPs are far harder, so this page targets
  // the category vocabulary ("llm ...") the incumbents have not saturated.
  // Deliberately scoped to LLM/AI-wide terms so it cannot cannibalise the
  // engine-specific pages: no "chatgpt rank tracker" or "perplexity rank
  // tracker" terms appear in the keyword list below.
  {
    slug: 'llm-rank-tracker',
    engine: 'LLM',
    engineSubject: 'LLMs',
    enginePlural: true,
    engineFull: 'large language model',
    gradientFrom: '#6366f1',
    gradientTo: '#8b5cf6',
    metaTitle: 'LLM Rank Tracker | Track Your Rank Across AI Models | Livesov',
    metaDescription:
      'The LLM rank tracker that records where your brand ranks across ChatGPT, Claude, Gemini, Perplexity, and Grok - and how that position moves over time. Free to start.',
    keywords:
      'llm rank tracker, llm rank tracking, llm rank tracker tool, free llm rank tracker, best llm rank tracker, llm tracker, llm visibility checker, llm seo rank tracking, large language model rank tracker, track llm rankings, llm brand rank tracker',
    heroSubtitle:
      'Livesov is the LLM rank tracker that records where your brand lands when large language models recommend options for your target prompts - across every major model, not just one. Benchmark competitors, capture the sources they cite, and start free with no credit card.',
    stats: [
      { value: '5', label: 'AI engines tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'],
    engineFeatureNote:
      'Every model answers differently - one can rank you first while another omits you entirely - so an LLM rank tracker has to measure each engine separately and then roll them into a single cross-model position.',
    whyHeading: 'Why track your rank across LLMs, not just one?',
    whyParagraphs: [
      'Buyers do not stay on one assistant. The same question gets asked in ChatGPT, Claude, Gemini, Perplexity, and Grok - and the answers disagree. Tracking a single engine tells you how you are doing on that engine, which is a fraction of the picture and can be badly misleading when your weakest engine is the one your buyers actually use.',
      'A rank tracker built for Google cannot see any of this. LLM answers are generated rather than retrieved, they are non-deterministic, and each model has its own training data, retrieval stack, and citation behaviour. A one-off check on one model is noise dressed up as a metric.',
      'Livesov runs your target prompts against all five engines on a schedule, runs each prompt several times to average out variance, records your position and the cited sources every time, and charts both the per-engine trend and your combined cross-model rank.',
    ],
    faqs: [
      {
        question: 'What is an LLM rank tracker?',
        answer:
          'An LLM rank tracker measures where your brand or pages appear when large language models list or recommend options for a set of target prompts, and how that position changes over time. Because LLM answers are generated and non-deterministic, it runs each prompt multiple times across multiple models and aggregates the results into a stable rank rather than reporting a single snapshot.',
      },
      {
        question: 'How is an LLM rank tracker different from a normal rank tracker?',
        answer:
          'A traditional rank tracker reads a fixed list of ten blue links from a search engine. An LLM rank tracker reads a generated answer that changes between runs, varies by model, and often cites sources instead of ranking pages. That means multi-run sampling, per-model measurement, and citation capture - none of which a Google rank tracker does.',
      },
      {
        question: 'Which LLMs does Livesov track?',
        answer:
          'ChatGPT, Claude, Gemini, Perplexity, and Grok, across multiple models per engine. You can view rank per engine or as a single combined cross-model position, so you can see both your overall standing and the specific engine dragging it down.',
      },
      {
        question: 'Is there a free LLM rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and a set of free one-off tools that need no signup at all. That is enough to see your LLM rankings before paying anything. Paid plans start at $9/mo.',
      },
      {
        question: 'Can I track competitor rankings across LLMs?',
        answer:
          'Yes. Livesov benchmarks up to 20 competitors on the same prompts across every tracked engine, so you can see who each model ranks above you, on which queries, and how the gap moves over time.',
      },
      {
        question: 'How often should LLM rank be checked?',
        answer:
          'More often than Google rank, because the variance is higher. Livesov runs on a daily, 2-day, or weekly schedule depending on your plan, and runs each prompt several times per scheduled check so the number you see is an average rather than a single roll of the dice.',
      },
    ],
    brandTrackingHref: '/chatgpt-brand-tracking',
    brandTrackingLabel: 'AI brand tracking',
    brandTrackingDescription: 'Track mentions and sentiment, not just rank.',
    otherHref: '/chatgpt-rank-tracker',
    otherLabel: 'ChatGPT rank tracker',
    otherDescription: 'Drill into rank for ChatGPT specifically.',
  },
  // ── Claude (3.6K cluster) ─────────────────────────────────────────────────
  // Search Console shows 3.6K impressions on "claude rank tracking" / "best
  // claude rank tracker tool" landing on /claude-brand-tracking at ~position
  // 53 - the wrong page for a rank-tracker query. This is the matching page.
  {
    slug: 'claude-rank-tracker',
    engine: 'Claude',
    engineFull: 'Claude (Anthropic)',
    gradientFrom: '#d97757',
    gradientTo: '#b45309',
    metaTitle: 'Claude Rank Tracker | Track Your Rank in Claude | Livesov',
    metaDescription:
      'The Claude rank tracker that records where your brand ranks in Claude answers over time. Track rankings across Claude models, benchmark competitors, and start free.',
    keywords:
      'claude rank tracker, claude rank tracking, best claude rank tracker tool, claude rank tracker tool, free claude rank tracking, free claude rank tracker, track claude rankings, claude ai rank tracking, claude seo rank tracking, anthropic claude rank tracker, claude visibility tracker',
    heroSubtitle:
      'Livesov is the Claude rank tracker that records where your brand lands when Claude recommends options for your target prompts - then tracks how that rank moves over time. Sample every Claude model, benchmark competitors, and start free with no credit card.',
    stats: [
      { value: '3+', label: 'Claude models tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['Claude Haiku 4.5', 'Claude Sonnet 4', 'Fable 5'],
    engineFeatureNote:
      'Claude answers lean on model knowledge rather than a live citation list on most prompts, so rank tracking here means sampling the same prompt repeatedly across Haiku, Sonnet, and Fable and reading your position out of the recommendation order.',
    whyHeading: 'Why track your Claude rankings?',
    whyParagraphs: [
      'Claude is the assistant of choice inside a lot of technical and enterprise teams - the people who write the evaluation shortlist rather than sign the invoice. When Claude names three tools in your category and you are not one of them, you never enter the evaluation, and nothing in your analytics records that it happened.',
      'Claude also behaves differently from the search-grounded engines. It answers many category questions from model knowledge, which means your rank is driven less by a page you published last week and more by how consistently your brand is described across the sources the model already absorbed. A Google rank tracker cannot see any part of that.',
      'Livesov runs your target prompts against Claude on a schedule, repeats each prompt several times to average out variance, records your position and any cited sources, benchmarks up to 20 competitors on the same prompts, and charts the trend so you can see whether the work you are doing is moving your Claude rank at all.',
    ],
    faqs: [
      {
        question: 'What is a Claude rank tracker?',
        answer:
          'A Claude rank tracker measures where your brand or pages appear when Claude lists or recommends options for a set of target prompts, and how that position changes over time. Because Claude answers are non-deterministic and differ between models, it runs each prompt multiple times and aggregates the results into a stable rank instead of reporting a single snapshot.',
      },
      {
        question: 'Is there a free Claude rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and a set of free one-off tools that need no signup at all. That is enough to see your Claude rankings before paying anything. Paid plans start at $9/mo.',
      },
      {
        question: 'How does Livesov track Claude rankings?',
        answer:
          'Add your brand, competitors, and target prompts. Livesov queries Claude (Haiku 4.5, Sonnet 4, and Fable 5) on a schedule, runs each prompt several times to average out variance, and records your position, sentiment, any cited sources, and where competitors placed - then charts the trend and emails you when your rank moves.',
      },
      {
        question: 'Which Claude models does Livesov track?',
        answer:
          'Claude Haiku 4.5, Claude Sonnet 4, and Fable 5, depending on your plan. Model choice matters more than most teams expect: the smaller and larger models often produce different shortlists for the same prompt, so a win on one is not a win on Claude.',
      },
      {
        question: 'How is this different from Claude brand tracking?',
        answer:
          'They overlap. Rank tracking focuses on your position and how it trends over time for specific prompts and keywords; brand tracking focuses on whether and how Claude mentions, describes, and recommends your brand. Livesov does both - see the Claude brand tracking page for the mention-and-sentiment angle.',
      },
      {
        question: 'Can I track competitor rankings in Claude?',
        answer:
          'Yes. Livesov benchmarks up to 20 competitors on the same prompts, so you can see who Claude ranks above you, on which queries, and how the gap changes over time.',
      },
    ],
    brandTrackingHref: '/claude-brand-tracking',
    brandTrackingLabel: 'Claude brand tracking',
    brandTrackingDescription: 'Track mentions, sentiment, and recommendations.',
    otherHref: '/gemini-rank-tracker',
    otherLabel: 'Gemini rank tracker',
    otherDescription: 'Track your rankings in Gemini answers too.',
  },

  // ── Gemini (2.5K cluster) ─────────────────────────────────────────────────
  // "gemini visibility tracker" / "gemini tracking" / "brand mentions in
  // gemini" currently land on /gemini-brand-tracking at positions 21-42. That
  // page owns the mention angle; this one owns rank.
  {
    slug: 'gemini-rank-tracker',
    engine: 'Gemini',
    engineFull: 'Google Gemini',
    gradientFrom: '#4285f4',
    gradientTo: '#9b72cb',
    metaTitle: 'Gemini Rank Tracker | Track Your Rank in Gemini | Livesov',
    metaDescription:
      'The Gemini rank tracker that records where your brand ranks in Google Gemini answers over time. Track rankings across Gemini models, benchmark competitors, and start free.',
    keywords:
      'gemini rank tracker, gemini rank tracking, gemini rank tracker tool, free gemini rank tracker, best gemini rank tracker, track gemini rankings, google gemini rank tracker, gemini ai rank tracking, gemini seo rank tracking, gemini keyword rank tracker',
    heroSubtitle:
      'Livesov is the Gemini rank tracker that records where your brand lands when Google Gemini recommends options for your target prompts - then tracks how that rank moves over time. Sample every Gemini model, capture grounded sources, and start free with no credit card.',
    stats: [
      { value: '3+', label: 'Gemini models tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['Gemini 2.5 Flash Lite', 'Gemini 2.5 Flash', 'Gemini 2.5 Pro'],
    engineFeatureNote:
      'Gemini sits closest to Google’s own index, and grounded answers return the web sources behind them, so rank tracking here means recording both your position in the answer and the grounded URLs that produced it.',
    whyHeading: 'Why track your Gemini rankings?',
    whyParagraphs: [
      'Gemini is the assistant with the shortest path to Google itself. It ships inside Search, Workspace, and Android, which means a Gemini answer is not a side channel - for a lot of people it is the first and only answer they see. Your position in it is the closest thing the AI era has to a page-one ranking.',
      'It is also the engine where AI and classic SEO overlap most. Grounded Gemini answers pull live web sources, so the pages you rank with in Google feed the answers Gemini gives - but not reliably, and not in the same order. Teams routinely find they rank third in Google and are absent from the Gemini answer for the identical query. You cannot spot that gap without measuring both.',
      'Livesov runs your target prompts against Gemini on a schedule, repeats each prompt to average out variance, records your position and the grounded sources behind the answer, benchmarks competitors on the same prompts, and charts the trend so a Gemini rank drop shows up as a line on a chart instead of a quiet quarter.',
    ],
    faqs: [
      {
        question: 'What is a Gemini rank tracker?',
        answer:
          'A Gemini rank tracker measures where your brand or pages appear when Google Gemini lists or recommends options for a set of target prompts, and how that position changes over time. Because Gemini answers are generated and non-deterministic, it runs each prompt multiple times across models and aggregates the results into a stable rank.',
      },
      {
        question: 'Is there a free Gemini rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and free one-off tools that need no signup. That lets you see your Gemini rankings before paying anything. Paid plans start at $9/mo.',
      },
      {
        question: 'How does Livesov track Gemini rankings?',
        answer:
          'Add your brand, competitors, and target prompts. Livesov queries Gemini (2.5 Flash Lite, 2.5 Flash, and 2.5 Pro) on a schedule, runs each prompt several times, and records your position, the grounded sources, sentiment, and competitor placement - then charts the trend and alerts you when rank moves.',
      },
      {
        question: 'Does Livesov capture the sources Gemini grounds its answers in?',
        answer:
          'Yes, on grounded runs. Google Search grounding is available on the Pro plan and above; when it is enabled, every tracked answer stores the web sources Gemini used, so you can see which pages produced your ranking and which competitor pages produced theirs.',
      },
      {
        question: 'Is a Gemini rank the same as a Google AI Overviews rank?',
        answer:
          'No, and they should be tracked separately. Gemini is the assistant; AI Overviews is the summary block inside Google Search. They draw on overlapping data and often disagree, so a strong Gemini position is not proof you are cited in AI Overviews for the same query.',
      },
      {
        question: 'Can I track competitor rankings in Gemini?',
        answer:
          'Yes. Livesov benchmarks up to 20 competitors on the same prompts, so you can see who Gemini ranks above you, on which queries, and how the gap changes over time.',
      },
    ],
    brandTrackingHref: '/gemini-brand-tracking',
    brandTrackingLabel: 'Gemini brand tracking',
    brandTrackingDescription: 'Track mentions, sentiment, and grounded citations.',
    otherHref: '/grok-rank-tracker',
    otherLabel: 'Grok rank tracker',
    otherDescription: 'Track your rankings in Grok answers too.',
  },

  // ── Grok (2.4K cluster) ───────────────────────────────────────────────────
  // "grok rank tracker tool" plus the adjacent "does grok use x data" question
  // (already position 7). The X/Twitter retrieval angle is the differentiator
  // and is answered on-page rather than left to the blog alone.
  {
    slug: 'grok-rank-tracker',
    engine: 'Grok',
    engineFull: 'Grok (xAI)',
    gradientFrom: '#64748b',
    gradientTo: '#0f172a',
    metaTitle: 'Grok Rank Tracker | Track Your Rank in Grok | Livesov',
    metaDescription:
      'The Grok rank tracker that records where your brand ranks in Grok answers over time. Track rankings across Grok models, see the X posts behind them, and start free.',
    keywords:
      'grok rank tracker, grok rank tracker tool, grok rank tracking, free grok rank tracker, best grok rank tracker, track grok rankings, xai grok rank tracker, grok ai rank tracking, grok seo rank tracking, grok visibility tracker',
    heroSubtitle:
      'Livesov is the Grok rank tracker that records where your brand lands when Grok recommends options for your target prompts - then tracks how that rank moves over time. Sample every Grok model, capture what it draws on, and start free with no credit card.',
    stats: [
      { value: '2+', label: 'Grok models tracked' },
      { value: '20', label: 'Competitors benchmarked' },
      { value: '24/7', label: 'Automated rank tracking' },
      { value: '7-day', label: 'Free trial, no card' },
    ],
    models: ['Grok 3 Mini', 'Grok 4'],
    engineFeatureNote:
      'Grok is the one major assistant with live access to X, so its answers move with social conversation as well as the open web - which makes rank here more volatile, and multi-run sampling more necessary, than on any other engine.',
    whyHeading: 'Why track your Grok rankings?',
    whyParagraphs: [
      'Grok is built into X and answers questions for an audience that skews founder, developer, trader, and journalist - people who publish. A recommendation there does not just reach a buyer; it reaches somebody who may repeat it in public, which is how a Grok mention turns into the kind of source the other engines later read.',
      'Grok is also the most volatile engine to rank in, because it can pull on live posts as well as the open web. A discussion thread from this morning can change the answer this afternoon. That is exactly the condition under which a single manual check is worthless and a tracked trend is the only honest measurement.',
      'Livesov runs your target prompts against Grok on a schedule, repeats each prompt to average out the volatility, records your position, sentiment, and whatever sources come back with the answer, benchmarks competitors on the same prompts, and charts the trend so you can tell a real move from noise.',
    ],
    faqs: [
      {
        question: 'What is a Grok rank tracker?',
        answer:
          'A Grok rank tracker measures where your brand or pages appear when Grok lists or recommends options for a set of target prompts, and how that position changes over time. Because Grok answers are non-deterministic and can shift with live conversation on X, it runs each prompt multiple times and aggregates the results into a stable rank.',
      },
      {
        question: 'Does Grok use X data to rank brands?',
        answer:
          'Grok has live access to X, and xAI has said so plainly: it can read posts and threads in real time as well as the open web. That does not make X a ranking factor in the Google sense - there is no published weighting - but it does mean the volume, recency, and sentiment of what is said about your brand on X can change the answer Grok gives, in a way it cannot on ChatGPT or Claude. Track it rather than assume it.',
      },
      {
        question: 'Is there a free Grok rank tracker?',
        answer:
          'Livesov offers a 7-day free trial with no credit card, plus a free GEO audit and free one-off tools that need no signup. That is enough to see your Grok rankings before paying anything. Paid plans start at $9/mo.',
      },
      {
        question: 'How does Livesov track Grok rankings?',
        answer:
          'Add your brand, competitors, and target prompts. Livesov queries Grok (Grok 3 Mini and Grok 4) on a schedule, runs each prompt several times because Grok is the most volatile engine we track, and records your position, sentiment, any sources returned, and competitor placement - then charts the trend and alerts you when rank moves.',
      },
      {
        question: 'How often should Grok rank be checked?',
        answer:
          'More often than the other engines. Because Grok can draw on live posts, its answers move faster, so daily tracking with several runs per check is the setting that produces a usable trend line rather than a jagged one.',
      },
      {
        question: 'How is this different from Grok brand tracking?',
        answer:
          'They overlap. Rank tracking focuses on your position and how it trends over time for specific prompts and keywords; brand tracking focuses on whether and how Grok mentions, describes, and recommends your brand. Livesov does both - see the Grok brand tracking page for the mention-and-sentiment angle.',
      },
    ],
    brandTrackingHref: '/grok-brand-tracking',
    brandTrackingLabel: 'Grok brand tracking',
    brandTrackingDescription: 'Track mentions, sentiment, and X-driven swings.',
    otherHref: '/claude-rank-tracker',
    otherLabel: 'Claude rank tracker',
    otherDescription: 'Track your rankings in Claude answers too.',
  },
];

export function getRankTracker(slug: string): RankTracker | undefined {
  return rankTrackers.find((r) => r.slug === slug);
}

export function getAllRankTrackerSlugs(): string[] {
  return rankTrackers.map((r) => r.slug);
}

/** Build Next.js metadata for a rank-tracker page from its data entry. */
export function buildRankTrackerMetadata(r: RankTracker): Metadata {
  const url = `https://livesov.com/${r.slug}`;
  return {
    title: r.metaTitle,
    description: r.metaDescription,
    keywords: r.keywords,
    alternates: { canonical: `/${r.slug}` },
    openGraph: {
      title: r.metaTitle,
      description: r.metaDescription,
      url,
      siteName: 'Livesov',
      type: 'website',
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: `${r.engine} rank tracker - Livesov`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: r.metaTitle,
      description: r.metaDescription,
      images: ['https://livesov.com/og-image.png'],
    },
  };
}
