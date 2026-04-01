'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface CategoryResult {
  name: string;
  score: number;
  findings: string[];
}

interface AuditResult {
  url: string;
  overallScore: number;
  categories: CategoryResult[];
  recommendations: string[];
  meta: {
    title: string;
    wordCount: number;
    fetchTimeMs: number;
  };
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

function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const inner = size - 24;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) ${score * 3.6}deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: '50%',
          background: 'var(--card-bg, #fff)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>/100</span>
      </div>
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
        result: data,
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

  const scoreColor = (s: number) => (s >= 70 ? '#10b981' : s >= 40 ? '#f59e0b' : '#ef4444');

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>GEO Audit</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>
        Analyze any page for AI visibility optimization
      </p>

      {/* URL Input */}
      <div
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="url"
            required
            placeholder="https://yoursite.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{
              flex: 1,
              minWidth: 240,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
              outline: 'none',
              background: 'var(--bg, #fff)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: loading ? 'var(--muted)' : '#FF6154',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Auditing...' : 'Audit This Page'}
          </button>
        </form>

        {/* Progress */}
        {loading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#FF6154',
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
              {progress < 35 ? 'Fetching page...' : progress < 65 ? 'Analyzing content...' : 'Generating scores...'}
            </span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div style={{ marginBottom: 32 }}>
          {/* Score + Meta Row */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 180,
              }}
            >
              <ScoreGauge score={result.overallScore} />
              <span style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: scoreColor(result.overallScore) }}>
                {result.overallScore >= 70 ? 'Good' : result.overallScore >= 40 ? 'Needs Work' : 'Poor'}
              </span>
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 240,
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 24,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Page Info</h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 2 }}>
                <div><strong style={{ color: 'var(--text)' }}>Title:</strong> {result.meta.title}</div>
                <div><strong style={{ color: 'var(--text)' }}>URL:</strong> {result.url}</div>
                <div><strong style={{ color: 'var(--text)' }}>Word Count:</strong> {result.meta.wordCount.toLocaleString()}</div>
                <div><strong style={{ color: 'var(--text)' }}>Fetch Time:</strong> {result.meta.fetchTimeMs}ms</div>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {result.categories.map((cat) => (
              <div
                key={cat.name}
                style={{
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{cat.name}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(cat.score) }}>{cat.score}</span>
                </div>
                <div style={{ width: '100%', height: 5, background: 'var(--border)', borderRadius: 3, marginBottom: 12 }}>
                  <div style={{ width: `${cat.score}%`, height: '100%', background: scoreColor(cat.score), borderRadius: 3 }} />
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                  {cat.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div
            style={{
              background: 'var(--card-bg, #fff)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Recommendations</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 2 }}>
              {result.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* History */}
      <div
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Your Recent Audits</h3>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>No audits yet. Enter a URL above to get started.</p>
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
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: expandedIdx === idx ? 'rgba(255,97,84,.04)' : 'transparent',
                    transition: 'background .15s',
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: `conic-gradient(${scoreColor(audit.score)} ${audit.score * 3.6}deg, var(--border) ${audit.score * 3.6}deg)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'var(--card-bg, #fff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        color: scoreColor(audit.score),
                      }}
                    >
                      {audit.score}
                    </span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {audit.url}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {new Date(audit.date).toLocaleDateString()} at {new Date(audit.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)', transform: expandedIdx === idx ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                    ▼
                  </span>
                </div>

                {/* Expanded details */}
                {expandedIdx === idx && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: 16,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--card-bg, #fff)',
                    }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                      <strong style={{ color: 'var(--text)' }}>Title:</strong> {audit.result.meta.title} &middot; {audit.result.meta.wordCount} words
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      {audit.result.categories.map((cat) => (
                        <span
                          key={cat.name}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: `${scoreColor(cat.score)}15`,
                            color: scoreColor(cat.score),
                            fontWeight: 600,
                          }}
                        >
                          {cat.name}: {cat.score}
                        </span>
                      ))}
                    </div>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Top recommendations:</span>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                        {audit.result.recommendations.slice(0, 3).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setResult(audit.result);
                        setUrl(audit.url);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        marginTop: 12,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: '#FF6154',
                        cursor: 'pointer',
                      }}
                    >
                      View Full Results
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
