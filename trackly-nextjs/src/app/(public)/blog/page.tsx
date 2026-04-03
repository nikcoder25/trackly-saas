'use client';

import { useState } from 'react';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import Link from 'next/link';

const articles = [
  {
    id: 'how-to-check-if-chatgpt-recommends-your-brand',
    title: 'How to Check if ChatGPT Recommends Your Brand',
    description: 'A practical guide to discovering whether AI platforms mention your brand when users ask for recommendations — and what to do about it.',
    tag: 'Guide',
    date: 'January 15, 2026',
    readTime: '8 min read',
  },
  {
    id: 'what-is-generative-engine-optimization-geo',
    title: 'What is Generative Engine Optimization (GEO)?',
    description: 'GEO is the practice of optimizing your brand and content to appear in AI-generated answers. Here is everything you need to know about this emerging discipline.',
    tag: 'GEO',
    date: 'February 10, 2026',
    readTime: '8 min read',
  },
  {
    id: 'ai-share-of-voice-what-it-is-and-why-it-matters',
    title: 'AI Share of Voice: What It Is and Why It Matters',
    description: 'Share of Voice in the AI era measures how often AI platforms recommend your brand. Learn how to calculate it and why it is the defining metric for AI visibility.',
    tag: 'Metrics',
    date: 'March 5, 2026',
    readTime: '6 min read',
  },
];

function ArticleContent({ id }: { id: string }) {
  switch (id) {
    case 'how-to-check-if-chatgpt-recommends-your-brand':
      return <Article1 />;
    case 'what-is-generative-engine-optimization-geo':
      return <Article2 />;
    case 'ai-share-of-voice-what-it-is-and-why-it-matters':
      return <Article3 />;
    default:
      return null;
  }
}

