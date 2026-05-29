'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { useToast } from '@/components/dashboard/Toast';
import { useBrandData } from '@/hooks/useBrandData';
import { safeExternalUrl } from '@/lib/sanitize';
import { Card, KPIRail, Badge, Bar, PageHead, PlatformTile, PLATFORMS, type Platform } from '@/app/dashboard-v2/ui';

interface Brand { id: string; name: string; }
interface Fact { key: string; value: string; category: string; }
interface SuggestedFact { key: string; value: string; category: string; confidence: 'high' | 'medium' | 'low'; }
interface Issue { id?: number; platform: string; model?: string; fact_key: string; expected: string; found: string; severity: string; date?: string; category?: string; explanation?: string; source_url?: string; query?: string; count?: number; fixed?: boolean; fixed_at?: string; }
interface TrendPoint { date: string; rate: number; }
interface PlatformStat { total: number; accurate: number; }
interface CategoryStat { total: number; accurate: number; }

const SEVERITY_COLORS: Record<string, string> = { critical: '#dc2626', high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
const ACCENT_PURPLE = '#7c3aed';
const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_').trim();
const stripCategorySuffix = (k: string) => k.replace(/\s*\([^)]*\)\s*$/, '');
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABELS = ['All', 'Critical', 'High', 'Medium', 'Low'];
const rateColor = (rate: number) => rate >= 80 ? 'var(--green)' : rate >= 50 ? 'var(--amber)' : 'var(--red)';
const ACCENT_GRADIENT = 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06))';
const ACCENT_GRADIENT_BOLD = 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))';
const ACCENT_GRADIENT_SUBTLE = 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(168,85,247,0.04))';

const filterPillStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '3px 10px', borderRadius: 100, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
  cursor: 'pointer', border: '1px solid', transition: 'all .15s',
  ...(isActive
    ? { background: ACCENT_GRADIENT_BOLD, color: ACCENT_PURPLE, borderColor: 'rgba(124,58,237,0.3)' }
    : { background: 'var(--bg)', color: 'var(--muted)', borderColor: 'var(--border)' }),
});

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

  const chartWidth = 460, chartHeight = 140, chartPadX = 36, chartPadY = 16;
  const minR = Math.min(...data.map(d => d.rate));
  const maxR = Math.max(...data.map(d => d.rate));
  const yMin = Math.max(0, minR - 5);
  const yMax = Math.min(100, maxR + 5);
  const yRange = yMax - yMin || 10;

  const points = data.map((d, i) => {
    const x = chartPadX + (i / (data.length - 1)) * (chartWidth - chartPadX * 2);
    const y = chartPadY + (1 - (d.rate - yMin) / yRange) * (chartHeight - chartPadY * 2);
    return { x, y, ...d };
  });

  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${points[0].x},${chartHeight - chartPadY} ${line} ${points[points.length - 1].x},${chartHeight - chartPadY}`;

  // Y-axis labels
  const yLabels = [yMin, Math.round((yMin + yMax) / 2), yMax];

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height={chartHeight} style={{ overflow: 'visible' }}>
      {/* Grid lines */}
      {yLabels.map(val => {
        const y = chartPadY + (1 - (val - yMin) / yRange) * (chartHeight - chartPadY * 2);
        return (
          <g key={val}>
            <line x1={chartPadX} y1={y} x2={chartWidth - chartPadX} y2={y} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={chartPadX - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="var(--mono)">{val}%</text>
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
          {/* X labels - show first, last, and middle */}
          {(i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
            <text x={p.x} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily="var(--mono)">
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
    const acc = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
      const sev = issue.severity as keyof typeof acc;
      if (sev in acc) acc[sev]++;
    }
    return acc;
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

  let cumulative = 0;
  const segments = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, val]) => {
      const start = cumulative;
      cumulative += (val / total) * 100;
      return { key, val, start, end: cumulative, color: SEVERITY_COLORS[key] };
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

function brandApi(brandId: string, path = '', method = 'GET', body?: unknown) {
  const opts: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return fetch(`/api/brands/${brandId}/accuracy${path}`, opts);
}

// ── Source URL Link (extracted from IIFE) ──────────────────────
function SourceUrlLink({ issue }: { issue: Issue }) {
  if (!issue.source_url) return null;
  // source_url comes from AI-citation output — never trust it as an
  // <a href>. A `javascript:`/`data:` URL would fire on click.
  const safeUrl = safeExternalUrl(issue.source_url, '');
  if (!safeUrl) return null;
  const isSearchUrl = safeUrl.includes('/search?q=') || safeUrl.includes('/?q=') || safeUrl.includes('/new?q=') || safeUrl.includes('/app?q=') || safeUrl.includes('?text=');
  let hostname = '';
  try { hostname = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch { /* */ }
  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{ padding: '1px 5px', background: 'rgba(59,130,246,0.08)', borderRadius: 3, color: 'var(--blue)', textDecoration: 'none', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}
      title={safeUrl}>
      {isSearchUrl ? `Verify on ${issue.platform} ↗` : `${hostname} ↗`}
    </a>
  );
}

// ── Resolve a raw platform name to a design-system Platform tile ──
function platformFor(name: string): Platform {
  const lc = (name || '').toLowerCase();
  const match = PLATFORMS.find(p => p.id === lc || p.name.toLowerCase() === lc || p.short.toLowerCase() === lc || lc.includes(p.id));
  if (match) return match;
  const short = (name || '?').slice(0, 3).toUpperCase();
  return { id: lc || 'unknown', name: name || 'Unknown', short, sov: 0, delta: 0, ok: true, ms: 0 };
}

// ── Main Page ───────────────────────────────────────────────────
export default function AccuracyPage() {
  const { brand: rawBrand, loading } = useBrandData();
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
  const [checkMessage, setCheckMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [suggestedFacts, setSuggestedFacts] = useState<SuggestedFact[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [hideFixed, setHideFixed] = useState(true);
  const [sortBy, setSortBy] = useState<'severity' | 'date' | 'platform'>('severity');
  const [reverifying, setReverifying] = useState<number | null>(null);
  const [togglingFixed, setTogglingFixed] = useState<number | null>(null);

  const loadAccuracy = useCallback((id: string) => {
    brandApi(id)
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
  }, []);

  useEffect(() => {
    if (!brand?.id) return;
    loadAccuracy(brand.id);
  }, [brand?.id, loadAccuracy]);

  // Pick up freshly-verified facts after each run finishes.
  useEffect(() => {
    if (!brand?.id) return;
    const handler = () => loadAccuracy(brand.id);
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brand?.id, loadAccuracy]);

  function addFact() {
    if (!factKey.trim() || !factValue.trim() || !brand) return;
    const updated = [...facts, { key: factKey.trim(), value: factValue.trim(), category: factCategory }];
    brandApi(brand.id, '', 'POST', { facts: updated })
      .then(() => { setFacts(updated); setFactKey(''); setFactValue(''); });
  }

  function removeFact(idx: number) {
    if (!brand) return;
    const updated = facts.filter((_, i) => i !== idx);
    brandApi(brand.id, '', 'POST', { facts: updated })
      .then(() => setFacts(updated));
  }

  function checkNow() {
    if (!brand || checking) return;
    setChecking(true);
    setCheckMessage(null);
    brandApi(brand.id, '', 'PUT', { action: 'check' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then(d => {
      if (d.error) {
        setCheckMessage({ text: d.error, isError: true });
        return;
      }
      // Always update data when present
      setIssues(d.issues || []);
      setAccuracyRate(d.accuracyRate ?? null);
      if (d.platformStats) setPlatformStats(d.platformStats);
      if (d.categoryStats) setCategoryStats(d.categoryStats);
      setLastChecked(new Date().toISOString());
      // Show message from API or generate a summary
      if (d.message) {
        setCheckMessage({ text: d.message, isError: false });
      } else if (d.checkedRuns) {
        const runs = d.checkedRuns;
        const issueCount = (d.issues || []).length;
        setCheckMessage({ text: `AI analyzed ${runs} response${runs > 1 ? 's' : ''} against ${facts.length} fact${facts.length > 1 ? 's' : ''} - found ${issueCount} issue${issueCount !== 1 ? 's' : ''}`, isError: false });
      }
    }).catch(() => {
      setCheckMessage({ text: 'Failed to run accuracy check. Please try again.', isError: true });
    }).finally(() => setChecking(false));
  }

  function autoDiscover() {
    if (!brand || discovering) return;
    setDiscovering(true);
    setCheckMessage(null);
    toast('Auto-discovering facts... This may take a moment.', 'info');
    brandApi(brand.id, '', 'PUT', { action: 'auto-discover' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then(d => {
      if (d.error && (!d.suggestedFacts || d.suggestedFacts.length === 0)) {
        toast(d.error, 'error');
        setCheckMessage({ text: d.error, isError: true });
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
    }).catch(async (err) => {
      // Try to extract the specific error message from the response
      let errorMsg = 'Failed to auto-discover facts. Please try again.';
      if (err instanceof Response || err?.json) {
        try { const d = await err.json(); if (d.error) errorMsg = d.error; } catch { /* use default */ }
      } else if (err?.message && err.message !== `HTTP ${err?.status}`) {
        errorMsg = err.message;
      }
      toast(errorMsg, 'error');
      setCheckMessage({ text: errorMsg, isError: true });
    }).finally(() => setDiscovering(false));
  }

  function acceptFact(sf: SuggestedFact) {
    if (!brand) return;
    const updated = [...facts, { key: sf.key, value: sf.value, category: sf.category }];
    brandApi(brand.id, '', 'POST', { facts: updated })
      .then(() => {
        setFacts(updated);
        setSuggestedFacts(prev => prev.filter(f => f.key !== sf.key));
      });
  }

  function acceptAllFacts() {
    if (!brand || suggestedFacts.length === 0) return;
    const updated = [...facts, ...suggestedFacts.map(sf => ({ key: sf.key, value: sf.value, category: sf.category }))];
    brandApi(brand.id, '', 'POST', { facts: updated })
      .then(() => {
        setFacts(updated);
        setSuggestedFacts([]);
      });
  }

  function dismissFact(key: string) {
    setSuggestedFacts(prev => prev.filter(f => f.key !== key));
  }

  async function toggleFixed(issue: Issue) {
    if (!brand || issue.id == null || togglingFixed !== null) return;
    setTogglingFixed(issue.id);
    try {
      const r = await brandApi(brand.id, `/issues/${issue.id}`, 'POST');
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setIssues(prev => prev.map(iss =>
        iss.id === issue.id ? { ...iss, fixed: d.fixed, fixed_at: d.fixed_at } : iss
      ));
      toast(d.fixed ? 'Issue marked as fixed.' : 'Issue marked as unfixed.');
    } catch (err) {
      toast(`Failed to update issue: ${(err as Error).message}`, 'error');
    } finally {
      setTogglingFixed(null);
    }
  }

  function reverifyIssue(issue: Issue) {
    if (!brand || issue.id == null || reverifying !== null) return;
    setReverifying(issue.id);
    brandApi(brand.id, '/reverify', 'POST', { platform: issue.platform, query: issue.query, factKey: stripCategorySuffix(issue.fact_key ?? '') })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then(d => {
      if (d.stillInaccurate) {
        // Issue returned - unfix it
        setIssues(prev => prev.map(iss =>
          iss.id === issue.id ? { ...iss, fixed: false, fixed_at: undefined, found: d.found || iss.found, explanation: d.explanation || iss.explanation } : iss
        ));
        toast('Issue still present - marked as unfixed.', 'error');
      } else {
        toast('Verified - issue is fixed!');
      }
    }).catch(() => toast('Re-verify failed. Try again.', 'error'))
      .finally(() => setReverifying(null));
  }

  // Build lookup from canonical facts to resolve expected values on the frontend
  const expectedLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of facts) {
      map.set(f.key, f.value);
      map.set(normalizeKey(f.key), f.value);
    }
    return map;
  }, [facts]);

  function getExpected(issue: Issue): string {
    if (issue.expected) return issue.expected;
    const baseKey = stripCategorySuffix(issue.fact_key);
    return expectedLookup.get(baseKey) || expectedLookup.get(normalizeKey(baseKey)) || '';
  }

  // Derived data
  const toAccuracyList = (stats: Record<string, { total: number; accurate: number }>) =>
    Object.entries(stats).map(([name, stat]) => ({
      name,
      rate: stat.total > 0 ? Math.round((stat.accurate / stat.total) * 100) : 100,
    }));

  const platformAccuracy = useMemo(() => toAccuracyList(platformStats).sort((a, b) => b.rate - a.rate), [platformStats]);
  const categoryAccuracy = useMemo(() => toAccuracyList(categoryStats).sort((a, b) => a.rate - b.rate), [categoryStats]);

  // Filter, sort, and derive issue data
  const filteredIssues = useMemo(() => {
    let filtered = issues;
    if (hideFixed) filtered = filtered.filter(i => !i.fixed);
    if (filterPlatform !== 'All') filtered = filtered.filter(i => i.platform === filterPlatform);
    if (filterSeverity !== 'All') filtered = filtered.filter(i => i.severity === filterSeverity.toLowerCase());
    if (sortBy === 'severity') filtered = [...filtered].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));
    else if (sortBy === 'date') filtered = [...filtered].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    else if (sortBy === 'platform') filtered = [...filtered].sort((a, b) => a.platform.localeCompare(b.platform));
    return filtered;
  }, [issues, hideFixed, filterPlatform, filterSeverity, sortBy]);

  const issueSummary = useMemo(() => {
    const summary = { total: issues.length, critical: 0, high: 0, medium: 0, low: 0, fixed: 0 };
    for (const issue of issues) {
      if (issue.fixed) summary.fixed++;
      const sev = issue.severity as keyof typeof summary;
      if (sev in summary && sev !== 'total' && sev !== 'fixed') summary[sev]++;
    }
    return summary;
  }, [issues]);

  const allPlatforms = useMemo(() => [...new Set(issues.map(i => i.platform))].sort(), [issues]);

  // Per-fact accuracy breakdown
  const factBreakdown = useMemo(() => {
    const map = new Map<string, { factKey: string; wrongPlatforms: Set<string>; totalPlatforms: Set<string> }>();
    for (const issue of issues) {
      const key = stripCategorySuffix(issue.fact_key ?? '') || issue.fact_key;
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
    <div className="lvx">
      <div className="page-body" style={{ paddingTop: 28 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    </div>
  );

  const severityTone = (sev: string) =>
    sev === 'critical' || sev === 'high' ? 'neg' : sev === 'medium' ? 'warn' : 'info';


  // Worst-offender engine + topic (derived from real accuracy data)
  const worstEngine = platformAccuracy.length ? platformAccuracy[platformAccuracy.length - 1] : null;
  const worstTopic = categoryAccuracy.length ? categoryAccuracy[0] : null;

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Accuracy Monitor <Badge tone="acc">AI-POWERED</Badge></span>}
        sub="Uses AI to analyze actual responses from AI platforms against your canonical facts — find inaccurate claims, fix them, prevent them."
        actions={
          <button className="btn-p" onClick={checkNow} disabled={checking}>
            {checking ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                Analyzing…
              </span>
            ) : 'Check Now'}
          </button>
        }
      />

      <div className="page-body">
        {/* KPI rail — real metrics */}
        <KPIRail items={[
          { k: 'OPEN', v: issues.length - issueSummary.fixed, danger: (issues.length - issueSummary.fixed) > 0 },
          { k: 'FIXED', v: issueSummary.fixed },
          { k: 'ACCURACY RATE', v: accuracyRate != null ? accuracyRate : '—', suffix: accuracyRate != null ? '%' : '' },
          { k: 'CLAIMS VERIFIED', v: facts.length },
          { k: 'LAST CHECKED', v: lastChecked ? new Date(lastChecked).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Never', info: lastChecked ? new Date(lastChecked).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : undefined },
        ]} />

        {/* Status message */}
        {checkMessage && (
          <Card padding={false}>
            <div style={{ padding: '12px 16px', fontSize: 12.5, color: checkMessage.isError ? 'var(--danger)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>{checkMessage.text}</span>
              <button className="btn-d" style={{ padding: '2px 8px' }} onClick={() => setCheckMessage(null)}>Dismiss</button>
            </div>
          </Card>
        )}

        {/* ── Brand Facts ── */}
        <Card
          title="Your brand facts"
          lede="Define what's true about your brand — AI accuracy is checked against these."
          right={
            <button className="btn-g" onClick={autoDiscover} disabled={discovering}>
              {discovering ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: ACCENT_PURPLE, borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  Discovering…
                </span>
              ) : '✦ Auto-Discover'}
            </button>
          }
        >
          {discovering && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 14, borderRadius: 8, background: ACCENT_GRADIENT_SUBTLE, border: '1px solid rgba(124,58,237,0.15)' }}>
              <span style={{ width: 16, height: 16, border: '2.5px solid rgba(124,58,237,0.25)', borderTopColor: ACCENT_PURPLE, borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: ACCENT_PURPLE, fontWeight: 600 }}>AI is analyzing your brand to discover facts…</span>
            </div>
          )}

          {/* Add Fact Form */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Fact Key</div>
              <input className="sel" placeholder="e.g. founded_year" value={factKey} onChange={e => setFactKey(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Fact Value</div>
              <input className="sel" placeholder="e.g. 2009" value={factValue} onChange={e => setFactValue(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ minWidth: 100 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Category</div>
              <select className="sel" value={factCategory} onChange={e => setFactCategory(e.target.value)} style={{ width: '100%' }}>
                {RECOMMENDED_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>
            </div>
            <button className="btn-p" onClick={addFact}>Add Fact</button>
          </div>

          {/* AI Suggested Facts */}
          {suggestedFacts.length > 0 && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: ACCENT_GRADIENT_SUBTLE, border: '1px solid rgba(124,58,237,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT_PURPLE }}>✦ {suggestedFacts.length} AI-suggested fact{suggestedFacts.length !== 1 ? 's' : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-p" style={{ padding: '4px 10px', fontSize: 11 }} onClick={acceptAllFacts}>Add All</button>
                  <button className="btn-d" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSuggestedFacts([])}>Dismiss</button>
                </div>
              </div>
              {suggestedFacts.map(sf => (
                <div key={sf.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(124,58,237,0.08)', fontSize: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: sf.confidence === 'high' ? 'var(--success)' : sf.confidence === 'medium' ? 'var(--warn)' : 'var(--danger)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 100 }}>{sf.key}</span>
                  <span style={{ color: 'var(--text-2)', flex: 1 }}>{sf.value}</span>
                  <Badge tone="neu">{sf.category}</Badge>
                  <button className="btn-d" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--success)' }} onClick={() => acceptFact(sf)}>+ Add</button>
                  <button className="btn-d" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => dismissFact(sf.key)}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Fact Coverage */}
          {facts.length > 0 && (
            <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <FactCoverage facts={facts} />
            </div>
          )}

          {/* Existing Facts List */}
          {facts.length > 0 ? (
            <div>
              {facts.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < facts.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{f.key}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>{f.value}</span>
                  <Badge tone="neu">{f.category}</Badge>
                  <button className="btn-d" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }} onClick={() => removeFact(i)}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-3)', fontSize: 12.5 }}>
              No facts yet. Add your brand&apos;s facts above or click <strong>Auto-Discover</strong> to let AI find them.
            </div>
          )}
        </Card>

        {/* Charts Row */}
        <div className="g2">
          <Card title="Accuracy trend">
            <TrendChart data={trend} />
          </Card>
          <Card title="Severity distribution">
            <SeverityDonut issues={issues} />
          </Card>
        </div>

        {/* ── Hallucination feed (real issues) ── */}
        <Card
          title="Hallucination feed"
          right={issues.length > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
              {issueSummary.critical > 0 && <span style={{ color: SEVERITY_COLORS.critical }}>{issueSummary.critical} crit</span>}
              {issueSummary.high > 0 && <span style={{ color: SEVERITY_COLORS.high }}>{issueSummary.high} high</span>}
              {issueSummary.medium > 0 && <span style={{ color: SEVERITY_COLORS.medium }}>{issueSummary.medium} med</span>}
              {issueSummary.low > 0 && <span style={{ color: SEVERITY_COLORS.low }}>{issueSummary.low} low</span>}
              {issueSummary.fixed > 0 && <span style={{ color: 'var(--success)' }}>{issueSummary.fixed} fixed</span>}
            </span>
          ) : undefined}
          padding={false}
          foot={issues.length > 0 ? <><span>Showing {filteredIssues.length} of {issues.length}</span><span>Last checked {lastChecked ? new Date(lastChecked).toLocaleString() : 'never'}</span></> : undefined}
        >
          {/* Filter & Sort Toolbar */}
          {issues.length > 0 && (
            <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {['All', ...allPlatforms].map(p => (
                  <button key={p} onClick={() => setFilterPlatform(p)} style={filterPillStyle(filterPlatform === p)}>{p}</button>
                ))}
              </div>
              <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {SEVERITY_LABELS.map(s => (
                  <button key={s} onClick={() => setFilterSeverity(s)} style={filterPillStyle(filterSeverity === s)}>{s}</button>
                ))}
              </div>
              <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--mono)' }}>
                <span onClick={() => setHideFixed(!hideFixed)} style={{ width: 28, height: 16, borderRadius: 8, background: hideFixed ? ACCENT_PURPLE : 'var(--surface-3)', position: 'relative', transition: 'background .15s', display: 'inline-block', cursor: 'pointer' }}>
                  <span style={{ position: 'absolute', top: 2, left: hideFixed ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                </span>
                Hide Fixed
              </label>
              <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
              <select className="sel" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                <option value="severity">By Severity</option>
                <option value="date">By Date</option>
                <option value="platform">By Platform</option>
              </select>
            </div>
          )}

          {issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-3)', fontSize: 12.5 }}>
              {facts.length === 0 ? (
                <>Add your brand&apos;s facts above, then click <strong>&quot;Check Now&quot;</strong> to verify AI accuracy.</>
              ) : accuracyRate !== null ? (
                <>All facts verified accurately across AI platforms. No issues found.</>
              ) : (
                <>Click <strong>&quot;Check Now&quot;</strong> to analyze AI responses against your {facts.length} canonical fact{facts.length !== 1 ? 's' : ''}.</>
              )}
            </div>
          ) : filteredIssues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)', fontSize: 12.5 }}>
              No issues match the current filters.
            </div>
          ) : (
            <ul className="hal-list">
              {filteredIssues.map((issue, i) => {
                const expanded = expandedIssue === i;
                return (
                  <li key={issue.id ?? i} className="hal-row" style={{ opacity: issue.fixed ? 0.6 : 1 }}>
                    <PlatformTile p={platformFor(issue.platform)} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div className="hal-q mono">
                        <span className="dim">FACT ›</span> {issue.fact_key}
                        {(issue.count ?? 1) > 1 && <span className="dim"> · ×{issue.count}</span>}
                        {issue.query && <> &nbsp;<span className="dim">QUERY ›</span> &ldquo;{issue.query}&rdquo;</>}
                      </div>
                      <div className="hal-claim"><span className="hal-tag mono">CLAIMED ✗</span> {issue.found}</div>
                      <div className="hal-truth"><span className="hal-tag mono ok">TRUTH ✓</span> {getExpected(issue) || '(not set)'}</div>
                      <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{issue.platform}</span>
                        {issue.date && <span>{new Date(issue.date).toLocaleDateString()}</span>}
                        {issue.category && <span style={{ textTransform: 'capitalize' }}>{issue.category}</span>}
                        <SourceUrlLink issue={issue} />
                        {(issue.explanation || issue.query) && (
                          <button className="btn-d" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setExpandedIssue(expanded ? null : i)}>
                            {expanded ? 'Hide detail ▲' : 'Detail ▼'}
                          </button>
                        )}
                      </div>
                      {expanded && (issue.explanation || issue.query) && (
                        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: ACCENT_GRADIENT_SUBTLE, border: '1px solid rgba(124,58,237,0.1)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                          {issue.query && (
                            <div style={{ marginBottom: issue.explanation ? 10 : 0 }}>
                              <div className="eyebrow" style={{ marginBottom: 4 }}>Query Asked</div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>{issue.query}</div>
                            </div>
                          )}
                          {issue.explanation && (
                            <div>
                              <div className="eyebrow" style={{ marginBottom: 4, color: ACCENT_PURPLE }}>AI Analysis</div>
                              {issue.explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="hal-actions">
                      <Badge tone={issue.fixed ? 'pos' : severityTone(issue.severity)}>{issue.fixed ? 'FIXED' : issue.severity.toUpperCase()}</Badge>
                      {issue.id != null && (
                        <>
                          <button className="btn-g" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => toggleFixed(issue)} disabled={togglingFixed === issue.id}>
                            {togglingFixed === issue.id ? 'Updating…' : issue.fixed ? 'Marked Fixed ✓' : 'Mark as Fixed'}
                          </button>
                          {issue.fixed && (
                            <button className="btn-d" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => reverifyIssue(issue)} disabled={reverifying === issue.id}>
                              {reverifying === issue.id ? '…' : 'Re-verify ↻'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* By engine + By topic */}
        {(platformAccuracy.length > 0 || categoryAccuracy.length > 0) && (
          <div className="g2">
            <Card title="By engine" right={worstEngine ? <Badge tone="neg">WORST · {worstEngine.name}</Badge> : undefined}>
              {platformAccuracy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-3)', fontSize: 12.5 }}>Run accuracy checks to see platform-level breakdowns.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {platformAccuracy.map(p => (
                    <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '26px 90px 1fr 44px', gap: 10, alignItems: 'center' }}>
                      <PlatformTile p={platformFor(p.name)} size={22} />
                      <span style={{ fontSize: 12 }}>{p.name}</span>
                      <Bar value={p.rate} max={100} color={rateColor(p.rate)} />
                      <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}><b>{p.rate}%</b></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="By topic" right={worstTopic ? <Badge tone="warn">WORST · {worstTopic.name}</Badge> : undefined}>
              {categoryAccuracy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-3)', fontSize: 12.5 }}>Add facts across categories and run checks to see category-level accuracy.</div>
              ) : (
                <ul className="topic-list">
                  {categoryAccuracy.map(c => (
                    <li key={c.name}>
                      <span style={{ textTransform: 'capitalize' }}>{c.name}</span>
                      <Bar value={c.rate} max={100} color={rateColor(c.rate)} />
                      <span className="num">{c.rate}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* Per-Fact Accuracy Breakdown */}
        {factBreakdown.length > 0 && (
          <Card title="Fact accuracy breakdown">
            <div style={{ display: 'grid', gap: 2 }}>
              {factBreakdown.map(fb => {
                const wrong = fb.wrongPlatforms.size;
                const total = fb.totalPlatforms.size;
                const pct = total > 0 ? wrong / total : 0;
                const dotColor = pct > 0.5 ? 'var(--danger)' : pct > 0 ? 'var(--warn)' : 'var(--success)';
                return (
                  <div key={fb.factKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)', minWidth: 140 }}>{fb.factKey}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>{wrong}/{total} platform{total !== 1 ? 's' : ''} incorrect</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[...fb.totalPlatforms].map(p => (
                        <span key={p} style={{ width: 6, height: 6, borderRadius: '50%', background: fb.wrongPlatforms.has(p) ? 'var(--danger)' : 'var(--success)' }} title={p} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
