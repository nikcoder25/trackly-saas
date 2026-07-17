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
  /** Short engine name, e.g. "Perplexity" */
  engine: string;
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
