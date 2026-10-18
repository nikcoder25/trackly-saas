'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteShell from '@/components/site/SiteShell';
import { PLAN_LIMITS } from '@/lib/constants';
import { validateUrlClientSide } from './validate-url';

interface CategoryResult {
  name: string;
  score: number;
  findings: string[];
  label?: string;
}

interface AuditResult {
  url: string;
  overallScore: number;
  categories: Record<string, CategoryResult> | CategoryResult[];
  recommendations: string[];
  meta: {
    title: string;
    wordCount: number;
    fetchTimeMs: number;
  };
}

function categoriesAsArray(cats: Record<string, CategoryResult> | CategoryResult[]): CategoryResult[] {
  if (Array.isArray(cats)) return cats;
  return Object.entries(cats).map(([key, val]) => ({ ...val, name: val.label || val.name || key }));
}

/* The design's input takes a bare domain ("yourclient.com"); the API needs
   a full http(s) URL, so add https:// when the protocol is missing. */
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t || /^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const scoreState = (s: number) => (s >= 70 ? { cls: '', label: 'Good' } : s >= 40 ? { cls: ' warn', label: 'Needs work' } : { cls: ' bad', label: 'Poor' });

// Shown before the visitor runs their own audit. Category names match the
// ones /api/geo-audit returns.
const SAMPLE = {
  domain: 'acme-pm.com',
  overall: 68,
  scores: [
    { name: 'Content Structure', score: 72 },
    { name: 'Structured Data', score: 64 },
    { name: 'AI Readability', score: 58 },
  ],
  fixes: [
    'Add clear answers to buyer questions on key pages',
    'Add structured data for business and services',
    'Get listed on sources AI engines already cite',
  ],
};

const CHECKS = [
  { k: 'Structure', t: 'Content structure', d: 'Answerable headings, short sections and a clear answer near the top.' },
  { k: 'Schema', t: 'Structured data', d: 'JSON-LD for the business, services, FAQs and articles.' },
  { k: 'Trust', t: 'Authority signals', d: 'Authorship, dates, outbound sources and citations engines can verify.' },
  { k: 'Technical', t: 'Technical SEO', d: 'HTTPS, load time, meta tags and crawlable markup.' },
  { k: 'Readability', t: 'AI readability', d: 'Plain sentences and lists that an LLM can lift and quote.' },
];

