'use client';

import { useState } from 'react';
import SeoLayout, { SeoHero } from '@/components/seo/SeoLayout';
import Link from 'next/link';

const posts = [
  {
    id: 'chatgpt-brand-recommendation',
    title: 'How to Check if ChatGPT Recommends Your Brand',
    desc: 'Learn how to find out whether ChatGPT mentions and recommends your brand — and what to do if it doesn\'t.',
    tag: 'Guide',
    date: 'March 15, 2026',
    readTime: '6 min read',
    content: `When someone asks ChatGPT "What's the best project management tool?" or "Which CRM should I use for my startup?", does your brand come up in the answer?

This is the question that keeps modern marketers up at night. With over 200 million weekly active users, ChatGPT has become one of the most influential recommendation engines on the planet — yet most brands have no idea whether they're being recommended or ignored.

## Why ChatGPT Recommendations Matter

Traditional search is changing. Instead of scrolling through 10 blue links on Google, users are increasingly asking AI assistants for direct recommendations. When ChatGPT recommends your brand, it carries enormous weight because:

- **Users trust AI recommendations.** Studies show that 65% of users act on AI suggestions without further research.
- **There's no "page 2."** Unlike Google where you can rank lower but still be visible, AI either mentions you or it doesn't.
- **The recommendation includes context.** ChatGPT doesn't just name your brand — it explains why it's good, essentially writing your sales pitch for you.

## How to Manually Check

You can start by asking ChatGPT directly. Try these queries:

1. **"What are the best [your industry] companies?"** — The broad recommendation query
2. **"Which [product category] would you recommend for [use case]?"** — The specific use case query
3. **"Compare [your brand] vs [competitor]"** — The head-to-head comparison
4. **"What do people say about [your brand]?"** — The reputation query

Run each query 3-5 times, because ChatGPT responses vary between sessions. Document the results.

## The Problem with Manual Checking

Manual checking has serious limitations:

- **Inconsistency** — ChatGPT gives different answers each time. You'd need to check hundreds of times for reliable data.
- **No historical tracking** — You can't measure whether your visibility is improving or declining over time.
- **Only one platform** — Your customers also use Perplexity, Claude, Gemini, and Grok. Each has different training data and gives different recommendations.
- **No competitor comparison** — You can't systematically compare your mention rate against competitors.
- **Time-consuming** — Manually querying, reading, and documenting takes hours per week.

## How to Automate AI Brand Tracking

This is exactly the problem Livesov solves. Instead of manually querying AI chatbots, Livesov:

- **Sends your custom queries** to all 5 major AI platforms automatically
- **Captures the full AI responses** as verifiable proof
- **Calculates your Share of Voice** — what percentage of responses mention your brand
- **Tracks sentiment** — whether recommendations are positive, neutral, or negative
- **Monitors competitors** — see how often competitors appear alongside your brand
- **Runs on a schedule** — daily, every 6 hours, or hourly depending on your plan

The result? Instead of spending hours manually checking, you get a dashboard showing exactly how visible your brand is across all AI platforms — with historical trends and actionable insights.

## What to Do if You're Not Being Recommended

If you discover that ChatGPT isn't mentioning your brand, here's your action plan:

1. **Create authoritative, factual content** that AI models can reference during training
2. **Get cited on high-authority websites** — AI models weight citations from trusted sources
3. **Ensure your brand information is consistent** across all online sources
4. **Build a strong presence on review platforms** that AI models use as training data
5. **Track your progress** with an AI visibility tool so you can measure what's working

The brands that start optimizing for AI visibility now will have an enormous advantage as AI assistants become the primary way people discover products and services.`,
  },
  {
    id: 'what-is-geo',
    title: 'What is Generative Engine Optimization (GEO)?',
    desc: 'GEO is the new frontier of marketing. Learn what it is, how it differs from SEO, and why every brand needs a GEO strategy in 2026.',
    tag: 'GEO',
    date: 'February 20, 2026',
    readTime: '7 min read',
    content: `Generative Engine Optimization — or GEO — is the practice of optimizing your brand's online presence to appear more frequently, more accurately, and more positively in AI-generated answers.

If SEO is about ranking in Google's blue links, GEO is about being the brand that ChatGPT, Perplexity, Claude, and Gemini recommend when users ask for advice.

## GEO vs SEO: Key Differences

| Aspect | SEO | GEO |
|---|---|---|
| **Target** | Search engine result pages | AI-generated responses |
| **Goal** | Rank higher in links | Get mentioned and recommended |
| **Metric** | Position, CTR, traffic | Share of Voice, mention rate, sentiment |
| **Competition** | 10 results per page | 2-5 brands mentioned per response |
| **User behavior** | Click through to website | Accept recommendation directly |
| **Content format** | Keywords, meta tags, backlinks | Authoritative facts, structured data, citations |

The fundamental shift is this: **in traditional search, you compete for clicks. In AI search, you compete for recommendations.** There is no "page 2" in an AI response. Either the AI mentions your brand, or your potential customer never hears about you.

## Why GEO Matters in 2026

The numbers tell the story:

- **ChatGPT** has over 200 million weekly active users asking for product recommendations
- **Perplexity** processes millions of searches daily, often replacing Google for research queries
- **Google's AI Overviews** now appear on 40%+ of search results, pushing organic links below the fold
- **65% of Gen Z** prefers asking AI for recommendations over traditional search

If your brand isn't showing up in these AI-generated answers, you're invisible to a rapidly growing segment of your potential customers.

## Core GEO Strategies

### 1. Create Authoritative, Factual Content

AI models learn from the web. They prioritize content that is:
- **Factual and well-sourced** — include statistics, citations, and references
- **Structured clearly** — use headings, lists, and tables that AI can easily parse
- **Comprehensive** — cover topics thoroughly rather than writing thin content
- **Up-to-date** — regularly update content with current information

### 2. Build Citation Authority

AI models weight information based on how many authoritative sources corroborate it. To build citation authority:
- Get featured on industry publications and review sites
- Maintain consistent brand information across all platforms
- Earn mentions from authoritative domains in your niche
- Create original research and data that others cite

### 3. Optimize for Entity Recognition

AI models understand entities (brands, products, people) through knowledge graphs. Ensure:
- Your brand has a Wikipedia page or Wikidata entry (if notable enough)
- Your Google Business Profile is complete and accurate
- Schema markup on your website identifies your brand clearly
- Consistent NAP (Name, Address, Phone) across all directories

### 4. Monitor and Measure

You can't optimize what you don't measure. Use an AI visibility tracking tool like Livesov to:
- Track how often each AI platform mentions your brand
- Measure your Share of Voice against competitors
- Identify which queries you're winning and losing
- Monitor sentiment trends over time

## Getting Started with GEO

The brands that invest in GEO now will have a first-mover advantage. AI models are forming their "opinions" about brands based on the data available today. The longer you wait, the harder it becomes to change the AI's perception of your brand.

Start by checking your current AI visibility with a free scan, then build a systematic GEO strategy based on the data.`,
  },
  {
    id: 'ai-share-of-voice',
    title: 'AI Share of Voice: What It Is and Why It Matters',
    desc: 'Share of Voice in AI is the most important metric for brand visibility in 2026. Here\'s how to measure it and why it matters.',
    tag: 'Metrics',
    date: 'January 28, 2026',
    readTime: '5 min read',
    content: `Share of Voice (SOV) has been a cornerstone metric in advertising and PR for decades. Now, there's a new version that matters even more: **AI Share of Voice** — the percentage of AI-generated responses that mention your brand when users ask relevant questions.

## What is AI Share of Voice?

AI Share of Voice measures how visible your brand is across AI platforms relative to your competitors. The formula is simple:

**AI SOV = (Number of AI responses mentioning your brand ÷ Total relevant AI responses) × 100**

For example, if you track 100 queries across 5 AI platforms (500 total responses), and your brand is mentioned in 150 of them, your AI SOV is 30%.

## Why AI SOV is the Key Metric

Traditional SOV measured ad impressions or media mentions — things you could directly control through spending. AI SOV is fundamentally different because:

1. **You can't buy your way in.** There are no ads in ChatGPT responses. Your brand either earns the recommendation or it doesn't.
2. **It compounds over time.** As AI models are retrained, consistent brand visibility reinforces future recommendations.
3. **It directly influences purchase decisions.** When ChatGPT recommends your brand, users often act on it immediately without further research.
4. **It's a leading indicator.** Declining AI SOV today means declining revenue tomorrow as more consumers shift to AI-first discovery.

## How to Measure AI SOV

Measuring AI SOV requires:

1. **Define your query set** — The questions your potential customers ask AI when looking for your type of product or service
2. **Choose your platforms** — ChatGPT, Perplexity, Claude, Gemini, and Grok each have different user bases
3. **Run queries consistently** — AI responses vary, so you need repeated measurements for reliable data
4. **Track over time** — A single measurement is a snapshot. Trends reveal whether your strategy is working

This is tedious to do manually, which is why tools like Livesov automate the entire process — running your queries across all platforms on a schedule and calculating SOV automatically.

## Industry Benchmarks

While the space is still emerging, early data suggests:

- **Category leaders** typically have 40-60% AI SOV for their primary keywords
- **Strong challengers** range from 15-35%
- **Most brands** hover around 5-15%
- **Unoptimized brands** often have 0-5% — meaning AI rarely or never mentions them

## Improving Your AI SOV

The levers for improving AI SOV align with GEO (Generative Engine Optimization) strategies:

- **Create content that AI models can cite** — authoritative, well-structured, factual content
- **Build citation authority** — get mentioned on trusted sources that AI models reference
- **Maintain brand consistency** — ensure your brand information is accurate and consistent everywhere
- **Target high-intent queries** — focus on the queries where purchase intent is highest
- **Monitor competitors** — understand what they're doing to earn AI recommendations

## Start Tracking Your AI SOV Today

The most important step is simply starting to measure. You can't optimize what you don't track. Try a free AI visibility check to see where you stand, then set up automated tracking to measure your progress over time.

The brands that own their AI Share of Voice today will dominate their categories as AI becomes the primary discovery channel.`,
  },
];