function Article1() {
  return (
    <>
      <p>
        Every day, millions of people ask ChatGPT, Perplexity, Claude, and other AI platforms questions like
        &quot;What is the best project management tool?&quot; or &quot;Which CRM should I use for a small business?&quot;
        These AI platforms respond with specific brand recommendations — and if your brand is not among them, you are
        losing potential customers without ever knowing it.
      </p>
      <p>
        Unlike traditional search engines where you can check your ranking on Google, there is no obvious way to see
        what AI platforms say about you. The responses are generated dynamically, they vary based on how the question
        is phrased, and they can change from week to week as models are updated. This makes monitoring your AI
        visibility a genuine challenge — but also an enormous opportunity for brands that get ahead of it.
      </p>

      <h2>Why AI Recommendations Matter</h2>
      <p>
        The shift from search engines to AI assistants is accelerating. Research from multiple sources suggests that
        a growing share of product discovery now happens through conversational AI rather than traditional Google
        searches. When someone asks ChatGPT for a recommendation, the response typically includes three to five
        specific brands. If you are not on that list, your competitor is.
      </p>
      <p>
        What makes this particularly important is the <strong>authority effect</strong>. Users tend to trust AI
        recommendations the same way they trust a knowledgeable friend. There is no ad label, no &quot;sponsored&quot;
        tag — just a direct answer. This means that the brands AI chooses to mention get an outsized share of trust
        and attention.
      </p>

      <h2>Step-by-Step: Manual Checking Process</h2>
      <p>
        Before investing in any tool, it is worth understanding what manual checking looks like. Here is a practical
        approach you can follow today:
      </p>
      <p>
        <strong>Step 1: Identify your key queries.</strong> Think about the questions your potential customers would
        ask an AI assistant. These are not keyword phrases like you would use for SEO — they are natural language
        questions. For example: &quot;What is the best email marketing platform for ecommerce?&quot; or &quot;Which
        accounting software do freelancers recommend?&quot; Write down 10 to 20 of these queries.
      </p>
      <p>
        <strong>Step 2: Query each AI platform.</strong> Open ChatGPT, Perplexity, Claude, Gemini, and Grok. Enter
        each of your queries and record the response. Pay attention to which brands are mentioned, in what order, and
        whether the tone is positive, neutral, or negative.
      </p>
      <p>
        <strong>Step 3: Document the results.</strong> Create a spreadsheet with columns for the query, the platform,
        which brands were mentioned, your brand&apos;s position (if mentioned), and the sentiment. This gives you a
        baseline snapshot.
      </p>
      <p>
        <strong>Step 4: Check your competitors.</strong> Run the same queries but also look for queries where
        competitors are specifically mentioned. This helps you understand your relative position.
      </p>
      <p>
        <strong>Step 5: Repeat regularly.</strong> AI responses change as models are updated. What was true last month
        may not be true today. Plan to re-run your checks at least monthly.
      </p>

      <h2>Limitations of Manual Checking</h2>
      <p>
        If the manual process sounds tedious, that is because it is. Here are the key problems with doing this by hand:
      </p>
      <p>
        <strong>Scale.</strong> If you have 20 queries and 5 platforms, that is 100 individual checks per round. Do
        this monthly and you are looking at 1,200 checks per year — just for one brand.
      </p>
      <p>
        <strong>Consistency.</strong> AI responses can vary based on factors like your account history, the time of day,
        and even minor phrasing differences. A single manual check is just one data point, not a trend.
      </p>
      <p>
        <strong>No historical data.</strong> Unless you are meticulous about your spreadsheet, you lose the ability to
        track changes over time. Did your visibility improve after that content update? Without consistent historical
        data, you cannot answer that question.
      </p>
      <p>
        <strong>Proof for stakeholders.</strong> Screenshots of AI conversations are easy to fabricate and hard to
        verify. If you need to show a client or executive that your brand&apos;s AI visibility improved, you need
        something more robust than a collection of screenshots.
      </p>

      <h2>Automating AI Brand Monitoring with Livesov</h2>
      <p>
        This is the problem Livesov was built to solve. Instead of manually querying five platforms with dozens of
        prompts, Livesov automates the entire process. You set up your brand, define your key queries (or use
        auto-generated ones based on your industry), and Livesov runs them on a schedule across all five major AI
        platforms.
      </p>
      <p>
        Every response is saved as verifiable evidence. You get a dashboard showing your <strong>AI Share of
        Voice</strong> — the percentage of responses that mention your brand — along with sentiment analysis,
        competitor tracking, and trend data over time. When your content strategy works, you see it reflected in
        the data. When a competitor overtakes you, you know immediately.
      </p>
      <p>
        The proof export feature is particularly valuable for agencies. Instead of presenting screenshots to clients,
        you can export CSV reports with full AI responses, timestamps, and platform details. It is the difference
        between &quot;trust me, I checked&quot; and &quot;here is the verified data.&quot;
      </p>

      <h2>Getting Started</h2>
      <p>
        Whether you start with the manual process or jump straight to automation, the important thing is to start
        monitoring. AI platforms are becoming a primary discovery channel, and the brands that track their visibility
        now will have a significant advantage over those that wait.
      </p>
    </>
  );
}

