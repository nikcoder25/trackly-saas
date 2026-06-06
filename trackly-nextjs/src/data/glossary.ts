/**
 * AI search / LLM SEO / GEO glossary.
 *
 * Each entry generates a /glossary/[slug] page plus a card on the /glossary
 * hub. Keep definitions tight (1–2 sentences) and expand in `longDef`.
 */

export interface GlossaryTerm {
  slug: string;
  term: string;
  /** Short one-liner shown on the hub */
  shortDef: string;
  /** Long-form explanation used on the term page */
  longDef: string;
  /** Acronym expansion if any */
  acronym?: string;
  /** Related term slugs */
  related?: string[];
  /** Category for grouping on the hub */
  category: 'Core concepts' | 'Surfaces & platforms' | 'Signals & ranking' | 'Measurement' | 'Crawlers & infrastructure';
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: 'geo',
    term: 'GEO',
    acronym: 'Generative Engine Optimization',
    category: 'Core concepts',
    shortDef:
      'The practice of optimizing brand and content so generative AI engines (ChatGPT, Perplexity, Gemini, Claude, Grok) mention, recommend, and cite you.',
    longDef:
      'Generative Engine Optimization (GEO) is the discipline of structuring your brand and content for the generative-AI search layer. Unlike classic SEO, which targets a ranked list of links, GEO targets the generated paragraph itself - making sure the model recommends your brand, cites your URL, and represents your facts accurately. GEO sits on top of classic SEO; it does not replace it.',
    related: ['llm-seo', 'aeo', 'ai-search-optimization', 'mention-rate', 'citation-share'],
  },
  {
    slug: 'aeo',
    term: 'AEO',
    acronym: 'Answer Engine Optimization',
    category: 'Core concepts',
    shortDef:
      'Optimizing content so answer engines (Perplexity, Google AI Overviews, ChatGPT Search) quote it as the direct answer to a query.',
    longDef:
      'Answer Engine Optimization (AEO) is the subset of GEO focused specifically on grounded answer surfaces - the ones that retrieve live URLs and quote them in the answer. AEO emphasises extractability: leading with a direct answer in the first 200 words, structuring with question-style H2s, adding FAQ schema, and making sure the page is fast and crawlable.',
    related: ['geo', 'llm-seo', 'ai-overviews', 'extractability', 'citation-share'],
  },
  {
    slug: 'llm-seo',
    term: 'LLM SEO',
    category: 'Core concepts',
    shortDef:
      'Optimizing for Large Language Models - making sure ChatGPT, Claude, Gemini, Perplexity, and Grok know about, cite, and recommend your brand.',
    longDef:
      'LLM SEO emphasises the model itself: what it learned during training, what it retrieves at inference, and what cross-source consensus it sees about your brand. The discipline overlaps almost completely with GEO and AEO but frames the work around the model rather than the answer surface.',
    related: ['geo', 'aeo', 'training-corpus', 'retrieval-augmented-generation', 'mention-rate'],
  },
  {
    slug: 'ai-search-optimization',
    term: 'AI search optimization',
    category: 'Core concepts',
    shortDef:
      'The umbrella term for optimizing for any AI-powered search surface - including ChatGPT Search, Perplexity, Google AI Overviews, and AI Mode.',
    longDef:
      'AI search optimization covers everything from training-corpus presence to live retrieval to schema. It is the broadest framing - most teams use it interchangeably with GEO, though strictly speaking GEO is the active practice and AI search optimization is the outcome.',
    related: ['geo', 'aeo', 'llm-seo', 'ai-overviews', 'chatgpt-search'],
  },
  {
    slug: 'ai-overviews',
    term: 'AI Overviews',
    category: 'Surfaces & platforms',
    shortDef:
      'Google\'s generative-AI answer box at the top of search results, powered by Gemini. Now appears for more than half of qualifying US queries.',
    longDef:
      'AI Overviews are Google\'s in-SERP AI answers - generated paragraphs that summarise the top-ranking results with linked citations. When an AI Overview appears, click-through to the top organic result drops by an average of 34.5%. Optimizing for AI Overviews is largely classic SEO done very well, plus aggressive extractability.',
    related: ['ai-mode', 'gemini', 'aeo', 'extractability', 'zero-click'],
  },
  {
    slug: 'ai-mode',
    term: 'AI Mode',
    category: 'Surfaces & platforms',
    shortDef:
      'Google\'s full conversational search experience - an alternative to classic SERPs where AI answers the query end-to-end.',
    longDef:
      'AI Mode replaces the SERP with a Perplexity-like conversational interface. Users can ask follow-up questions, the assistant retrieves and cites web sources, and the entire interaction can complete without ever showing 10 blue links. AI Mode is the long-term destination Google is steering toward.',
    related: ['ai-overviews', 'gemini', 'chatgpt-search', 'perplexity'],
  },
  {
    slug: 'chatgpt-search',
    term: 'ChatGPT Search',
    category: 'Surfaces & platforms',
    shortDef:
      'OpenAI\'s live-retrieval mode inside ChatGPT - pulls real-time web results, cites them, and answers in the chat surface.',
    longDef:
      'ChatGPT Search uses OAI-SearchBot to crawl and retrieve URLs in real time, then re-ranks and synthesises. Citations are inline. Schema, freshness, and explicit comparison content matter heavily; pure training-corpus signals matter less than in the default ChatGPT model.',
    related: ['oai-searchbot', 'aeo', 'retrieval-augmented-generation', 'citation-share'],
  },
  {
    slug: 'perplexity',
    term: 'Perplexity',
    category: 'Surfaces & platforms',
    shortDef:
      'A dedicated answer engine that retrieves the web in real time and synthesises answers with inline citations.',
    longDef:
      'Perplexity is the most directly optimisable AI search surface: it retrieves live, cites every source, and updates within days. A correctly optimised page can appear in Perplexity citations within days of publishing. The Sonar API family lets developers embed Perplexity-style retrieval.',
    related: ['perplexitybot', 'citation-share', 'aeo', 'retrieval-augmented-generation'],
  },
  {
    slug: 'gemini',
    term: 'Gemini',
    category: 'Surfaces & platforms',
    shortDef:
      'Google\'s multimodal LLM family. Powers Gemini app, AI Overviews, AI Mode, Workspace AI, and the Vertex AI / AI Studio APIs.',
    longDef:
      'Gemini is Google\'s frontier LLM family - Pro, Flash, and Flash-Lite tiers. Grounded Gemini variants use Google Search retrieval, which makes high organic rank a near-prerequisite for citation. Ungrounded Gemini answers from training memory.',
    related: ['ai-overviews', 'ai-mode', 'google-extended', 'grounding'],
  },
  {
    slug: 'claude',
    term: 'Claude',
    category: 'Surfaces & platforms',
    shortDef:
      'Anthropic\'s LLM family (Opus, Sonnet, Haiku). Available via Claude.ai, the Anthropic API, and embedded in Notion, Slack, Quora, Cursor, and more.',
    longDef:
      'Claude rewards depth, attribution, and balance. Marketing-heavy prose is quoted less often than well-cited long-form documentation. Claude is unusually sensitive to fact consistency - contradictions across sources visibly suppress mention rate.',
    related: ['claudebot', 'llm-seo', 'training-corpus'],
  },
  {
    slug: 'grok',
    term: 'Grok',
    category: 'Surfaces & platforms',
    shortDef:
      'xAI\'s LLM, with native access to real-time X (formerly Twitter) data. Powers Grok-on-X and Grok.com.',
    longDef:
      'Grok weights real-time X conversation heavily and uses live X search. Active, credible X presence in your category shifts Grok answers within days - even when your website footprint is unchanged.',
    related: ['llm-seo', 'mention-rate'],
  },
  {
    slug: 'training-corpus',
    term: 'Training corpus',
    category: 'Signals & ranking',
    shortDef:
      'The dataset an LLM was trained on. Brands that appear frequently and consistently in the training corpus are recalled by name in answers, with no live retrieval required.',
    longDef:
      'Training-corpus presence is the single most important signal for non-grounded LLM surfaces (default ChatGPT, Claude, ungrounded Gemini). You buy presence by being everywhere LLM training pipelines scrape: Wikipedia, Reddit, GitHub, established publishers, G2/Capterra, broad press coverage.',
    related: ['llm-seo', 'cross-source-consensus', 'mention-rate'],
  },
  {
    slug: 'retrieval-augmented-generation',
    term: 'RAG',
    acronym: 'Retrieval-Augmented Generation',
    category: 'Signals & ranking',
    shortDef:
      'A technique where an LLM retrieves external documents at inference time and uses them to ground its answer. Powers Perplexity, ChatGPT Search, and AI Overviews.',
    longDef:
      'RAG combines a retrieval step (search a knowledge base or the live web for relevant documents) with a generation step (the LLM synthesises an answer using the retrieved context). This is what enables citations - the model can name the source it used. For SEO purposes, optimizing for RAG-based surfaces is closest to classic SEO plus extractability work.',
    related: ['chatgpt-search', 'perplexity', 'ai-overviews', 'grounding', 'extractability'],
  },
  {
    slug: 'grounding',
    term: 'Grounding',
    category: 'Signals & ranking',
    shortDef:
      'Augmenting an LLM\'s answer with retrieved evidence so the model can cite verifiable sources, rather than relying on training memory alone.',
    longDef:
      'A grounded answer is one the model justified with retrieved documents. Grounded surfaces (Perplexity, ChatGPT Search, AI Overviews, Gemini with search) cite sources; ungrounded surfaces (default ChatGPT, base Claude) do not. Grounded surfaces respond to SEO investment in days; ungrounded surfaces respond in weeks to months.',
    related: ['retrieval-augmented-generation', 'ai-overviews', 'perplexity', 'citation-share'],
  },
  {
    slug: 'cross-source-consensus',
    term: 'Cross-source consensus',
    category: 'Signals & ranking',
    shortDef:
      'How consistently many independent sources describe a brand the same way. The single biggest factor in whether an LLM names a brand by default.',
    longDef:
      'LLMs deliberately diversify sources to reduce hallucination. The brand that 6 unrelated domains name beats the brand that only its own homepage describes - even if that homepage is more authoritative. Earning third-party placements, comparison roundups, analyst inclusion, and Reddit advocacy is how you build consensus.',
    related: ['training-corpus', 'llm-seo', 'mention-rate'],
  },
  {
    slug: 'extractability',
    term: 'Extractability',
    category: 'Signals & ranking',
    shortDef:
      'How easily an LLM can lift a clean, summarisable answer from your page. High extractability dramatically increases citation rate on grounded surfaces.',
    longDef:
      'Extractable pages answer the question in the first 200 words, use question-style H2s, bullet-pointed conclusions, FAQ schema, and clean HTML. Long preambles, gated content, and JS-heavy rendering all suppress extractability.',
    related: ['aeo', 'schema', 'ai-overviews', 'llms-txt'],
  },
  {
    slug: 'llms-txt',
    term: 'llms.txt',
    category: 'Crawlers & infrastructure',
    shortDef:
      'A proposed standard file at the root of a site that tells LLM crawlers what content is available, in what format, and how to use it.',
    longDef:
      'Modeled on robots.txt and sitemap.xml, llms.txt is an emerging convention for declaring LLM-readable content. While not universally honored yet, major AI crawlers have signalled support. Generating one is essentially free upside - use Livesov\'s free llms.txt generator.',
    related: ['robots-txt', 'gptbot', 'claudebot', 'perplexitybot'],
  },
  {
    slug: 'robots-txt',
    term: 'robots.txt',
    category: 'Crawlers & infrastructure',
    shortDef:
      'The decades-old file telling web crawlers what they can fetch. Used to allow or block GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and others.',
    longDef:
      'Every major AI crawler respects robots.txt. Blocking them opts you out of training and (in some cases) retrieval. Make sure the major AI agents are explicitly allowed - see our free AI Crawler Checker.',
    related: ['llms-txt', 'gptbot', 'claudebot', 'perplexitybot', 'google-extended'],
  },
  {
    slug: 'gptbot',
    term: 'GPTBot',
    category: 'Crawlers & infrastructure',
    shortDef: 'OpenAI\'s crawler for ChatGPT training data. Identified by the user agent "GPTBot".',
    longDef:
      'GPTBot crawls the open web to gather training data for OpenAI\'s GPT model family. Blocking GPTBot in robots.txt removes your site from future ChatGPT training datasets, which suppresses mention rate over time on the default ChatGPT model.',
    related: ['oai-searchbot', 'robots-txt', 'training-corpus', 'llm-seo'],
  },
  {
    slug: 'oai-searchbot',
    term: 'OAI-SearchBot',
    category: 'Crawlers & infrastructure',
    shortDef:
      'OpenAI\'s live-retrieval crawler for ChatGPT Search. Separate from GPTBot and must be allowed independently.',
    longDef:
      'OAI-SearchBot fetches URLs in real time when ChatGPT Search needs to retrieve sources. Many sites block GPTBot to opt out of training but unintentionally also block OAI-SearchBot, which removes them from ChatGPT Search citations entirely.',
    related: ['gptbot', 'chatgpt-search', 'robots-txt', 'citation-share'],
  },
  {
    slug: 'claudebot',
    term: 'ClaudeBot',
    category: 'Crawlers & infrastructure',
    shortDef: 'Anthropic\'s web crawler for Claude training and (in some configurations) retrieval.',
    longDef:
      'ClaudeBot indexes the open web for Claude\'s training corpus. Blocking ClaudeBot removes you from future Claude training - which is the only meaningful Claude SEO lever, since Claude does not natively retrieve at inference.',
    related: ['claude', 'robots-txt', 'training-corpus'],
  },
  {
    slug: 'perplexitybot',
    term: 'PerplexityBot',
    category: 'Crawlers & infrastructure',
    shortDef: 'Perplexity\'s live-retrieval crawler. Blocking it removes you from Perplexity citations.',
    longDef:
      'PerplexityBot retrieves URLs in real time for Perplexity answers. Because Perplexity is the most directly-optimisable AI surface, ensuring PerplexityBot can reach your site is one of the highest-leverage GEO actions available.',
    related: ['perplexity', 'robots-txt', 'citation-share'],
  },
  {
    slug: 'google-extended',
    term: 'Google-Extended',
    category: 'Crawlers & infrastructure',
    shortDef:
      'An opt-in agent that lets Google use your content for Gemini training. Separate from Googlebot, which is required for classic search.',
    longDef:
      'Google-Extended is the agent Google uses to source training data for Gemini and related AI products. Allowing it does not affect classic Google rankings. Blocking it removes you from future Gemini training datasets but keeps you indexable for Google Search and AI Overviews retrieval.',
    related: ['gemini', 'robots-txt', 'training-corpus'],
  },
  {
    slug: 'mention-rate',
    term: 'Mention rate',
    category: 'Measurement',
    shortDef:
      'The percentage of prompts in a defined panel where an LLM names your brand. The headline metric of LLM SEO programs.',
    longDef:
      'Mention rate is measured per LLM, per prompt set, over time. A brand at 70% mention rate is named in 7 of 10 buyer-intent prompts. Mention rate is the most actionable KPI because every other metric (citation share, sentiment, rank) is downstream of it.',
    related: ['citation-share', 'share-of-voice', 'sentiment', 'rank-in-answer'],
  },
  {
    slug: 'citation-share',
    term: 'Citation share',
    category: 'Measurement',
    shortDef:
      'Percentage of cited sources in an LLM answer that come from your domain. Only meaningful on grounded surfaces (Perplexity, ChatGPT Search, AI Overviews).',
    longDef:
      'On grounded surfaces, citation share is a leading indicator of mention rate - if a model is repeatedly retrieving your URL, your brand recall on that topic compounds. Improving citation share is largely a classic SEO plus extractability problem.',
    related: ['mention-rate', 'extractability', 'grounding', 'ai-overviews'],
  },
  {
    slug: 'share-of-voice',
    term: 'Share of voice (AI)',
    category: 'Measurement',
    shortDef:
      'Your mention rate as a percentage of the total mentions of you plus your named competitors across LLM answers.',
    longDef:
      'AI share of voice contextualises mention rate against the competitive set. A 60% mention rate is bad in a category where the #1 brand has 95% - and excellent in a category where the #1 has 65%. Use it as a relative, not absolute, KPI.',
    related: ['mention-rate', 'citation-share', 'rank-in-answer'],
  },
  {
    slug: 'rank-in-answer',
    term: 'Rank in answer',
    category: 'Measurement',
    shortDef:
      'Where your brand appears in an LLM\'s ordered recommendation set - first paragraph (best), middle, or final mention (weakest).',
    longDef:
      'Position inside a generated answer matters: first-paragraph mentions drive 4–6× the downstream clicks of last-paragraph mentions. Tracking rank lets you distinguish "we are named" from "we are the recommendation".',
    related: ['mention-rate', 'citation-share', 'share-of-voice'],
  },
  {
    slug: 'sentiment',
    term: 'Sentiment (in LLM answers)',
    category: 'Measurement',
    shortDef:
      'The tone with which an LLM describes your brand - positive, neutral, negative - when it does mention you.',
    longDef:
      'Sentiment in LLM answers is downstream of the corpus the model learned from: Reddit threads, review platforms, press coverage. Suppressing negative sentiment is rarely possible directly; the lever is producing enough new, positive third-party signal to shift the consensus.',
    related: ['mention-rate', 'cross-source-consensus', 'training-corpus'],
  },
  {
    slug: 'zero-click',
    term: 'Zero-click search',
    category: 'Measurement',
    shortDef:
      'Searches that end inside the search surface without a click to an external site. Now 58% of US searches.',
    longDef:
      'Zero-click rate has been climbing for a decade thanks to featured snippets and Knowledge Panels - but AI Overviews and ChatGPT Search accelerated it sharply. In a zero-click world, being cited <em>in</em> the answer is the conversion, not the start of one.',
    related: ['ai-overviews', 'chatgpt-search', 'mention-rate'],
  },
  {
    slug: 'schema',
    term: 'Schema (structured data)',
    category: 'Signals & ranking',
    shortDef:
      'JSON-LD or microdata that labels your content for machines. FAQ, Article, Product, HowTo, and Organization schema all improve LLM extractability.',
    longDef:
      'Schema gives LLMs unambiguous machine-readable signals about what your page is about. FAQ schema, in particular, doubles as direct training data for question-answer pairs and as an extractability boost on grounded surfaces.',
    related: ['extractability', 'aeo', 'ai-overviews'],
  },
];

export function getTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.slug === slug);
}

export function getAllTermSlugs(): string[] {
  return GLOSSARY.map((t) => t.slug);
}
