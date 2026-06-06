'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Badge, Bar, Pill, Donut, PageHead } from '@/app/dashboard-v2/ui';

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

interface SavedAudit {
  url: string;
  score: number;
  date: string;
  result: AuditResult;
}

const STORAGE_KEY = 'livesov_geo_audits';

function loadAudits(): SavedAudit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAudit(audit: SavedAudit) {
  const audits = loadAudits();
  audits.unshift(audit);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(audits.slice(0, 10)));
}

function Find({ ok, warn, bad, children }: any) {
  const tone = ok ? 'pos' : bad ? 'neg' : 'warn';
  const sym = ok ? '✓' : bad ? '✗' : '⚠';
  return (
    <div className="find">
      <span className={'find-sym ' + tone}>{sym}</span>
      <span>{children}</span>
    </div>
  );
}

export default function DashboardGeoAuditPage() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedAudit[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    setHistory(loadAudits());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => (p >= 90 ? (clearInterval(interval), 90) : p + Math.random() * 15));
    }, 300);

    try {
      const res = await fetch('/api/geo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }

      setProgress(100);
      // Transform categories from object to array if needed
      const cats = data.categories && !Array.isArray(data.categories)
        ? Object.values(data.categories).map((c: any) => ({ name: c.label || c.name, score: c.score, findings: c.findings }))
        : data.categories;
      setResult({ ...data, categories: cats });

      const saved: SavedAudit = {
        url: url.trim(),
        score: data.overallScore,
        date: new Date().toISOString(),
        result: { ...data, categories: cats },
      };
      saveAudit(saved);
      setHistory(loadAudits());
    } catch {
      setError('Network error. Please try again.');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const resultCats = result ? categoriesAsArray(result.categories) : [];

  return (
    <div className="lvx">
      <PageHead
        title="GEO Audit"
        sub="Analyze any page for AI visibility optimization. One run, one shareable result."
      />
      <div className="page-body">
        {/* New audit */}
        <Card title="New audit">
          <form onSubmit={handleSubmit} className="audit-form">
            <div className="aud-field">
              <label className="eyebrow">PAGE URL</label>
              <input
                className="aud-input"
                type="url"
                required
                placeholder="https://yoursite.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {loading && (
              <div className="aud-field">
                <div style={{ width: '100%', height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'var(--primary)',
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <span className="mono dim" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                  {progress < 35 ? 'Fetching page…' : progress < 65 ? 'Analyzing content…' : 'Generating scores…'}
                </span>
              </div>
            )}

            {error && (
              <div className="aud-field">
                <Badge tone="neg">{error}</Badge>
              </div>
            )}

            <div className="aud-cta">
              <span className="mono dim" style={{ fontSize: 11 }}>≈ FETCH + SCORE ACROSS GEO CATEGORIES</span>
              <button type="submit" className="btn-p" disabled={loading} style={{ padding: '10px 18px' }}>
                {loading ? 'Auditing…' : '▶ Audit this page'}
              </button>
            </div>
          </form>
        </Card>

        {/* Latest audit */}
        {result && (
          <Card
            title="Latest audit"
            right={
              <>
                <Badge tone="acc">SCORE {result.overallScore}</Badge>
                <Pill>{result.meta.wordCount.toLocaleString()} words · {result.meta.fetchTimeMs}ms</Pill>
              </>
            }
          >
            <div className="aud-summary">
              <div className="aud-num">
                <Donut value={result.overallScore} size={140} label="OVERALL SCORE" />
                <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
                  {result.overallScore >= 70 ? 'Good' : result.overallScore >= 40 ? 'Needs work' : 'Poor'}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 14, flex: 1 }}>
                <div className="audit-finds">
                  <Find ok>
                    Audited <b>{result.meta.title}</b>
                  </Find>
                  {resultCats.map((cat) => (
                    <Find
                      key={cat.name || cat.label}
                      ok={cat.score >= 70}
                      warn={cat.score >= 40 && cat.score < 70}
                      bad={cat.score < 40}
                    >
                      <b>{cat.name || cat.label}</b> scored <b>{cat.score}</b>
                      {cat.findings && cat.findings[0] ? ` - ${cat.findings[0]}` : ''}
                    </Find>
                  ))}
                </div>
                <div className="audit-by-engine">
                  {resultCats.map((cat) => (
                    <div key={cat.name || cat.label} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12 }}>{cat.name || cat.label}</span>
                        <span className="mono"><b>{cat.score}</b></span>
                      </div>
                      <Bar value={cat.score} max={100} />
                    </div>
                  ))}
                </div>
                {result.recommendations.length > 0 && (
                  <div className="audit-finds">
                    {result.recommendations.map((rec, i) => (
                      <Find key={i} warn>{rec}</Find>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* History */}
        <Card title="Your recent audits" right={<Pill>{history.length} saved</Pill>}>
          {history.length === 0 ? (
            <p className="quiet" style={{ fontSize: 13, margin: 0 }}>No audits yet. Enter a URL above to get started.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((audit, idx) => (
                <div key={idx}>
                  <div
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 5,
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                      background: expandedIdx === idx ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <Badge tone={audit.score >= 70 ? 'pos' : audit.score >= 40 ? 'warn' : 'neg'}>{audit.score}</Badge>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {audit.url}
                      </div>
                      <div className="mono dim" style={{ fontSize: 11 }}>
                        {new Date(audit.date).toLocaleDateString()} at {new Date(audit.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="dim" style={{ fontSize: 12, transform: expandedIdx === idx ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                      ▼
                    </span>
                  </div>

                  {/* Expanded details */}
                  {expandedIdx === idx && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: 14,
                        borderRadius: 5,
                        border: '1px solid var(--line)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <div className="quiet" style={{ fontSize: 13, marginBottom: 12 }}>
                        <b>{audit.result.meta.title}</b> · {audit.result.meta.wordCount} words
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {categoriesAsArray(audit.result.categories).map((cat) => (
                          <Badge
                            key={cat.name || cat.label}
                            tone={cat.score >= 70 ? 'pos' : cat.score >= 40 ? 'warn' : 'neg'}
                          >
                            {cat.name || cat.label}: {cat.score}
                          </Badge>
                        ))}
                      </div>
                      <div className="audit-finds">
                        {audit.result.recommendations.slice(0, 3).map((r, i) => (
                          <Find key={i} warn>{r}</Find>
                        ))}
                      </div>
                      <button
                        className="btn-d"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResult(audit.result);
                          setUrl(audit.url);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{ marginTop: 12 }}
                      >
                        View full results
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