function Article2() {
  return (
    <>
      <p>
        If you have spent any time in digital marketing, you know SEO — the practice of optimizing your website to
        rank higher in search engine results. But there is a new discipline emerging that addresses a fundamentally
        different problem: how to ensure your brand appears in <strong>AI-generated answers</strong>. This discipline
        is called Generative Engine Optimization, or GEO.
      </p>

      <h2>Defining GEO</h2>
      <p>
        Generative Engine Optimization is the practice of structuring your brand&apos;s online presence — your website
        content, data, reviews, citations, and authority signals — so that AI platforms like ChatGPT, Perplexity,
        Claude, Gemini, and Grok are more likely to mention and recommend you when users ask relevant questions.
      </p>
      <p>
        Unlike SEO, which focuses on matching keywords and building backlinks to rank in a list of blue links, GEO
        focuses on making your brand <strong>the kind of entity that AI models recognize, trust, and reference</strong>.
        The output is not a ranking position — it is whether or not you appear in a conversational answer at all.
      </p>

      <h2>How GEO Differs from SEO</h2>
      <p>
        The differences between GEO and traditional SEO are significant, even though they share some underlying
        principles. Here are the key distinctions:
      </p>
      <p>
        <strong>Discovery format.</strong> SEO targets a list of ranked links. GEO targets inclusion in a generated
        paragraph or recommendation. There is no &quot;position 1&quot; in an AI response — there is mentioned or not
        mentioned.
      </p>
      <p>
        <strong>Ranking signals.</strong> SEO relies heavily on backlinks, page speed, and keyword optimization. GEO
        relies more on <strong>entity authority</strong> — whether your brand is consistently mentioned across
        authoritative sources, structured data, and factual references that AI training data and retrieval systems
        can pick up.
      </p>
      <p>
        <strong>Content strategy.</strong> For SEO, you optimize individual pages for specific keywords. For GEO, you
        need your brand information to be <strong>consistently represented across the web</strong> — in directories,
        review sites, industry publications, structured data, and your own content — so that AI models have strong,
        unambiguous signals about what you do and why you are relevant.
      </p>
      <p>
        <strong>Measurement.</strong> SEO success is measured in rankings, organic traffic, and click-through rates.
        GEO success is measured in <strong>AI Share of Voice</strong> — how often AI platforms mention your brand in
        response to relevant queries. This requires a completely different measurement approach.
      </p>

      <h2>Why GEO Matters in 2026</h2>
      <p>
        The urgency around GEO has grown dramatically. AI assistants are no longer a novelty — they are a primary
        information source for millions of people. When a potential customer asks an AI assistant &quot;What is the
        best tool for X?&quot; and your brand is not mentioned, you have lost that opportunity. No amount of Google
        ranking will help you if the customer never opens a search engine.
      </p>
      <p>
        The competitive landscape is also shifting. Early movers who optimize for AI visibility now are building
        advantages that will be difficult to overcome later. AI models tend to reinforce existing patterns — if your
        competitor is consistently mentioned in training data and retrieval sources, they will continue to be
        recommended unless you actively work to change the signals.
      </p>

      <h2>Key GEO Strategies</h2>
      <p>
        While GEO is still an emerging field, several strategies have proven effective:
      </p>
      <p>
        <strong>Structured data and schema markup.</strong> Implement comprehensive schema markup on your website.
        AI systems that use retrieval-augmented generation (RAG) rely on structured data to understand what your
        brand does, where you operate, and what makes you distinct. Organization schema, product schema, FAQ schema,
        and review schema all help.
      </p>
      <p>
        <strong>Authoritative, factual content.</strong> Create content that serves as a definitive reference in your
        space. AI models are more likely to cite sources that provide clear, well-organized, factual information.
        Avoid thin content and focus on depth and specificity.
      </p>
      <p>
        <strong>Consistent entity presence.</strong> Ensure your brand information is consistent across directories,
        review platforms, industry databases, and your own properties. Inconsistent information (different names,
        descriptions, or details across sources) makes it harder for AI to confidently recommend you.
      </p>
      <p>
        <strong>Citations and mentions in authoritative sources.</strong> Being mentioned in respected industry
        publications, comparison sites, and expert roundups increases your authority signal. AI models — especially
        those using retrieval — weight authoritative sources more heavily.
      </p>
      <p>
        <strong>Clear brand positioning.</strong> AI models need to categorize you. If your positioning is vague or
        tries to cover too many categories, AI will struggle to recommend you for any specific query. Be clear about
        what you do and who you serve.
      </p>

      <h2>Measuring GEO Success</h2>
      <p>
        The biggest challenge with GEO is measurement. Unlike SEO where you can check your Google ranking anytime,
        measuring your AI visibility requires systematically querying multiple AI platforms with relevant prompts and
        tracking the results over time.
      </p>
      <p>
        Key metrics to track include: <strong>AI Share of Voice</strong> (what percentage of relevant AI responses
        mention your brand), <strong>mention sentiment</strong> (positive, neutral, or negative), <strong>platform
        coverage</strong> (which AI platforms mention you and which do not), and <strong>competitive position</strong>
        (how you compare to competitors in AI recommendations).
      </p>
      <p>
        Tools like Livesov automate this measurement by running your key queries across ChatGPT, Perplexity, Claude,
        Gemini, and Grok on a regular schedule, tracking all of these metrics in a single dashboard. This gives you
        the feedback loop you need to know whether your GEO efforts are working — and where to focus next.
      </p>

      <h2>The Bottom Line</h2>
      <p>
        GEO is not replacing SEO — it is a complementary discipline that addresses a different discovery channel. But
        as AI-driven discovery grows, brands that ignore GEO risk becoming invisible to a significant and growing
        audience. The good news is that many GEO best practices (authoritative content, structured data, clear
        positioning) also benefit your traditional SEO. The key difference is in how you measure success and where
        you focus your optimization efforts.
      </p>
    </>
  );
}

