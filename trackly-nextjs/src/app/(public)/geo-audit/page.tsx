'use client';

import { useState } from 'react';
import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';
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

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'Good' : score >= 40 ? 'Needs Work' : 'Poor';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${score * 3.6}deg, #e5e7eb ${score * 3.6}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 48, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>/100</span>
        </div>
      </div>
      <span style={{ marginTop: 12, fontSize: 16, fontWeight: 700, color }}>{label}</span>
      <span style={{ fontSize: 13, color: '#6b7280' }}>GEO Score</span>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryResult }) {
  const color = category.score >= 70 ? '#10b981' : category.score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,.06)',
        border: '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{category.name}</h3>
        <span style={{ fontSize: 18, fontWeight: 800, color }}>{category.score}</span>
      </div>
      <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, marginBottom: 16 }}>
        <div style={{ width: `${category.score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#4b5563', lineHeight: 1.8 }}>
        {category.findings.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

export default function GeoAuditPage() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);

    // Pre-fetch validation: catch obvious bad inputs before burning
    // a network round trip + a rate-limit slot. Server-side re-validates.
    const clientErr = validateUrlClientSide(url);
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
        body: JSON.stringify({ url: url.trim(), website: honeypot }),
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

  return (
    <SeoLayout>
      {/* Hero */}
      <section
        className="land-hero"
        style={{ paddingTop: 80, paddingBottom: 48, textAlign: 'center' }}
      >
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
          How AI-Ready Is <span style={{ color: 'var(--brand)' }}>Your Content</span>?
        </h1>
        <p
          style={{
            fontSize: 18,
            color: 'rgba(255,255,255,.7)',
            maxWidth: 540,
            margin: '0 auto',
            paddingBottom: 24,
          }}
        >
          Get your GEO score in seconds - free, no signup required
        </p>
      </section>

      {/* Form Section */}
      <section style={{ padding: '0 24px 64px', maxWidth: 600, margin: '-12px auto 0' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 40,
            boxShadow: '0 4px 24px rgba(0,0,0,.08)',
          }}
        >
          <form onSubmit={handleSubmit} aria-busy={loading}>
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
              <label htmlFor="audit-website">Website</label>
              <input id="audit-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="auditUrl"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#1a1a2e',
                  marginBottom: 6,
                }}
              >
                Page URL
              </label>
              <input
                id="auditUrl"
                type="url"
                name="url"
                required
                placeholder="https://yoursite.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid #e0e0e0',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: 10,
                border: 'none',
                background: loading ? '#ccc' : 'var(--brand)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background .2s',
              }}
            >
              {loading ? 'Auditing...' : 'Audit This Page'}
            </button>
          </form>

          {/* Loading progress */}
          {loading && (
            <div style={{ marginTop: 24 }} role="status" aria-live="polite">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>Analyzing page...</span>
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--brand), #818cf8)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {progress > 10 && <span style={{ fontSize: 12, color: '#9ca3af' }}>Fetching page content...</span>}
                {progress > 35 && <span style={{ fontSize: 12, color: '#9ca3af' }}>Analyzing structure & metadata...</span>}
                {progress > 60 && <span style={{ fontSize: 12, color: '#9ca3af' }}>Evaluating AI optimization signals...</span>}
                {progress > 80 && <span style={{ fontSize: 12, color: '#9ca3af' }}>Generating recommendations...</span>}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 20,
                padding: '12px 16px',
                borderRadius: 10,
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div style={{ marginTop: 32 }}>
            {/* Score Card */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 40,
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 24 }}>
                GEO Audit Results
              </h2>
              <ScoreGauge score={result.overallScore} />

              {/* Meta info */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 32,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: '#6b7280',
                  marginTop: 8,
                }}
              >
                <span>
                  <strong style={{ color: '#1a1a2e' }}>{result.meta.title.length > 50 ? result.meta.title.slice(0, 50) + '...' : result.meta.title}</strong>
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 24,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: '#6b7280',
                  marginTop: 12,
                }}
              >
                <span>{result.meta.wordCount.toLocaleString()} words</span>
                <span>Fetched in {result.meta.fetchTimeMs}ms</span>
              </div>
            </div>

            {/* Category Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {categoriesAsArray(result.categories).map((cat) => (
                <CategoryCard key={cat.name} category={cat} />
              ))}
            </div>

            {/* Recommendations */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 32,
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                marginBottom: 24,
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 16 }}>
                Recommendations
              </h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#374151', lineHeight: 2 }}>
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>

            {/* Upsell */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 32,
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  background: '#f5f3ff',
                  borderRadius: 10,
                  padding: 20,
                  marginBottom: 24,
                  border: '1px solid #e0e7ff',
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    color: '#1a1a2e',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  Want to audit <strong>all your pages</strong> and track improvements over time?
                  Sign up free to monitor your AI visibility across ChatGPT, Perplexity, Claude, Gemini &amp; Grok.
                </p>
              </div>

              <Link
                href="/signup"
                style={{
                  display: 'inline-block',
                  padding: '14px 32px',
                  borderRadius: 10,
                  background: 'var(--brand)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'background .2s',
                }}
              >
                Start Tracking Your AI Visibility - Free
              </Link>
            </div>
          </div>
        )}
      </section>
    </SeoLayout>
  );
}
