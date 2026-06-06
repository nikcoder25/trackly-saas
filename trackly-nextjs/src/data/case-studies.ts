/**
 * Customer case studies. Each entry generates /case-studies/[slug].
 *
 * Keep `summary` to one sentence and `outcome` to numbers-first bullets so the
 * hub page scans cleanly. Add real customers as logos and quotes land.
 */

export interface CaseStudy {
  slug: string;
  brand: string;
  industry: string;
  segment: 'B2B SaaS' | 'E-commerce' | 'Agency' | 'Media' | 'Marketplace' | 'Healthcare';
  summary: string;
  challenge: string;
  approach: string[];
  outcomes: Array<{ value: string; label: string }>;
  quote?: { text: string; author: string; title: string };
  /** ISO date string */
  publishedAt: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'northwind-saas',
    brand: 'Northwind',
    industry: 'B2B SaaS - project management',
    segment: 'B2B SaaS',
    summary:
      'How Northwind grew its ChatGPT mention rate from 12% to 64% on "best project management tool" prompts in 90 days.',
    challenge:
      'Northwind ranked top-10 organically on most of its category keywords but was invisible inside ChatGPT, Claude, and Perplexity. Buyers who started in AI search never reached the website. Conversions from AI-referred traffic were effectively zero.',
    approach: [
      'Ran a 60-prompt baseline across ChatGPT, Claude, Gemini, Perplexity, and Grok using Livesov',
      'Identified the four diagnostic causes for each missed prompt - 78% of misses traced to weak cross-source consensus',
      'Earned five new placements on G2, Capterra, and three category roundups in 6 weeks',
      'Restructured the homepage and three core comparison pages for extractability (direct answer in first 200 words, FAQ schema, llms.txt)',
      'Set up daily Livesov alerts for mention-rate drops above 5%',
    ],
    outcomes: [
      { value: '+52pp', label: 'ChatGPT mention rate (12% → 64%)' },
      { value: '+47pp', label: 'Perplexity citation share' },
      { value: '3.4×', label: 'Branded search lift in 90 days' },
      { value: '$1.1M', label: 'Estimated incremental pipeline (Q4 2025)' },
    ],
    quote: {
      text: 'We were measuring everything except the one channel that was actually shaping buyer perception. Livesov closed that gap in a week.',
      author: 'Sam K.',
      title: 'Head of Marketing, Northwind',
    },
    publishedAt: '2026-01-15',
  },
  {
    slug: 'meridian-commerce',
    brand: 'Meridian',
    industry: 'E-commerce - sustainable home goods',
    segment: 'E-commerce',
    summary:
      'A DTC brand recovered 31% of revenue lost to AI Overviews by becoming the brand cited inside the answer.',
    challenge:
      'Meridian saw organic traffic drop 38% in 6 months as Google AI Overviews started answering buyer-research queries in-place. Revenue from organic dropped 31% by the end of Q3 2025.',
    approach: [
      'Mapped every product-research keyword where AI Overviews now triggered',
      'Identified the 12 highest-revenue keywords and audited what AI Overviews currently cited',
      'Restructured the top 18 product and category pages around extractability + Product schema',
      'Earned 7 new third-party reviews and 3 industry roundup placements over a quarter',
      'Set up Livesov continuous tracking for both classic SERP and AI Overviews citations',
    ],
    outcomes: [
      { value: '+38pp', label: 'AI Overviews citation share' },
      { value: '+27%', label: 'AOV from AI-referred sessions' },
      { value: '+31%', label: 'Recovered organic-channel revenue' },
      { value: '11 weeks', label: 'Time to first material lift' },
    ],
    quote: {
      text: 'AI Overviews were eating us alive. Two quarters later we are the brand it cites - and our AOV on those sessions is materially higher than classic organic.',
      author: 'Priya M.',
      title: 'VP of Growth, Meridian',
    },
    publishedAt: '2026-02-04',
  },
  {
    slug: 'oakline-agency',
    brand: 'Oakline',
    industry: 'B2B Agency - SEO + GEO',
    segment: 'Agency',
    summary:
      'A 14-person agency added a GEO retainer to every existing SEO client and grew MRR by 41% in two quarters.',
    challenge:
      'Oakline\'s SEO retainers were under pricing pressure. Clients increasingly asked &quot;what about ChatGPT?&quot; and Oakline did not have a defensible answer or a measurement story.',
    approach: [
      'Standardised on Livesov for all 32 client accounts to baseline LLM mention rate per brand and per competitor',
      'Built a templated 90-day GEO program: audit, third-party placement push, on-page extractability, monthly client report',
      'Trained the team on the LLM SEO playbook over two weeks',
      'Repackaged retainers from SEO-only to SEO + GEO at a 32% price uplift, with measurable AI-mention KPIs',
      'Used Livesov\'s white-label reports for monthly client deliverables',
    ],
    outcomes: [
      { value: '+41%', label: 'MRR in 6 months' },
      { value: '92%', label: 'Client retention through repackaging' },
      { value: '+32%', label: 'Average retainer price' },
      { value: '4', label: 'New 6-figure logos signed citing GEO' },
    ],
    quote: {
      text: 'Adding GEO turned a price-pressured SEO retainer into a strategic conversation. Half our new business now comes in asking about AI search first.',
      author: 'Daniel R.',
      title: 'Managing Director, Oakline',
    },
    publishedAt: '2026-02-18',
  },
  {
    slug: 'lumen-fintech',
    brand: 'Lumen Finance',
    industry: 'Fintech - small business banking',
    segment: 'B2B SaaS',
    summary:
      'How a fintech became the default ChatGPT recommendation for &quot;best business bank account for startups&quot; in 16 weeks.',
    challenge:
      'Lumen was a credible top-5 contender by every objective measure - yet ChatGPT consistently recommended two competitors and an incumbent bank. Cross-source consensus was the blocker.',
    approach: [
      'Diagnosed mention failure with Livesov - Lumen was named in 18% of relevant prompts, vs. 71% for the #1 competitor',
      'Identified that competitors had 4× more third-party review coverage on Reddit, NerdWallet, and Fintech press',
      'Ran a targeted PR + Reddit engagement push over 10 weeks, plus structured-data overhaul on 14 product pages',
      'Built a citable founder thought-leadership presence (X, podcast appearances, two op-eds)',
      'Kept measurement continuous with Livesov for weekly delta tracking',
    ],
    outcomes: [
      { value: '+62pp', label: 'ChatGPT mention rate (18% → 80%)' },
      { value: '#1', label: 'Default recommendation for 7 of 12 priority prompts' },
      { value: '2.4×', label: 'Branded search lift' },
      { value: '+$2.3M', label: 'New deposits attributed to AI-discovered leads (90 days)' },
    ],
    publishedAt: '2026-03-02',
  },
  {
    slug: 'voyageur-marketplace',
    brand: 'Voyageur',
    industry: 'Travel marketplace',
    segment: 'Marketplace',
    summary:
      'A travel marketplace captured 47% Perplexity citation share on long-tail itinerary queries by restructuring 1,200 destination pages.',
    challenge:
      'Voyageur\'s organic traffic plateaued in 2024 as Perplexity and ChatGPT Search became the new starting point for trip planning. The company was not cited in either.',
    approach: [
      'Used Livesov to identify the 200 highest-volume Perplexity prompts in travel - &quot;best 7-day Italy itinerary&quot;, &quot;Tokyo with kids&quot;, etc.',
      'Found that Perplexity cited blog posts and Reddit threads but not their destination pages',
      'Restructured 1,200 destination pages around the extractable Q&amp;A pattern (TripAdvisor + Perplexity-style)',
      'Ensured PerplexityBot, OAI-SearchBot, and Google-Extended were explicitly allowed',
      'Added FAQ schema and itinerary microdata across the catalogue',
    ],
    outcomes: [
      { value: '47%', label: 'Perplexity citation share on tracked itinerary prompts' },
      { value: '+186%', label: 'AI-referred sessions YoY' },
      { value: '4.1', label: 'Average pages per AI-referred session' },
      { value: '+22%', label: 'Bookings from AI-referred traffic' },
    ],
    publishedAt: '2026-03-25',
  },
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.slug === slug);
}

export function getAllCaseStudySlugs(): string[] {
  return CASE_STUDIES.map((c) => c.slug);
}
