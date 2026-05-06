'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  meta: { title: string; wordCount: number; fetchTimeMs: number };
}

function categoriesAsArray(cats: Record<string, CategoryResult> | CategoryResult[]): CategoryResult[] {
  if (Array.isArray(cats)) return cats;
  return Object.entries(cats).map(([key, val]) => ({ ...val, name: val.label || val.name || key }));
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'AI-ready' : score >= 40 ? 'Needs work' : 'Not ready';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${score * 3.6}deg, #e5e7eb ${score * 3.6}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 128, height: 128, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 44, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>/100</span>
        </div>
      </div>
      <span style={{ marginTop: 12, fontSize: 16, fontWeight: 700, color }}>{label}</span>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryResult }) {
  const color = category.score >= 70 ? '#10b981' : category.score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{category.name}</h3>
        <span style={{ fontSize: 18, fontWeight: 800, color }}>{category.score}</span>
      </div>
      <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, marginBottom: 12 }}>
        <div style={{ width: `${category.score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      {category.findings && category.findings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#4b5563', lineHeight: 1.7 }}>
          {category.findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiReadinessAuditInner() {
  const params = useSearchParams();
  const presetUrl = params.get('url') || '';

  const [url, setUrl] = useState(presetUrl);
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);

  // Email gate state
  const [email, setEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const runAudit = async (target: string) => {
    setError('');
    setResult(null);
    setEmailSubmitted(false);
    setLoading(true);
    try {
      const res = await fetch('/api/geo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target.trim(), website: honeypot }),
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

  useEffect(() => {
    if (presetUrl) {
      runAudit(presetUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    runAudit(url);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailLoading(true);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'ai-readiness-audit' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || 'Could not save your email.');
        return;
      }
      setEmailSubmitted(true);
    } catch {
      setEmailError('Network error. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Readiness</span> Audit</>}
      subtitle="Test your site for ChatGPT, Perplexity, Claude and Gemini visibility. Score, category breakdown and an actionable to-do list."
      toolName="AI Readiness Audit"
      toolSlug="ai-readiness-audit"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="ar-website">Website</label>
            <input id="ar-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="arUrl" style={labelStyle}>Page URL</label>
            <input
              id="arUrl"
              type="url"
              required
              placeholder="https://yoursite.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Running 50+ checks...' : 'Run Free AI Readiness Audit'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <ScoreGauge score={result.overallScore} />
            <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280', wordBreak: 'break-all' }}>{result.url}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
              {result.meta.wordCount.toLocaleString()} words · fetched in {result.meta.fetchTimeMs}ms
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Category breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {categoriesAsArray(result.categories).map((c) => (
                <CategoryCard key={c.name} category={c} />
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>What to fix next</h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#374151', lineHeight: 1.9 }}>
              {result.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          <div style={{ ...cardStyle, background: '#f5f3ff', border: '1px solid #e0e7ff' }}>
            {!emailSubmitted ? (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' }}>Want the full PDF report?</h2>
                <p style={{ fontSize: 14, color: '#374151', margin: '0 0 16px' }}>
                  Drop your email and we&apos;ll send the complete 50-checkpoint audit, plus weekly GEO tips.
                </p>
                <form onSubmit={handleEmailSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ ...inputStyle, flex: '1 1 240px' }}
                  />
                  <button
                    type="submit"
                    disabled={emailLoading}
                    style={{ padding: '12px 22px', borderRadius: 10, border: 'none', background: emailLoading ? '#ccc' : 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: emailLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {emailLoading ? 'Sending...' : 'Send me the report'}
                  </button>
                </form>
                <ErrorBanner message={emailError} />
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#166534', margin: '0 0 6px' }}>Thanks - check your inbox.</h2>
                <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
                  We&apos;ll email the full audit shortly. In the meantime, <Link href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>create a free Livesov account</Link> to track AI visibility every day.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <ToolArticle>
        <h2>What the AI Readiness Audit checks</h2>
        <p>
          The audit runs 50+ checkpoints in five categories: <strong>crawlability</strong>, <strong>structure</strong>, <strong>content quality</strong>, <strong>citations</strong>, and <strong>freshness</strong>. Every checkpoint is mapped to a behaviour we have observed in ChatGPT, Perplexity, Claude, Gemini and Grok. The output is a single GEO score, a per-category breakdown, and a prioritised to-do list you can hand to whoever owns the page.
        </p>

        <h2>The five pillars of AI readiness</h2>

        <h3>1. Crawlability</h3>
        <p>
          Can AI bots fetch the page? We check status code, response time, redirect chains, content-length, robots.txt rules, and the most common edge-level blocks. If a bot cannot fetch the page, nothing else matters.
        </p>

        <h3>2. Structure</h3>
        <p>
          Can AI parse the page reliably? We grade heading hierarchy, semantic HTML, schema.org markup (Article, FAQPage, HowTo, BreadcrumbList, Product, Organization), and the presence of FAQ blocks. Pages with clean structure get cited verbatim; messy pages get summarised badly.
        </p>

        <h3>3. Content quality</h3>
        <p>
          Does the page answer a real question? We grade word count, reading level, answer density (the ratio of declarative answers to filler), use of lists and tables, expert quotes, and definitional clarity. AI engines reward answer-first prose over keyword-stuffed marketing copy.
        </p>

        <h3>4. Citations</h3>
        <p>
          Does the page demonstrate expertise? We check outbound citations, expert references, source diversity, and links to authoritative third parties. The pages AI quotes most are usually the pages that themselves quote sources well.
        </p>

        <h3>5. Freshness</h3>
        <p>
          Is the page current? We grade the visible date, the year mentioned in copy, the <code>lastmod</code> in your sitemap, and whether AI engines have a recent cached copy. Stale content gets quietly demoted; pages dated in the current year get a free boost.
        </p>

        <h2>How to act on the results</h2>
        <ol>
          <li>Fix red categories first - a 30 in any single category drags the whole page down.</li>
          <li>Work through the recommendations in order. Each one is phrased as a concrete change.</li>
          <li>Re-run the audit after each round of fixes to confirm score lift.</li>
          <li>For multiple pages: audit your homepage, pricing, top 3 product pages and top 3 blog posts. Those 7 URLs typically drive 80% of AI mentions.</li>
        </ol>

        <h2>What the email-gated PDF includes</h2>
        <ul>
          <li>The full 50-checkpoint result with raw values per check.</li>
          <li>An executive summary you can paste into a Slack channel or PR description.</li>
          <li>A printable, brand-friendly export for sharing with leadership.</li>
          <li>Bonus: weekly GEO tips and category benchmarks delivered to your inbox.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'How long does an audit take?',
              a: 'About 8-15 seconds. We fetch the page once, render it, and run all checks in parallel. Most of the time is the fetch + render of your page, not our analysis.',
            },
            {
              q: 'Does this work for SPA / client-rendered pages?',
              a: 'Mostly yes - we render server-side first. If your page relies on client-side hydration to render its main content, the score will under-count what an AI engine actually sees, because most AI crawlers do not execute JS. That is the most important takeaway from a poor SPA audit.',
            },
            {
              q: 'Why do I need to provide an email for the full PDF?',
              a: 'Two reasons. First, it lets us send the report and the weekly newsletter that deepens what the audit teaches. Second, it filters casual lookers from people who are serious about improvement - so the inbox flow stays clean for both sides.',
            },
            {
              q: 'Will my email be sold or shared?',
              a: 'No. We use it for the report, the weekly newsletter, and nothing else. Unsubscribe in any email, any time. Read the privacy policy for the full detail.',
            },
            {
              q: 'How is this different from a traditional SEO audit?',
              a: 'Traditional SEO audits are tuned for Google rankings - keyword targeting, backlink profile, Core Web Vitals. This audit is tuned for AI inclusion - schema, answer density, citation hygiene, freshness signals. The two overlap maybe 30%; the rest is genuinely different criteria.',
            },
            {
              q: 'I scored low. Where do I start?',
              a: 'Start with the lowest-scoring category. If the page is not crawlable, fix that first - everything else is moot. If structure is the problem, add JSON-LD and clean your heading hierarchy. If content is thin, expand answers and add an FAQ. The recommendations list is ordered by expected lift.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'geo-score-checker', name: 'GEO Score Checker', tagline: 'Just want the number? Score any URL in seconds.' },
            { slug: 'ai-crawler-checker', name: 'AI Crawler Checker', tagline: 'Confirm AI bots can fetch the page you audited.' },
            { slug: 'citation-finder', name: 'AI Citation Finder', tagline: 'See which URLs Perplexity and ChatGPT cite for your industry.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}

export default function AiReadinessAuditPage() {
  return (
    <Suspense fallback={null}>
      <AiReadinessAuditInner />
    </Suspense>
  );
}
