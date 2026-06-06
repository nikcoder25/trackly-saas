'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';

interface CategoryResult {
  name: string;
  score: number;
  findings?: string[];
  label?: string;
}

interface AuditResult {
  url: string;
  overallScore: number;
  categories: Record<string, CategoryResult> | CategoryResult[];
  recommendations: string[];
}

function categoriesAsArray(cats: Record<string, CategoryResult> | CategoryResult[]): CategoryResult[] {
  if (Array.isArray(cats)) return cats;
  return Object.entries(cats).map(([key, val]) => ({ ...val, name: val.label || val.name || key }));
}

export default function GeoScoreCheckerPage() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/geo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const score = result?.overallScore ?? 0;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const verdict = score >= 70 ? 'AI-ready' : score >= 40 ? 'Needs work' : 'Poor';

  return (
    <ToolPage
      title={<>Free <span style={{ color: 'var(--brand)' }}>GEO Score</span> Checker</>}
      subtitle="Get a single GEO score for any page. No signup, instant result. Want a deeper breakdown? Try the AI Readiness Audit."
      toolName="GEO Score Checker"
      toolSlug="geo-score-checker"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="geo-website">Website</label>
            <input id="geo-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="geoUrl" style={labelStyle}>Page URL</label>
            <input
              id="geoUrl"
              type="url"
              required
              placeholder="https://yoursite.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Scoring...' : 'Get GEO Score'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6b7280', wordBreak: 'break-all' }}>{result.url}</div>
            <div style={{ fontSize: 96, fontWeight: 800, color, lineHeight: 1, margin: '20px 0 8px' }}>{score}</div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>out of 100 - <strong style={{ color }}>{verdict}</strong></div>

            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {categoriesAsArray(result.categories).map((c) => {
                const cColor = c.score >= 70 ? '#10b981' : c.score >= 40 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={c.name} style={{ background: '#f9fafb', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{c.name}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: cColor }}>{c.score}</div>
                  </div>
                );
              })}
            </div>

            <Link
              href={`/tools/ai-readiness-audit?url=${encodeURIComponent(result.url)}`}
              style={{
                display: 'inline-block',
                marginTop: 28,
                padding: '12px 24px',
                borderRadius: 10,
                background: '#fff',
                color: 'var(--brand)',
                border: '1px solid var(--brand)',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              See full breakdown in the AI Readiness Audit →
            </Link>
          </div>
        </div>
      )}

      <ToolArticle>
        <ArticleSchema
          headline="Free GEO Score Checker: Measure Any Page's AI Readiness in Seconds"
          description="A complete guide to the Generative Engine Optimization score - what we measure, how to interpret bands, what to fix first, and how GEO differs from traditional SEO."
          url="https://livesov.com/tools/geo-score-checker"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          The <strong>GEO Score Checker</strong> grades any URL on a 0-100 scale for Generative Engine Optimization readiness - how easily ChatGPT, Perplexity, Claude, Gemini and Grok can find, parse and quote it. Five categories drive the score: crawlability, structure, content quality, citations and freshness. Free, instant, no signup.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'GEO is to AI engines what SEO was to Google search - the structural baseline that decides whether you compete at all.',
            '70+ is the bar for "AI-ready". Most public pages land in the 40-69 range on first audit.',
            'Schema markup, FAQ blocks, and answer-first prose are the three highest-impact fixes.',
            'A high GEO score correlates with - but does not guarantee - higher AI mention rate. It is necessary, not sufficient.',
            'Re-audit after every meaningful page edit. The score moves more responsively than search rankings.',
          ]}
        />

        <h2>What is a GEO score?</h2>
        <p>
          GEO stands for Generative Engine Optimization - the practice of structuring a page so AI answer engines can find it, parse it, and quote it accurately. The GEO score is a single number from 0 to 100 that summarises how well a page meets the technical, structural and semantic requirements those engines reward.
        </p>
        <p>
          Think of it as PageSpeed for AI. One number, several diagnostic categories underneath, and an opinionated verdict on whether the page is ready to be cited by ChatGPT, Perplexity, Claude, Gemini and Grok.
        </p>

        <h2>What we score</h2>
        <ul>
          <li><strong>Crawlability</strong> - response status, redirects, content size, robots compliance.</li>
          <li><strong>Structure</strong> - heading hierarchy, semantic HTML, schema.org markup, FAQ blocks.</li>
          <li><strong>Content quality</strong> - word count, reading level, answer density, list and table usage.</li>
          <li><strong>Citations</strong> - external references, expert quotes, source diversity.</li>
          <li><strong>Freshness</strong> - last-modified signals, dates in copy, year-currency.</li>
        </ul>

        <h2>Reading your score</h2>
        <ul>
          <li><strong>0-39 (Poor)</strong> - the page has fundamental gaps. AI engines will skip it or hallucinate around it.</li>
          <li><strong>40-69 (Needs work)</strong> - the page has the bones but is missing the structural cues AI engines reward. Most public pages land here on a first audit.</li>
          <li><strong>70-100 (AI-ready)</strong> - the page meets the bar. Iterate to push individual category scores rather than the headline number.</li>
        </ul>

        <h2>How GEO differs from traditional SEO</h2>
        <p>
          Search engines optimise for &quot;is this the right link to send the user to?&quot; AI engines optimise for &quot;is this the right paragraph to quote?&quot;. Same content, different scoring. Schema markup matters more. Answer-first prose matters more. Tables and lists matter more. Anchor-text-stuffing and meta-keyword tricks matter less.
        </p>
        <p>
          A page can rank #1 in Google and still score poorly here. The opposite is also true - a page can be invisible in search and yet quoted relentlessly by Perplexity because it has the structure AI parses cleanly.
        </p>

        <div className="callout">
          <strong>Want the deeper audit?</strong> The <a href="/tools/ai-readiness-audit">AI Readiness Audit</a> runs the same engine but shows per-category findings, every recommendation, and an email-gated PDF.
        </div>

        <ExpertQuote
          quote="GEO is not new SEO with a new acronym. It is a different scoring function. Pages that ranked #1 in Google for ten years can score 30 here because they were optimised for keyword density, not answer extraction. The teams who notice the gap fastest will own the AI category for their vertical."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>Score band benchmarks</h2>
        <table>
          <thead>
            <tr>
              <th>Band</th>
              <th>Verdict</th>
              <th>What it means</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>0-39</td><td>Poor</td><td>Fundamental gaps. AI engines skip the page or hallucinate.</td><td>Triage. Fix crawlability and structure first.</td></tr>
            <tr><td>40-54</td><td>Weak</td><td>Page is reachable but not optimised. Below average.</td><td>Add schema, fix headings, expand answer density.</td></tr>
            <tr><td>55-69</td><td>Average</td><td>Most public pages live here. Citable but not preferred.</td><td>Push two categories above 70 to break out.</td></tr>
            <tr><td>70-84</td><td>Good</td><td>AI-ready. Eligible for citation and inclusion.</td><td>Iterate. Sustain freshness and citations.</td></tr>
            <tr><td>85-100</td><td>Excellent</td><td>Best-in-class. Likely to be quoted verbatim.</td><td>Defend. Maintain quality and monitor.</td></tr>
          </tbody>
        </table>

        <h2>The five scoring pillars in detail</h2>

        <h3>Crawlability</h3>
        <p>
          Status code, response time, redirect chain length, robots.txt rules and content size. A 200 OK in under 800ms with a clean robots policy is the baseline. Pages behind aggressive bot-fight rules score 0 here regardless of content quality.
        </p>

        <h3>Structure</h3>
        <p>
          Heading hierarchy (one H1, sequential H2-H6), semantic HTML usage, schema.org markup (Article, FAQPage, HowTo, BreadcrumbList, Product, Organization where relevant), and the presence of FAQ blocks. Schema is the single biggest lever in this category.
        </p>

        <h3>Content quality</h3>
        <p>
          Word count, reading level, answer density (declarative answers vs filler), use of lists and tables, definitional clarity, expert quotes. AI engines reward content that answers a question directly in the first 100 words.
        </p>

        <h3>Citations</h3>
        <p>
          Outbound citations to authoritative sources, source diversity, and inbound expertise signals. Pages that cite sources well are themselves cited well - the relationship is reflexive.
        </p>

        <h3>Freshness</h3>
        <p>
          Visible date, last-modified header, year-currency in body copy, sitemap <code>lastmod</code>. Content dated in the current year gets a meaningful boost; content dated more than three years old gets quietly demoted.
        </p>

        <h2>Quick wins for each category</h2>
        <ul>
          <li><strong>Crawlability</strong> - confirm <code>robots.txt</code> allows AI bots, remove non-essential redirects, ensure HTTPS.</li>
          <li><strong>Structure</strong> - add Article schema and FAQPage schema where appropriate. Fix heading skips (H2 then H4 with no H3 is a common error).</li>
          <li><strong>Content quality</strong> - add a 1-2 sentence answer capsule at the very top. Convert dense paragraphs to bulleted lists where possible.</li>
          <li><strong>Citations</strong> - add 3-5 outbound links to authoritative sources. Quote a recognised expert with attribution.</li>
          <li><strong>Freshness</strong> - update the visible date and <code>dateModified</code> in your schema after any meaningful edit.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'How is the score calculated?',
              a: 'We fetch the page, render it server-side, and run several dozen heuristic checks across crawlability, structure, content quality, citation profile, and freshness. Each category contributes to a weighted overall score. The exact weighting is tuned against the pages we see being cited most often by major AI engines.',
            },
            {
              q: 'Will my score improve overnight if I add schema?',
              a: 'Schema is one signal among many. It helps AI engines parse your content more reliably, which improves the structure score, but it will not single-handedly carry a thin page. Combine schema with answer-first prose, FAQ blocks and clear headings.',
            },
            {
              q: 'Can I use this for a competitor’s page?',
              a: 'Yes. The tool is happy to score any public URL. Many users score their top three competitors and reverse-engineer the patterns that show up in high-score pages.',
            },
            {
              q: 'What is the rate limit?',
              a: '2 audits per hour for unauthenticated users. Signed-in users get 10 per hour and a monthly cap based on plan. Sign up free to lift the limits.',
            },
            {
              q: 'Does the score predict AI mentions?',
              a: 'It correlates - higher GEO scores generally mean more AI citations - but mention rate is downstream of many other factors (brand strength, third-party signals, query specificity). Pair the score with the ChatGPT Mention Checker to see both sides.',
            },
            {
              q: 'Should I score every page on my site?',
              a: 'No. Score the 7-10 pages that drive 80% of your AI mention surface: home, pricing, top 3 product pages, top 3 blog posts. Fixing those first delivers most of the lift.',
            },
            {
              q: 'How long does each audit take?',
              a: 'Typically 5-15 seconds. Most of the time is the page fetch and render, not our analysis.',
            },
            {
              q: 'Why does my client-side rendered page score poorly?',
              a: 'Most AI crawlers do not execute JavaScript. If your main content only appears after hydration, the audit reflects what those crawlers actually see - which is little. The fix is server-side rendering or static generation for the content that matters.',
            },
            {
              q: 'How is this different from Lighthouse or PageSpeed Insights?',
              a: 'Those tools measure user-experience signals (Core Web Vitals, accessibility). The GEO score measures AI-extraction signals (schema, structure, answer density). The two complement each other; neither replaces the other.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'ai-readiness-audit', name: 'AI Readiness Audit', tagline: 'Full breakdown across 50+ AI-readiness checkpoints.' },
            { slug: 'ai-crawler-checker', name: 'AI Crawler Checker', tagline: 'Make sure AI bots can reach the page you just scored.' },
            { slug: 'llms-txt-generator', name: 'llms.txt Generator', tagline: 'Spotlight your highest-scoring pages for AI.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