function Article3() {
  return (
    <>
      <p>
        Share of Voice (SOV) has been a marketing metric for decades. In traditional media, it measures the percentage
        of total advertising in a market that belongs to your brand. In SEO, it approximates your visibility in search
        results relative to competitors. But in the AI era, Share of Voice takes on an entirely new meaning — and it
        may be the most important visibility metric for the next decade.
      </p>

      <h2>What is AI Share of Voice?</h2>
      <p>
        <strong>AI Share of Voice</strong> measures the percentage of AI-generated responses that mention or recommend
        your brand when users ask relevant questions. If users ask 100 questions related to your industry across
        AI platforms, and your brand appears in 23 of those responses, your AI SOV is 23%.
      </p>
      <p>
        This metric is distinct from traditional SOV because it measures something fundamentally different: not how
        much ad space you occupy, but <strong>how likely AI platforms are to recommend you</strong> during the moments
        when potential customers are actively seeking solutions.
      </p>

      <h2>How to Calculate AI Share of Voice</h2>
      <p>
        Calculating AI SOV requires three components:
      </p>
      <p>
        <strong>1. A set of relevant queries.</strong> These are the questions your potential customers would ask an
        AI assistant. They should be phrased naturally, the way a real user would speak. For example: &quot;What are
        the best tools for social media scheduling?&quot; rather than the keyword-style &quot;social media scheduling
        tools.&quot;
      </p>
      <p>
        <strong>2. Multi-platform coverage.</strong> Different AI platforms can give different answers. A comprehensive
        SOV calculation should cover ChatGPT, Perplexity, Claude, Gemini, and Grok at minimum. Your brand might have
        strong visibility on one platform and be completely absent from another.
      </p>
      <p>
        <strong>3. Regular measurement.</strong> AI responses change over time as models are updated and retrieval
        sources evolve. A single measurement is a snapshot, not a trend. To track real progress, you need consistent
        measurement on at least a weekly or bi-weekly basis.
      </p>
      <p>
        The formula is straightforward: <strong>AI SOV = (Number of responses mentioning your brand / Total number
        of relevant responses) x 100</strong>. You can break this down further by platform, by query category, or
        by sentiment to get more granular insights.
      </p>

      <h2>Why AI SOV is the Key Metric</h2>
      <p>
        There are several reasons why AI Share of Voice is emerging as the critical metric for brand visibility:
      </p>
      <p>
        <strong>It reflects real discovery behavior.</strong> When someone asks an AI assistant for a recommendation,
        the brands mentioned in the response are the ones that enter the consideration set. Unlike SEO where users
        might scroll through multiple results, AI responses typically surface only three to five brands. If you are
        not there, you do not exist in that user&apos;s decision process.
      </p>
      <p>
        <strong>It is a leading indicator.</strong> Changes in AI SOV often precede changes in referral traffic and
        conversions. If your SOV is growing, more users are hearing about you through AI. If it is declining, a
        competitor is gaining ground.
      </p>
      <p>
        <strong>It is actionable.</strong> When you know which queries you appear for and which you do not, you can
        take specific actions to improve — updating content, building citations, or adjusting your brand positioning.
      </p>

      <h2>Industry Benchmarks</h2>
      <p>
        AI SOV benchmarks are still emerging as the field is new, but early data suggests some patterns. Market
        leaders in established categories tend to see AI SOV between 30% and 50% for core queries. Challengers
        typically range from 10% to 25%. Brands new to a category often start near 0% and can reach 15% to 20%
        within a few months of focused GEO effort.
      </p>
      <p>
        These numbers vary significantly by industry. In categories with a clear dominant player, that player may
        capture 60% or more of AI mentions. In fragmented markets, the top brand might only reach 20% to 30%.
      </p>

      <h2>Tracking AI SOV with Livesov</h2>
      <p>
        Livesov was built specifically to track AI Share of Voice. You define your brand, your industry, and your key
        queries. Livesov then runs those queries across all five major AI platforms on your chosen schedule — daily,
        every few days, or more frequently on higher-tier plans.
      </p>
      <p>
        The dashboard shows your overall AI SOV, broken down by platform, by query, and by time period. You can add
        competitors to see how your SOV compares, track sentiment trends, and export verified AI responses as proof
        for stakeholders or clients.
      </p>
      <p>
        Whether you are a solo founder wanting to know if AI platforms are aware of your product, or an agency
        managing AI visibility for multiple clients, tracking AI Share of Voice gives you the data you need to make
        informed decisions about where to invest your efforts.
      </p>
    </>
  );
}

