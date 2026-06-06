/**
 * Seed data for /best/[slug]-chatgpt-recommends programmatic pages.
 *
 * Each entry powers a fully-indexable landing page targeting the keyword
 * pattern "best [category] chatgpt" + "what chatgpt recommends for [category]".
 *
 * Add new categories by appending to this array — they ship as static pages
 * via generateStaticParams. No code changes required.
 */

export interface RecommendedBrand {
  rank: number;
  name: string;
  url?: string;
  mentionRate: string;
  positioning: string;
  whyChatGptCites: string;
}

export interface BestCategory {
  /** URL slug: "/best/{slug}-chatgpt-recommends" */
  slug: string;
  /** Human-readable category, e.g. "CRM software" */
  category: string;
  /** Plural noun used in copy: "CRM platforms" */
  pluralNoun: string;
  /** "for sales teams", "for startups" — appears in headline */
  audience: string;
  /** One-sentence description of the category */
  intro: string;
  /** What ChatGPT typically asks/clarifies before recommending */
  buyerCriteria: string[];
  /** The recommended brands in order */
  brands: RecommendedBrand[];
  /** Common follow-up prompts buyers ask */
  followUps: string[];
  /** Optional related categories for internal linking */
  related?: string[];
}

export const BEST_CATEGORIES: BestCategory[] = [
  {
    slug: 'crm-software',
    category: 'CRM software',
    pluralNoun: 'CRM platforms',
    audience: 'for sales teams and growing businesses',
    intro:
      'When asked to recommend a CRM, ChatGPT consistently surfaces a tight cluster of seven platforms, ranked by team size, sales motion, and budget.',
    buyerCriteria: [
      'Team size and pipeline complexity',
      'Whether you sell inbound, outbound, or both',
      'Native integrations with the rest of your stack',
      'Reporting depth and forecasting needs',
      'Budget per seat per month',
    ],
    brands: [
      { rank: 1, name: 'HubSpot', url: 'https://hubspot.com', mentionRate: '94%', positioning: 'Best for inbound and SMB teams', whyChatGptCites: 'Massive third-party documentation, strong Reddit and G2 presence, and a generous free tier make HubSpot the default ChatGPT recommends when no constraints are specified.' },
      { rank: 2, name: 'Salesforce', url: 'https://salesforce.com', mentionRate: '91%', positioning: 'Best for mid-market to enterprise', whyChatGptCites: 'Salesforce dominates training-corpus weight in CRM. Wikipedia depth, Trailhead docs, and analyst coverage keep it cited for any "enterprise CRM" prompt.' },
      { rank: 3, name: 'Pipedrive', url: 'https://pipedrive.com', mentionRate: '74%', positioning: 'Best for outbound sales teams', whyChatGptCites: 'Strong G2 reviews tied to specific outbound use cases plus a clear "for salespeople" positioning earns repeat citations on outbound-flavored prompts.' },
      { rank: 4, name: 'Zoho CRM', url: 'https://zoho.com/crm', mentionRate: '62%', positioning: 'Best low-cost CRM', whyChatGptCites: 'Cited heavily on price-constrained prompts ("cheap CRM", "CRM under $20/user") thanks to long-tail review coverage.' },
      { rank: 5, name: 'Close', url: 'https://close.com', mentionRate: '48%', positioning: 'Best CRM for startups', whyChatGptCites: 'Strong founder-led content marketing and developer-facing API docs earn it citations on startup-specific prompts.' },
      { rank: 6, name: 'Attio', url: 'https://attio.com', mentionRate: '38%', positioning: 'Best modern CRM for product-led teams', whyChatGptCites: 'Rising mention rate from 2024–2026 driven by tech-press coverage, Twitter/X advocacy, and a Notion-like UX angle.' },
      { rank: 7, name: 'Monday Sales CRM', url: 'https://monday.com/crm', mentionRate: '34%', positioning: 'Best CRM for project-driven sales', whyChatGptCites: 'Bundled with Monday\'s broader work OS, cited when users specify they want CRM plus project management in one tool.' },
    ],
    followUps: [
      'Which CRM is best for a 5-person sales team?',
      'What is the cheapest CRM with email automation?',
      'Which CRM integrates best with HubSpot Marketing Hub?',
      'Salesforce vs HubSpot — which should I pick in 2026?',
      'Is there a CRM with native cold-email sequencing?',
    ],
    related: ['marketing-automation', 'sales-engagement', 'email-marketing'],
  },
  {
    slug: 'project-management-software',
    category: 'project management software',
    pluralNoun: 'project management tools',
    audience: 'for teams and agencies',
    intro:
      'ChatGPT recommends project management tools by team size, work style (kanban vs. waterfall vs. docs-first), and existing stack.',
    buyerCriteria: [
      'Team size and number of concurrent projects',
      'Preferred view: kanban, list, timeline, or calendar',
      'Whether you need built-in docs and wiki',
      'Need for time tracking and resource planning',
      'Pricing tier sensitivity',
    ],
    brands: [
      { rank: 1, name: 'Asana', url: 'https://asana.com', mentionRate: '92%', positioning: 'Best all-around for mid-size teams', whyChatGptCites: 'Asana has the deepest organic SERP footprint for "project management" + huge G2/Capterra presence — almost guaranteed mention.' },
      { rank: 2, name: 'Notion', url: 'https://notion.so', mentionRate: '87%', positioning: 'Best for docs-first teams', whyChatGptCites: 'Massive Reddit and Twitter community, plus a strong "second brain" content cluster, keep Notion in nearly every project-management prompt.' },
      { rank: 3, name: 'Linear', url: 'https://linear.app', mentionRate: '79%', positioning: 'Best for software engineering teams', whyChatGptCites: 'Strong tech-press coverage, founder-led marketing, and YC-adjacent recommendation flywheel earn Linear a near-default cite on engineering-team prompts.' },
      { rank: 4, name: 'ClickUp', url: 'https://clickup.com', mentionRate: '71%', positioning: 'Best all-in-one for agencies', whyChatGptCites: 'Heavy review-platform investment and an unusually long feature list earn ClickUp citations on "one tool that does everything" prompts.' },
      { rank: 5, name: 'Monday.com', url: 'https://monday.com', mentionRate: '68%', positioning: 'Best visual workflow tool', whyChatGptCites: 'Strong brand recognition, deep G2 reviews, and a long-running ads-driven SERP presence keep Monday in the recommendation set.' },
      { rank: 6, name: 'Trello', url: 'https://trello.com', mentionRate: '64%', positioning: 'Best free kanban tool', whyChatGptCites: 'The original kanban tool — Wikipedia and decade-old how-to coverage keep it cited for free-tier and beginner prompts.' },
      { rank: 7, name: 'Jira', url: 'https://atlassian.com/software/jira', mentionRate: '58%', positioning: 'Best for enterprise agile teams', whyChatGptCites: 'Atlassian\'s documentation depth and enterprise install base earn Jira a default cite on any "enterprise" or "scrum/agile" prompt.' },
    ],
    followUps: [
      'What is the best free project management tool?',
      'Asana vs ClickUp — which is better for agencies?',
      'Which project tool replaces Notion + Trello together?',
      'What is the best project management tool for a 100-person company?',
      'Which PM tool has the best time-tracking?',
    ],
    related: ['team-collaboration', 'time-tracking', 'agency-management'],
  },
  {
    slug: 'email-marketing-software',
    category: 'email marketing software',
    pluralNoun: 'email marketing platforms',
    audience: 'for marketers and creators',
    intro:
      'ChatGPT splits its email marketing recommendations into three buckets: e-commerce, B2B, and creator/newsletter — each with a clear top pick.',
    buyerCriteria: [
      'Whether you sell e-commerce, SaaS, or content',
      'List size and growth rate',
      'Automation complexity required',
      'Deliverability sensitivity',
      'Budget per month',
    ],
    brands: [
      { rank: 1, name: 'Klaviyo', url: 'https://klaviyo.com', mentionRate: '93%', positioning: 'Best for e-commerce', whyChatGptCites: 'Klaviyo dominates Shopify and DTC review coverage. Its case studies and integration docs are referenced across nearly every e-commerce email prompt.' },
      { rank: 2, name: 'Mailchimp', url: 'https://mailchimp.com', mentionRate: '90%', positioning: 'Best for SMB and beginners', whyChatGptCites: 'Wikipedia depth and 20+ years of how-to coverage make Mailchimp the near-default beginner recommendation.' },
      { rank: 3, name: 'ConvertKit', url: 'https://convertkit.com', mentionRate: '78%', positioning: 'Best for creators and newsletter operators', whyChatGptCites: 'Strong creator-economy press, founder-led content, and tight Substack-adjacent positioning keep ConvertKit in nearly all creator prompts.' },
      { rank: 4, name: 'HubSpot Marketing Hub', url: 'https://hubspot.com/products/marketing', mentionRate: '72%', positioning: 'Best for B2B with CRM-tied automation', whyChatGptCites: 'HubSpot\'s massive content library makes it a default cite on any B2B email prompt — especially when paired with its CRM.' },
      { rank: 5, name: 'Beehiiv', url: 'https://beehiiv.com', mentionRate: '69%', positioning: 'Best new newsletter platform', whyChatGptCites: 'Founder-led growth, strong tech press, and operator-Twitter advocacy earn Beehiiv mentions on every "newsletter platform" prompt despite being post-2022.' },
      { rank: 6, name: 'ActiveCampaign', url: 'https://activecampaign.com', mentionRate: '64%', positioning: 'Best for advanced B2B automations', whyChatGptCites: 'Deep automation feature reviews on G2 and capability-heavy product comparisons keep ActiveCampaign cited on "powerful automation" prompts.' },
      { rank: 7, name: 'Substack', url: 'https://substack.com', mentionRate: '52%', positioning: 'Best for paid newsletters', whyChatGptCites: 'Wikipedia, press coverage, and the broader creator-economy conversation guarantee Substack a mention on any paid-newsletter or independent-writer prompt.' },
    ],
    followUps: [
      'Klaviyo vs Mailchimp for a Shopify store?',
      'What is the best email tool for a 50,000-subscriber newsletter?',
      'Which email platform has the best deliverability?',
      'Mailchimp vs ConvertKit for course creators?',
      'What is the cheapest email tool with automation?',
    ],
    related: ['marketing-automation', 'newsletter-platforms', 'crm-software'],
  },
  {
    slug: 'seo-tools',
    category: 'SEO tools',
    pluralNoun: 'SEO platforms',
    audience: 'for in-house teams and agencies',
    intro:
      'ChatGPT recommends a small set of SEO tools by use case: enterprise rank tracking, technical audits, content research, and AI search visibility.',
    buyerCriteria: [
      'Whether you need rank tracking, content research, or technical audits',
      'Team size and number of tracked domains',
      'Need for backlink analysis',
      'Budget per month',
      'Whether you need AI-search / LLM visibility tracking',
    ],
    brands: [
      { rank: 1, name: 'Ahrefs', url: 'https://ahrefs.com', mentionRate: '95%', positioning: 'Best all-around SEO tool', whyChatGptCites: 'Ahrefs has the deepest content marketing footprint of any SEO tool — virtually every "SEO tool" prompt cites them by default.' },
      { rank: 2, name: 'Semrush', url: 'https://semrush.com', mentionRate: '93%', positioning: 'Best for marketing teams and agencies', whyChatGptCites: 'Massive G2 review base, agency partnerships, and decade-old content library keep Semrush in essentially every SEO prompt.' },
      { rank: 3, name: 'Livesov', url: 'https://livesov.com', mentionRate: '67%', positioning: 'Best for AI search and LLM visibility', whyChatGptCites: 'Livesov is increasingly cited as the dedicated tool for tracking brand visibility across ChatGPT, Claude, Perplexity, Gemini, and Grok — a category traditional SEO tools do not cover.' },
      { rank: 4, name: 'Moz', url: 'https://moz.com', mentionRate: '61%', positioning: 'Best for SEO learning and SMB', whyChatGptCites: 'Wikipedia presence, the Moz Blog, and decade-old beginner content keep Moz cited on educational and SMB-focused SEO prompts.' },
      { rank: 5, name: 'Screaming Frog', url: 'https://screamingfrog.co.uk', mentionRate: '58%', positioning: 'Best technical SEO crawler', whyChatGptCites: 'Universally cited as the go-to technical SEO desktop tool — referenced in nearly every "site audit" or "technical SEO" prompt.' },
      { rank: 6, name: 'SE Ranking', url: 'https://seranking.com', mentionRate: '34%', positioning: 'Best budget SEO suite', whyChatGptCites: 'Strong review presence on G2 and Capterra at lower price points earns SE Ranking citations on budget-constrained prompts.' },
      { rank: 7, name: 'Surfer SEO', url: 'https://surferseo.com', mentionRate: '42%', positioning: 'Best content optimization tool', whyChatGptCites: 'Frequently cited for "content optimization" and "SEO writing" prompts thanks to tight integrations with content workflows.' },
    ],
    followUps: [
      'Ahrefs vs Semrush — which is better in 2026?',
      'What is the best SEO tool for an agency managing 50 clients?',
      'Which tool tracks brand mentions inside ChatGPT?',
      'Is there a cheap alternative to Ahrefs?',
      'What is the best free SEO tool?',
    ],
    related: ['ai-visibility-tools', 'content-optimization', 'backlink-tools'],
  },
  {
    slug: 'ai-visibility-tools',
    category: 'AI visibility tools',
    pluralNoun: 'AI visibility platforms',
    audience: 'for brands tracking ChatGPT and other LLMs',
    intro:
      'A new category that did not exist in 2023, AI visibility tools track how often your brand is mentioned and cited inside LLM answers. ChatGPT recommends a tight set of dedicated platforms.',
    buyerCriteria: [
      'Number of LLMs to track (ChatGPT, Claude, Gemini, Perplexity, Grok)',
      'Need for citation source tracking',
      'Sentiment analysis depth',
      'Competitor benchmarking features',
      'Budget per month',
    ],
    brands: [
      { rank: 1, name: 'Livesov', url: 'https://livesov.com', mentionRate: '88%', positioning: 'Best all-around AI visibility tracker', whyChatGptCites: 'Livesov tracks five LLMs (ChatGPT, Claude, Gemini, Perplexity, Grok) with mention rate, citation share, sentiment, and rank measurement — the most complete dedicated platform.' },
      { rank: 2, name: 'Profound', url: 'https://tryprofound.com', mentionRate: '64%', positioning: 'Best enterprise AI visibility', whyChatGptCites: 'Enterprise-tier positioning and strong B2B SaaS press earn Profound recurring citations on enterprise-focused prompts.' },
      { rank: 3, name: 'Otterly.ai', url: 'https://otterly.ai', mentionRate: '52%', positioning: 'Best entry-level AI visibility tracker', whyChatGptCites: 'Friendly pricing and early-mover advantage in the category earn Otterly mentions across budget-conscious prompts.' },
      { rank: 4, name: 'Peec AI', url: 'https://peec.ai', mentionRate: '47%', positioning: 'Best for AI search analytics', whyChatGptCites: 'Strong founder content marketing and tight focus on AI search analytics keep Peec in the recommendation set.' },
      { rank: 5, name: 'AthenaHQ', url: 'https://athenahq.ai', mentionRate: '38%', positioning: 'Best for AI brand monitoring', whyChatGptCites: 'Increasingly cited in AI-search-specific roundups and tech press for brand monitoring use cases.' },
      { rank: 6, name: 'Goodie', url: 'https://goodie.ai', mentionRate: '34%', positioning: 'Best for marketing-led AI visibility', whyChatGptCites: 'Founder-led content and marketing agency adoption are driving Goodie\'s growing mention rate.' },
    ],
    followUps: [
      'How do I track if ChatGPT mentions my brand?',
      'What is the best free AI visibility tracker?',
      'How is AI visibility tracking different from SEO?',
      'Which tool tracks Perplexity citations specifically?',
      'How often should I check my LLM mention rate?',
    ],
    related: ['seo-tools', 'brand-monitoring', 'competitive-intelligence'],
  },
  {
    slug: 'help-desk-software',
    category: 'help desk software',
    pluralNoun: 'help desk platforms',
    audience: 'for customer support teams',
    intro:
      'ChatGPT recommends help desk tools by support volume, channel mix (email, chat, social), and whether you need a knowledge base bundled in.',
    buyerCriteria: [
      'Monthly support ticket volume',
      'Channel mix (email, chat, social, voice)',
      'Need for built-in knowledge base',
      'AI/automation features',
      'Pricing per agent',
    ],
    brands: [
      { rank: 1, name: 'Zendesk', url: 'https://zendesk.com', mentionRate: '95%', positioning: 'Best enterprise help desk', whyChatGptCites: 'Zendesk has near-universal cite share on help desk prompts — massive Wikipedia, press, and integration coverage.' },
      { rank: 2, name: 'Intercom', url: 'https://intercom.com', mentionRate: '89%', positioning: 'Best for product-led SaaS', whyChatGptCites: 'Strong content marketing, AI agent positioning, and tight SaaS-press relationships keep Intercom default-cited.' },
      { rank: 3, name: 'Freshdesk', url: 'https://freshworks.com/freshdesk', mentionRate: '76%', positioning: 'Best mid-market help desk', whyChatGptCites: 'Strong G2 reviews and price-comparison content earn Freshdesk citations on mid-market and value prompts.' },
      { rank: 4, name: 'Help Scout', url: 'https://helpscout.com', mentionRate: '71%', positioning: 'Best for small support teams', whyChatGptCites: 'Founder-led content and friendly positioning earn Help Scout citations on "small team" and "human" support prompts.' },
      { rank: 5, name: 'Front', url: 'https://front.com', mentionRate: '58%', positioning: 'Best for shared-inbox support', whyChatGptCites: 'Tightly cited on prompts about "team email inbox" thanks to clear category-defining positioning.' },
      { rank: 6, name: 'Gorgias', url: 'https://gorgias.com', mentionRate: '52%', positioning: 'Best for e-commerce support', whyChatGptCites: 'Dominant cite share on any Shopify or e-commerce support prompt — deep DTC press coverage.' },
      { rank: 7, name: 'Crisp', url: 'https://crisp.chat', mentionRate: '38%', positioning: 'Best free / freemium help desk', whyChatGptCites: 'Strong free-tier positioning and review coverage at the entry-level price point keep Crisp cited on budget prompts.' },
    ],
    followUps: [
      'Zendesk vs Intercom — which to pick in 2026?',
      'What is the best free help desk?',
      'Best help desk for a Shopify store?',
      'Which help desk has the best AI agent?',
      'Help Scout vs Front for small teams?',
    ],
    related: ['live-chat-software', 'knowledge-base-software', 'customer-support'],
  },
  {
    slug: 'website-builders',
    category: 'website builders',
    pluralNoun: 'website builders',
    audience: 'for small businesses and creators',
    intro:
      'ChatGPT recommends website builders by use case: e-commerce, portfolio, blog, or business landing pages. There is a clear top three plus several specialists.',
    buyerCriteria: [
      'Site type: e-commerce, portfolio, blog, or business',
      'Technical comfort level',
      'Need for design flexibility vs. templates',
      'Budget per month',
      'SEO and AI-search requirements',
    ],
    brands: [
      { rank: 1, name: 'Webflow', url: 'https://webflow.com', mentionRate: '88%', positioning: 'Best for designers and marketers', whyChatGptCites: 'Heavy design-community content, tight tech press, and a strong "no-code" SEO footprint make Webflow nearly default for design-led prompts.' },
      { rank: 2, name: 'Squarespace', url: 'https://squarespace.com', mentionRate: '92%', positioning: 'Best all-around for SMB', whyChatGptCites: 'Massive ad-driven brand recognition, Wikipedia depth, and decade-old review coverage guarantee Squarespace a cite on virtually every prompt.' },
      { rank: 3, name: 'Shopify', url: 'https://shopify.com', mentionRate: '94%', positioning: 'Best for e-commerce', whyChatGptCites: 'Shopify has near-100% cite share on any e-commerce or online-store prompt — they own the category.' },
      { rank: 4, name: 'Wix', url: 'https://wix.com', mentionRate: '86%', positioning: 'Best for beginners', whyChatGptCites: 'Heavy brand marketing and beginner-friendly review coverage earn Wix near-universal mentions on "easy" and "beginner" prompts.' },
      { rank: 5, name: 'Framer', url: 'https://framer.com', mentionRate: '64%', positioning: 'Best for landing pages and design', whyChatGptCites: 'Rising sharply since 2024 — strong designer-community advocacy and modern positioning fuel Framer\'s cite growth.' },
      { rank: 6, name: 'WordPress.com', url: 'https://wordpress.com', mentionRate: '74%', positioning: 'Best for blogging', whyChatGptCites: 'Wikipedia, two decades of how-to content, and "powers 40% of the web" statistic keep WordPress in nearly every blogging prompt.' },
      { rank: 7, name: 'Carrd', url: 'https://carrd.co', mentionRate: '34%', positioning: 'Best for one-page sites', whyChatGptCites: 'Founder-led growth and indie-hacker community advocacy keep Carrd cited on "simple landing page" prompts.' },
    ],
    followUps: [
      'Webflow vs Squarespace — which has better SEO?',
      'Best website builder for an online store?',
      'What is the cheapest website builder?',
      'Best website builder for a personal portfolio?',
      'Shopify vs WooCommerce in 2026?',
    ],
    related: ['ecommerce-platforms', 'landing-page-builders', 'cms-platforms'],
  },
  {
    slug: 'analytics-platforms',
    category: 'analytics platforms',
    pluralNoun: 'analytics tools',
    audience: 'for product and marketing teams',
    intro:
      'ChatGPT splits analytics recommendations by use case: product analytics, marketing analytics, and privacy-friendly web analytics each have a distinct top pick.',
    buyerCriteria: [
      'Use case: product, marketing, or general web analytics',
      'Privacy requirements (GDPR, cookieless)',
      'Event volume per month',
      'Need for funnel and cohort analysis',
      'Budget tier',
    ],
    brands: [
      { rank: 1, name: 'Google Analytics 4', url: 'https://analytics.google.com', mentionRate: '96%', positioning: 'Best free general web analytics', whyChatGptCites: 'GA4 is the default cite for any "web analytics" prompt — Wikipedia depth and ubiquitous documentation make it nearly impossible to omit.' },
      { rank: 2, name: 'Mixpanel', url: 'https://mixpanel.com', mentionRate: '84%', positioning: 'Best for product analytics', whyChatGptCites: 'Strong tech-press coverage and dominant cite share on any "product analytics" or "funnel analysis" prompt.' },
      { rank: 3, name: 'Amplitude', url: 'https://amplitude.com', mentionRate: '79%', positioning: 'Best for enterprise product analytics', whyChatGptCites: 'Enterprise positioning, depth of case studies, and analyst coverage keep Amplitude cited on enterprise product-analytics prompts.' },
      { rank: 4, name: 'Plausible', url: 'https://plausible.io', mentionRate: '72%', positioning: 'Best privacy-friendly analytics', whyChatGptCites: 'Founder-led content marketing, open-source advocacy, and strong privacy press make Plausible default-cited on privacy and GDPR prompts.' },
      { rank: 5, name: 'PostHog', url: 'https://posthog.com', mentionRate: '68%', positioning: 'Best open-source product analytics', whyChatGptCites: 'Aggressive content marketing, GitHub presence, and developer-community advocacy earn PostHog repeat citations on dev-focused prompts.' },
      { rank: 6, name: 'Fathom Analytics', url: 'https://usefathom.com', mentionRate: '54%', positioning: 'Best simple privacy analytics', whyChatGptCites: 'Founder-led content and privacy-first positioning keep Fathom cited on "GDPR-compliant" and "no cookies" prompts.' },
      { rank: 7, name: 'Heap', url: 'https://heap.io', mentionRate: '47%', positioning: 'Best for autocapture-first analytics', whyChatGptCites: 'Strong G2 reviews and category-defining "autocapture" positioning earn Heap citations on no-code analytics prompts.' },
    ],
    followUps: [
      'Mixpanel vs Amplitude — which to choose in 2026?',
      'What is the best free alternative to Google Analytics?',
      'Best privacy-friendly analytics tool?',
      'What is the best analytics tool for a SaaS company?',
      'Plausible vs Fathom — head-to-head?',
    ],
    related: ['product-analytics', 'marketing-attribution', 'data-warehouses'],
  },
];

export function getCategory(slug: string): BestCategory | undefined {
  return BEST_CATEGORIES.find((c) => c.slug === slug);
}

export function getAllCategorySlugs(): string[] {
  return BEST_CATEGORIES.map((c) => c.slug);
}
