'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRun, type LiveResult } from '@/contexts/RunContext';
// Language removed from dashboard
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
  const { live, elapsed, pct } = useRun();
  // Language removed
  const [brands, setBrands] = useState<Brand[]>([]);
  const [toasts, setToasts] = useState<Array<LiveResult & { id: number }>>([]);
  const toastIdRef = { current: 0 };
  const [loading, setLoading] = useState(true);
  const [newQuery, setNewQuery] = useState('');
  const [compareMode, setCompareMode] = useState<'current' | 'week' | 'month'>('current');
  const [preset, setPreset] = useState<'all' | 'founder' | 'seo' | 'agency'>('all');
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedQueries, setSelectedQueries] = useState<Set<number>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [queryMsg, setQueryMsg] = useState('');

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

  // Toast notifications — spawn a card for each new result
  const lastResultCountRef = { current: 0 };
  useEffect(() => {
    if (live.results.length <= lastResultCountRef.current) return;
    const newResults = live.results.slice(lastResultCountRef.current);
    lastResultCountRef.current = live.results.length;
    const newToasts = newResults.map(r => ({ ...r, id: ++toastIdRef.current }));
    setToasts(prev => [...prev, ...newToasts].slice(-6)); // keep max 6 visible
    // Auto-dismiss each toast after 4s
    const ids = newToasts.map(t => t.id);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => !ids.includes(t.id)));
    }, 4000);
  }, [live.results.length]);

  // Live computed scores (override static values during run)
  const liveSOV = live.running && live.received > 0
    ? Math.round((live.foundCount / live.received) * 100) : null;
  const liveTotalM = live.running ? live.foundCount : null;
  const liveTotalQ = live.running ? live.received : null;

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

  // Normalize platform data — handles both number format (SOV%) and object format
  function normPlatform(pd: unknown): { sov: number; total: number; mentions: number; errors: number } {
    if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
    if (typeof pd === 'object' && pd !== null) {
      const o = pd as Record<string, number>;
      return { sov: o.sov || 0, total: o.total || o.queries || 0, mentions: o.mentions || 0, errors: o.errors || 0 };
    }
    return { sov: 0, total: 0, mentions: 0, errors: 0 };
  }
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

  // AI Category Breakdown (Chat AI vs Search AI) — only count active platforms
  const chatNames = ['ChatGPT', 'Claude', 'Grok'];
  const searchNames = ['Perplexity', 'Gemini'];

  const chatStats = useMemo(() => {
    let total = 0, mentioned = 0;
    const active: string[] = [];
    Object.entries(platforms).forEach(([name, pd]) => {
      if (chatNames.includes(name)) { const n = normPlatform(pd); if (n.total > 0) { total += n.total; mentioned += n.mentions; active.push(name); } }
    });
    return { total, mentioned, sov: total > 0 ? Math.round(mentioned / total * 100) : 0, active };
  }, [platforms]);

  const searchStats = useMemo(() => {
    let total = 0, mentioned = 0;
    const active: string[] = [];
    Object.entries(platforms).forEach(([name, pd]) => {
      if (searchNames.includes(name)) { const n = normPlatform(pd); if (n.total > 0) { total += n.total; mentioned += n.mentions; active.push(name); } }
    });
    return { total, mentioned, sov: total > 0 ? Math.round(mentioned / total * 100) : 0, active };
  }, [platforms]);

  const bestPlatform = useMemo(() => {
    const entries = Object.entries(platforms).map(([name, pd]) => ({ name, sov: normPlatform(pd).sov }));
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

  // API Health summary — normalize platform data (handles both number and object formats)
  const apiTotalResponses = Object.values(platforms).reduce((s, p) => s + normPlatform(p).total, 0);
  const apiErrors = Object.values(platforms).reduce((s, p) => s + normPlatform(p).errors, 0);
  const apiHealthy = Object.values(platforms).filter(p => { const n = normPlatform(p); return n.total > 0 && (n.errors === 0 || n.errors / n.total < 0.3); }).length;
  const apiTotal = Object.values(platforms).filter(p => normPlatform(p).total > 0).length;
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
      {/* ═══ LIVE PROGRESS BAR (main content area) ═══ */}
      {(live.running || live.status === 'done') && (
        <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700 }}>
                {live.running && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />}
                {live.running ? 'RUNNING QUERIES' : 'RUN COMPLETE'}
              </span>
              {live.running && live.received > 0 && (
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  {live.received}/{live.totalExpected}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
              {live.foundCount > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>{live.foundCount} found</span>}
              {live.errorCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{live.errorCount} error{live.errorCount > 1 ? 's' : ''}</span>}
              {live.running && elapsed && <span style={{ color: 'var(--muted)' }}>{elapsed}</span>}
            </div>
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: live.status === 'done' ? '100%' : `${pct}%`,
              height: '100%', background: live.status === 'done' ? 'var(--green)' : 'var(--primary)',
              borderRadius: 4, transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 6 }}>
            {live.statusText}
            {live.running && liveSOV !== null && ` · Live SOV: ${liveSOV}%`}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="ov-header">
        <div className="ov-header-left">
          <div className="view-title">{brand.name}</div>
          <div className="view-sub">{[brand.industry, brand.city].filter(Boolean).join(' · ') || 'Select a brand and queries run automatically on schedule.'}</div>
        </div>
        <div className="ov-header-right">
          {nextRunText && (() => { const [type, text] = nextRunText.split('|'); return <div className="next-run-badge" style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:'var(--radius-xs)',fontSize:11,fontFamily:'var(--mono)',fontWeight:600,background:type==='overdue'?'rgba(245,158,11,.06)':'rgba(59,130,246,.06)',color:type==='overdue'?'var(--amber)':'var(--blue)',border:`1px solid ${type==='overdue'?'rgba(245,158,11,.15)':'rgba(59,130,246,.15)'}` }}><span>⏱</span> {text}</div>; })()}
          <div className="compare-toggle" style={{display:'flex',gap:4}}>
            {(['current','week','month'] as const).map(m => <button key={m} onClick={()=>setCompareMode(m)} className={compareMode===m?'active':''} style={{padding:'6px 12px',fontSize:11,fontWeight:600,borderRadius:'var(--radius-xs)',border:compareMode===m?'1px solid var(--primary)':'1px solid var(--border)',background:compareMode===m?'var(--primary)':'var(--bg2)',color:compareMode===m?'#fff':'var(--muted)',cursor:'pointer',fontFamily:'var(--font)'}}>{m==='current'?'Current':m==='week'?'vs Last Week':'vs Last Month'}</button>)}
          </div>
          <select className="finp" value={preset} onChange={e=>setPreset(e.target.value as typeof preset)} style={{width:150,margin:0,fontSize:11,padding:'4px 8px'}}>
            <option value="all">All Sections</option>
            <option value="founder">Founder View</option>
            <option value="seo">SEO Manager</option>
            <option value="agency">Agency View</option>
          </select>
        </div>
      </div>

      {/* ALERT STRIP — white cards with colored dot matching production screenshot */}
      {alerts.length > 0 && <div className="alerts-strip">{alerts.map((a,i) => <div key={i} className={`alert-chip ${a.type}`}><span className="alert-dot" style={{background:a.type==='danger'?'var(--red)':a.type==='warn'?'var(--amber)':'var(--blue)'}}/><div style={{flex:1,minWidth:0}}><div className="alert-text">{a.text}</div><div className="alert-time">{now>0&&lastRun?.date?(()=>{const diff=now-new Date(lastRun.date).getTime();const days=Math.floor(diff/86400000);return days>0?`${days}d ago`:'today';})():''}</div></div></div>)}</div>}

      {/* SOV HERO — shows live values during run */}
      {(() => {
        const displaySOV = liveSOV !== null ? liveSOV : sov;
        const displayM = liveTotalM !== null ? liveTotalM : totalM;
        const displayQ = liveTotalQ !== null ? liveTotalQ : totalQ;
        const displayOffset = circumference - (displaySOV / 100) * circumference;
        return (
      <div className="ov-hero">
        <div className="ov-hero-sov">
          <div className="ov-hero-sov-ring">
            <svg viewBox="0 0 120 120" className="ov-ring-svg">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" strokeWidth="8"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke={live.running ? 'var(--green)' : 'var(--primary)'} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={displayOffset} strokeLinecap="round" transform="rotate(-90 60 60)" style={{transition:'stroke-dashoffset .6s ease'}}/>
            </svg>
            <div className="ov-ring-label">
              <span className="ov-ring-pct" style={{color:displaySOV>=50?'var(--green)':displaySOV>0?'var(--primary)':'var(--muted)'}}>{displaySOV}%</span>
              {live.running && <span style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--green)',fontWeight:700}}>LIVE</span>}
              {!live.running&&sovChange!==null&&sovChange!==0&&<span className="ov-ring-diff" style={{color:sovChange>0?'var(--green)':'var(--red)'}} title="Compared to previous run">{sovChange>0?'▲':'▼'}{Math.abs(sovChange)}%</span>}
            </div>
          </div>
          <div className="ov-hero-sov-label">Share of Voice</div>
        </div>
        <div className="ov-hero-stats">
          <div className="ov-hero-stat"><div className="ov-hero-stat-val" style={live.running?{color:'var(--green)'}:{}}>{displayM} / {displayQ}</div><div className="ov-hero-stat-lbl">Mentions / Total</div></div>
          <div className="ov-hero-stat"><div className="ov-hero-stat-val">{Object.values(platforms).filter(p=>normPlatform(p).total>0).length} / {Object.keys(PLATFORM_COLORS).length}</div><div className="ov-hero-stat-lbl">Platforms Active</div></div>
          <div className="ov-hero-stat"><div className="ov-hero-stat-val">{queries.length} / {planLimit>1000?'∞':planLimit}</div><div className="ov-hero-stat-lbl">Queries Tracked</div></div>
          <div className="ov-hero-stat"><div className="ov-hero-stat-val" style={{color:live.running?'var(--green)':lastRunAge.includes('d')?'var(--amber)':''}}>{live.running?elapsed||'0s':lastRunAge||'--'}</div><div className="ov-hero-stat-lbl">{live.running?'Run Duration':'Last Run'}</div></div>
          <div className="ov-hero-stat"><div className="ov-hero-stat-val">{live.running?`${live.received - live.foundCount - live.errorCount}`:fmtDuration(lastRun?.duration)}</div><div className="ov-hero-stat-lbl">{live.running?'Not Found':'Run Duration'}</div></div>
        </div>
      </div>
        );
      })()}

      {/* COMPARE BANNER — shows when vs Last Week or vs Last Month is active */}
      {compareRun && compareMode !== 'current' && (
        <div style={{padding:'10px 16px',marginBottom:14,background:'var(--primary-light)',border:'1px solid var(--primary-border)',borderRadius:'var(--radius-xs)',fontSize:12,fontFamily:'var(--mono)',color:'var(--primary)',display:'flex',alignItems:'center',gap:8}}>
          <span>📊</span>
          Comparing with run from {compareRun.date ? new Date(compareRun.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '?'}:
          SOV was {compareRun.sov ?? 0}% → now {sov}%
          <span style={{fontWeight:700,color:sov-(compareRun.sov??0)>=0?'var(--green)':'var(--red)'}}>
            ({sov-(compareRun.sov??0)>=0?'+':''}{sov-(compareRun.sov??0)}%)
          </span>
        </div>
      )}
      {compareMode !== 'current' && !compareRun && (
        <div style={{padding:'10px 16px',marginBottom:14,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',fontSize:12,color:'var(--muted)'}}>
          No comparison data available for {compareMode === 'week' ? 'last week' : 'last month'}. Need more runs to compare.
        </div>
      )}

      {/* API HEALTH — live counter during run */}
      {show('health') && (apiTotalResponses > 0 || live.running) && (
        <div className="ov-health">
          <span className="ov-health-dot" style={{ background: live.running ? 'var(--green)' : apiHealthColor }} />
          <span className="ov-health-text">
            {live.running
              ? <>{live.received - live.errorCount} ok · {live.errorCount} errors · {live.received}/{live.totalExpected} total</>
              : <>{apiHealthy}/{apiTotal} platforms healthy · {apiTotalResponses - apiErrors} ok · {apiErrors} errors · <Link href="/dashboard/platforms" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>View Errors →</Link></>
            }
          </span>
        </div>
      )}

      {/* ═══ LIVE RESULTS FEED ═══ */}
      {live.running && live.results.length > 0 && (
        <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>LIVE Results Feed</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginLeft: 'auto' }}>{live.results.length} results</span>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {live.results.slice(-30).reverse().map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                background: 'var(--bg)', borderRadius: 'var(--radius-xs)',
                borderLeft: `3px solid ${r.error ? 'var(--amber)' : r.mentioned ? 'var(--green)' : 'var(--red)'}`,
                animation: i === 0 ? 'fadeInUp .3s ease' : undefined,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: PLATFORM_COLORS[r.platform] || 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                  {r.platform[0]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: PLATFORM_COLORS[r.platform] || 'var(--muted)', marginRight: 6 }}>{r.platform}</span>
                    {r.query}
                  </div>
                  {r.model && <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{r.model}</div>}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 100,
                  background: r.error ? 'rgba(245,158,11,.1)' : r.mentioned ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.08)',
                  color: r.error ? 'var(--amber)' : r.mentioned ? 'var(--green)' : 'var(--red)',
                  whiteSpace: 'nowrap',
                }}>
                  {r.error ? 'ERROR' : r.mentioned ? 'FOUND' : 'NOT FOUND'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GEO SCORE / AI SENTIMENT / AI RECOMMENDS */}
      {show('scores')&&<div className="ov-scores-row">
        <div className="ov-score-card"><div className="ov-score-val" style={{color:geoScore>=60?'var(--green)':geoScore>=30?'var(--amber)':geoScore>0?'var(--red)':'var(--muted)'}}>{geoScore}</div><div className="ov-score-label">GEO Score</div><div className="ov-score-bar"><div className="ov-score-bar-fill" style={{width:`${geoScore}%`,background:geoScore>=60?'var(--green)':geoScore>=30?'var(--amber)':'var(--red)'}}/></div><div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>{geoScore>=70?'Strong':geoScore>=40?'Growing':geoScore>0?'Weak':'Not Visible'}</div></div>
        <div className="ov-score-card"><div className="ov-score-val" style={{color:sentimentScore>=70?'var(--green)':sentimentScore>=40?'var(--amber)':'var(--muted)'}}>{sentimentScore}</div><div className="ov-score-label">AI Sentiment</div><div className="ov-score-bar"><div className="ov-score-bar-fill" style={{width:`${sentimentScore}%`,background:sentimentScore>=70?'var(--green)':sentimentScore>=40?'var(--amber)':'var(--red)'}}/></div><div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>+{posCount} positive · {neuCount} neutral · {negCount} negative</div></div>
        <div className="ov-score-card"><div className="ov-score-val" style={{color:recommendedPct>=40?'var(--green)':recommendedPct>0?'var(--amber)':'var(--muted)'}}>{recommendedPct}%</div><div className="ov-score-label">AI Recommends You</div><div className="ov-score-bar"><div className="ov-score-bar-fill" style={{width:`${recommendedPct}%`,background:recommendedPct>=40?'var(--green)':'var(--amber)'}}/></div><div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>{recommendedPct>=50?'Strong endorsement':recommendedPct>0?'Room to grow':'Not yet'}</div></div>
      </div>}

      {/* AI CATEGORY BREAKDOWN */}
      {show('categories')&&<div className="ov-card"><div className="ov-card-head"><div className="ov-card-title">AI Category Breakdown</div><div className="ov-card-sub">Share of Voice by platform type</div></div>
        <div className="ov-grid-3" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          <div className="ov-cat-card"><div className="ov-cat-label">💬 Chat AI SOV</div><div className="ov-cat-val" style={{color:chatStats.sov>=40?'var(--green)':chatStats.sov>0?'var(--amber)':'var(--red)'}}>{chatStats.sov}%</div><div className="ov-cat-detail">Mentioned in {chatStats.mentioned} of {chatStats.total} responses</div><div className="ov-cat-sub">{chatStats.active.length > 0 ? chatStats.active.join(' · ') : 'ChatGPT · Claude · Grok'}</div></div>
          <div className="ov-cat-card"><div className="ov-cat-label">🔍 Search AI SOV</div><div className="ov-cat-val" style={{color:searchStats.sov>=40?'var(--green)':searchStats.sov>0?'var(--amber)':'var(--red)'}}>{searchStats.sov}%</div><div className="ov-cat-detail">Mentioned in {searchStats.mentioned} of {searchStats.total} responses</div><div className="ov-cat-sub">{searchStats.active.length > 0 ? searchStats.active.join(' · ') : 'Perplexity · Gemini'}</div></div>
          <div className="ov-cat-card"><div className="ov-cat-label">🏆 Best Platform</div><div className="ov-cat-val" style={{color:bestPlatform&&bestPlatform.sov>0?'var(--green)':'var(--muted)'}}>{bestPlatform&&bestPlatform.sov>0?bestPlatform.name:'—'}</div><div className="ov-cat-detail">{bestPlatform&&bestPlatform.sov>0?`${bestPlatform.sov}% SOV — strongest visibility`:'No platform data yet'}</div></div>
        </div>
      </div>}

      {/* LOCATION VISIBILITY */}
      {show('scores')&&<div className="ov-card ov-loc-card"><div className="ov-card-head"><div className="ov-card-title">📍 Location Visibility</div>{brand.city&&<div className="ov-card-sub">{brand.city}{nearbyAreas&&nearbyAreas.length>0?` + ${nearbyAreas.length} nearby areas`:''}</div>}</div>
        <div className="ov-loc-grid" style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:20}}>
          <div className="ov-loc-stat"><div className="ov-loc-stat-val" style={{color:locationData.rate>=40?'var(--green)':locationData.rate>0?'var(--amber)':'var(--red)'}}>{locationData.rate}%</div><div className="ov-loc-stat-lbl">City Match Rate</div><div className="ov-loc-stat-sub">AI mentions your location</div></div>
          <div className="ov-loc-areas"><div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Areas where AI finds you</div><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{Object.entries(locationData.areas).length>0?Object.entries(locationData.areas).map(([area,count])=><span key={area} className="ov-loc-area-tag">{area} <span className="ov-loc-area-count">{count}</span></span>):<span style={{fontSize:11,color:'var(--muted)'}}>No location matches found yet. Run more queries with location-specific terms.</span>}</div></div>
        </div>
        {locationData.rate<30&&<div className="ov-loc-tip">💡 <strong>Tip:</strong> Include &quot;{brand.city}&quot; in your queries (e.g., &quot;best paving in {brand.city}&quot;) to test local AI visibility.</div>}
      </div>}

      {/* ACTIONABLE INSIGHTS */}
      {show('insights')&&<div className="ov-card"><div className="ov-card-head"><div className="ov-card-title">Actionable Insights</div><div className="ov-card-sub">{alerts.length} tip{alerts.length!==1?'s':''}</div></div>
        {sovChange!==null&&sovChange<-5&&<div className="ov-insight"><span className="ov-insight-icon">⚡</span><div className="ov-insight-text"><div className="ov-insight-head">Platform Gap Detected</div><div>Strong on <strong>ChatGPT</strong> but invisible on <strong>Gemini</strong>. Different AI platforms pull from different sources — diversify your online presence.</div></div></div>}
        {sov>0&&sov<50&&<div className="ov-insight"><span className="ov-insight-icon">📈</span><div className="ov-insight-text"><div className="ov-insight-head">Growing Your AI Presence</div><div>You&apos;re appearing in {sov}% of queries. To boost this, create <strong>FAQ-style content</strong> that directly answers common questions, and ensure your <strong><Link href="/dashboard/setup" style={{color:'var(--primary)',textDecoration:'none'}}>Google Business Profile</Link></strong> is fully optimized.</div></div></div>}
        {sentTotal>0&&negCount>0&&<div className="ov-insight"><span className="ov-insight-icon">⚠️</span><div className="ov-insight-text"><div className="ov-insight-head">Negative Sentiment Detected</div><div>{negCount} AI response{negCount>1?'s':''} show{negCount===1?'s':''} negative sentiment about your brand. Check <Link href="/dashboard/mentions" style={{color:'var(--primary)',textDecoration:'none'}}>All Results</Link> to see what AI is saying and address underlying issues.</div></div></div>}
        {sov===0&&<div className="ov-insight"><span className="ov-insight-icon">⭐</span><div className="ov-insight-text"><div className="ov-insight-head">Getting Started</div><div>Your SOV is 0%. Run queries from <Link href="/dashboard/setup" style={{color:'var(--primary)',textDecoration:'none'}}>Brand Setup</Link> and check <Link href="/dashboard/recommendations" style={{color:'var(--primary)',textDecoration:'none'}}>Recommendations</Link> for optimization tips.</div></div></div>}
      </div>}

      {/* PLATFORM CARDS */}
      {show('platforms')&&<div className="ov-plat-grid">{Object.entries(PLATFORM_COLORS).map(([name,color])=>{const n=normPlatform(platforms[name]);const isActive=n.total>0||n.sov>0;return <div key={name} className="ov-plat-card" style={{borderTop:`3px solid ${color}`}}><div className="ov-plat-name">{name}</div><div className="ov-plat-status" style={{color:isActive?'var(--green)':'var(--muted)'}}>● {isActive?'ACTIVE':'INACTIVE'}</div><div className="ov-plat-bar"><div className="ov-plat-bar-fill" style={{width:`${n.sov}%`,background:color}}/></div><div className="ov-plat-sov" style={{color:n.sov>=50?'var(--green)':n.sov>0?'var(--amber)':'var(--muted)'}}>{n.sov}%</div></div>;})}</div>}

      {/* SOV TREND */}
      {show('trend')&&sovTrend.length>1&&<div className="ov-card"><div className="ov-card-head"><div className="ov-card-title">SOV Trend</div><div className="ov-card-sub">Last {sovTrend.length} runs</div></div>
        <div style={{height:200,background:'var(--bg3)',borderRadius:'var(--radius-xs)',display:'flex',alignItems:'flex-end',gap:4,padding:16}}>{sovTrend.map((r,i)=><div key={i} title={`${r.sov}% — ${r.date?new Date(r.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'#'+(i+1)}`} style={{flex:1,background:'var(--primary)',borderRadius:'3px 3px 0 0',height:`${Math.max(r.sov,4)}%`,opacity:0.4+(i/Math.max(sovTrend.length-1,1))*0.6,transition:'height .3s ease'}}/>)}</div>
        {sovTrend.length>1&&<div style={{display:'flex',justifyContent:'space-between',marginTop:8}}><span style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--muted)'}}>{new Date(sovTrend[0].date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--muted)'}}>{new Date(sovTrend[sovTrend.length-1].date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>}
      </div>}

      {/* QUERY PERFORMANCE + COMPETITORS */}
      {show('qperf')&&<div className="ov-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div className="ov-card" style={{marginBottom:0}}><div className="ov-card-head"><div className="ov-card-title">Query Performance</div><div className="ov-card-sub">{queries.length} queries · Avg {queryPerfData.length>0?Math.round(queryPerfData.reduce((s,q)=>s+q.rate,0)/queryPerfData.length):0}%</div></div>
          {(queryPerfData.length>0?queryPerfData:queries.map(q=>({query:q,rate:0}))).slice(0,8).map((q,i)=><div key={i} className="ov-qp-bar" style={{marginBottom:6}}><div className="ov-qp-query" title={q.query}>{q.query}</div><div className="ov-qp-track"><div className="ov-qp-fill" style={{width:`${q.rate}%`,background:q.rate>40?'var(--green)':'var(--amber)'}}/></div><div className="ov-qp-rate" style={{color:q.rate>40?'var(--green)':'var(--amber)'}}>{q.rate}%</div></div>)}
        </div>
        <div className="ov-card" style={{marginBottom:0}}><div className="ov-card-head"><div className="ov-card-title">Competitors in AI</div><div className="ov-card-sub">{topCompetitors.length||(brand.competitors||[]).length} brands</div></div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{topCompetitors.length>0?topCompetitors.map(([name,count],i)=><span key={i} className="ov-comp-chip">{name} <span className="ov-comp-count">{count}x</span></span>):(brand.competitors||[]).length>0?(brand.competitors||[]).map((c,i)=><span key={i} className="ov-comp-chip">{c}</span>):<span style={{fontSize:12,color:'var(--muted)'}}>Add competitors in Brand Setup</span>}</div>
        </div>
      </div>}

      {/* CITATION SOURCES */}
      {show('citations')&&<div className="ov-card"><div className="ov-card-head"><div className="ov-card-title">Citation Sources</div><div className="ov-card-sub">Where AI pulls information from</div></div>
        {topCitations.length>0?<div className="ov-cit-list">{(()=>{const max=topCitations[0]?topCitations[0][1]:1;return topCitations.map(([domain,count],i)=><div key={i} className="ov-cit-item"><div className={`ov-cit-domain ${brand.name&&domain.includes(brand.name.toLowerCase().replace(/\s+/g,''))?'ov-cit-own':''}`}>{brand.name&&domain.includes(brand.name.toLowerCase().replace(/\s+/g,''))?'★ ':''}{domain}</div><div className="ov-cit-bar"><div className="ov-cit-bar-fill" style={{width:`${(count/max)*100}%`}}/></div><div className="ov-cit-count">{count}</div></div>);})()}</div>:<div style={{fontSize:12,color:'var(--muted)'}}>Citation tracking requires AI platforms that provide source links.</div>}
      </div>}

      {/* LAST RUN */}
      {show('lastrun')&&lastRun&&<div className="ov-card"><div className="ov-card-head"><div className="ov-card-title">Last Run — {fmtDate(lastRun.date)}</div><div style={{display:'flex',gap:12,alignItems:'center'}}><span style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--muted)'}}>Found {totalM}/{totalQ}</span><Link href="/dashboard/mentions" style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--primary)',textDecoration:'none'}}>View All Results →</Link></div></div></div>}

      {/* TRACKED QUERIES */}
      {show('queries')&&<div className="ov-card" style={{marginBottom:0}}><div className="ov-card-head"><div className="ov-card-title">Tracked Queries</div><div className="ov-card-sub">{queries.length} / {planLimit>1000?'∞':planLimit} prompts</div></div>
        <div className="ov-query-tags" style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>{queries.map((q,i)=><span key={i} title={q} style={{display:'inline-flex',alignItems:'center',gap:4,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontSize:12,padding:'6px 12px',borderRadius:100}}>{q}<button onClick={()=>removeQuery(i)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:14,padding:0,lineHeight:1}}>×</button></span>)}{queries.length===0&&<span style={{fontSize:12,color:'var(--muted)'}}>No queries yet. Add some below.</span>}</div>
        <div className="add-query-row" style={{display:'flex',gap:8,marginBottom:12}}><input className="finp" value={newQuery} onChange={e=>setNewQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addQuery()} placeholder="Add a new query..." style={{flex:1,margin:0}}/><button onClick={addQuery} className="pbtn" style={{background:'var(--primary)',color:'#fff',borderColor:'var(--primary)'}}>+ Add</button></div>
        <div className="ov-query-btns" style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="ov-btn-subtle" onClick={()=>setBulkAddOpen(!bulkAddOpen)}>BULK ADD</button>
          <button className="ov-btn-subtle ov-btn-green" disabled={suggesting} onClick={async()=>{if(!brand)return;setSuggesting(true);setQueryMsg('');try{const res=await fetch('/api/ai-generate-queries',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({brandName:brand.name,industry:brand.industry||'services',city:brand.city||'',existingQueries:queries,mode:'suggest'})});if(!res.ok)throw new Error('API error');const data=await res.json();const suggestions=(data.queries||[]).filter((s:string)=>!queries.includes(s));if(suggestions.length){const updated=[...queries,...suggestions];await fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:updated})});fetchBrands();setQueryMsg(`Added ${suggestions.length} suggested queries`);}else{setQueryMsg('All suggestions already added');}}catch{const industry=brand.industry||'services';const city=brand.city||'';const suggestions=[`best ${industry} in ${city||'my area'}`,`top rated ${industry} near me`,`${brand.name} reviews`,`recommended ${industry} companies`,`${industry} cost ${city}`,`${brand.name} ${industry} quality`,`hire ${industry} in ${city}`,`${industry} services ${city}`,`why choose ${brand.name}`,`${brand.name} testimonials`].filter(s=>!queries.includes(s));if(suggestions.length){const updated=[...queries,...suggestions];await fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:updated})});fetchBrands();setQueryMsg(`Added ${suggestions.length} suggested queries`);}else{setQueryMsg('All suggestions already added');}}finally{setSuggesting(false);}}}>{suggesting?'SUGGESTING...':'SUGGEST'}</button>
          <button className="ov-btn-subtle ov-btn-blue" disabled={generating} onClick={async()=>{if(!brand)return;setGenerating(true);setQueryMsg('');try{const res=await fetch('/api/ai-generate-queries',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({brandName:brand.name,industry:brand.industry||'services',city:brand.city||'',existingQueries:queries})});if(!res.ok)throw new Error('API error');const data=await res.json();const generated=(data.queries||[]).filter((s:string)=>!queries.includes(s));if(generated.length){const updated=[...queries,...generated];await fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:updated})});fetchBrands();setQueryMsg(`Added ${generated.length} AI-generated queries`);}else{setQueryMsg('All AI suggestions already added');}}catch{const generated=[`what is ${brand.name}`,`is ${brand.name} good`,`${brand.name} vs competitors`,`${brand.name} pricing`,`alternatives to ${brand.name}`,`${brand.name} reputation`,`does ${brand.name} offer good service`,`${brand.name} customer experience`,`compare ${brand.name} to others`,`is ${brand.name} worth it`].filter(s=>!queries.includes(s));if(generated.length){const updated=[...queries,...generated];await fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:updated})});fetchBrands();setQueryMsg(`Added ${generated.length} AI-generated queries`);}else{setQueryMsg('All AI suggestions already added');}}finally{setGenerating(false);}}}>{generating?'GENERATING...':'AI GENERATE'}</button>
          <button className="ov-btn-subtle ov-btn-red" onClick={()=>{if(!brand||!queries.length)return;setShowClearConfirm(true);}}>CLEAR ALL</button>
          <button className="ov-btn-subtle" onClick={()=>{setSelectMode(!selectMode);setSelectedQueries(new Set());}}>{selectMode?'✓ DONE':'☐ SELECT'}</button>
        </div>
        {queryMsg && <div style={{marginTop:8,padding:'8px 14px',background:queryMsg.includes('Added')?'rgba(34,197,94,.08)':'rgba(245,158,11,.08)',border:queryMsg.includes('Added')?'1px solid rgba(34,197,94,.2)':'1px solid rgba(245,158,11,.2)',borderRadius:'var(--radius-xs)',fontSize:12,color:queryMsg.includes('Added')?'var(--green)':'var(--amber)'}}>{queryMsg}</div>}
        {bulkAddOpen&&<div style={{marginTop:12,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',padding:14}}><textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={5} style={{width:'100%',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',padding:10,fontSize:13,fontFamily:'var(--font)',color:'var(--text)',resize:'vertical'}} placeholder={'Paste queries (one per line)'}/><div style={{display:'flex',gap:8,marginTop:8}}><button className="pbtn" style={{background:'var(--primary)',color:'#fff',borderColor:'var(--primary)'}} onClick={()=>{const lines=bulkText.split('\n').map(l=>l.trim()).filter(l=>l.length>0);if(lines.length&&brand){const updated=[...queries,...lines];fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:updated})}).then(()=>{fetchBrands();setBulkText('');setBulkAddOpen(false);});}}}>Add {bulkText.split('\n').filter(l=>l.trim()).length} Queries</button><button className="pbtn" onClick={()=>setBulkAddOpen(false)}>Cancel</button></div></div>}
        {showClearConfirm&&<div style={{background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:'var(--radius-xs)',padding:14,marginTop:12}}><div style={{fontSize:13,fontWeight:600,color:'var(--red)',marginBottom:8}}>Remove all {queries.length} queries?</div><div style={{display:'flex',gap:8}}><button className="pbtn" onClick={()=>setShowClearConfirm(false)}>Cancel</button><button className="pbtn" style={{background:'var(--red)',color:'#fff',borderColor:'var(--red)'}} onClick={()=>{if(!brand)return;fetch(`/api/brands/${brand.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({queries:[]})}).then(()=>{fetchBrands();setShowClearConfirm(false);});}}>Yes, Remove All</button></div></div>}
      </div>}

      {/* ═══ TOAST NOTIFICATIONS (fixed bottom-right) ═══ */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
          display: 'flex', flexDirection: 'column-reverse', gap: 8,
          maxHeight: '50vh', pointerEvents: 'none',
        }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
              minWidth: 280, maxWidth: 380, animation: 'toastIn .35s ease',
              pointerEvents: 'auto',
              borderLeft: `3px solid ${t.error ? 'var(--amber)' : t.mentioned ? 'var(--green)' : 'var(--red)'}`,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8,
                background: PLATFORM_COLORS[t.platform] || 'var(--bg3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0,
              }}>
                {t.platform[0]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: PLATFORM_COLORS[t.platform] || 'var(--muted)', fontWeight: 700 }}>
                  {t.platform}{t.model ? ` · ${t.model}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.query}
                </div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100,
                background: t.error ? 'rgba(245,158,11,.1)' : t.mentioned ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.08)',
                color: t.error ? 'var(--amber)' : t.mentioned ? 'var(--green)' : 'var(--red)',
                whiteSpace: 'nowrap',
              }}>
                {t.error ? 'ERROR' : t.mentioned ? 'FOUND' : 'NOT FOUND'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