export default function BlogPage() {
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Blog', url: '/blog' }]} />
      <SeoHero
        title="Livesov Blog"
        subtitle="Insights on AI visibility, generative engine optimization, and brand tracking across AI platforms."
      />

      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          {expandedArticle ? (
            (() => {
              const article = articles.find(a => a.id === expandedArticle);
              if (!article) return null;
              return (
                <article>
                  {/* Header */}
                  <div className="blog-post-header">
                    <div className="blog-post-header-inner">
                      <button onClick={() => setExpandedArticle(null)} className="blog-back">
                        &larr; Back to all articles
                      </button>
                      <div className="blog-post-meta">
                        <span className="blog-post-tag">{article.tag}</span>
                        <span className="blog-post-date">{article.date}</span>
                        <span className="blog-post-read">{article.readTime}</span>
                      </div>
                      <h1 className="blog-post-title">{article.title}</h1>
                      <p className="blog-post-desc">{article.description}</p>
                    </div>
                  </div>

                  {/* Article body */}
                  <div className="blog-post-body">
                    <ArticleContent id={article.id} />
                  </div>

                  {/* CTA */}
                  <div className="blog-post-cta" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
                    <h3>Ready to track your AI visibility?</h3>
                    <p>Livesov monitors your brand across ChatGPT, Perplexity, Claude, Gemini, and Grok — automatically.</p>
                    <Link href="/signup" className="blog-cta-btn">
                      Start Tracking Free &rarr;
                    </Link>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>No credit card required</p>
                  </div>
                </article>
              );
            })()
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map(article => (
                <button
                  key={article.id}
                  onClick={() => setExpandedArticle(article.id)}
                  className="rounded-xl border border-gray-200 bg-white p-6 text-left hover:shadow-lg hover:border-[#FF6154]/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-[#FF6154]/10 text-[#FF6154]">
                      {article.tag}
                    </span>
                    <span className="text-xs text-gray-400">{article.readTime}</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug group-hover:text-[#FF6154] transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-3">{article.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{article.date}</span>
                    <span className="text-sm font-bold text-[#FF6154]">Read article &rarr;</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </SeoLayout>
  );
}
