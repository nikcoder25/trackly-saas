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

  const fetchBrands = useCallback(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setBrands(d.brands || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const brand = brands[0];
  const lastRun = brand?.runs?.length ? brand.runs[brand.runs.length - 1] : null;
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
  const sentTotal = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0);
  const recommendedPct = lastRun?.recommended || 0;

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
      {/* Header */}
      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{brand.name}</h1>
          <p className="text-[var(--muted)] text-[13px] mt-1">{brand.industry || ''} {brand.city ? '· ' + brand.city : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Compare Toggle */}
          <div className="flex bg-[var(--bg2)] border border-[var(--border)] rounded-lg overflow-hidden">
            {(['current', 'week', 'month'] as const).map(m => (
              <button key={m} onClick={() => setCompareMode(m)}
                className={`px-3 py-1.5 text-[11px] font-semibold transition ${compareMode === m ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>
                {m === 'current' ? 'Current' : m === 'week' ? 'vs Last Week' : 'vs Last Month'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SOV Hero Card */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 shadow-[var(--app-shadow)] mb-4 flex flex-col md:flex-row gap-6 items-center">
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
            </div>
          </div>
          <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-2">Share of Voice</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 flex-1 w-full">
          <HeroStat label="Mentions / Total" value={`${totalM} / ${totalQ}`} />
          <HeroStat label="Platforms Active" value={String(Object.keys(platforms).length)} />
          <HeroStat label="Queries Tracked" value={String(queries.length)} />
          <HeroStat label="Last Run" value={lastRun?.date ? new Date(lastRun.date).toLocaleDateString() : '--'} />
          <HeroStat label="Run Duration" value={lastRun?.duration ? `${Math.round(lastRun.duration / 1000)}s` : '--'} />
        </div>
      </div>

      {/* GEO & Sentiment Scores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
        <ScoreCard label="Brand Sentiment" color={sentiment.positive && sentiment.positive > (sentiment.negative || 0) ? 'var(--green)' : 'var(--amber)'}>
          <div className="flex gap-3 text-[11px] font-mono">
            <span className="text-[var(--green)]">+{sentiment.positive || 0}</span>
            <span className="text-[var(--muted)]">~{sentiment.neutral || 0}</span>
            <span className="text-[var(--red)]">-{sentiment.negative || 0}</span>
          </div>
          <div className="flex gap-0.5 mt-2 h-2 rounded-full overflow-hidden bg-[var(--bg3)]">
            {sentTotal > 0 && <>
              <div className="bg-[var(--green)] h-full" style={{ width: `${((sentiment.positive || 0) / sentTotal) * 100}%` }} />
              <div className="bg-[var(--bg4)] h-full" style={{ width: `${((sentiment.neutral || 0) / sentTotal) * 100}%` }} />
              <div className="bg-[var(--red)] h-full" style={{ width: `${((sentiment.negative || 0) / sentTotal) * 100}%` }} />
            </>}
          </div>
        </ScoreCard>
        <ScoreCard label="AI Recommends You" color={recommendedPct >= 50 ? 'var(--green)' : 'var(--amber)'}>
          <div className="text-2xl font-extrabold font-mono">{recommendedPct}%</div>
        </ScoreCard>
        <ScoreCard label={`City Match: ${brand.city || 'N/A'}`} color="var(--blue)">
          <div className="text-sm text-[var(--muted)]">{brand.city ? 'Location tracking active' : 'Set a city in Brand Setup'}</div>
        </ScoreCard>
      </div>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
          const pd = platforms[name] || {};
          const pSov = (pd as Record<string, number>).sov || 0;
          const pMent = (pd as Record<string, number>).mentions || 0;
          const pTotal = (pd as Record<string, number>).total || 0;
          const pErr = (pd as Record<string, number>).errors || 0;
          return (
            <div key={name} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)] hover:shadow-[var(--app-shadow-lg)] hover:-translate-y-px transition" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-sm font-bold text-[var(--text)]">{name}</span>
                <span className="ml-auto text-lg font-extrabold font-mono" style={{ color: pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--muted)' }}>{pSov}%</span>
              </div>
              <div className="flex gap-4 text-[11px] text-[var(--muted)] font-mono">
                <span>Mentions: <strong className="text-[var(--text)]">{pMent}/{pTotal}</strong></span>
                {pErr > 0 && <span className="text-[var(--red)]">Errors: {pErr}</span>}
              </div>
              <div className="mt-2 h-1 bg-[var(--bg3)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pSov}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* SOV Trend Mini Chart */}
      {sovTrend.length > 1 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">SOV Trend <span className="font-normal">Last {sovTrend.length} runs</span></div>
          <div className="flex items-end gap-1 h-[100px]">
            {sovTrend.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[8px] font-mono text-[var(--muted)]">{r.sov}%</span>
                <div className="w-full rounded-t" style={{ height: `${Math.max(4, r.sov)}%`, background: r.sov >= 50 ? 'var(--green)' : r.sov > 0 ? 'var(--amber)' : 'var(--bg4)', minHeight: 4 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Performance + Competitors Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-4">
        {/* Top Queries */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Top Queries</div>
          {queries.slice(0, 6).map((q, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0 text-xs">
              <span className="text-[var(--text)] truncate flex-1">{q}</span>
            </div>
          ))}
          {queries.length === 0 && <p className="text-[var(--muted)] text-xs">No queries yet</p>}
          {queries.length > 6 && <Link href="/dashboard/query-performance" className="text-[10px] text-[var(--primary)] font-mono mt-2 inline-block">View all {queries.length} queries &rarr;</Link>}
        </div>

        {/* Competitors */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Detected Competitors</div>
          {topCompetitors.length > 0 ? topCompetitors.map(([name, count], i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0 text-xs">
              <span className="text-[var(--text)] truncate flex-1">{name}</span>
              <span className="font-mono text-[var(--muted)]">{count}x</span>
            </div>
          )) : (brand.competitors || []).length > 0 ? (brand.competitors || []).map((c, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0 text-xs">
              <span className="text-[var(--text)]">{c}</span>
              <span className="font-mono text-[var(--muted)]">--</span>
            </div>
          )) : <p className="text-[var(--muted)] text-xs">Add competitors in Brand Setup</p>}
        </div>
      </div>

      {/* Citation Sources */}
      {topCitations.length > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Top Citation Sources</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {topCitations.map(([domain, count], i) => (
              <div key={i} className="text-xs px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-md">
                <span className="text-[var(--text)] truncate block">{domain}</span>
                <span className="font-mono text-[var(--muted)]">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actionable Insights */}
      {sov < 30 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Actionable Insights</div>
          <div className="space-y-2">
            {sov === 0 && <InsightCard color="var(--amber)" icon="\u26A0" title="Getting Started with GEO" desc="Your SOV is 0%. Run queries and check Recommendations for optimization tips." link="/dashboard/recommendations" />}
            {sov > 0 && sov < 30 && <InsightCard color="var(--primary)" icon="\u25B2" title="Growing Your AI Presence" desc={`Your SOV is ${sov}%. Focus on high-performing queries and optimize content for AI platforms.`} link="/dashboard/recommendations" />}
            {Object.values(platforms).some(p => (p as Record<string, number>).sov === 0) && <InsightCard color="var(--red)" icon="\u25CE" title="Platform Gap Detected" desc="Some platforms show 0% SOV. Check Platform Status for details." link="/dashboard/platforms" />}
            {!brand.city && <InsightCard color="var(--blue)" icon="\u2139" title="Set Your Location" desc="Add a city in Brand Setup to track local AI visibility." link="/dashboard/setup" />}
          </div>
        </div>
      )}

      {/* Tracked Queries */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Tracked Queries</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">{queries.length} / {planLimit} queries</div>
          </div>
          <Link href="/dashboard/setup" className="text-[11px] font-mono text-[var(--primary)] hover:underline">Manage Queries</Link>
        </div>
        {queries.length >= planLimit && (
          <div className="bg-[rgba(245,158,11,.06)] border border-[rgba(245,158,11,.2)] px-3.5 py-2 mb-3 text-[11px] text-[var(--amber)] font-mono rounded-md">
            Query limit reached. Upgrade your plan for more queries.
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {queries.map((q, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-[12px] font-medium px-3 py-1.5 rounded-full">
              {q}
              <button onClick={() => removeQuery(i)} className="text-[var(--muted)] hover:text-[var(--red)] ml-1 text-xs">&times;</button>
            </span>
          ))}
          {queries.length === 0 && <span className="text-[var(--muted)] text-xs">No queries yet. Add some below.</span>}
        </div>
        <div className="flex gap-2">
          <input value={newQuery} onChange={e => setNewQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuery()}
            placeholder="Add a new query..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-3 py-2 rounded-md focus:border-[var(--primary)] focus:outline-none transition" />
          <button onClick={addQuery} className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md hover:bg-[var(--primary-hover)] transition">+ Add</button>
        </div>
      </div>
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

function ScoreCard({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]" style={{ borderTop: `3px solid ${color}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">{label}</div>
      {children}
    </div>
  );
}

function InsightCard({ color, icon, title, desc, link }: { color: string; icon: string; title: string; desc: string; link: string }) {
  return (
    <Link href={link} className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg hover:bg-[var(--bg3)] transition no-underline">
      <span className="text-lg" style={{ color }}>{icon}</span>
      <div>
        <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{desc}</div>
      </div>
    </Link>
  );
}