export default function BlogPage() {
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  return (
    <SeoLayout>
      <SeoHero
        title="Livesov Blog"
        subtitle="Insights on AI visibility, generative engine optimization, and brand tracking across AI platforms."
      />
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          {expandedPost ? (
            // Expanded article view
            (() => {
              const post = posts.find(p => p.id === expandedPost);
              if (!post) return null;
              return (
                <article>
                  <button
                    onClick={() => setExpandedPost(null)}
                    className="text-sm text-[#FF6154] font-bold mb-6 hover:underline"
                  >
                    &larr; Back to all articles
                  </button>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-[#FF6154]/10 text-[#FF6154]">{post.tag}</span>
                    <span className="text-xs text-gray-400">{post.date}</span>
                    <span className="text-xs text-gray-400">{post.readTime}</span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6 leading-tight">{post.title}</h1>
                  <div className="prose prose-gray max-w-none">
                    {post.content.split('\n\n').map((paragraph, i) => {
                      if (paragraph.startsWith('## ')) {
                        return <h2 key={i} className="text-2xl font-bold text-gray-900 mt-10 mb-4">{paragraph.replace('## ', '')}</h2>;
                      }
                      if (paragraph.startsWith('### ')) {
                        return <h3 key={i} className="text-xl font-bold text-gray-900 mt-8 mb-3">{paragraph.replace('### ', '')}</h3>;
                      }
                      if (paragraph.startsWith('| ')) {
                        const rows = paragraph.split('\n').filter(r => r.trim());
                        return (
                          <div key={i} className="overflow-x-auto my-6">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr>
                                  {rows[0].split('|').filter(Boolean).map((cell, j) => (
                                    <th key={j} className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-bold text-gray-900">{cell.trim()}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.slice(2).map((row, ri) => (
                                  <tr key={ri}>
                                    {row.split('|').filter(Boolean).map((cell, ci) => (
                                      <td key={ci} className="border border-gray-200 px-3 py-2 text-gray-600">{cell.trim()}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                      if (paragraph.startsWith('- **') || paragraph.startsWith('1. **')) {
                        const items = paragraph.split('\n');
                        return (
                          <ul key={i} className="my-4 space-y-2">
                            {items.map((item, j) => {
                              const text = item.replace(/^[-\d.]+\s*/, '');
                              return (
                                <li key={j} className="text-gray-600 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#FF6154]">
                                  <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>') }} />
                                </li>
                              );
                            })}
                          </ul>
                        );
                      }
                      return (
                        <p key={i} className="text-gray-600 leading-relaxed my-4">
                          <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>') }} />
                        </p>
                      );
                    })}
                  </div>
                  <div className="mt-12 p-6 rounded-xl bg-gradient-to-r from-[#FF6154] to-[#ff8a7a] text-center">
                    <h3 className="text-xl font-bold text-white mb-2">Ready to track your AI visibility?</h3>
                    <p className="text-white/80 mb-4">Start monitoring your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</p>
                    <Link href="/signup" className="inline-block bg-white text-[#FF6154] font-bold px-6 py-2.5 rounded-lg hover:bg-gray-100 transition no-underline">
                      Start Free — No Credit Card Required
                    </Link>
                  </div>
                </article>
              );
            })()
          ) : (
            // Article listing
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map(post => (
                <button
                  key={post.id}
                  onClick={() => setExpandedPost(post.id)}
                  className="rounded-xl border border-gray-200 bg-white p-6 text-left hover:shadow-lg hover:border-[#FF6154]/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-[#FF6154]/10 text-[#FF6154]">{post.tag}</span>
                    <span className="text-xs text-gray-400">{post.date}</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug group-hover:text-[#FF6154] transition-colors">{post.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-4">{post.desc}</p>
                  <span className="text-sm font-bold text-[#FF6154]">Read article &rarr;</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </SeoLayout>
  );
}
