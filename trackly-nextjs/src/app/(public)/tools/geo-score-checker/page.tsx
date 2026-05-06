'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

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
    </ToolPage>
  );
}
