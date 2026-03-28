'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand {
  id: string;
  name: string;
  industry?: string;
  city?: string;
  sov_goal?: number;
  runs?: Array<{ sov?: number; totalQ?: number; totalM?: number; date?: string; duration?: number;
    platforms?: Record<string, { sov?: number; mentions?: number; total?: number; errors?: number }>;
    sentiment?: { positive?: number; neutral?: number; negative?: number };
    recommended?: number; competitors?: Record<string, number>; citations?: Record<string, number>;
  }>;
  queries?: string[];
  competitors?: string[];
  selected_platforms?: string[];
  [key: string]: unknown;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQuery, setNewQuery] = useState('');
  const [compareMode, setCompareMode] = useState<'current' | 'week' | 'month'>('current');
  const [preset, setPreset] = useState<'all' | 'founder' | 'seo' | 'agency'>('all');
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedQueries, setSelectedQueries] = useState<Set<number>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Preset section visibility
  const allSections = ['hero', 'health', 'scores', 'categories', 'location', 'platforms', 'trend', 'qperf', 'citations', 'insights', 'lastrun', 'queries'];
  const presetMap: Record<string, string[]> = {
    all: allSections,
    founder: ['hero', 'scores', 'trend', 'qperf', 'insights', 'lastrun', 'queries'],
    seo: ['hero', 'health', 'scores', 'platforms', 'qperf', 'citations', 'categories'],
    agency: ['hero', 'health', 'categories', 'platforms', 'lastrun', 'qperf'],
  };
  const visibleSections = presetMap[preset] || allSections;
  const show = (section: string) => visibleSections.includes(section);

  // Hydration-safe: initialize to 0, set real value in useEffect
  const [now, setNow] = useState(0);
  const [nextRunText, setNextRunText] = useState('');

  const fetchBrands = useCallback(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setBrands(d.brands || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  // Client-only live timer — avoids hydration mismatch
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const brand = brands[0];
  const allRuns = brand?.runs || [];
  const lastRun = allRuns.length ? allRuns[allRuns.length - 1] : null;
  const prevRun = allRuns.length >= 2 ? allRuns[allRuns.length - 2] : null;

  // Comparison run based on compareMode — ensures week/month find different runs
  const compareRun = useMemo((): (typeof allRuns)[number] | null => {
    if (compareMode === 'current' || !lastRun?.date) return null;
    const lastDate = new Date(lastRun.date).getTime();
    const targetAge = compareMode === 'week' ? 7 * 86400000 : 30 * 86400000;
    const minAge = compareMode === 'week' ? 3 * 86400000 : 14 * 86400000;
    const targetDate = lastDate - targetAge;
    // Filter to only runs older than minAge from latest
    const candidates = allRuns.filter(run => {
      if (!run.date || run === lastRun) return false;
      const age = lastDate - new Date(run.date).getTime();
      return age >= minAge;
    });
    if (candidates.length === 0) return null;
    // Find closest to target date
    let closest = candidates[0];
    let closestDiff = Math.abs(new Date(closest.date!).getTime() - targetDate);
    candidates.forEach(run => {
      const diff = Math.abs(new Date(run.date!).getTime() - targetDate);
      if (diff < closestDiff) { closestDiff = diff; closest = run; }
    });
    return closest;
  }, [compareMode, lastRun, allRuns]);
  const sov = lastRun?.sov || 0;
  const totalM = lastRun?.totalM || 0;
  const totalQ = lastRun?.totalQ || 0;
  const platforms = lastRun?.platforms || {};
  const queries = brand?.queries || [];
  const planLimit = (user?.limits as Record<string, number>)?.prompts || 5;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (sov / 100) * circumference;

  // Sentiment data
  const sentiment = lastRun?.sentiment || { positive: 0, neutral: 0, negative: 0 };
  const posCount = sentiment.positive || 0;
  const neuCount = sentiment.neutral || 0;
  const negCount = sentiment.negative || 0;
  const sentTotal = posCount + neuCount + negCount;
  const recommendedPct = lastRun?.recommended || 0;

  // GEO Score (mentionRate*40 + recommendRate*35)
  const geoScore = useMemo(() => {
    const mRate = totalQ > 0 ? totalM / totalQ : 0;
    const rRate = totalQ > 0 ? recommendedPct / 100 : 0;
    return Math.round(mRate * 40 + rRate * 35);
  }, [totalM, totalQ, recommendedPct]);

  // AI Sentiment score ((pos*100 + neu*50) / total)
  const sentimentScore = useMemo(() => {
    return sentTotal > 0 ? Math.round((posCount * 100 + neuCount * 50) / sentTotal) : 0;
  }, [posCount, neuCount, sentTotal]);

  // AI Category Breakdown (Chat AI vs Search AI)
  const chatStats = useMemo(() => {
    const names = ['ChatGPT', 'Claude', 'Grok'];
    let total = 0, mentioned = 0;
    Object.entries(platforms).forEach(([name, pd]) => {
      if (names.includes(name)) { total += (pd as Record<string, number>).total || 0; mentioned += (pd as Record<string, number>).mentions || 0; }
    });
    return { total, mentioned, sov: total > 0 ? Math.round(mentioned / total * 100) : 0 };
  }, [platforms]);

  const searchStats = useMemo(() => {
    const names = ['Perplexity', 'Gemini'];
    let total = 0, mentioned = 0;
    Object.entries(platforms).forEach(([name, pd]) => {
      if (names.includes(name)) { total += (pd as Record<string, number>).total || 0; mentioned += (pd as Record<string, number>).mentions || 0; }
    });
    return { total, mentioned, sov: total > 0 ? Math.round(mentioned / total * 100) : 0 };
  }, [platforms]);

  const bestPlatform = useMemo(() => {
    const entries = Object.entries(platforms).map(([name, pd]) => ({ name, sov: (pd as Record<string, number>).sov || 0 }));
    if (!entries.length) return null;
    return entries.reduce((a, b) => b.sov > a.sov ? b : a);
  }, [platforms]);

  // Location visibility — scan recent run responses for city/area mentions
  const locationData = useMemo(() => {
    const city = brand?.city;
    if (!city) return { rate: 0, areas: {} as Record<string, number> };
    const nearbyAreas = (brand as Record<string, unknown>).nearby_areas as string[] | undefined;
    const allAreas = [city, ...(nearbyAreas || [])].filter(Boolean);
    const recentRuns = (brand?.runs || []).slice(-3);
    let total = 0, matched = 0;
    const areaHits: Record<string, number> = {};
    recentRuns.forEach(run => {
      const results = (run as Record<string, unknown>).allResults as Array<{ response?: string; snippet?: string }> | undefined;
      if (!results) return;
      results.forEach(r => {
        const text = ((r.response || '') + ' ' + (r.snippet || '')).toLowerCase();
        if (!text.trim()) return;
        total++;
        for (const area of allAreas) {
          if (text.includes(area.toLowerCase())) {
            matched++;
            areaHits[area] = (areaHits[area] || 0) + 1;
            break;
          }
        }
      });
    });
    return { rate: total > 0 ? Math.round((matched / total) * 100) : 0, areas: areaHits };
  }, [brand]);

  const nearbyAreas = (brand as Record<string, unknown>)?.nearby_areas as string[] | undefined;

  // Query Performance data (per-query mention rate from last run)
  const queryPerfData = useMemo(() => {
    if (!lastRun) return [];
    const allResults = (lastRun as Record<string, unknown>).allResults as Array<{ query: string; mentioned: boolean }> | undefined;
    if (!allResults) return [];
    const map: Record<string, { query: string; mentioned: number; total: number }> = {};
    allResults.forEach(r => {
      if (!map[r.query]) map[r.query] = { query: r.query, mentioned: 0, total: 0 };
      map[r.query].total++;
      if (r.mentioned) map[r.query].mentioned++;
    });
    return Object.values(map)
      .map(q => ({ query: q.query, rate: q.total > 0 ? Math.round((q.mentioned / q.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate);
  }, [lastRun]);

  // Competitors
  const competitorData = lastRun?.competitors || {};
  const topCompetitors = useMemo(() =>
    Object.entries(competitorData).sort((a, b) => b[1] - a[1]).slice(0, 8),
  [competitorData]);

  // Citations
  const citationData = lastRun?.citations || {};
  const topCitations = useMemo(() =>
    Object.entries(citationData).sort((a, b) => b[1] - a[1]).slice(0, 10),
  [citationData]);

  // SOV Trend (from runs history)
  const sovTrend = useMemo(() =>
    (brand?.runs || []).slice(-14).map(r => ({ sov: r.sov || 0, date: r.date || '' })),
  [brand?.runs]);

  const addQuery = () => {
    if (!newQuery.trim() || !brand) return;
    const updated = [...queries, newQuery.trim()];
    fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
      .then(() => { setNewQuery(''); fetchBrands(); });
  };

  const removeQuery = (idx: number) => {
    if (!brand) return;
    const updated = queries.filter((_, i) => i !== idx);
    fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
      .then(() => fetchBrands());
  };

  // Next run badge — client-only to avoid hydration mismatch
  useEffect(() => {
    if (!lastRun?.date || !now) { setNextRunText(''); return; }
    const runTime = new Date(lastRun.date).getTime();
    const nextRunMs = runTime + 6 * 3600 * 1000;
    const diffMs = nextRunMs - now;
    if (diffMs > 0) {
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      setNextRunText(`next|Next run in ${h}h ${m}m`);
    } else {
      const overdueMs = Math.abs(diffMs);
      const oh = Math.floor(overdueMs / 3600000);
      const om = Math.floor((overdueMs % 3600000) / 60000);
      setNextRunText(`overdue|Overdue by ${oh > 0 ? `${oh}h ${om}m` : `${om}m`} — waiting for next scheduled run`);
    }
  }, [lastRun?.date, now]);

  // Last run age
  const lastRunAge = useMemo(() => {
    if (!lastRun?.date) return '';
    const diff = now - new Date(lastRun.date).getTime();
    if (diff < 0) return 'just now';
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h ago`;
  }, [lastRun?.date, now]);

  // SOV change from previous run
  const sovChange = prevRun?.sov !== undefined && lastRun?.sov !== undefined ? lastRun.sov - prevRun.sov : null;

  // Alerts derived from data
  const alerts = useMemo(() => {
    const a: Array<{ type: 'danger' | 'warn' | 'info'; text: string }> = [];
    if (sovChange !== null && sovChange < -10) a.push({ type: 'danger', text: `SOV dropped ${Math.abs(sovChange)}% since last run` });
    else if (sovChange !== null && sovChange < -3) a.push({ type: 'warn', text: `SOV down ${Math.abs(sovChange)}% since last run` });
    if (sovChange !== null && sovChange > 5) a.push({ type: 'info', text: `SOV improved +${sovChange}% since last run` });
    if (sentiment.negative && sentTotal > 0 && (sentiment.negative / sentTotal) > 0.3) a.push({ type: 'warn', text: 'High negative sentiment detected' });
    const zeroPlatforms = Object.entries(platforms).filter(([, p]) => (p as Record<string, number>).sov === 0);
    if (zeroPlatforms.length > 0 && Object.keys(platforms).length > 0) a.push({ type: 'warn', text: `${zeroPlatforms.length} platform(s) with 0% SOV` });
    return a;
  }, [sovChange, sentiment, sentTotal, platforms]);

  // API Health summary — fix: green when 0 errors regardless of platform count
  const apiTotalResponses = Object.values(platforms).reduce((s, p) => s + ((p as Record<string, number>).total || 0), 0);
  const apiErrors = Object.values(platforms).reduce((s, p) => s + ((p as Record<string, number>).errors || 0), 0);
  const apiHealthy = Object.values(platforms).filter(p => {
    const pd = p as Record<string, number>;
    return pd.total && pd.total > 0 && (!pd.errors || pd.errors / pd.total < 0.3);
  }).length;
  const apiTotal = Object.values(platforms).filter(p => (p as Record<string, number>).total > 0).length;
  const apiHealthColor = apiErrors === 0 && apiTotalResponses > 0 ? 'var(--green)' : apiErrors > 0 ? 'var(--red)' : 'var(--muted)';

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  if (!brand) return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center shadow-[var(--app-shadow)]">
      <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Get started with your first brand</h2>
      <p className="text-sm text-[var(--muted)] mb-6 max-w-md mx-auto">Set up your brand and start tracking how AI platforms mention you.</p>
      <Link href="/dashboard/setup" className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-lg font-bold text-sm transition no-underline shadow-[0_1px_2px_rgba(255,97,84,.2)]">Set Up Brand</Link>
    </div>
  );


  // Duration formatter
  const fmtDuration = (d: number | undefined | null) => {
    if (d === undefined || d === null) return 'N/A';
    const s = typeof d === 'number' ? (d > 1000 ? Math.round(d / 1000) : d) : 0;
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  };

  // Date formatter for Last Run
  const fmtDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(h12).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
  };

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="ov-header">
        <div className="ov-header-left">
          <div className="view-title">{brand.name}</div>
          <div className="view-sub">{brand.industry || ''} {brand.city ? `· ${brand.city}` : ''}</div>
        </div>
        <div className="ov-header-right">
          {nextRunText && (() => {
            const [type, text] = nextRunText.split('|');
            return <div className="next-run-badge" style={{ background: type === 'overdue' ? 'rgba(245,158,11,.08)' : 'rgba(59,130,246,.08)', color: type === 'overdue' ? 'var(--amber)' : 'var(--blue)', padding: '6px 14px', borderRadius: 'var(--radius-xs)', fontSize: 11, fontFamily: 'var(--mono)', border: `1px solid ${type === 'overdue' ? 'rgba(245,158,11,.2)' : 'rgba(59,130,246,.2)'}` }}>{text}</div>;
          })()}
          <div className="compare-toggle">
            {(['current','week','month'] as const).map(m => (
              <button key={m} className={compareMode === m ? 'active' : ''} onClick={() => setCompareMode(m)}>
                {m === 'current' ? 'Current' : m === 'week' ? 'vs Last Week' : 'vs Last Month'}
              </button>
            ))}
          </div>
          <select className="finp" style={{ width: 150, margin: 0, fontSize: 11, padding: '4px 8px' }} value={preset} onChange={e => setPreset(e.target.value as typeof preset)}>
            <option value="all">All Sections</option>
            <option value="founder">Founder View</option>
            <option value="seo">SEO Manager</option>
            <option value="agency">Agency View</option>
          </select>
        </div>
      </div>

      {/* ── ALERTS STRIP ── */}
      {alerts.length > 0 && (
        <div className="alerts-strip" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(alerts.length, 3)}, 1fr)`, gap: 8, marginBottom: 14 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ background: 'var(--primary)', color: '#fff', padding: '12px 16px', borderRadius: 'var(--radius-xs)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.text}</div>
              <div style={{ fontSize: 10, opacity: .7 }}>{now > 0 && lastRun?.date ? (() => { const days = Math.floor((now - new Date(lastRun.date).getTime()) / 86400000); return days > 0 ? `${days}d ago` : 'today'; })() : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── SOV HERO ── */}
      {show('hero') && (
        <div className="ov-hero">
          <div className="ov-hero-sov">
            <div className="ov-hero-sov-ring">
              <svg viewBox="0 0 120 120" className="ov-ring-svg">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" strokeWidth="8" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={sov >= 50 ? 'var(--green)' : sov > 0 ? 'var(--primary)' : 'var(--bg4)'} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
              </svg>
              <div className="ov-ring-label">
                <span className="ov-ring-pct">{sov}%</span>
                {sovChange !== null && sovChange !== 0 && (
                  <span className="ov-ring-diff" style={{ color: sovChange > 0 ? 'var(--green)' : 'var(--red)' }}>{sovChange > 0 ? '▲' : '▼'} {Math.abs(sovChange)}%</span>
                )}
              </div>
            </div>
            <div className="ov-hero-sov-label">Share of Voice</div>
          </div>
          <div className="ov-hero-stats">
            <div className="ov-hero-stat"><div className="ov-hero-stat-val">{totalM} / {totalQ}</div><div className="ov-hero-stat-lbl">Mentions / Total</div></div>
            <div className="ov-hero-stat"><div className="ov-hero-stat-val">{Object.values(platforms).filter(p => (p as Record<string,number>).total > 0).length} / {Object.keys(PLATFORM_COLORS).length}</div><div className="ov-hero-stat-lbl">Platforms Active</div></div>
            <div className="ov-hero-stat"><div className="ov-hero-stat-val">{queries.length} / {totalQ > 0 ? totalQ / Object.values(platforms).filter(p => (p as Record<string,number>).total > 0).length || queries.length : queries.length}</div><div className="ov-hero-stat-lbl">Queries Tracked</div></div>
            <div className="ov-hero-stat"><div className="ov-hero-stat-val">{lastRunAge || '--'}</div><div className="ov-hero-stat-lbl">Last Run</div></div>
            <div className="ov-hero-stat"><div className="ov-hero-stat-val">{fmtDuration(lastRun?.duration)}</div><div className="ov-hero-stat-lbl">Run Duration</div></div>
          </div>
        </div>
      )}

      {/* ── API HEALTH ── */}
      {show('health') && apiTotalResponses > 0 && (
        <div className="ov-health">
          <span className="ov-health-dot" style={{ background: apiHealthColor }} />
          <span className="ov-health-text">{apiHealthy}/{apiTotal} platforms healthy</span>
          <span style={{ color: 'var(--muted)' }}>{apiTotalResponses - apiErrors} ok · {apiErrors} errors</span>
        </div>
      )}

      {/* ── SCORE CARDS ── */}
      {show('scores') && (
        <div className="ov-scores-row">
          <div className="ov-score-card">
            <div className="ov-score-val" style={{ color: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : geoScore > 0 ? 'var(--red)' : 'var(--muted)' }}>{geoScore}</div>
            <div className="ov-score-label">GEO Score</div>
            <div className="ov-score-tag" style={{ color: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : geoScore > 0 ? 'var(--red)' : 'var(--muted)' }}>{geoScore >= 70 ? 'Strong' : geoScore >= 40 ? 'Growing' : geoScore > 0 ? 'Weak' : 'Not Visible'}</div>
            <div className="ov-score-bar"><div className="ov-score-bar-fill" style={{ width: `${geoScore}%`, background: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : 'var(--red)' }} /></div>
          </div>
          <div className="ov-score-card">
            <div className="ov-score-val" style={{ color: sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : sentimentScore > 0 ? 'var(--red)' : 'var(--muted)' }}>{sentimentScore}</div>
            <div className="ov-score-label">AI Sentiment</div>
            <div className="ov-score-tag">+{posCount} positive · {neuCount} neutral · {negCount} negative</div>
            <div className="ov-score-bar"><div className="ov-score-bar-fill" style={{ width: `${sentimentScore}%`, background: sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : 'var(--red)' }} /></div>
          </div>
          <div className="ov-score-card">
            <div className="ov-score-val" style={{ color: recommendedPct >= 40 ? 'var(--green)' : recommendedPct > 0 ? 'var(--amber)' : 'var(--muted)' }}>{recommendedPct}<span className="ov-score-unit">%</span></div>
            <div className="ov-score-label">AI Recommends You</div>
            <div className="ov-score-tag" style={{ color: recommendedPct >= 50 ? 'var(--green)' : recommendedPct > 0 ? 'var(--amber)' : 'var(--muted)' }}>{recommendedPct >= 50 ? 'Strong endorsement' : recommendedPct > 0 ? 'Room to grow' : 'Not yet'}</div>
            <div className="ov-score-bar"><div className="ov-score-bar-fill" style={{ width: `${recommendedPct}%`, background: recommendedPct >= 40 ? 'var(--green)' : recommendedPct > 0 ? 'var(--amber)' : 'var(--muted)' }} /></div>
          </div>
        </div>
      )}

      {/* ── CATEGORY BREAKDOWN ── */}
      {show('categories') && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">AI Category Breakdown</div><div className="ov-card-sub">Share of Voice by platform type</div></div>
          <div className="ov-grid-3">
            <div className="ov-cat-card">
              <div className="ov-cat-label">💬 Chat AI SOV</div>
              <div className="ov-cat-val" style={{ color: chatStats.sov >= 40 ? 'var(--green)' : chatStats.sov > 0 ? 'var(--amber)' : 'var(--red)' }}>{chatStats.sov}%</div>
              <div className="ov-cat-detail">Mentioned in {chatStats.mentioned} of {chatStats.total} responses</div>
              <div className="ov-cat-sub">ChatGPT · Claude · Grok</div>
            </div>
            <div className="ov-cat-card">
              <div className="ov-cat-label">🔍 Search AI SOV</div>
              <div className="ov-cat-val" style={{ color: searchStats.sov >= 40 ? 'var(--green)' : searchStats.sov > 0 ? 'var(--amber)' : 'var(--red)' }}>{searchStats.sov}%</div>
              <div className="ov-cat-detail">Mentioned in {searchStats.mentioned} of {searchStats.total} responses</div>
              <div className="ov-cat-sub">Perplexity · Gemini</div>
            </div>
            <div className="ov-cat-card">
              <div className="ov-cat-label">🏆 Best Platform</div>
              <div className="ov-cat-val" style={{ color: bestPlatform && bestPlatform.sov > 0 ? 'var(--green)' : 'var(--muted)' }}>{bestPlatform && bestPlatform.sov > 0 ? bestPlatform.name : '--'}</div>
              <div className="ov-cat-detail">{bestPlatform && bestPlatform.sov > 0 ? `${bestPlatform.sov}% SOV — strongest visibility` : 'No platform data yet'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATION VISIBILITY ── */}
      {show('location') && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">📍 Location Visibility</div><div className="ov-card-sub">{brand.city || ''}{nearbyAreas?.length ? ` + ${nearbyAreas.length} nearby areas` : ''}</div></div>
          <div className="ov-loc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--mono)', color: locationData.rate >= 40 ? 'var(--green)' : locationData.rate > 0 ? 'var(--amber)' : 'var(--red)' }}>{locationData.rate}%</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: 4 }}>City Match Rate</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>AI mentions your location</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Areas where AI finds you</div>
              {Object.entries(locationData.areas).length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{Object.entries(locationData.areas).map(([area, count]) => (
                  <span key={area} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 100, fontSize: 11 }}>{area} <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>{count}</span></span>
                ))}</div>
              ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>No location matches found yet. Run more queries with location-specific terms.</div>}
            </div>
          </div>
          {locationData.rate < 30 && brand.city && (
            <div className="ov-cit-tip" style={{ marginTop: 12 }}>💡 Tip: Include &quot;{brand.city}&quot; in your queries (e.g., &quot;best {brand.industry || 'service'} in {brand.city}&quot;) to test local AI visibility.</div>
          )}
        </div>
      )}

      {/* ── ACTIONABLE INSIGHTS ── */}
      {show('insights') && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">Actionable Insights</div><div className="ov-card-sub">{alerts.length} tip{alerts.length !== 1 ? 's' : ''}</div></div>
          {Object.values(platforms).some(p => (p as Record<string,number>).sov === 0) && Object.values(platforms).some(p => (p as Record<string,number>).total > 0) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18 }}>✦</span>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Platform Gap Detected</div><div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Strong on some platforms but invisible on others. Different AI platforms pull from different sources — diversify your online presence.</div></div>
            </div>
          )}
          {sov > 0 && sov < 50 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18 }}>📈</span>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Growing Your AI Presence</div><div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>You&apos;re appearing in {sov}% of queries. To boost this: create <strong style={{ color: 'var(--text)' }}>FAQ-style content</strong> that directly answers common questions, and ensure your <strong style={{ color: 'var(--text)' }}>Google Business Profile</strong> is fully optimized.</div></div>
            </div>
          )}
          {sentTotal > 0 && negCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Negative Sentiment Detected</div><div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{negCount} AI response{negCount !== 1 ? 's' : ''} show negative sentiment about your brand. Check <Link href="/dashboard/mentions" style={{ color: 'var(--primary)', textDecoration: 'none' }}>All Results</Link> to see what AI is saying and address underlying issues.</div></div>
            </div>
          )}
        </div>
      )}

      {/* ── PLATFORM CARDS ── */}
      {show('platforms') && (
        <div className="ov-plat-grid">
          {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
            const pd = platforms[name] || {};
            const pSov = (pd as Record<string,number>).sov || 0;
            const pTotal = (pd as Record<string,number>).total || 0;
            const isActive = pTotal > 0 || pSov > 0;
            return (
              <div key={name} className="ov-plat-card" style={{ borderTop: `3px solid ${color}` }}>
                <div className="ov-plat-name">{name}</div>
                <div className="ov-plat-status" style={{ color: isActive ? 'var(--green)' : 'var(--muted)' }}>● {isActive ? 'ACTIVE' : 'INACTIVE'}</div>
                <div className="ov-plat-sov" style={{ color: pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--muted)' }}>{pSov}%</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SOV TREND ── */}
      {show('trend') && sovTrend.length > 1 && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">SOV Trend</div><div className="ov-card-sub">Last {sovTrend.length} runs</div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 160, padding: '0 4px' }}>
            {sovTrend.map((r, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: r.sov >= 50 ? 'var(--green)' : r.sov > 20 ? 'var(--primary)' : r.sov > 0 ? 'var(--amber)' : 'var(--bg4)', height: `${Math.max(4, r.sov * 1.5)}px`, transition: 'height .3s' }} />
                {(i === 0 || i === sovTrend.length - 1 || sovTrend.length <= 7) && (
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 4, whiteSpace: 'nowrap' }}>{r.date ? new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUERY PERFORMANCE + COMPETITORS ── */}
      {show('qperf') && (
        <div className="ov-grid-2">
          <div className="ov-card" style={{ marginBottom: 0 }}>
            <div className="ov-card-head"><div className="ov-card-title">Query Performance</div><div className="ov-card-sub">{queries.length} queries · Avg {queryPerfData.length > 0 ? Math.round(queryPerfData.reduce((s, q) => s + q.rate, 0) / queryPerfData.length) : 0}%</div></div>
            {(queryPerfData.length > 0 ? queryPerfData : queries.map(q => ({ query: q, rate: 0 }))).slice(0, 8).map((q, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span className="ov-qp-query" title={q.query}>{q.query}</span>
                  <span className="ov-qp-rate" style={{ color: q.rate >= 50 ? 'var(--green)' : q.rate > 0 ? 'var(--amber)' : 'var(--red)' }}>{q.rate}%</span>
                </div>
                <div className="ov-qp-track"><div className="ov-qp-bar"><div className="ov-qp-fill" style={{ width: `${q.rate}%`, background: q.rate >= 50 ? 'var(--green)' : q.rate > 0 ? 'var(--amber)' : 'var(--red)' }} /></div></div>
              </div>
            ))}
          </div>
          <div className="ov-card" style={{ marginBottom: 0 }}>
            <div className="ov-card-head"><div className="ov-card-title">Competitors in AI</div><div className="ov-card-sub">{topCompetitors.length || (brand.competitors || []).length} brands</div></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topCompetitors.length > 0 ? topCompetitors.map(([name, count], i) => (
                <span key={i} className="ov-comp-chip">{name} <span className="ov-comp-count">{count}x</span></span>
              )) : (brand.competitors || []).length > 0 ? (brand.competitors || []).map((c, i) => (
                <span key={i} className="ov-comp-chip">{c}</span>
              )) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Add competitors in Brand Setup</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── CITATION SOURCES ── */}
      {show('citations') && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">Citation Sources</div><div className="ov-card-sub">Where AI pulls information from</div></div>
          <div className="ov-cit-list">
            {topCitations.length > 0 ? (() => {
              const maxC = topCitations[0][1];
              return topCitations.map(([domain, count], i) => (
                <div key={i} className="ov-cit-item">
                  <span className={`ov-cit-domain ${brand.name && domain.toLowerCase().includes(brand.name.toLowerCase().split(' ')[0]) ? 'ov-cit-own' : ''}`}>{brand.name && domain.toLowerCase().includes(brand.name.toLowerCase().split(' ')[0]) ? `★ ${domain}` : domain}</span>
                  <div className="ov-cit-bar"><div className="ov-cit-bar-fill" style={{ width: `${(count / maxC) * 100}%` }} /></div>
                  <span className="ov-cit-count">{count}</span>
                </div>
              ));
            })() : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Citation tracking requires AI platforms that provide source links (Perplexity, Gemini). Run queries to start collecting citation data.</div>}
          </div>
        </div>
      )}

      {/* ── LAST RUN ── */}
      {show('lastrun') && lastRun && (
        <div className="ov-card">
          <div className="ov-card-head">
            <div className="ov-card-title">Last Run — {fmtDate(lastRun.date)}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{totalM} found / {totalQ} total responses</span>
              <Link href="/dashboard/mentions" style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--primary)', textDecoration: 'none' }}>View All Results →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── TRACKED QUERIES ── */}
      {show('queries') && (
        <div className="ov-card">
          <div className="ov-card-head"><div className="ov-card-title">Tracked Queries</div><div className="ov-card-sub">{queries.length} / {planLimit > 1000 ? '∞' : planLimit} prompts</div></div>
          <div className="ov-query-tags">
            {queries.map((q, i) => (
              <span key={i} className="query-tag" title={q}>
                {selectMode && <input type="checkbox" checked={selectedQueries.has(i)} onChange={() => setSelectedQueries(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{ marginRight: 4, accentColor: 'var(--primary)' }} />}
                {q}
                {!selectMode && <button onClick={() => removeQuery(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, marginLeft: 4, padding: 0 }}>×</button>}
              </span>
            ))}
          </div>
          <div className="ov-query-actions">
            <div className="add-query-row">
              <input value={newQuery} onChange={e => setNewQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuery()} placeholder="Add a new query..." />
              <button onClick={addQuery}>+ Add</button>
            </div>
            <div className="ov-query-btns">
              <button className="ov-btn-subtle" onClick={() => setBulkAddOpen(!bulkAddOpen)}>BULK ADD</button>
              <button className="ov-btn-subtle ov-btn-green" onClick={() => {
                if (!brand) return;
                const suggestions = [`best ${brand.industry || 'service'} in ${brand.city || 'my area'}`, `top rated ${brand.industry || 'service'} near me`, `${brand.name} reviews`, `recommended ${brand.industry || 'service'} companies`, `${brand.industry || 'service'} cost ${brand.city || ''}`].filter(s => !queries.includes(s));
                if (suggestions.length) { fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: [...queries, ...suggestions] }) }).then(() => fetchBrands()); }
              }}>SUGGEST</button>
              <button className="ov-btn-subtle ov-btn-blue" onClick={() => {
                if (!brand) return;
                const gen = [`what is ${brand.name}`, `is ${brand.name} good`, `${brand.name} vs competitors`, `${brand.name} pricing`, `alternatives to ${brand.name}`].filter(s => !queries.includes(s));
                if (gen.length) { fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: [...queries, ...gen] }) }).then(() => fetchBrands()); }
              }}>AI GENERATE</button>
              <button className="ov-btn-subtle ov-btn-red" onClick={() => { if (brand && queries.length && confirm('Remove all queries?')) fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: [] }) }).then(() => fetchBrands()); }}>CLEAR ALL</button>
              <button className="ov-btn-subtle" onClick={() => { setSelectMode(!selectMode); setSelectedQueries(new Set()); }}>{selectMode ? '✓ DONE' : '☐ SELECT'}</button>
              {selectMode && selectedQueries.size > 0 && (
                <button className="ov-btn-subtle ov-btn-red" onClick={() => {
                  if (!brand) return;
                  const updated = queries.filter((_, i) => !selectedQueries.has(i));
                  fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) }).then(() => { fetchBrands(); setSelectedQueries(new Set()); setSelectMode(false); });
                }}>🗑 DELETE SELECTED ({selectedQueries.size})</button>
              )}
            </div>
          </div>
          {bulkAddOpen && (
            <div style={{ marginTop: 12 }}>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={'Paste multiple queries here — one per line'} style={{ width: '100%', minHeight: 120, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: 10, resize: 'vertical', boxSizing: 'border-box', borderRadius: 'var(--radius-xs)' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 11 }} onClick={() => {
                  const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
                  if (lines.length && brand) { fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: [...queries, ...lines] }) }).then(() => { fetchBrands(); setBulkText(''); setBulkAddOpen(false); }); }
                }}>ADD ALL QUERIES</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>One query per line</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
