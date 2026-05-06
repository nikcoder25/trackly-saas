'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

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
