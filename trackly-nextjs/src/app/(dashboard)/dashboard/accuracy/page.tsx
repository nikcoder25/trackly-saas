'use client';

import { useState, useEffect, useMemo } from 'react';

interface Brand { id: string; name: string; }
interface Fact { key: string; value: string; category: string; }
interface SuggestedFact { key: string; value: string; category: string; source: 'website' | 'ai_responses'; confidence: 'high' | 'medium' | 'low'; }
interface Issue { platform: string; model?: string; fact_key: string; expected: string; found: string; severity: string; date?: string; category?: string; explanation?: string; run_id?: string; }
interface TrendPoint { date: string; rate: number; }
interface PlatformStat { total: number; accurate: number; }
interface CategoryStat { total: number; accurate: number; }

// ── Mini SVG Line Chart ──────────────────────────────────────────
function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>
        Not enough data for trend chart yet. Run more checks to see trends.
      </div>
    );
  }

  const w = 460, h = 140, px = 36, py = 16;
  const minR = Math.min(...data.map(d => d.rate));
  const maxR = Math.max(...data.map(d => d.rate));
  const range = maxR - minR || 10;
  const yMin = Math.max(0, minR - 5);
  const yMax = Math.min(100, maxR + 5);
  const yRange = yMax - yMin || 10;

  const points = data.map((d, i) => {
    const x = px + (i / (data.length - 1)) * (w - px * 2);
    const y = py + (1 - (d.rate - yMin) / yRange) * (h - py * 2);
    return { x, y, ...d };
  });

  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${points[0].x},${h - py} ${line} ${points[points.length - 1].x},${h - py}`;

  // Y-axis labels
  const yLabels = [yMin, Math.round((yMin + yMax) / 2), yMax];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ overflow: 'visible' }}>
      {/* Grid lines */}
      {yLabels.map(val => {
        const y = py + (1 - (val - yMin) / yRange) * (h - py * 2);
        return (
          <g key={val}>
            <line x1={px} y1={y} x2={w - px} y2={y} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={px - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">{val}%</text>
          </g>
        );
      })}
      {/* Area fill */}
      <polygon points={area} fill="var(--primary)" opacity={0.06} />
      {/* Line */}
      <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--bg)" stroke="var(--primary)" strokeWidth={2} />
          {/* X labels — show first, last, and middle */}
          {(i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
            <text x={p.x} y={h - 2} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily="var(--mono)">
              {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Donut Chart (CSS) ───────────────────────────────────────────
function SeverityDonut({ issues }: { issues: Issue[] }) {
  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
      const s = issue.severity as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [issues]);

  const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);
  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>
        No issues detected
      </div>
    );
  }

  const colors = { critical: '#dc2626', high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  let cumulative = 0;
  const segments = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, val]) => {
      const start = cumulative;
      cumulative += (val / total) * 100;
      return { key, val, start, end: cumulative, color: colors[key as keyof typeof colors] };
    });

  const gradient = segments.map(s => `${s.color} ${s.start}% ${s.end}%`).join(', ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: `conic-gradient(${gradient})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
          {total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{s.key}</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{s.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal Bar ──────────────────────────────────────────────
function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textTransform: 'capitalize' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)', minWidth: 36, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

// ── Fact Coverage ───────────────────────────────────────────────
const RECOMMENDED_CATEGORIES = ['general', 'pricing', 'features', 'company'];

function FactCoverage({ facts }: { facts: Fact[] }) {
  const covered = useMemo(() => {
    const cats = new Set(facts.map(f => f.category));
    return RECOMMENDED_CATEGORIES.filter(c => cats.has(c));
  }, [facts]);
  const pct = Math.round((covered.length / RECOMMENDED_CATEGORIES.length) * 100);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Category Coverage</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: pct === 100 ? 'var(--green)' : 'var(--amber)' }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--primary)', borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {RECOMMENDED_CATEGORIES.map(cat => {
          const isCovered = covered.includes(cat);
          return (
            <span key={cat} style={{
              fontSize: 10, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 4,
              background: isCovered ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
              color: isCovered ? 'var(--green)' : 'var(--muted)',
              border: `1px solid ${isCovered ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
              textTransform: 'capitalize',
            }}>
              {isCovered ? '✓' : '○'} {cat}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function AccuracyPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [accuracyRate, setAccuracyRate] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [factKey, setFactKey] = useState('');
  const [factValue, setFactValue] = useState('');
  const [factCategory, setFactCategory] = useState('general');
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [platformStats, setPlatformStats] = useState<Record<string, PlatformStat>>({});
  const [categoryStats, setCategoryStats] = useState<Record<string, CategoryStat>>({});
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'facts'>('issues');
  const [checkedRuns, setCheckedRuns] = useState(0);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [suggestedFacts, setSuggestedFacts] = useState<SuggestedFact[]>([]);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!brand) return;
    fetch(`/api/brands/${brand.id}/accuracy`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setFacts(d.facts || []);
        setIssues(d.issues || []);
        setAccuracyRate(d.accuracyRate ?? null);
        setTrend(d.trend || []);
        setPlatformStats(d.platformStats || {});
        setCategoryStats(d.categoryStats || {});
        setLastChecked(d.lastChecked || null);
      })
      .catch(() => { setFacts([]); setIssues([]); });
  }, [brand]);

  function addFact() {
    if (!factKey.trim() || !factValue.trim() || !brand) return;
    const updated = [...facts, { key: factKey.trim(), value: factValue.trim(), category: factCategory }];
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => { setFacts(updated); setFactKey(''); setFactValue(''); });
  }

  function removeFact(idx: number) {
    if (!brand) return;
    const updated = facts.filter((_, i) => i !== idx);
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => setFacts(updated));
  }

  function checkNow() {
    if (!brand || checking) return;
    setChecking(true);
    setCheckMessage(null);
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check' }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => {
      if (d.error) {
        setCheckMessage(d.error);
        return;
      }
      // Always update data when present
      setIssues(d.issues || []);
      setAccuracyRate(d.accuracyRate ?? null);
      if (d.platformStats) setPlatformStats(d.platformStats);
      if (d.categoryStats) setCategoryStats(d.categoryStats);
      setCheckedRuns(d.checkedRuns || 0);
      setLastChecked(new Date().toISOString());
      setActiveTab('issues');
      // Show message from API or generate a summary
      if (d.message) {
        setCheckMessage(d.message);
      } else if (d.checkedRuns > 0) {
        setCheckMessage(`AI analyzed ${d.checkedRuns} response${d.checkedRuns > 1 ? 's' : ''} against ${facts.length} fact${facts.length > 1 ? 's' : ''} — found ${(d.issues || []).length} issue${(d.issues || []).length !== 1 ? 's' : ''}`);
      }
    }).catch((err) => {
      console.error('[Accuracy Check]', err);
      setCheckMessage('Failed to run accuracy check. Please try again.');
    }).finally(() => setChecking(false));
  }

  function autoDiscover() {
    if (!brand || discovering) return;
    setDiscovering(true);
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto-discover' }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => {
      if (d.error && (!d.suggestedFacts || d.suggestedFacts.length === 0)) {
        setCheckMessage(d.error);
      } else {
        const suggestions = (d.suggestedFacts || []) as SuggestedFact[];
        // Filter out facts that already exist
        const existingKeys = new Set(facts.map(f => f.key));
        const newSuggestions = suggestions.filter(s => !existingKeys.has(s.key));
        setSuggestedFacts(newSuggestions);
        if (newSuggestions.length === 0 && suggestions.length > 0) {
          setCheckMessage('All discovered facts already exist in your canonical facts.');
        }
      }
    }).catch(() => {
      setCheckMessage('Failed to auto-discover facts. Please try again.');
    }).finally(() => setDiscovering(false));
  }

  function acceptFact(sf: SuggestedFact) {
    if (!brand) return;
    const updated = [...facts, { key: sf.key, value: sf.value, category: sf.category }];
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => {
      setFacts(updated);
      setSuggestedFacts(prev => prev.filter(f => f.key !== sf.key));
    });
  }

  function acceptAllFacts() {
    if (!brand || suggestedFacts.length === 0) return;
    const updated = [...facts, ...suggestedFacts.map(sf => ({ key: sf.key, value: sf.value, category: sf.category }))];
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => {
      setFacts(updated);
      setSuggestedFacts([]);
    });
  }

  function dismissFact(key: string) {
    setSuggestedFacts(prev => prev.filter(f => f.key !== key));
  }

  // Derived data
  const platformAccuracy = useMemo(() => {
    return Object.entries(platformStats).map(([name, stat]) => ({
      name,
      rate: stat.total > 0 ? Math.round((stat.accurate / stat.total) * 100) : 100,
    })).sort((a, b) => b.rate - a.rate);
  }, [platformStats]);

  const categoryAccuracy = useMemo(() => {
    return Object.entries(categoryStats).map(([name, stat]) => ({
      name,
      rate: stat.total > 0 ? Math.round((stat.accurate / stat.total) * 100) : 100,
    })).sort((a, b) => a.rate - b.rate);
  }, [categoryStats]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Accuracy Monitor
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 100,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))',
              color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              AI-Powered
            </span>
          </div>
          <div className="view-sub">Uses AI to analyze actual responses from AI platforms against your canonical facts.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {brands.length > 1 && (
            <select
              className="finp"
              value={brand?.id || ''}
              onChange={e => setBrand(brands.find(b => b.id === e.target.value) || null)}
              style={{ margin: 0, fontSize: 11 }}
            >
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button className="pbtn" onClick={checkNow} disabled={checking}
            style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700, opacity: checking ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {checking ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                Analyzing...
              </span>
            ) : 'Check Now'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {checkMessage && (
        <div style={{
          padding: '8px 14px', marginBottom: 12, borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)',
          background: checkMessage.includes('Failed') || checkMessage.includes('No ') ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
          color: checkMessage.includes('Failed') || checkMessage.includes('No ') ? 'var(--red)' : 'var(--green)',
          border: `1px solid ${checkMessage.includes('Failed') || checkMessage.includes('No ') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{checkMessage}</span>
          <button onClick={() => setCheckMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
        </div>
      )}

      {/* Canonical Facts Section */}
      <div style={{ padding: '16px 20px' }}>
        {/* Fact Coverage Indicator */}
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
          <FactCoverage facts={facts} />
        </div>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
          Define what&apos;s true about your brand. We&apos;ll check if AI gets it right.
        </div>

        {facts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>
            No facts defined yet. Add your brand&apos;s canonical facts below (e.g. founded year, pricing, phone number) to check AI accuracy.
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{f.key}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{f.value}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 4 }}>{f.category}</span>
                <button onClick={() => removeFact(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add Fact Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
          <div>
            <label className="flbl">Fact Key</label>
            <input className="finp" placeholder="e.g. founded_year" value={factKey} onChange={e => setFactKey(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div>
            <label className="flbl">Fact Value</label>
            <input className="finp" placeholder="e.g. 2009" value={factValue} onChange={e => setFactValue(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div>
            <label className="flbl">Category</label>
            <select className="finp" value={factCategory} onChange={e => setFactCategory(e.target.value)} style={{ margin: 0 }}>
              <option value="general">General</option>
              <option value="pricing">Pricing</option>
              <option value="features">Features</option>
              <option value="company">Company</option>
            </select>
          </div>
          <button className="pbtn" onClick={addFact} style={{ fontWeight: 700 }}>Add</button>
        </div>
      </div>

      {/* KPI Cards — 4 score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: accuracyRate != null ? (accuracyRate >= 80 ? 'var(--green)' : accuracyRate >= 50 ? 'var(--amber)' : 'var(--red)') : 'var(--muted)' }}>
            {accuracyRate != null ? `${accuracyRate}%` : '—'}
          </div>
          <div className="score-label">Accuracy Rate</div>
          {trend.length >= 2 && (
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', marginTop: 4, color: trend[trend.length - 1].rate >= trend[trend.length - 2].rate ? 'var(--green)' : 'var(--red)' }}>
              {trend[trend.length - 1].rate >= trend[trend.length - 2].rate ? '↑' : '↓'} vs prev
            </div>
          )}
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: issues.length > 0 ? 'var(--red)' : 'var(--green)' }}>{issues.length}</div>
          <div className="score-label">Inaccuracies Found</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: 'var(--green)' }}>{facts.length}</div>
          <div className="score-label">Claims Verified</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 13, fontWeight: 600, color: lastChecked ? 'var(--text)' : 'var(--muted)' }}>
            {lastChecked ? new Date(lastChecked).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
          </div>
          <div className="score-label">Last Checked</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Accuracy Trend */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title">Accuracy Trend</div>
          <TrendChart data={trend} />
        </div>

        {/* Right column: Severity + Platform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Severity Distribution */}
          <div className="card" style={{ padding: '16px 20px', flex: 1 }}>
            <div className="section-title">Severity Distribution</div>
            <SeverityDonut issues={issues} />
          </div>
        </div>
      </div>

      {/* Platform + Category Breakdown Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Platform Breakdown */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title">Platform Accuracy</div>
          {platformAccuracy.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>
              Run accuracy checks to see platform-level breakdowns.
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {platformAccuracy.map(p => (
                <HBar key={p.name} label={p.name} value={p.rate} max={100}
                  color={p.rate >= 80 ? 'var(--green)' : p.rate >= 50 ? 'var(--amber)' : 'var(--red)'} />
              ))}
            </div>
          )}
        </div>

        {/* Category Accuracy */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title">Category Accuracy</div>
          {categoryAccuracy.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>
              Add facts across categories and run checks to see category-level accuracy.
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {categoryAccuracy.map(c => (
                <HBar key={c.name} label={c.name} value={c.rate} max={100}
                  color={c.rate >= 80 ? 'var(--green)' : c.rate >= 50 ? 'var(--amber)' : 'var(--red)'} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabbed Section: Issues / Facts */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('issues')}
            style={{
              flex: 1, padding: '12px 16px', border: 'none', cursor: 'pointer', fontSize: 11,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: activeTab === 'issues' ? 'var(--primary)' : 'var(--muted)',
              background: activeTab === 'issues' ? 'var(--bg)' : 'var(--bg3)',
              borderBottom: activeTab === 'issues' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            Recent Issues ({issues.length})
          </button>
        </div>

        {/* Issues Tab */}
        {activeTab === 'issues' && (
          <div style={{ padding: '16px 20px' }}>
            {issues.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 12 }}>
                {facts.length === 0 ? (
                  <>Add your brand&apos;s canonical facts above, then click <strong>&quot;Check Now&quot;</strong> to verify AI accuracy.</>
                ) : accuracyRate !== null ? (
                  <>All facts verified accurately across AI platforms. No issues found.</>
                ) : (
                  <>Click <strong>&quot;Check Now&quot;</strong> to analyze AI responses against your {facts.length} canonical fact{facts.length !== 1 ? 's' : ''}.</>
                )}
              </div>
            ) : (
              <div>
                {checkedRuns > 0 && (
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 12, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 4 }}>
                    AI analyzed {checkedRuns} response{checkedRuns > 1 ? 's' : ''} across {Object.keys(platformStats).length} platform{Object.keys(platformStats).length !== 1 ? 's' : ''}
                  </div>
                )}
                {issues.map((issue, i) => (
                  <div key={i} style={{ borderBottom: i < issues.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div
                      onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', cursor: 'pointer' }}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', flexShrink: 0,
                        color: issue.severity === 'high' || issue.severity === 'critical' ? 'var(--red)' : issue.severity === 'medium' ? 'var(--amber)' : 'var(--blue)',
                        background: issue.severity === 'high' || issue.severity === 'critical' ? 'rgba(239,68,68,.08)' : issue.severity === 'medium' ? 'rgba(245,158,11,.08)' : 'rgba(59,130,246,.08)',
                      }}>
                        {issue.severity}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{issue.fact_key}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Expected: <strong style={{ color: 'var(--green)' }}>{issue.expected}</strong> · Found: <strong style={{ color: 'var(--red)' }}>{issue.found}</strong>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ padding: '1px 5px', background: 'var(--bg3)', borderRadius: 3 }}>{issue.platform}</span>
                          {issue.model && <span style={{ padding: '1px 5px', background: 'var(--bg3)', borderRadius: 3 }}>{issue.model}</span>}
                          {issue.date && <span>{new Date(issue.date).toLocaleDateString()}</span>}
                          {issue.category && <span style={{ textTransform: 'capitalize' }}>{issue.category}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginTop: 2 }}>
                        {expandedIssue === i ? '▼' : '▶'}
                      </span>
                    </div>
                    {/* Expanded explanation */}
                    {expandedIssue === i && issue.explanation && (
                      <div style={{
                        margin: '0 0 12px 32px', padding: '10px 14px', borderRadius: 6,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))',
                        border: '1px solid rgba(124,58,237,0.1)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', color: '#7c3aed', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
                          AI Analysis
                        </div>
                        {issue.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Facts Tab */}
        {activeTab === 'facts' && (
          <div style={{ padding: '16px 20px' }}>
            {/* Fact Coverage Indicator */}
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
              <FactCoverage facts={facts} />
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
              Define what&apos;s true about your brand. We&apos;ll check if AI gets it right.
            </div>

            {/* AI Suggested Facts Panel */}
            {(suggestedFacts.length > 0 || discovering) && (
              <div style={{
                marginBottom: 16, padding: 14, borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))',
                border: '1px solid rgba(124,58,237,0.15)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 100,
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))',
                      color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      AI-Suggested
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {suggestedFacts.length} fact{suggestedFacts.length !== 1 ? 's' : ''} discovered
                    </span>
                  </div>
                  {suggestedFacts.length > 1 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={acceptAllFacts} className="pbtn" style={{ fontWeight: 700, fontSize: 10, padding: '4px 10px', background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>
                        Add All
                      </button>
                      <button onClick={() => setSuggestedFacts([])} className="pbtn" style={{ fontWeight: 700, fontSize: 10, padding: '4px 10px' }}>
                        Dismiss All
                      </button>
                    </div>
                  )}
                </div>

                {discovering ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, color: '#7c3aed', fontSize: 12 }}>
                    <span style={{ width: 14, height: 14, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    AI is analyzing your brand...
                  </div>
                ) : (
                  <div>
                    {suggestedFacts.map((sf) => (
                      <div key={sf.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid rgba(124,58,237,0.08)' }}>
                        {/* Confidence dot */}
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: sf.confidence === 'high' ? 'var(--green)' : sf.confidence === 'medium' ? 'var(--amber)' : 'var(--red)',
                        }} title={`${sf.confidence} confidence`} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 110 }}>{sf.key}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{sf.value}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '2px 6px', background: 'var(--bg3)', borderRadius: 4, textTransform: 'capitalize' }}>{sf.category}</span>
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          color: sf.source === 'website' ? '#3b82f6' : '#7c3aed',
                          background: sf.source === 'website' ? 'rgba(59,130,246,0.08)' : 'rgba(124,58,237,0.08)',
                        }}>
                          {sf.source === 'website' ? 'Website' : 'AI Responses'}
                        </span>
                        <button onClick={() => acceptFact(sf)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '2px 4px' }} title="Add fact">+</button>
                        <button onClick={() => dismissFact(sf.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }} title="Dismiss">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {facts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>
                No facts defined yet. Add your brand&apos;s canonical facts below or use <strong>Auto-Discover</strong> to let AI find them for you.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {facts.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{f.key}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{f.value}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 4 }}>{f.category}</span>
                    <button onClick={() => removeFact(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Fact Form */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
              <div>
                <label className="flbl">Fact Key</label>
                <input className="finp" placeholder="e.g. founded_year" value={factKey} onChange={e => setFactKey(e.target.value)} style={{ margin: 0 }} />
              </div>
              <div>
                <label className="flbl">Fact Value</label>
                <input className="finp" placeholder="e.g. 2009" value={factValue} onChange={e => setFactValue(e.target.value)} style={{ margin: 0 }} />
              </div>
              <div>
                <label className="flbl">Category</label>
                <select className="finp" value={factCategory} onChange={e => setFactCategory(e.target.value)} style={{ margin: 0 }}>
                  <option value="general">General</option>
                  <option value="pricing">Pricing</option>
                  <option value="features">Features</option>
                  <option value="company">Company</option>
                </select>
              </div>
              <button className="pbtn" onClick={addFact} style={{ fontWeight: 700 }}>Add</button>
              <button className="pbtn" onClick={autoDiscover} disabled={discovering}
                style={{
                  fontWeight: 700, whiteSpace: 'nowrap',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))',
                  color: '#7c3aed', borderColor: 'rgba(124,58,237,0.25)',
                  opacity: discovering ? 0.6 : 1,
                }}>
                {discovering ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    Discovering...
                  </span>
                ) : 'Auto-Discover'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