export default function GeoAuditPage() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');

  // Prefill from the homepage CTA (/geo-audit?url=example.com).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('url');
    if (q) setUrl(q);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);

    // Pre-fetch validation: catch obvious bad inputs before burning
    // a network round trip + a rate-limit slot. Server-side re-validates.
    const target = normalizeUrl(url);
    const clientErr = validateUrlClientSide(target);
    if (clientErr) {
      setError(clientErr);
      return;
    }

    setLoading(true);
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + Math.random() * 15;
      });
    }, 300);

    try {
      const res = await fetch('/api/geo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, website: honeypot }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setResult(data);
      }, 400);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const cats = result ? categoriesAsArray(result.categories) : [];
  const shown = result
    ? {
        label: 'YOUR REPORT',
        domain: (() => { try { return new URL(result.url).hostname; } catch { return result.url; } })(),
        overall: result.overallScore,
        scores: [...cats].sort((a, b) => a.score - b.score).slice(0, 3),
        fixes: result.recommendations.slice(0, 3),
      }
    : { label: 'SAMPLE REPORT', ...SAMPLE };
  const state = scoreState(shown.overall);

  return (
    <SiteShell>
      {/* ── Hero: form + report ─────────────────── */}
      <section className="ls-wrap ls-split" style={{ paddingTop: 80, paddingBottom: 72, gap: 56 }}>
        <div className="ls-stack ls-gap-24" style={{ gap: 22 }}>
          <div className="ls-pill"><span className="ls-dot" />Free · No signup</div>
          <h1 className="ls-h1">AI visibility checker. <span className="ls-em acc">See if AI can cite you.</span></h1>
          <p className="ls-lead">
            Enter any page. In seconds we score how ready it is to be quoted by ChatGPT, Gemini and Perplexity, and tell you what to fix first.
          </p>
          <form className="ls-inline-form" onSubmit={handleSubmit} aria-busy={loading} noValidate>
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
              <label htmlFor="audit-website">Website</label>
              <input id="audit-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
            <label htmlFor="auditUrl" className="ls-sr">Page URL to audit</label>
            <input
              id="auditUrl"
              type="text"
              inputMode="url"
              name="url"
              required
              placeholder="yourclient.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="ls-btn ls-btn-pri" disabled={loading} style={{ padding: '14px 24px', borderRadius: 11, fontSize: 16, minHeight: 48 }}>
              {loading ? 'Auditing...' : 'Run my audit'}
            </button>
          </form>
          {loading && (
            <div className="ls-stack ls-gap-8" role="status" aria-live="polite">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ls-subtle)' }}>
                <span>Analyzing page...</span><span className="ls-mono">{Math.round(progress)}%</span>
              </div>
              <div className="ls-bar"><i style={{ width: `${progress}%`, transition: 'width .3s ease' }} /></div>
              <div className="ls-progress-steps">
                {progress > 10 && <span>Fetching page content...</span>}
                {progress > 35 && <span>Analyzing structure and metadata...</span>}
                {progress > 60 && <span>Evaluating AI optimization signals...</span>}
                {progress > 80 && <span>Generating recommendations...</span>}
              </div>
            </div>
          )}
          {error && <div className="ls-alert err" role="alert">{error}</div>}
          <p className="ls-trust">No credit card · No email needed · Results in seconds</p>
        </div>

        <div className="ls-report">
          <div className="ls-report-in" aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="ls-stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-subtle)' }}>{shown.label}</span>
                <span style={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{shown.domain}</span>
              </div>
              <span className={'ls-status' + state.cls}>{result ? `${shown.overall}/100 · ${state.label}` : 'Example'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {shown.scores.map((s) => (
                <div key={s.name} className="ls-score-tile">
                  <span style={{ fontSize: 13, color: 'var(--ls-muted)' }}>{s.name}</span>
                  <span className="v">{s.score}</span>
                  <div className="ls-bar thin"><i style={{ width: `${s.score}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="ls-stack ls-gap-10">
              <span className="ls-cap" style={{ fontSize: 12 }}>Fix first</span>
              {shown.fixes.map((f, i) => (
                <div key={i} className="ls-fix"><span className={'ls-fix-n' + (i === 2 ? ' acc' : '')}>{i + 1}</span>{f}</div>
              ))}
            </div>
            <Link href="/signup" className="ls-btn ls-btn-dark ls-btn-block">Track this site daily</Link>
          </div>
        </div>
      </section>

      {/* ── Full results ─────────────────────────── */}
      {result && (
        <section className="ls-wrap ls-sec" style={{ paddingTop: 0 }}>
          <div className="ls-sec-row">
            <div className="ls-sec-head">
              <span className="ls-eyebrow">Full results</span>
              <h2 className="ls-h2 md">GEO score: {result.overallScore}<span className="ls-em">/100.</span></h2>
              <p className="ls-body">
                <strong style={{ color: 'var(--ls-ink)' }}>{result.meta.title.length > 60 ? result.meta.title.slice(0, 60) + '...' : result.meta.title}</strong>
                {' '}· {result.meta.wordCount.toLocaleString()} words · fetched in {result.meta.fetchTimeMs}ms
              </p>
            </div>
          </div>
          <div className="ls-grid ls-grid-3">
            {cats.map((c) => (
              <div key={c.name} className="ls-card ls-stack ls-gap-12" style={{ padding: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>{c.name}</h3>
                  <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>{c.score}</span>
                </div>
                <div className="ls-bar thin"><i style={{ width: `${c.score}%` }} /></div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: 'var(--ls-muted)' }}>
                  {c.findings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          {result.recommendations.length > 0 && (
            <div className="ls-card dark ls-stack ls-gap-16">
              <span className="ls-mono" style={{ fontSize: 13, color: 'var(--ls-lime)' }}>Action plan</span>
              <h3 className="ls-h3">Recommendations</h3>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.9, color: 'var(--ls-on-dark-2)' }}>
                {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ol>
              <Link href="/signup" className="ls-btn ls-btn-pri" style={{ alignSelf: 'flex-start' }}>Start tracking your AI visibility</Link>
            </div>
          )}
        </section>
      )}

      {/* ── What the audit checks ──────────────── */}
      <section className="ls-band">
        <div className="ls-wrap ls-sec" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <h2 className="ls-h2 md" style={{ maxWidth: 760 }}>What the audit <span className="ls-em">checks.</span></h2>
          <div className="ls-grid ls-grid-3">
            {CHECKS.map((c) => (
              <div key={c.k} className="ls-card soft ls-stack ls-gap-10" style={{ padding: 28 }}>
                <span className="ls-kicker" style={{ fontSize: 13 }}>{c.k}</span>
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>{c.t}</h3>
                <p className="ls-small">{c.d}</p>
              </div>
            ))}
            <div className="ls-card dark ls-stack ls-gap-10" style={{ padding: 28 }}>
              <span className="ls-mono" style={{ fontSize: 13, color: 'var(--ls-lime)' }}>Action plan</span>
              <h3 style={{ fontSize: 20, fontWeight: 600 }}>What to fix first</h3>
              <p className="ls-small" style={{ color: 'var(--ls-on-dark-2)' }}>A short, ranked list your team can start on today.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── For agencies ─────────────────────────── */}
      <section className="ls-wrap ls-split" style={{ paddingTop: 96, paddingBottom: 72 }}>
        <div className="ls-stack ls-gap-16">
          <span className="ls-eyebrow">For agencies</span>
          <h2 className="ls-h2 md">Use audits to <span className="ls-em">win new clients.</span></h2>
          <p className="ls-body" style={{ fontSize: 17 }}>
            Run an audit on a prospect, send the report, then track them daily once they sign. Agency plans include up to {PLAN_LIMITS.agency.geoAudits} audits a month.
          </p>
          <Link href="/pricing" className="ls-link" style={{ alignSelf: 'flex-start' }}>See plans</Link>
        </div>
        <div className="ls-stack ls-gap-12">
          <div className="ls-tier-row"><span style={{ fontWeight: 600 }}>Starter</span><span className="ls-mono" style={{ color: 'var(--ls-muted)' }}>{PLAN_LIMITS.starter.geoAudits} audits / mo</span></div>
          <div className="ls-tier-row"><span style={{ fontWeight: 600 }}>Pro</span><span className="ls-mono" style={{ color: 'var(--ls-muted)' }}>{PLAN_LIMITS.pro.geoAudits} audits / mo</span></div>
          <div className="ls-tier-row dark"><span style={{ fontWeight: 600 }}>Agency</span><span className="ls-mono" style={{ color: 'var(--ls-lime)' }}>{PLAN_LIMITS.agency.geoAudits} audits / mo</span></div>
        </div>
      </section>

      {/* ── Supporting content ───────────────────── */}
      <section className="ls-wrap" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <div className="ls-prose" style={{ maxWidth: 760 }}>
          <h2>How the check works</h2>
          <p>
            AI search visibility is how often, and how prominently, tools like ChatGPT, Perplexity,
            Google&apos;s AI Overviews and Gemini surface your content when people ask questions in your
            category. Buyers increasingly start with an AI answer instead of ten blue links, so the page
            that gets cited wins the click. Paste any URL. The checker fetches the page and measures the
            on-page signals that drive AI search visibility: clear structure, answerable headings, schema,
            freshness and source attribution.
          </p>
          <h2>What your score means</h2>
          <p>
            You get an overall score out of 100 and a breakdown by category. A high score means AI engines
            can easily read, trust and quote the page. A low score means the page is hard to extract from,
            so engines tend to cite a competitor instead.
          </p>
          <h2>Track it every day</h2>
          <p style={{ marginBottom: 0 }}>
            This is a fast, single page check. To see whether ChatGPT, Gemini, Perplexity, Claude and Grok
            actually mention your brand, and track it over time,{' '}
            <Link href="/signup">start a free Livesov trial</Link>.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
