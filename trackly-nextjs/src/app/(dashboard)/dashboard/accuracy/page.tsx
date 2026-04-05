'use client';

import { useState, useEffect, useMemo } from 'react';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { useToast } from '@/components/dashboard/Toast';
import { useBrandData } from '@/hooks/useBrandData';


interface Brand { id: string; name: string; }
interface Fact { key: string; value: string; category: string; }
interface SuggestedFact { key: string; value: string; category: string; source: 'website' | 'ai_responses'; confidence: 'high' | 'medium' | 'low'; }
interface Issue { id?: number; platform: string; model?: string; fact_key: string; expected: string; found: string; severity: string; date?: string; category?: string; explanation?: string; run_id?: string; source_url?: string; query?: string; count?: number; fixed?: boolean; fixed_at?: string; }
interface TrendPoint { date: string; rate: number; }
interface PlatformStat { total: number; accurate: number; }
interface CategoryStat { total: number; accurate: number; }

// ── Mini SVG Line Chart ──────────────────────────────────────────
function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 16 }}>
        <div style={{ fontSize: 28, opacity: 0.4 }}>📉</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Not Enough Data</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>Run more checks to see accuracy trends over time.</div>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 16 }}>
        <div style={{ fontSize: 28, opacity: 0.4 }}>✓</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>No Issues Detected</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>All accuracy checks passed.</div>
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
              fontSize: 11, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 4,
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
  const { brand: rawBrand, brands, loading } = useBrandData();
  const brand = rawBrand as Brand | null;

  const { toast } = useToast();
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
  // activeTab removed — facts now in prominent card above, issues shown directly
  const [checkedRuns, setCheckedRuns] = useState(0);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [suggestedFacts, setSuggestedFacts] = useState<SuggestedFact[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [hideFixed, setHideFixed] = useState(true);
  const [sortBy, setSortBy] = useState<'severity' | 'date' | 'platform'>('severity');
  const [reverifying, setReverifying] = useState<number | null>(null);

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
    setCheckMessage(null);
    toast('Auto-discovering facts... This may take a moment.', 'info');
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto-discover' }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => {
      if (d.error && (!d.suggestedFacts || d.suggestedFacts.length === 0)) {
        toast(d.error, 'error');
        setCheckMessage(d.error);
        return;
      }
      const suggestions = (d.suggestedFacts || []) as SuggestedFact[];
      const existingKeys = new Set(facts.map(f => f.key));
      const newSuggestions = suggestions.filter(s => !existingKeys.has(s.key));
      setSuggestedFacts(newSuggestions);
      if (newSuggestions.length === 0 && suggestions.length > 0) {
        toast('All discovered facts already exist.', 'info');
      } else if (newSuggestions.length > 0) {
        toast(`Discovered ${newSuggestions.length} new fact${newSuggestions.length !== 1 ? 's' : ''}! Review them below.`);
      } else {
        toast('No facts could be discovered. Try adding a website URL to your brand or running more queries first.', 'error');
      }
    }).catch((err) => {
      console.error('[AutoDiscover]', err);
      toast('Failed to auto-discover facts. Please try again.', 'error');
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

  function toggleFixed(issue: Issue) {
    if (!brand || issue.id == null) return;
    fetch(`/api/brands/${brand.id}/accuracy/issues/${issue.id}`, {
      method: 'PATCH', credentials: 'include',
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => {
      setIssues(prev => prev.map(iss =>
        iss.id === issue.id ? { ...iss, fixed: d.fixed, fixed_at: d.fixed_at } : iss
      ));
    }).catch(err => console.error('[ToggleFixed]', err));
  }

  function reverifyIssue(issue: Issue) {
    if (!brand || issue.id == null || reverifying !== null) return;
    setReverifying(issue.id);
    fetch(`/api/brands/${brand.id}/accuracy/reverify`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: issue.platform, query: issue.query, factKey: issue.fact_key?.replace(/\s*\([^)]*\)\s*$/, '') }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => {
      if (d.stillInaccurate) {
        // Issue returned — unfix it
        setIssues(prev => prev.map(iss =>
          iss.id === issue.id ? { ...iss, fixed: false, fixed_at: undefined, found: d.found || iss.found, explanation: d.explanation || iss.explanation } : iss
        ));
        toast('Issue still present — marked as unfixed.', 'error');
      } else {
        toast('Verified — issue is fixed!');
      }
    }).catch(() => toast('Re-verify failed. Try again.', 'error'))
      .finally(() => setReverifying(null));
  }

  // Build lookup from canonical facts to resolve expected values on the frontend
  const expectedLookup = useMemo(() => {
    const normalize = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_').trim();
    const map = new Map<string, string>();
    for (const f of facts) {
      map.set(f.key, f.value);
      map.set(normalize(f.key), f.value);
    }
    return map;
  }, [facts]);

  function getExpected(issue: Issue): string {
    if (issue.expected) return issue.expected;
    const normalize = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_').trim();
    // Strip category suffix like "(company)" from fact_key before lookup
    const baseKey = issue.fact_key.replace(/\s*\([^)]*\)\s*$/, '');
    return expectedLookup.get(baseKey) || expectedLookup.get(normalize(baseKey)) || '';
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

  // Filter, sort, and derive issue data
  const filteredIssues = useMemo(() => {
    let filtered = issues;
    if (hideFixed) filtered = filtered.filter(i => !i.fixed);
    if (filterPlatform !== 'All') filtered = filtered.filter(i => i.platform === filterPlatform);
    if (filterSeverity !== 'All') filtered = filtered.filter(i => i.severity === filterSeverity.toLowerCase());
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sortBy === 'severity') filtered = [...filtered].sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4));
    else if (sortBy === 'date') filtered = [...filtered].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    else if (sortBy === 'platform') filtered = [...filtered].sort((a, b) => a.platform.localeCompare(b.platform));
    return filtered;
  }, [issues, hideFixed, filterPlatform, filterSeverity, sortBy]);

  const issueSummary = useMemo(() => {
    const s = { total: issues.length, critical: 0, high: 0, medium: 0, low: 0, fixed: 0 };
    for (const i of issues) {
      if (i.fixed) s.fixed++;
      if (i.severity === 'critical') s.critical++;
      else if (i.severity === 'high') s.high++;
      else if (i.severity === 'medium') s.medium++;
      else if (i.severity === 'low') s.low++;
    }
    return s;
  }, [issues]);

  const allPlatforms = useMemo(() => [...new Set(issues.map(i => i.platform))].sort(), [issues]);

  // Per-fact accuracy breakdown
  const factBreakdown = useMemo(() => {
    const map = new Map<string, { factKey: string; wrongPlatforms: Set<string>; totalPlatforms: Set<string> }>();
    for (const issue of issues) {
      const key = issue.fact_key?.replace(/\s*\([^)]*\)\s*$/, '') || issue.fact_key;
      if (!map.has(key)) map.set(key, { factKey: key, wrongPlatforms: new Set(), totalPlatforms: new Set() });
      const entry = map.get(key)!;
      if (!issue.fixed) entry.wrongPlatforms.add(issue.platform);
      entry.totalPlatforms.add(issue.platform);
    }
    // Also add platforms that were checked (from platformStats) to totalPlatforms
    const checkedPlatforms = Object.keys(platformStats);
    for (const entry of map.values()) {
      for (const p of checkedPlatforms) entry.totalPlatforms.add(p);
    }
    return [...map.values()].sort((a, b) => b.wrongPlatforms.size - a.wrongPlatforms.size);
  }, [issues, platformStats]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  return (
    <div>
      <LockedBrandBanner />
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

      {/* KPI Cards — 4 score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: accuracyRate != null ? (accuracyRate >= 80 ? 'var(--green)' : accuracyRate >= 50 ? 'var(--amber)' : 'var(--red)') : 'var(--muted)' }}>
            {accuracyRate != null ? `${accuracyRate}%` : '—'}
          </div>
          <div className="score-label">Accuracy Rate</div>
          {accuracyRate != null && trend.length >= 2 && (
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', marginTop: 4, color: trend[trend.length - 1].rate >= trend[trend.length - 2].rate ? 'var(--green)' : 'var(--red)' }}>
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

      {/* ── Brand Facts (prominent) ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--app-shadow)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Your Brand Facts</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Define what&apos;s true about your brand — AI accuracy is checked against these.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={autoDiscover} disabled={discovering}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', cursor: discovering ? 'not-allowed' : 'pointer', border: '1px solid rgba(124,58,237,0.25)', background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06))', color: '#7c3aed', opacity: discovering ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'opacity .15s' }}>
              {discovering ? (
                <><span style={{ width: 12, height: 12, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />Discovering...</>
              ) : '✦ Auto-Discover'}
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 22px' }}>
          {/* Discovering spinner */}
          {discovering && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', marginBottom: 16, borderRadius: 8, background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))', border: '1px solid rgba(124,58,237,0.15)' }}>
              <span style={{ width: 16, height: 16, border: '2.5px solid rgba(124,58,237,0.25)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>AI is analyzing your brand to discover facts...</span>
            </div>
          )}
          {/* Add Fact Form — inline */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Fact Key</label>
              <input placeholder="e.g. founded_year" value={factKey} onChange={e => setFactKey(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Fact Value</label>
              <input placeholder="e.g. 2009" value={factValue} onChange={e => setFactValue(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            </div>
            <div style={{ minWidth: 100 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Category</label>
              <select value={factCategory} onChange={e => setFactCategory(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', cursor: 'pointer' }}>
                <option value="general">General</option>
                <option value="pricing">Pricing</option>
                <option value="features">Features</option>
                <option value="company">Company</option>
              </select>
            </div>
            <button onClick={addFact}
              style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'opacity .15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Add Fact</button>
          </div>

          {/* AI Suggested Facts (if any) */}
          {suggestedFacts.length > 0 && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))', border: '1px solid rgba(124,58,237,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>✦ {suggestedFacts.length} AI-suggested fact{suggestedFacts.length !== 1 ? 's' : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={acceptAllFacts} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>Add All</button>
                  <button onClick={() => setSuggestedFacts([])} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Dismiss</button>
                </div>
              </div>
              {suggestedFacts.map(sf => (
                <div key={sf.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(124,58,237,0.08)', fontSize: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: sf.confidence === 'high' ? 'var(--green)' : sf.confidence === 'medium' ? 'var(--amber)' : 'var(--red)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>{sf.key}</span>
                  <span style={{ color: 'var(--muted)', flex: 1 }}>{sf.value}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '1px 6px', background: 'var(--bg3)', borderRadius: 4 }}>{sf.category}</span>
                  <button onClick={() => acceptFact(sf)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 4px' }}>+</button>
                  <button onClick={() => dismissFact(sf.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Fact Coverage */}
          {facts.length > 0 && (
            <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg3)', borderRadius: 6 }}>
              <FactCoverage facts={facts} />
            </div>
          )}

          {/* Existing Facts List */}
          {facts.length > 0 ? (
            <div>
              {facts.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < facts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{f.key}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>{f.value}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 4 }}>{f.category}</span>
                  <button onClick={() => removeFact(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: 12 }}>
              No facts yet. Add your brand&apos;s facts above or click <strong>Auto-Discover</strong> to let AI find them.
            </div>
          )}
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
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title">Platform Accuracy</div>
          {platformAccuracy.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>Run accuracy checks to see platform-level breakdowns.</div>
          ) : (
            <div style={{ marginTop: 8 }}>{platformAccuracy.map(p => (
              <HBar key={p.name} label={p.name} value={p.rate} max={100} color={p.rate >= 80 ? 'var(--green)' : p.rate >= 50 ? 'var(--amber)' : 'var(--red)'} />
            ))}</div>
          )}
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title">Category Accuracy</div>
          {categoryAccuracy.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>Add facts across categories and run checks to see category-level accuracy.</div>
          ) : (
            <div style={{ marginTop: 8 }}>{categoryAccuracy.map(c => (
              <HBar key={c.name} label={c.name} value={c.rate} max={100} color={c.rate >= 80 ? 'var(--green)' : c.rate >= 50 ? 'var(--amber)' : 'var(--red)'} />
            ))}</div>
          )}
        </div>
      </div>

      {/* ── Improvement 4: Per-Fact Accuracy Breakdown ── */}
      {factBreakdown.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 14 }}>
          <div className="section-title">Fact Accuracy Breakdown</div>
          <div style={{ marginTop: 8 }}>
            {factBreakdown.map(fb => {
              const wrong = fb.wrongPlatforms.size;
              const total = fb.totalPlatforms.size;
              const pct = total > 0 ? wrong / total : 0;
              const dotColor = pct > 0.5 ? 'var(--red)' : pct > 0 ? 'var(--amber)' : 'var(--green)';
              return (
                <div key={fb.factKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)', minWidth: 140 }}>{fb.factKey}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{wrong}/{total} platform{total !== 1 ? 's' : ''} incorrect</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[...fb.totalPlatforms].map(p => (
                      <span key={p} style={{ width: 6, height: 6, borderRadius: '50%', background: fb.wrongPlatforms.has(p) ? 'var(--red)' : 'var(--green)' }} title={p} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Issues ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* ── Improvement 6: Summary Bar ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)' }}>
              Recent Issues ({issues.length})
            </span>
            {issues.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--mono)' }}>
                {issueSummary.critical > 0 && <span style={{ color: '#dc2626' }}>{issueSummary.critical} Critical</span>}
                {issueSummary.high > 0 && <span style={{ color: '#ef4444' }}>{issueSummary.high} High</span>}
                {issueSummary.medium > 0 && <span style={{ color: '#f59e0b' }}>{issueSummary.medium} Medium</span>}
                {issueSummary.low > 0 && <span style={{ color: '#3b82f6' }}>{issueSummary.low} Low</span>}
                {issueSummary.fixed > 0 && <span style={{ color: 'var(--green)' }}>{issueSummary.fixed} Fixed</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Improvement 3: Filter & Sort Toolbar ── */}
        {issues.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--bg)' }}>
            {/* Platform filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['All', ...allPlatforms].map(p => (
                <button key={p} onClick={() => setFilterPlatform(p)} style={{
                  padding: '3px 10px', borderRadius: 100, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
                  cursor: 'pointer', border: '1px solid', transition: 'all .15s',
                  ...(filterPlatform === p
                    ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', color: '#7c3aed', borderColor: 'rgba(124,58,237,0.3)' }
                    : { background: 'var(--bg)', color: 'var(--muted)', borderColor: 'var(--border)' }),
                }}>{p}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {/* Severity filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['All', 'Critical', 'High', 'Medium', 'Low'].map(s => (
                <button key={s} onClick={() => setFilterSeverity(s)} style={{
                  padding: '3px 10px', borderRadius: 100, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
                  cursor: 'pointer', border: '1px solid', transition: 'all .15s',
                  ...(filterSeverity === s
                    ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', color: '#7c3aed', borderColor: 'rgba(124,58,237,0.3)' }
                    : { background: 'var(--bg)', color: 'var(--muted)', borderColor: 'var(--border)' }),
                }}>{s}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {/* Hide Fixed toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--mono)' }}>
              <span onClick={() => setHideFixed(!hideFixed)} style={{
                width: 28, height: 16, borderRadius: 8, background: hideFixed ? '#7c3aed' : 'var(--bg3)',
                position: 'relative', transition: 'background .15s', display: 'inline-block', cursor: 'pointer',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: hideFixed ? 14 : 2, width: 12, height: 12,
                  borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </span>
              Hide Fixed
            </label>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
              background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
            }}>
              <option value="severity">By Severity</option>
              <option value="date">By Date</option>
              <option value="platform">By Platform</option>
            </select>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
              Showing {filteredIssues.length} of {issues.length}
            </span>
          </div>
        )}

        <div style={{ padding: '16px 20px' }}>
          {issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 12 }}>
              {facts.length === 0 ? (
                <>Add your brand&apos;s facts in the card above, then click <strong>&quot;Check Now&quot;</strong> to verify AI accuracy.</>
              ) : accuracyRate !== null ? (
                <>All facts verified accurately across AI platforms. No issues found.</>
              ) : (
                <>Click <strong>&quot;Check Now&quot;</strong> to analyze AI responses against your {facts.length} canonical fact{facts.length !== 1 ? 's' : ''}.</>
              )}
            </div>
          ) : filteredIssues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>
              No issues match the current filters.
            </div>
          ) : (
            <div>
              {filteredIssues.map((issue, i) => (
                <div key={issue.id ?? i} style={{ borderBottom: i < filteredIssues.length - 1 ? '1px solid var(--border)' : 'none', opacity: issue.fixed ? 0.55 : 1 }}>
                  <div
                    onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', cursor: 'pointer' }}
                  >
                    {issue.fixed ? (
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', flexShrink: 0, color: 'var(--green)', background: 'rgba(34,197,94,0.08)' }}>FIXED</span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase', flexShrink: 0,
                        color: issue.severity === 'high' || issue.severity === 'critical' ? 'var(--red)' : issue.severity === 'medium' ? 'var(--amber)' : 'var(--blue)',
                        background: issue.severity === 'high' || issue.severity === 'critical' ? 'rgba(239,68,68,.08)' : issue.severity === 'medium' ? 'rgba(245,158,11,.08)' : 'rgba(59,130,246,.08)',
                      }}>
                        {issue.severity}
                      </span>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, textDecoration: issue.fixed ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {issue.fact_key}
                        {(issue.count ?? 1) > 1 && (
                          <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: 100, background: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.15)' }}>
                            ×{issue.count}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Expected: <strong style={{ color: 'var(--green)' }}>{getExpected(issue) || '(not set)'}</strong> · Found: <strong style={{ color: issue.fixed ? 'var(--muted)' : 'var(--red)' }}>{issue.found}</strong>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ padding: '1px 5px', background: 'var(--bg3)', borderRadius: 3 }}>{issue.platform}</span>
                        {issue.model && <span style={{ padding: '1px 5px', background: 'var(--bg3)', borderRadius: 3 }}>{issue.model}</span>}
                        {issue.date && <span>{new Date(issue.date).toLocaleDateString()}</span>}
                        {issue.category && <span style={{ textTransform: 'capitalize' }}>{issue.category}</span>}
                        {issue.source_url && (() => {
                          const isSearchUrl = issue.source_url.includes('/search?q=') || issue.source_url.includes('/?q=') || issue.source_url.includes('/new?q=') || issue.source_url.includes('/app?q=') || issue.source_url.includes('?text=');
                          let hostname = '';
                          try { hostname = new URL(issue.source_url).hostname.replace(/^www\./, ''); } catch { /* */ }
                          return (
                            <a href={issue.source_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ padding: '1px 5px', background: 'rgba(59,130,246,0.08)', borderRadius: 3, color: 'var(--blue)', textDecoration: 'none', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}
                              title={issue.source_url}>
                              {isSearchUrl ? `Verify on ${issue.platform} ↗` : `${hostname} ↗`}
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                    {/* ── Improvement 5: Mark Fixed + Re-verify buttons ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2 }}>
                      {issue.id != null ? (
                        <>
                          <button onClick={e => { e.stopPropagation(); toggleFixed(issue); }} style={{
                            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)',
                            cursor: 'pointer', border: '1px solid', transition: 'all .15s',
                            ...(issue.fixed
                              ? { background: 'rgba(34,197,94,0.08)', color: 'var(--green)', borderColor: 'rgba(34,197,94,0.2)' }
                              : { background: 'var(--bg3)', color: 'var(--muted)', borderColor: 'var(--border)' }),
                          }}>
                            {issue.fixed ? 'Marked Fixed ✓' : 'Mark as Fixed'}
                          </button>
                          {issue.fixed && (
                            <button onClick={e => { e.stopPropagation(); reverifyIssue(issue); }}
                              disabled={reverifying === issue.id}
                              style={{
                                padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
                                cursor: reverifying === issue.id ? 'not-allowed' : 'pointer', border: '1px solid rgba(124,58,237,0.2)',
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06))', color: '#7c3aed',
                                opacity: reverifying === issue.id ? 0.6 : 1, transition: 'opacity .15s',
                              }}>
                              {reverifying === issue.id ? '...' : 'Re-verify ↻'}
                            </button>
                          )}
                        </>
                      ) : null}
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{expandedIssue === i ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  {expandedIssue === i && (issue.explanation || issue.query) && (
                    <div style={{
                      margin: '0 0 12px 32px', padding: '10px 14px', borderRadius: 6,
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))',
                      border: '1px solid rgba(124,58,237,0.1)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
                    }}>
                      {issue.query && (
                        <div style={{ marginBottom: issue.explanation ? 10 : 0 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>Query Asked</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', padding: '6px 10px', background: 'var(--bg3)', borderRadius: 4 }}>{issue.query}</div>
                        </div>
                      )}
                      {issue.explanation && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', color: '#7c3aed', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>AI Analysis</div>
                          {issue.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
