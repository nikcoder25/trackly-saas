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

  return (
    <div>
      {/* Global dashboard styles: transitions, responsive, card consistency */}
      <style>{`
        .ov-section { transition: opacity .25s ease, max-height .3s ease; overflow: hidden; }
        .ov-section-hidden { opacity: 0; max-height: 0; margin: 0 !important; padding: 0 !important; border: none !important; }
        .card { border-radius: var(--radius) !important; box-shadow: var(--app-shadow) !important; border: 1px solid var(--border) !important; }
        .stat-card { border-radius: var(--radius) !important; box-shadow: var(--app-shadow) !important; }
        @media(max-width:768px) {
          .ov-hero-wrap { flex-direction: column !important; }
          .ov-hero-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .ov-score-grid { grid-template-columns: 1fr !important; }
          .ov-cat-grid { grid-template-columns: 1fr !important; }
          .ov-plat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .ov-qp-grid { grid-template-columns: 1fr !important; }
          .ov-header { flex-direction: column !important; align-items: stretch !important; }
          .ov-controls { flex-direction: column !important; align-items: stretch !important; }
          .ov-compare-btns { flex-wrap: wrap !important; }
        }
      `}</style>

      {/* Header */}
      <div className="ov-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="view-title">{brand.name}</h1>
          <p className="view-sub">{brand.industry || ''} {brand.city ? '· ' + brand.city : ''}</p>
        </div>
        <div className="ov-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Compare Toggle — each button has its own border */}
          <div className="ov-compare-btns" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['current', 'week', 'month'] as const).map(m => (
              <button key={m} onClick={() => setCompareMode(m)}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--radius-xs)',
                  border: compareMode === m ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: compareMode === m ? 'var(--primary)' : 'var(--bg2)',
                  color: compareMode === m ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', transition: 'all .15s', fontFamily: 'var(--font)',
                }}>
                {m === 'current' ? 'Current' : m === 'week' ? 'vs Last Week' : 'vs Last Month'}
              </button>
            ))}
          </div>
          {/* Preset Selector with section count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={preset}
              onChange={e => setPreset(e.target.value as typeof preset)}
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              <option value="all">All Sections ({allSections.length})</option>
              <option value="founder">Founder View ({presetMap.founder.length})</option>
              <option value="seo">SEO Manager ({presetMap.seo.length})</option>
              <option value="agency">Agency View ({presetMap.agency.length})</option>
            </select>
            {preset !== 'all' && (
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 100, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}>
                {visibleSections.length}/{allSections.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Next Run Badge — rendered client-only via useEffect state */}
      {nextRunText && (() => {
        const [type, text] = nextRunText.split('|');
        const isOverdue = type === 'overdue';
        return (
          <div className={`rounded-lg px-4 py-2 mb-4 text-[11px] font-medium flex items-center gap-2 ${isOverdue ? 'bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.15)] text-[var(--amber)]' : 'bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.15)] text-[var(--blue)]'}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> {text}
          </div>
        );
      })()}

      {/* Alert Strip */}
      {alerts.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {alerts.map((a, i) => (
            <span key={i} className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium ${
              a.type === 'danger' ? 'bg-[rgba(239,68,68,0.08)] text-[var(--red)]' :
              a.type === 'warn' ? 'bg-[rgba(245,158,11,0.08)] text-[var(--amber)]' :
              'bg-[rgba(59,130,246,0.08)] text-[var(--blue)]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                a.type === 'danger' ? 'bg-[var(--red)]' : a.type === 'warn' ? 'bg-[var(--amber)]' : 'bg-[var(--blue)]'
              }`} />
              {a.text}
            </span>
          ))}
        </div>
      )}

      {/* API Health Banner — matching legacy format */}
      {apiTotalResponses > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-4 py-2.5 mb-4 flex items-center gap-3 text-[11px] flex-wrap">
          <span className="w-2 h-2 rounded-full" style={{ background: apiHealthColor }} />
          <span className="text-[var(--text)] font-medium"><strong>{apiHealthy}/{apiTotal}</strong> platforms healthy</span>
          <span className="text-[var(--muted)]">·</span>
          <span className="text-[var(--muted)]"><strong>{apiTotalResponses - apiErrors}</strong> valid responses</span>
          <span className="text-[var(--muted)]">·</span>
          <span style={{ color: apiErrors > 0 ? 'var(--red)' : 'var(--green)' }}>{apiErrors === 0 ? '✓ No errors' : `${apiErrors} error${apiErrors !== 1 ? 's' : ''}`}</span>
          {apiErrors > 0 && (
            <Link href="/dashboard/activity" className="text-[var(--red)] font-mono text-[10px] hover:underline ml-auto no-underline">View Errors →</Link>
          )}
        </div>
      )}

      {/* SOV Hero Card */}
      <div className="card ov-hero-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <div className="text-center shrink-0">
          <div className="relative w-[120px] h-[120px]">
            <svg viewBox="0 0 120 120" className="w-full h-full">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold font-mono text-[var(--text)]">{sov}%</span>
              {sovChange !== null && sovChange !== 0 && (
                <span title="Compared to previous run" className={`text-[10px] font-mono font-bold ${sovChange > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`} style={{ cursor: 'help' }}>
                  {sovChange > 0 ? '▲' : '▼'} {Math.abs(sovChange)}%
                </span>
              )}
            </div>
          </div>
          <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-2">Share of Voice<MetricTooltip text="Percentage of AI responses that mention your brand out of all tracked queries" /></div>
        </div>
        {/* Compare banner */}
        {compareRun && (
          <div style={{ width: '100%', padding: '8px 14px', background: 'var(--primary-light)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-xs)', marginBottom: 12, fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
            Comparing with run from {compareRun.date ? new Date(compareRun.date).toLocaleDateString() : '?'}: SOV was {compareRun.sov ?? 0}% (now {sov}%, {sov - (compareRun.sov ?? 0) >= 0 ? '+' : ''}{sov - (compareRun.sov ?? 0)}%)
          </div>
        )}
        <div className="ov-hero-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, flex: 1, width: '100%' }}>
          <HeroStat label="Mentions / Total" value={`${totalM} / ${totalQ}`} />
          <HeroStat label="Platforms Active" value={String(Object.values(platforms).filter(p => (p as Record<string,number>).total > 0).length)} />
          <HeroStat label="Queries Tracked" value={String(queries.length)} />
          <HeroStat label="Last Run" value={lastRunAge || '--'} />
          <HeroStat label="Run Duration" value={(() => {
            const d = lastRun?.duration;
            if (d === undefined || d === null) return 'N/A';
            const s = typeof d === 'number' ? (d > 1000 ? Math.round(d / 1000) : d) : 0;
            return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
          })()} />
        </div>
      </div>

      {/* GEO Score / AI Sentiment / AI Recommends You */}
      {show('scores') && (
      <div className="stat-grid ov-score-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* GEO Score */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <div className="text-[32px] font-extrabold font-mono leading-none" style={{ color: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : geoScore > 0 ? 'var(--red)' : 'var(--muted)' }}>{geoScore}<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>/100</span></div>
          <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-1 mb-2">GEO Score<MetricTooltip text="Measures how well AI platforms associate your brand with your geographic location (0-100)" /></div>
          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', borderRadius: 4, width: `${geoScore}%`, background: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : geoScore > 0 ? 'var(--red)' : 'var(--muted)', transition: 'width .5s', minWidth: geoScore > 0 ? 8 : 0 }} />
          </div>
          <div className="text-[11px] font-semibold" style={{ color: geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : geoScore > 0 ? 'var(--red)' : 'var(--muted)' }}>
            {geoScore >= 70 ? 'Strong' : geoScore >= 40 ? 'Growing' : geoScore > 0 ? 'Weak' : 'Not Visible'}
          </div>
        </div>
        {/* AI Sentiment */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <div className="text-[32px] font-extrabold font-mono leading-none" style={{ color: sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : sentimentScore > 0 ? 'var(--red)' : 'var(--muted)' }}>{sentimentScore}</div>
          <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-1 mb-2">AI Sentiment<MetricTooltip text="Overall sentiment of AI responses mentioning your brand (positive, neutral, negative)" /></div>
          <div className="h-[6px] bg-[var(--bg3)] rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sentimentScore}%`, background: sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : sentimentScore > 0 ? 'var(--red)' : 'var(--muted)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />{posCount} positive</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)' }} />{neuCount} neutral</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />{negCount} negative</span>
          </div>
        </div>
        {/* AI Recommends You */}
        <div className="stat-card" style={{ textAlign: 'center' }}>
          {recommendedPct > 0 ? (
            <div className="text-[32px] font-extrabold font-mono leading-none" style={{ color: recommendedPct >= 40 ? 'var(--green)' : 'var(--amber)' }}>{recommendedPct}<span className="text-[18px]">%</span></div>
          ) : (
            <div className="text-[24px] font-extrabold leading-none" style={{ color: 'var(--muted)' }}>Not yet</div>
          )}
          <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-1 mb-2">AI Recommends You<MetricTooltip text="Percentage of AI responses that actively recommend your brand" /></div>
          {recommendedPct > 0 && (
            <div className="h-[6px] bg-[var(--bg3)] rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${recommendedPct}%`, background: recommendedPct >= 40 ? 'var(--green)' : 'var(--amber)' }} />
            </div>
          )}
          <div className="text-[11px] font-semibold" style={{ color: recommendedPct >= 50 ? 'var(--green)' : recommendedPct > 0 ? 'var(--amber)' : 'var(--muted)' }}>
            {recommendedPct >= 50 ? 'Strong endorsement' : recommendedPct > 0 ? 'Room to grow' : 'Run queries to start tracking'}
          </div>
        </div>
      </div>
      )}

      {/* AI Category Breakdown — always show */}
      {show('categories') && (
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>AI Category Breakdown</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Share of Voice by platform type</span>
        </div>
        <div className="ov-cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]" style={{ borderTop: `2px solid ${chatStats.sov >= 40 ? 'var(--green)' : chatStats.sov > 0 ? 'var(--amber)' : 'var(--red)'}` }}>
            <div className="text-[11px] text-[var(--muted)] font-medium mb-1">💬 Chat AI SOV</div>
            <div className="text-2xl font-extrabold font-mono" style={{ color: chatStats.sov >= 40 ? 'var(--green)' : chatStats.sov > 0 ? 'var(--amber)' : 'var(--red)' }}>{chatStats.sov}%</div>
            <div className="text-[11px] text-[var(--muted)] mt-1">Mentioned in {chatStats.mentioned} of {chatStats.total} responses</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono">ChatGPT · Claude · Grok</div>
          </div>
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]" style={{ borderTop: `2px solid ${searchStats.sov >= 40 ? 'var(--green)' : searchStats.sov > 0 ? 'var(--amber)' : 'var(--red)'}` }}>
            <div className="text-[11px] text-[var(--muted)] font-medium mb-1">🔍 Search AI SOV</div>
            <div className="text-2xl font-extrabold font-mono" style={{ color: searchStats.sov >= 40 ? 'var(--green)' : searchStats.sov > 0 ? 'var(--amber)' : 'var(--red)' }}>{searchStats.sov}%</div>
            <div className="text-[11px] text-[var(--muted)] mt-1">Mentioned in {searchStats.mentioned} of {searchStats.total} responses</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono">Perplexity · Gemini</div>
          </div>
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4" style={{ borderTop: `2px solid ${bestPlatform && bestPlatform.sov > 0 ? 'var(--green)' : 'var(--muted)'}` }}>
            <div className="text-[11px] text-[var(--muted)] font-medium mb-1">🏆 Best Platform</div>
            {bestPlatform && bestPlatform.sov > 0 ? (
              <>
                <div className="text-2xl font-extrabold font-mono text-[var(--green)]">{bestPlatform.name}</div>
                <div className="text-[11px] text-[var(--muted)] mt-1">{bestPlatform.sov}% SOV — strongest visibility</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-extrabold font-mono text-[var(--muted)]">--</div>
                <div className="text-[11px] text-[var(--muted)] mt-1">No platform data yet</div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Location Visibility */}
      {show('scores') && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>📍 Location Visibility</div>
            {brand.city && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {brand.city}{nearbyAreas && nearbyAreas.length > 0 ? ` + ${nearbyAreas.length} nearby areas` : ''}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-extrabold font-mono" style={{ color: locationData.rate >= 40 ? 'var(--green)' : locationData.rate > 0 ? 'var(--amber)' : 'var(--red)' }}>
                {locationData.rate}%
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-1">City Match Rate<MetricTooltip text="Percentage of AI responses that mention your specific city/location" /></div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5">AI mentions your location in responses</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">Areas where AI finds you</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(locationData.areas).length > 0 ? (
                  Object.entries(locationData.areas).map(([area, count]) => (
                    <span key={area} className="inline-flex items-center gap-1 bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-[11px] px-2.5 py-1 rounded-full">
                      {area} <span className="font-mono text-[var(--muted)]">{count}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-[var(--muted)]">No area mentions detected yet</span>
                )}
              </div>
            </div>
          </div>
          {locationData.rate < 30 && (
            <div className="mt-3 bg-[rgba(59,130,246,0.05)] border border-[rgba(59,130,246,0.12)] rounded-lg px-3 py-2 text-[11px] text-[var(--blue)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              <strong>Tip:</strong> Include city and neighborhood names in your tracked queries to improve local AI visibility.
            </div>
          )}
        </div>
      )}

      {/* Platform Cards */}
      {show('platforms') && (
      <div className="ov-plat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 14 }}>
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
          const pd = platforms[name] || {};
          const pSov = (pd as Record<string, number>).sov || 0;
          const pTotal = (pd as Record<string, number>).total || 0;
          const isActive = pTotal > 0;
          return (
            <div key={name} className="stat-card" style={{ textAlign: 'center', borderTop: `3px solid ${color}`, opacity: isActive ? 1 : 0.6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{name}</div>
              <div style={{
                display: 'inline-block', fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                padding: '2px 10px', borderRadius: 100, marginBottom: 10,
                background: isActive ? 'rgba(16,185,129,.08)' : 'var(--bg3)',
                color: isActive ? 'var(--green)' : 'var(--muted)',
                border: `1px solid ${isActive ? 'rgba(16,185,129,.2)' : 'var(--border)'}`,
                textTransform: 'uppercase', letterSpacing: '.3px',
              }}>● {isActive ? 'ACTIVE' : 'INACTIVE'}</div>
              {isActive ? (
                <>
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${pSov}%`, background: color, transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--muted)' }}>{pSov}%</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Not configured</div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* SOV Trend — SVG Line/Area Chart */}
      {show('trend') && sovTrend.length > 1 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>SOV Trend</div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last {sovTrend.length} runs</span>
          </div>
          <SovTrendChart data={sovTrend} />
        </div>
      )}

      {/* Query Performance + Competitors Row */}
      {show('qperf') && (
      <div className="ov-qp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* Query Performance — horizontal bars like legacy */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Query Performance</div>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
              {queries.length} queries {queryPerfData.length > 0 ? `· Avg ${Math.round(queryPerfData.reduce((s, q) => s + q.rate, 0) / queryPerfData.length)}%` : ''}
            </span>
          </div>
          {queryPerfData.length > 0 ? queryPerfData.slice(0, 8).map((q, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span title={q.query} style={{ fontSize: 12, color: 'var(--text)', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: q.rate >= 50 ? 'var(--green)' : q.rate > 0 ? 'var(--amber)' : 'var(--red)' }}>{q.rate}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${q.rate}%`, background: q.rate >= 50 ? 'var(--green)' : q.rate > 0 ? 'var(--amber)' : 'var(--red)', transition: 'width .3s' }} />
              </div>
            </div>
          )) : queries.length > 0 ? queries.slice(0, 8).map((q, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span title={q} style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{q}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>No data</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3 }} />
            </div>
          )) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>No queries yet</p>}
          {queries.length > 8 && <Link href="/dashboard/query-performance" style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>View all {queries.length} queries →</Link>}
        </div>

        {/* Competitors in AI — tag pills like legacy */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Competitors in AI</div>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
              {topCompetitors.length || (brand.competitors || []).length} brands
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topCompetitors.length > 0 ? topCompetitors.map(([name, count], i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 100, fontSize: 12, color: 'var(--text)' }}>
                {name} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{count}x</span>
              </span>
            )) : (brand.competitors || []).length > 0 ? (brand.competitors || []).map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 100, fontSize: 12, color: 'var(--text)' }}>
                {c} <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>No SOV data</span>
              </span>
            )) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Add competitors in Brand Setup</p>}
          </div>
        </div>
      </div>
      )}

      {/* Citation Sources */}
      {show('citations') && (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Citation Sources</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Where AI pulls information from</div>
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{topCitations.length} domains</span>
        </div>
        {topCitations.length > 0 ? (() => {
          const maxCount = topCitations[0] ? topCitations[0][1] : 1;
          return topCitations.map(([domain, count], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 140, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${(count / maxCount) * 100}%`, background: 'var(--primary)', transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', minWidth: 32, textAlign: 'right' }}>{count}×</span>
            </div>
          ));
        })() : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Citation tracking requires AI platforms that provide source links (Perplexity, Gemini). Run queries to start collecting citation data.</p>}
      </div>
      )}

      {/* Actionable Insights */}
      {show('insights') && (
      <div className="card">
        <div className="card-title">Actionable Insights</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* SOV drop takes priority over SOV level */}
          {sovChange !== null && sovChange < -5 && <InsightCard color="var(--red)" icon="⚠" title="SOV Declined" desc={`Your SOV dropped ${Math.abs(sovChange)}% since last run. Review your content strategy and check which platforms lost visibility.`} link="/dashboard/trends" />}
          {sovChange !== null && sovChange > 10 && <InsightCard color="var(--green)" icon="▲" title="SOV Improving" desc={`Great news! Your SOV improved +${sovChange}% since last run. Keep up the momentum.`} link="/dashboard/trends" />}
          {sov === 0 && <InsightCard color="var(--amber)" icon="⚠" title="Getting Started with GEO" desc="Your SOV is 0%. Run queries and check Recommendations for optimization tips." link="/dashboard/recommendations" />}
          {sov > 0 && sov < 50 && (sovChange === null || sovChange >= -5) && <InsightCard color="var(--primary)" icon="▲" title="Growing Your AI Presence" desc={`Your SOV is ${sov}%. Focus on high-performing queries and optimize content for AI platforms.`} link="/dashboard/recommendations" />}
          {sov >= 50 && (sovChange === null || sovChange >= -5) && <InsightCard color="var(--green)" icon="✓" title="Strong AI Visibility" desc={`Your SOV is ${sov}%. Keep monitoring and expanding your query coverage.`} link="/dashboard/query-performance" />}
          {Object.values(platforms).some(p => (p as Record<string, number>).sov === 0) && Object.values(platforms).some(p => (p as Record<string, number>).total > 0) && <InsightCard color="var(--red)" icon="◎" title="Platform Gap Detected" desc="Some platforms show 0% SOV. Check Platform Status for details." link="/dashboard/platforms" />}
          {sentTotal > 0 && negCount > posCount && <InsightCard color="var(--red)" icon="⚠" title="Negative Sentiment Detected" desc="More negative than positive sentiment. Review responses and optimize brand content." link="/dashboard/mentions" />}
          {!brand.city && <InsightCard color="var(--blue)" icon="ℹ" title="Set Your Location" desc="Add a city in Brand Setup to track local AI visibility." link="/dashboard/setup" />}
        </div>
      </div>
      )}

      {/* Last Run Summary */}
      {show('lastrun') && lastRun && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Last Run — {lastRun.date ? (() => {
                const d = new Date(lastRun.date);
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const h = d.getHours();
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                const mm = String(d.getMinutes()).padStart(2, '0');
                return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
              })() : 'Unknown'}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>Found {totalM}/{totalQ}</span>
              <Link href="/dashboard/mentions" style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--primary)', textDecoration: 'none' }}>
                View All →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tracked Queries */}
      {show('queries') && (
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Tracked Queries</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{queries.length} / {planLimit > 1000 ? '∞' : planLimit} queries</div>
          </div>
          <Link href="/dashboard/setup" style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--primary)', textDecoration: 'none' }}>Manage Queries</Link>
        </div>
        {queries.length >= planLimit && planLimit < 999 && (
          <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', padding: '8px 14px', marginBottom: 12, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--mono)', borderRadius: 'var(--radius-xs)' }}>
            Query limit reached. Upgrade your plan for more queries.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {queries.map((q, i) => (
            <span key={i} title={q} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', border: selectMode && selectedQueries.has(i) ? '2px solid var(--primary)' : '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 100, cursor: selectMode ? 'pointer' : 'default' }}
              onClick={() => { if (selectMode) setSelectedQueries(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; }); }}>
              {selectMode && <span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderRadius: 3, background: selectedQueries.has(i) ? 'var(--primary)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, marginRight: 2 }}>{selectedQueries.has(i) ? '✓' : ''}</span>}
              {q}
              {!selectMode && <button onClick={() => removeQuery(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, marginLeft: 4, padding: 0, lineHeight: 1 }}>&times;</button>}
            </span>
          ))}
          {queries.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No queries yet. Add some below.</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={newQuery} onChange={e => setNewQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuery()}
            placeholder="Add a new query..." className="finp" style={{ flex: 1, marginBottom: 0 }} />
          <button onClick={addQuery} className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }}>+ Add</button>
        </div>

        {/* BULK ADD modal */}
        {bulkAddOpen && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Paste queries (one per line)</div>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5} style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 10, fontSize: 13, fontFamily: 'var(--font)', color: 'var(--text)', resize: 'vertical' }} placeholder="best hvac company austin&#10;top plumber near me&#10;affordable ac repair" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }} onClick={() => {
                const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length && brand) {
                  const updated = [...queries, ...lines];
                  fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
                    .then(() => { fetchBrands(); setBulkText(''); setBulkAddOpen(false); });
                }
              }}>Add {bulkText.split('\n').filter(l => l.trim()).length} Queries</button>
              <button className="pill-btn" onClick={() => setBulkAddOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Select mode: delete selected */}
        {selectMode && selectedQueries.size > 0 && (
          <div style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 'var(--radius-xs)', padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--red)' }}>{selectedQueries.size} selected</span>
            <button className="pill-btn" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }} onClick={() => {
              if (!brand) return;
              const updated = queries.filter((_, i) => !selectedQueries.has(i));
              fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
                .then(() => { fetchBrands(); setSelectedQueries(new Set()); setSelectMode(false); });
            }}>DELETE SELECTED</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="pill-btn" onClick={() => setBulkAddOpen(!bulkAddOpen)}>BULK ADD</button>
          <button className="pill-btn" style={{ color: 'var(--green)', borderColor: 'rgba(16,185,129,.3)' }} onClick={() => {
            if (!brand) return;
            const industry = brand.industry || 'services';
            const city = brand.city || '';
            const suggestions = [
              `best ${industry} in ${city || 'my area'}`,
              `top rated ${industry} near me`,
              `${brand.name} reviews`,
              `recommended ${industry} companies`,
              `${industry} cost ${city}`,
            ].filter(s => !queries.includes(s));
            if (suggestions.length && brand) {
              const updated = [...queries, ...suggestions];
              fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
                .then(() => fetchBrands());
            }
          }}>SUGGEST</button>
          <button className="pill-btn" style={{ color: 'var(--blue)', borderColor: 'rgba(59,130,246,.3)' }} onClick={() => {
            if (!brand) return;
            const name = brand.name;
            const generated = [
              `what is ${name}`,
              `is ${name} good`,
              `${name} vs competitors`,
              `${name} pricing`,
              `alternatives to ${name}`,
            ].filter(s => !queries.includes(s));
            if (generated.length && brand) {
              const updated = [...queries, ...generated];
              fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: updated }) })
                .then(() => fetchBrands());
            }
          }}>AI GENERATE</button>
          <button className="pill-btn" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }} onClick={() => {
            if (!brand || !queries.length) return;
            setShowClearConfirm(true);
          }}>CLEAR ALL</button>
          <button className="pill-btn" style={selectMode ? { color: 'var(--primary)', borderColor: 'var(--primary-border)', background: 'var(--primary-light)' } : {}} onClick={() => { setSelectMode(!selectMode); setSelectedQueries(new Set()); }}>{selectMode ? '✓ DONE' : '☐ SELECT'}</button>
        </div>

        {/* Clear All Confirmation Modal */}
        {showClearConfirm && (
          <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>Are you sure you want to remove all {queries.length} queries?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>This cannot be undone. All tracked queries will be permanently deleted.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pill-btn" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12, background: 'var(--red)' }} onClick={() => {
                if (!brand) return;
                fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ queries: [] }) })
                  .then(() => { fetchBrands(); setShowClearConfirm(false); });
              }}>Yes, Remove All Queries</button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-extrabold font-mono text-[var(--text)]">{value}</div>
      <div className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function InsightCard({ color, icon, title, desc, link }: { color: string; icon: string; title: string; desc: string; link: string }) {
  return (
    <Link href={link} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', textDecoration: 'none', transition: 'all .15s', borderLeft: `3px solid ${color}` }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>
      <span style={{ fontSize: 18, color, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>View →</span>
    </Link>
  );
}

function MetricTooltip({ text }: { text: string }) {
  return (
    <span title={text} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: 'var(--bg3)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'help', marginLeft: 4, verticalAlign: 'middle', border: '1px solid var(--border)' }}>?</span>
  );
}

function SovTrendChart({ data }: { data: Array<{ sov: number; date: string }> }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 600, H = 160, PL = 36, PR = 12, PT = 10, PB = 24;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const maxSov = Math.max(100, ...data.map(d => d.sov));

  const points = data.map((d, i) => ({
    x: PL + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2),
    y: PT + chartH - (d.sov / maxSov) * chartH,
    sov: d.sov,
    date: d.date,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x},${PT + chartH} L${points[0].x},${PT + chartH} Z`;

  const yTicks = [0, 25, 50, 75, 100].filter(v => v <= maxSov);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 180 }}>
        <defs>
          <linearGradient id="sovGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Y-axis grid lines */}
        {yTicks.map(v => {
          const y = PT + chartH - (v / maxSov) * chartH;
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={PL - 6} y={y + 3} textAnchor="end" style={{ fontSize: 9, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
            </g>
          );
        })}
        {/* X-axis labels */}
        {points.filter((_, i) => data.length <= 7 || i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
            {p.date ? (() => { const d = new Date(p.date); return `${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })() : `#${i + 1}`}
          </text>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#sovGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 3}
            fill={hoverIdx === i ? 'var(--primary)' : 'var(--bg2)'}
            stroke="var(--primary)" strokeWidth="2"
            style={{ cursor: 'pointer', transition: 'r .15s' }}
            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
        ))}
      </svg>
      {/* Hover tooltip */}
      {hoverIdx !== null && points[hoverIdx] && (
        <div style={{
          position: 'absolute', left: `${(points[hoverIdx].x / W) * 100}%`, top: `${(points[hoverIdx].y / H) * 100 - 14}%`,
          transform: 'translateX(-50%)', background: 'var(--text)', color: '#fff', padding: '4px 10px',
          borderRadius: 'var(--radius-xs)', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
        }}>
          {points[hoverIdx].sov}% · {points[hoverIdx].date ? new Date(points[hoverIdx].date).toLocaleDateString() : ''}
        </div>
      )}
    </div>
  );
}
