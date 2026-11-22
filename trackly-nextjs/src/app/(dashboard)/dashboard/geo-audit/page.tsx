'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Badge, Bar, Pill, Donut, PageHead } from '@/app/dashboard-v2/ui';
import { normalizeAuditUrl, pickCategoryFinding, scoreTone } from '@/lib/geo-audit-utils';

interface CategoryResult {
  name: string;
  score: number;
  findings: string[];
  label?: string;
}

interface Snap { id: string; url: string; overallScore: number; categories: { name: string; score: number }[]; wordCount: number; createdAt: string }
interface Comparison {
  before: Snap;
  after: Snap;
  delta: number;
  checks: number;
  categories: { name: string; before: number; after: number; delta: number }[];
}
interface TrackedPage { urlKey: string; url: string; checks: number; before: Snap; after: Snap }

interface AuditResult {
  url: string;
  overallScore: number;
  comparison?: Comparison | null;
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

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return <Badge tone="dim">No change</Badge>;
  return <Badge tone={delta > 0 ? 'pos' : 'neg'}>{delta > 0 ? '▲ +' : '▼ '}{delta} pts</Badge>;
}

/** Before vs after for one page: two donuts, the change, and each category. */
function BeforeAfter({ c }: { c: Comparison }) {
  if (c.checks < 2) {
    return (
      <p className="quiet" style={{ fontSize: 13, margin: 0 }}>
        This is the first check of this page, so <b>{c.before.overallScore}</b> is saved as your <b>before</b> score ({fmtDay(c.before.createdAt)}).
        Make your AI SEO changes, then audit the same page again to see the after score.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <Donut value={c.before.overallScore} size={110} label="Before" />
          <div className="mono dim" style={{ fontSize: 11, marginTop: 8 }}>{fmtDay(c.before.createdAt)}</div>
        </div>
        <div style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 22, color: 'var(--mute)' }}>→</span>
          <DeltaChip delta={c.delta} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <Donut value={c.after.overallScore} size={110} label="After" />
          <div className="mono dim" style={{ fontSize: 11, marginTop: 8 }}>{fmtDay(c.after.createdAt)}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Category</th><th className="num">Before</th><th className="num">After</th><th>Change</th></tr></thead>
          <tbody>
            {c.categories.map(cat => (
              <tr key={cat.name}>
                <td>{cat.name}</td>
                <td className="num">{cat.before}</td>
                <td className="num"><b>{cat.after}</b></td>
                <td><DeltaChip delta={cat.delta} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="mono dim" style={{ fontSize: 11 }}>{c.checks} checks saved for this page. Before is the first check; after is the latest.</span>
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

  const [tracked, setTracked] = useState<TrackedPage[]>([]);

  const loadTracked = useCallback(async () => {
    try {
      const res = await fetch('/api/geo-audit/history', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setTracked(Array.isArray(data.pages) ? data.pages : []);
    } catch { /* the list is optional */ }
  }, []);

  useEffect(() => {
    setHistory(loadAudits());
    loadTracked();
  }, [loadTracked]);

  const resetBaseline = async (pageUrl: string) => {
    if (!window.confirm('Forget the saved scores for this page? The next audit becomes the new "before" score.')) return;
    try {
      await fetch('/api/geo-audit/history?url=' + encodeURIComponent(pageUrl), { method: 'DELETE', credentials: 'include' });
    } catch { /* ignore */ }
    loadTracked();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAudit(url);
  };

  const runAudit = async (rawUrl: string) => {
    setError('');
    setResult(null);
    setLoading(true);
    setProgress(0);
    // Accept bare domains ("livesov.com"): https:// is assumed.
    const target = normalizeAuditUrl(rawUrl);

    const interval = setInterval(() => {
      setProgress((p) => (p >= 90 ? (clearInterval(interval), 90) : p + Math.random() * 15));
    }, 300);

    try {
      const res = await fetch('/api/geo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
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
        url: target,
        score: data.overallScore,
        date: new Date().toISOString(),
        result: { ...data, categories: cats },
      };
      saveAudit(saved);
      setHistory(loadAudits());
      loadTracked();
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
        sub="Score any page for AI visibility. The first check is saved as your before score; re-check after your changes to see the after score."
      />
      <div className="page-body">
        {/* New audit */}
        <Card title="New audit">
          <form onSubmit={handleSubmit} className="audit-form">
            <div className="aud-field">
              <label className="eyebrow">Page URL</label>
              <input
                className="aud-input"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="yoursite.com/page"
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
              <span className="mono dim" style={{ fontSize: 11 }}>≈ Fetch + score across GEO categories</span>
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
                <Donut value={result.overallScore} size={140} label="Overall score" />
                <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
                  {result.overallScore >= 70 ? 'Good' : result.overallScore >= 40 ? 'Needs work' : 'Poor'}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 14, flex: 1 }}>
                <div className="audit-finds">
                  <Find ok>
                    Audited <b>{result.meta.title}</b>
                  </Find>
                  {resultCats.map((cat) => {
                    // The icon follows the score, and the finding shown next
                    // to it is picked to match: a strength for a good score,
                    // the first thing to fix for a weak one.
                    const tone = scoreTone(cat.score);
                    const finding = pickCategoryFinding(cat.score, cat.findings);
                    return (
                      <Find
                        key={cat.name || cat.label}
                        ok={tone === 'pos'}
                        warn={tone === 'warn'}
                        bad={tone === 'neg'}
                      >
                        <b>{cat.name || cat.label}</b> scored <b>{cat.score}</b>
                        {finding ? ` - ${finding}` : ''}
                      </Find>
                    );
                  })}
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

        {/* Before / after for the page just audited */}
        {result?.comparison && (
          <Card title="Before and after" right={result.comparison.checks >= 2 ? <DeltaChip delta={result.comparison.delta} /> : <Pill>Baseline saved</Pill>}>
            <BeforeAfter c={result.comparison} />
          </Card>
        )}

        {/* Every tracked page: first score vs latest */}
        <Card title="Tracked pages: before and after" right={<Pill>{tracked.length} pages</Pill>}>
          {tracked.length === 0 ? (
            <p className="quiet" style={{ fontSize: 13, margin: 0 }}>
              Audit a page to save its before score. Audit it again after your AI SEO work to see the change.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr><th>Page</th><th className="num">Before</th><th className="num">After</th><th>Change</th><th>Checks</th><th></th></tr>
                </thead>
                <tbody>
                  {tracked.map(p => (
                    <tr key={p.urlKey}>
                      <td>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 600, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.url}>{p.urlKey}</div>
                        <div className="mono dim" style={{ fontSize: 11 }}>{fmtDay(p.before.createdAt)}{p.checks > 1 ? ` → ${fmtDay(p.after.createdAt)}` : ''}</div>
                      </td>
                      <td className="num">{p.before.overallScore}</td>
                      <td className="num">{p.checks > 1 ? <b>{p.after.overallScore}</b> : <span className="dim">-</span>}</td>
                      <td>{p.checks > 1 ? <DeltaChip delta={p.after.overallScore - p.before.overallScore} /> : <span className="dim" style={{ fontSize: 12 }}>Not re-checked yet</span>}</td>
                      <td className="num">{p.checks}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn-d" disabled={loading} onClick={() => { setUrl(p.url); window.scrollTo({ top: 0, behavior: 'smooth' }); runAudit(p.url); }}>↻ Re-check</button>
                        <button className="btn-g" style={{ marginLeft: 6 }} onClick={() => resetBaseline(p.url)} title="Forget saved scores; the next audit becomes the new before score">Reset</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

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
