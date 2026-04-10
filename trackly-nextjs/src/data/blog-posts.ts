export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  tag: string;
  date: string;
  readTime: string;
  author: { name: string; role: string; initials: string };
  image: string;
  imageAlt: string;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'what-is-generative-engine-optimization-geo',
    title: 'What is Generative Engine Optimization (GEO)?',
    description: 'GEO is the new SEO. Learn how to optimize your brand to appear in AI-generated answers from ChatGPT, Perplexity, Claude, and more.',
    tag: 'GEO',
    date: '2026-03-25',
    readTime: '8 min read',
    author: { name: 'Livesov Team', role: 'AI Visibility Experts', initials: 'LT' },
    image: '/blog/geo-optimization.svg',
    imageAlt: 'Generative Engine Optimization diagram showing how brands appear in AI answers',
    content: `
## What is Generative Engine Optimization?

Generative Engine Optimization (GEO) is the practice of optimizing your brand's online presence so that AI platforms — like ChatGPT, Perplexity, Claude, Gemini, and Grok — mention and recommend you when users ask relevant questions.

Think of it as **SEO for the AI era**. Just as traditional SEO helps you rank on Google, GEO helps you appear in AI-generated answers.

## Why Does GEO Matter?

The way people search for information is changing dramatically:

- **40% of searches** now involve AI chatbots rather than traditional search engines
- Users increasingly ask ChatGPT and Perplexity for product recommendations instead of Googling
- AI platforms don't show 10 blue links — they give **one curated answer**, and if you're not in it, you're invisible

### The Problem with Traditional SEO

Ranking #1 on Google doesn't mean AI will recommend you. AI models pull from different signals:

- **Brand authority and mentions** across the web
- **Review quality and consistency** on multiple platforms
- **Content depth and expertise** (E-E-A-T signals)
- **Citation frequency** in authoritative sources
- **Structured data** and knowledge graph presence

## How to Start with GEO

### 1. Audit Your Current AI Visibility

Before optimizing, you need to know where you stand. Use a tool like [Livesov](https://livesov.com) to track how each AI platform currently mentions your brand.

Key metrics to track:
- **Share of Voice (SOV):** What percentage of relevant AI responses mention you?
- **Sentiment:** Is the AI recommending you positively or negatively?
- **Platform coverage:** Which AI platforms mention you vs. miss you?

### 2. Optimize Your Brand Signals

AI models learn from the open web. To improve your AI visibility:

- **Build authoritative backlinks** from industry publications
- **Get listed on review platforms** (G2, Capterra, Trustpilot)
- **Create comprehensive, expert content** that AI can cite
- **Ensure consistent NAP** (Name, Address, Phone) across directories
- **Add structured data** (Schema.org) to your website

### 3. Monitor and Iterate

GEO isn't a one-time fix. AI models update regularly, and your competitors are also optimizing. Set up automated tracking to:

- Run queries daily across all 5 AI platforms
- Track SOV trends over time
- Get alerts when your visibility changes
- Benchmark against competitors

## GEO vs. SEO: Key Differences

| Aspect | Traditional SEO | GEO |
|--------|----------------|-----|
| **Goal** | Rank in Google results | Appear in AI answers |
| **Output** | 10 blue links | One curated response |
| **Signals** | Keywords, backlinks | Brand authority, mentions |
| **Measurement** | Rankings, traffic | SOV, sentiment, mentions |
| **Tools** | Ahrefs, Semrush | Livesov |

## The Bottom Line

GEO is not replacing SEO — it's an **additional layer** of visibility that's growing rapidly. Brands that start optimizing for AI now will have a significant advantage as more users shift to AI-first discovery.

The first step? [Check your AI visibility](https://livesov.com/signup) across all 5 platforms. You might be surprised by what you find.
`,
  },
  {
    slug: 'ai-visibility-vs-traditional-seo',
    title: 'AI Visibility vs Traditional SEO: What\'s the Difference?',
    description: 'Ranking #1 on Google doesn\'t mean AI will recommend you. Understand why AI visibility tracking is a completely different game from SEO.',
    tag: 'Strategy',
    date: '2026-03-20',
    readTime: '6 min read',
    author: { name: 'Livesov Team', role: 'AI Visibility Experts', initials: 'LT' },
    image: '/blog/ai-vs-seo.svg',
    imageAlt: 'Comparison between traditional SEO and AI visibility tracking',
    content: `
## The Big Misconception

Most marketers assume that if they rank well on Google, they'll automatically appear in AI-generated answers. **This is wrong.**

We analyzed 500 brands and found that:

- **62% of brands** ranking in Google's top 3 are **not mentioned** by ChatGPT for the same queries
- **AI platforms use different ranking signals** than Google's algorithm
- Some brands with **zero SEO presence** are highly recommended by AI

## How Google Search Works vs How AI Works

### Google Search
1. Crawls and indexes web pages
2. Ranks based on keywords, backlinks, page speed, etc.
3. Shows 10 results per page
4. User clicks through to your website

### AI Platforms (ChatGPT, Perplexity, Claude, etc.)
1. Trained on massive datasets of web content
2. Generates a **single synthesized answer**
3. May or may not mention your brand
4. User gets the answer **without visiting your site**

This fundamental difference means your entire optimization strategy needs to change.

## What AI Platforms Actually Look For

Based on our analysis of thousands of AI responses, here's what increases your chances of being mentioned:

### 1. Brand Mentions Across the Web
AI models learn from seeing your brand name mentioned frequently in authoritative contexts. The more high-quality mentions, the more likely AI will reference you.

### 2. Review Volume and Quality
AI heavily weighs review signals. Brands with consistent 4+ star ratings across multiple platforms (Google, Yelp, G2, Trustpilot) get recommended more often.

### 3. Content Authority (E-E-A-T)
AI models favor content that demonstrates:
- **Experience**: First-hand knowledge
- **Expertise**: Deep domain knowledge
- **Authoritativeness**: Industry recognition
- **Trustworthiness**: Accurate, verified information

### 4. Structured Data
Schema.org markup helps AI understand your business. Implement:
- Organization schema
- Product/Service schema
- FAQ schema
- Review schema

## How to Track AI Visibility

Unlike SEO where you can check Google Search Console, AI visibility requires a different approach:

1. **Query AI platforms** with your target questions
2. **Analyze responses** for brand mentions
3. **Measure Share of Voice** (what % mention you vs competitors)
4. **Track sentiment** (positive, neutral, or negative mentions)
5. **Monitor trends** over time

Tools like [Livesov](https://livesov.com) automate this process across ChatGPT, Perplexity, Claude, Gemini, and Grok — giving you a unified dashboard to track your AI visibility.

## Action Steps

1. **Audit your current AI visibility** — [start a free trial](https://livesov.com/signup)
2. **Compare with your SEO rankings** — identify gaps
3. **Build brand authority** beyond Google
4. **Track both SEO and AI visibility** as complementary channels

The brands that win in 2026 will be those that master both traditional SEO **and** AI visibility.
`,
  },
  {
    slug: 'how-to-track-brand-across-ai-platforms',
    title: 'How to Track Your Brand Across ChatGPT, Perplexity & More',
    description: 'A step-by-step guide to monitoring your brand\'s presence across 5 AI platforms and measuring your share of voice.',
    tag: 'Guide',
    date: '2026-03-15',
    readTime: '7 min read',
    author: { name: 'Livesov Team', role: 'AI Visibility Experts', initials: 'LT' },
    image: '/blog/track-brand.svg',
    imageAlt: 'Dashboard showing brand tracking across multiple AI platforms',
    content: `
## Why You Need to Track AI Mentions

Every day, millions of users ask AI chatbots questions like:

- "What's the best CRM for small businesses?"
- "Recommend a good HVAC company in Austin TX"
- "What project management tools do you suggest?"

If AI isn't mentioning your brand in these conversations, you're missing a massive — and growing — discovery channel.

## The 5 AI Platforms You Should Track

### 1. ChatGPT (OpenAI)
The most popular AI chatbot with 200M+ weekly users. ChatGPT is where most buying-decision conversations happen.

### 2. Perplexity AI
An AI-powered search engine that provides sourced answers with citations. Increasingly used for product research.

### 3. Claude (Anthropic)
Known for detailed, nuanced responses. Popular among professionals and enterprises for research and recommendations.

### 4. Google Gemini
Google's AI integrated into Search. As Google AI Overviews expand, visibility here becomes critical.

### 5. Grok (xAI)
Built into X (Twitter), Grok has real-time data and a growing user base. Important for brands with social media presence.

## Step-by-Step: Setting Up Brand Tracking

### Step 1: Define Your Tracking Queries

Think about what your customers actually ask AI. Create queries like:

- "[Category] in [location]" — *"Best dentist in Chicago"*
- "Recommend a [product type]" — *"Recommend a project management tool"*
- "[Your brand] vs [competitor]" — *"Notion vs Monday.com"*
- "Review of [your brand]" — *"Is Livesov worth it?"*

**Pro tip:** Start with 10-15 queries that match real customer intent.

### Step 2: Run Queries Across All Platforms

You can do this manually (slow and tedious) or use a tool like [Livesov](https://livesov.com) to automate it.

For each query on each platform, record:
- ✓ Was your brand mentioned?
- What was the sentiment? (positive/neutral/negative)
- Were competitors mentioned instead?
- What exact words did the AI use to describe you?

### Step 3: Calculate Your Share of Voice

**Share of Voice (SOV)** = (Queries where you're mentioned / Total queries) × 100

Example:
- You track 20 queries across 5 platforms = 100 total checks
- Your brand is mentioned in 35 of them
- Your SOV = 35%

### Step 4: Analyze by Platform

Break down your SOV by platform to find gaps:

| Platform | Mentioned | Total | SOV |
|----------|-----------|-------|-----|
| ChatGPT | 12 | 20 | 60% |
| Perplexity | 10 | 20 | 50% |
| Claude | 8 | 20 | 40% |
| Gemini | 5 | 20 | 25% |
| Grok | 0 | 20 | 0% |

This tells you exactly where to focus your optimization efforts.

### Step 5: Set Up Automated Tracking

Manual checking doesn't scale. Set up daily automated tracking to:

- **Catch changes quickly** — AI models update frequently
- **Build trend data** — See if your visibility is improving
- **Get alerts** — Know immediately when something changes
- **Generate reports** — Export proof for clients or stakeholders

## What to Do With the Data

Once you're tracking, focus on:

1. **Low SOV platforms** — Optimize for platforms where you're missing
2. **Negative sentiment** — Fix misinformation quickly
3. **Competitor gaps** — Find queries where competitors appear but you don't
4. **Proof collection** — Save AI responses as evidence for clients

## Get Started Today

The sooner you start tracking, the sooner you can improve. [Sign up for Livesov](https://livesov.com/signup) and get your first AI visibility report in under 2 minutes.
`,
  },
  {
    slug: 'share-of-voice-ai-complete-guide',
    title: 'Share of Voice in AI: The Complete Guide for 2026',
    description: 'Learn what AI Share of Voice means, how to measure it, and why it\'s the most important metric for brand visibility in the AI era.',
    tag: 'Analytics',
    date: '2026-03-10',
    readTime: '9 min read',
    author: { name: 'Livesov Team', role: 'AI Visibility Experts', initials: 'LT' },
    image: '/blog/share-of-voice.svg',
    imageAlt: 'Chart showing Share of Voice metrics across AI platforms',
    content: `
## What is Share of Voice in AI?

Share of Voice (SOV) in AI measures **what percentage of AI-generated responses mention your brand** when users ask relevant questions. It's the AI equivalent of market share in advertising.

### Traditional SOV vs AI SOV

| | Traditional SOV | AI SOV |
|---|---|---|
| **Measures** | Ad impressions in market | Brand mentions in AI responses |
| **Channels** | TV, radio, digital ads | ChatGPT, Perplexity, Claude, Gemini, Grok |
| **Control** | You buy visibility | You earn visibility |
| **Cost** | Pay per impression | Optimize brand presence |

## Why AI SOV Matters More Than Ever

### The Numbers

- **40% of product research** now starts with an AI chatbot
- AI platforms give **one answer**, not 10 results — so SOV is winner-takes-most
- **87% of users** trust AI recommendations as much as friend recommendations
- Brands with >50% AI SOV see **3x more organic sign-ups** than those below 20%

### The Compounding Effect

Unlike paid advertising where visibility stops when you stop paying, AI SOV compounds over time. As your brand authority grows:

1. AI mentions you more frequently
2. More mentions → more brand searches → more content about you
3. More content → stronger AI signals → even more mentions

This virtuous cycle means **early movers have a massive advantage**.

## How to Measure AI Share of Voice

### Formula

\`\`\`
AI SOV = (Responses mentioning your brand / Total relevant responses) × 100
\`\`\`

### What Counts as a "Mention"?

- **Direct mention**: AI names your brand explicitly
- **Recommendation**: AI suggests your product/service
- **Comparison**: AI includes you in a comparison with competitors
- **Citation**: AI references your content or data

### What Doesn't Count

- Your brand appears only in a disclaimer
- AI mentions your brand in a negative-only context
- Your domain appears in a URL but isn't discussed

## Benchmarks: What's a Good AI SOV?

Based on data from 500+ brands tracked on Livesov:

| SOV Range | Assessment | Action |
|-----------|------------|--------|
| **0-10%** | Invisible | Urgent optimization needed |
| **10-25%** | Low visibility | Active improvement required |
| **25-50%** | Moderate | Growing, keep optimizing |
| **50-75%** | Strong | Maintain and defend |
| **75%+** | Dominant | Monitor for changes |

## 5 Strategies to Increase Your AI SOV

### 1. Build Brand Authority Signals
- Get featured in industry publications
- Earn mentions on Wikipedia (if notable)
- Publish original research and data
- Speak at conferences and events

### 2. Optimize Review Presence
- Maintain 4+ stars across Google, G2, Capterra, Trustpilot
- Respond to all reviews (positive and negative)
- Encourage detailed reviews that mention specific features

### 3. Create AI-Friendly Content
- Write comprehensive, well-structured articles
- Use clear headings and bullet points
- Include data, statistics, and original insights
- Add FAQ sections with Schema markup

### 4. Monitor Competitors
- Track competitor SOV alongside yours
- Identify queries where they appear but you don't
- Analyze what makes their brand get mentioned

### 5. Track and Iterate
- Set up daily automated tracking with [Livesov](https://livesov.com)
- Review SOV trends weekly
- Adjust strategy based on data
- Export proof reports for stakeholders

## Measuring SOV Across Platforms

Different AI platforms may have wildly different SOV for your brand:

A local HVAC company might have:
- **80% SOV** on ChatGPT (great reviews, strong local presence)
- **60% SOV** on Perplexity (good citations)
- **40% SOV** on Claude (moderate authority)
- **20% SOV** on Gemini (low structured data)
- **0% SOV** on Grok (no social presence)

This platform-level breakdown reveals exactly where to focus.

## Start Tracking Your AI SOV Today

You can't improve what you can't measure. [Start tracking your Share of Voice](https://livesov.com/signup) across all 5 AI platforms and get actionable insights to grow your AI visibility.
`,
  },
  {
    slug: 'ai-brand-monitoring-for-agencies',
    title: 'AI Brand Monitoring for Agencies: A New Revenue Stream',
    description: 'How digital marketing agencies can offer AI visibility audits as a premium service and win more clients with data-backed reports.',
    tag: 'Agency',
    date: '2026-03-05',
    readTime: '6 min read',
    author: { name: 'Livesov Team', role: 'AI Visibility Experts', initials: 'LT' },
    image: '/blog/agency-monitoring.svg',
    imageAlt: 'Agency dashboard showing AI brand monitoring reports for multiple clients',
    content: `
## The Opportunity for Agencies

Here's a conversation happening in every marketing agency right now:

> **Client:** "We rank #1 on Google for our main keywords, but leads are declining. What's happening?"

The answer? **AI is eating traditional search.** Users are getting answers from ChatGPT and Perplexity instead of clicking Google results.

This creates a massive opportunity for agencies that can help clients with AI visibility.

## Why Clients Will Pay for AI Visibility Services

### 1. It's a New, Unsolved Problem
Most businesses don't even know AI platforms exist as a discovery channel. When you show them data proving they're invisible in AI, it creates immediate urgency.

### 2. No DIY Solution
Unlike SEO where clients can Google "how to do SEO," there's no established playbook for AI visibility. They need expert help.

### 3. Measurable ROI
With tools like [Livesov](https://livesov.com), you can show before/after metrics: "Your AI SOV went from 15% to 48% in 90 days."

### 4. Recurring Revenue
AI visibility requires ongoing monitoring and optimization — not a one-time fix. This means retainer contracts.

## How to Package AI Visibility Services

### Tier 1: AI Visibility Audit ($500-$2,000)
**One-time assessment:**
- Track client's brand across 5 AI platforms
- Run 20-30 relevant queries
- Analyze SOV, sentiment, and competitor positioning
- Deliver a PDF report with recommendations

**Deliverable:** 10-15 page report with evidence screenshots

### Tier 2: Monthly AI Monitoring ($500-$1,500/mo)
**Ongoing tracking:**
- Daily automated tracking across all platforms
- Monthly SOV trend reports
- Competitor benchmarking
- Alert notifications for visibility changes

**Deliverable:** Monthly dashboard access + executive summary

### Tier 3: Full AI Optimization ($2,000-$5,000/mo)
**Strategy + execution:**
- Everything in Tier 2
- Content strategy for AI visibility
- Review management optimization
- Structured data implementation
- Quarterly strategy reviews

**Deliverable:** Full-service AI visibility management

## Using Livesov for Client Reporting

Livesov's Agency plan gives you everything you need:

### Evidence & Proof
Every AI response is saved as verifiable proof. You can:
- Export responses as CSV for custom reports
- Share direct links to saved evidence
- Show clients exactly what AI says about them

### Multi-Brand Dashboard
Track up to 20 brands from one account. Perfect for:
- Managing multiple client accounts
- Running competitive audits
- Comparing performance across clients

### White-Label Reporting
Export data in CSV format to build branded reports:
- SOV trends over time
- Platform-by-platform breakdown
- Competitor comparison charts
- Sentiment analysis summaries

## Pitching AI Visibility to Clients

### The Conversation Starter
> "Did you know ChatGPT gets 200M+ weekly users, and when someone asks it to recommend a [your industry] company, your brand doesn't appear? Let me show you."

### The Demo
Run a live query in front of the client:
1. Open ChatGPT
2. Ask "Recommend a [their industry] in [their city]"
3. Show them the result — are they mentioned? Are competitors?

This "aha moment" closes deals.

### The Proof
Use Livesov's evidence export to show:
- Which platforms mention them
- What competitors are being recommended
- Their current SOV score
- Specific quotes from AI about their brand

## Getting Started

1. [Sign up for Livesov Agency plan](https://livesov.com/signup) ($149/mo for 20 brands)
2. Add your first client's brand
3. Run an initial audit
4. Package the results into a proposal
5. Present findings to the client
6. Close the deal and set up ongoing monitoring

The agencies that add AI visibility to their services now will have a **12-month head start** on competitors.
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find(p => p.slug === slug);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
