'use client';

import { useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { useBrands } from '@/contexts/BrandContext';

interface PlatformData {
  sov?: number;
  queries?: number;
  mentions?: number;
  total?: number;
  errors?: number;
  latency?: number;
  successRate?: number;
  calls24h?: number;
}

interface Run {
  date?: string;
  platforms?: Record<string, PlatformData>;
}

interface Brand {
  id: string;
  name: string;
  runs?: Run[];
  selected_platforms?: string[];
}

function normPlatform(pd: unknown): { sov: number; total: number; mentions: number; errors: number } {
  if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
  if (typeof pd === 'object' && pd !== null) {
    const o = pd as Record<string, number>;
    return { sov: o.sov || 0, total: o.total || o.queries || 0, mentions: o.mentions || 0, errors: o.errors || 0 };
  }
  return { sov: 0, total: 0, mentions: 0, errors: 0 };
}

function healthStatus(pd: unknown): { label: string; color: string; bg: string } {
  const n = normPlatform(pd);
  if (n.sov === 0 && n.total === 0 && n.mentions === 0)
    return { label: 'No Data', color: 'var(--muted)', bg: 'var(--bg3)' };
  if (n.errors && n.total && n.errors / n.total > 0.3)
    return { label: 'Degraded', color: 'var(--red)', bg: 'rgba(239,68,68,.08)' };
  if (n.errors > 0)
    return { label: 'Issues', color: 'var(--amber)', bg: 'rgba(245,158,11,.08)' };
  return { label: 'Healthy', color: 'var(--green)', bg: 'rgba(16,185,129,.08)' };
}

/* ── Radial progress ring ── */
function SovRing({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg3)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

/* ── SOV sparkline (last 10 runs) ── */
function Sparkline({ values, color, w = 100, h = 28 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ flexShrink: 0, overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
      {values.length > 0 && (() => {
        const last = values[values.length - 1];
        const x = w;
        const y = h - (last / max) * h;
        return <circle cx={x} cy={y} r={2.5} fill={color} />;
      })()}
    </svg>
  );
}

export default function PlatformsPage() {
  const { brand: rawBrand, brands, loading } = useBrandData({ fullData: true });
  const selectedBrand = rawBrand as Brand | null;
  const { selectBrandById } = useBrands();

  const latestRun = selectedBrand?.runs?.length ? selectedBrand.runs[selectedBrand.runs.length - 1] : null;
  const platformData = latestRun?.platforms || {};

  // Aggregate stats across last 10 runs
  const platformStats = useMemo(() => {
    const stats: Record<string, { totalCalls: number; totalErrors: number; sovHistory: number[] }> = {};
    const recentRuns = (selectedBrand?.runs || []).slice(-10);
    recentRuns.forEach(run => {
      if (!run.platforms) return;
      Object.entries(run.platforms).forEach(([name, pd]) => {
        if (!stats[name]) stats[name] = { totalCalls: 0, totalErrors: 0, sovHistory: [] };
        const n = normPlatform(pd);
        stats[name].totalCalls += n.total;
        stats[name].totalErrors += n.errors;
        stats[name].sovHistory.push(n.sov);
      });
    });
    return stats;
  }, [selectedBrand?.runs]);

  // Summary counts
  const activePlatforms = Object.keys(platformData).length;
  const healthyCount = Object.entries(PLATFORM_COLORS).filter(([name]) => {
    const pd = platformData[name];
    return pd !== undefined && pd !== null && healthStatus(pd).label === 'Healthy';
  }).length;
  const totalErrors = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).errors, 0);
  const totalMentions = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).mentions, 0);
  const totalQueries = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).total, 0);
  const overallSov = totalQueries > 0 ? Math.round((totalMentions / totalQueries) * 100) : 0;
  const totalPlatforms = Object.keys(PLATFORM_COLORS).length;

  // Best & worst performing platform
  const ranked = Object.entries(PLATFORM_COLORS)
    .map(([name]) => ({ name, ...normPlatform(platformData[name]) }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.sov - a.sov);
  const best = ranked[0] || null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  const s = { // reusable style fragments
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--app-shadow)' } as const,
    label: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    mono: { fontFamily: 'var(--mono)' },
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', margin: 0 }}>Platform Status</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Real-time health and performance across {totalPlatforms} AI platforms.
            {latestRun?.date && <span> · Last run {new Date(latestRun.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
          </p>
        </div>
        {brands.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {brands.map(b => (
              <button key={b.id} onClick={() => selectBrandById(b.id)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all .15s', background: selectedBrand?.id === b.id ? 'var(--primary)' : 'var(--bg3)', color: selectedBrand?.id === b.id ? '#fff' : 'var(--muted)' }}>{b.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Top summary row: overall SOV ring + KPI chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, marginBottom: 20 }}>
        {/* Overall SOV ring */}
        <div style={{ ...s.card, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <SovRing pct={overallSov} color="var(--primary)" size={88} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22, fontWeight: 800, ...s.mono, color: 'var(--text)', lineHeight: 1 }}>{overallSov}%</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>SOV</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Overall Share of Voice</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Your brand found in <strong style={{ color: 'var(--text)' }}>{totalMentions}</strong> of <strong style={{ color: 'var(--text)' }}>{totalQueries}</strong> AI responses
            </div>
            {best && worst && best.name !== worst.name && (
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>▲ Best: {best.name} ({best.sov}%)</span>
                <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>▼ Worst: {worst.name} ({worst.sov}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* KPI chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Active', value: activePlatforms, sub: `of ${totalPlatforms}`, color: 'var(--primary)' },
            { label: 'Healthy', value: healthyCount, sub: `of ${activePlatforms}`, color: 'var(--green)' },
            { label: 'Mentions', value: totalMentions, sub: `of ${totalQueries}`, color: 'var(--text)' },
            { label: 'Errors', value: totalErrors, sub: totalErrors === 0 ? 'none' : 'total', color: totalErrors > 0 ? 'var(--red)' : 'var(--green)' },
          ].map(kpi => (
            <div key={kpi.label} style={{ ...s.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={s.label}>{kpi.label}</span>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 800, ...s.mono, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Platform cards ── */}
      <div style={{ ...s.label, marginBottom: 10, fontSize: 12 }}>Platform Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
          const raw = platformData[name];
          const n = normPlatform(raw);
          const hasData = raw !== undefined && raw !== null;
          const health = healthStatus(raw);
          const stats = platformStats[name];
          const successRate = stats && stats.totalCalls > 0
            ? Math.round(((stats.totalCalls - stats.totalErrors) / stats.totalCalls) * 100)
            : null;
          const sovHistory = stats?.sovHistory || [];

          return (
            <div key={name} style={{ ...s.card, padding: 0, overflow: 'hidden', transition: 'box-shadow .2s, transform .2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--app-shadow-lg)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--app-shadow)'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}>
              {/* Colored top bar */}
              <div style={{ height: 3, background: color }} />

              <div style={{ padding: '18px 22px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `color-mix(in srgb, ${color} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color, flexShrink: 0 }}>
                      {name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hasData ? 'Active' : 'Inactive'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: health.color, background: health.bg, padding: '3px 10px', borderRadius: 99 }}>{health.label}</span>
                </div>

                {hasData ? (
                  <>
                    {/* SOV + sparkline row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                          <span style={{ fontSize: 32, fontWeight: 800, ...s.mono, color: n.sov >= 50 ? 'var(--green)' : n.sov > 0 ? 'var(--amber)' : 'var(--muted)', lineHeight: 1 }}>{n.sov}%</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>SOV</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                          {n.mentions} of {n.total} responses mention you
                        </div>
                      </div>
                      {sovHistory.length >= 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <Sparkline values={sovHistory} color={color} />
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>last {sovHistory.length} runs</span>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div style={{ width: '100%', background: 'var(--bg)', borderRadius: 99, height: 5, marginBottom: 18 }}>
                      <div style={{ height: 5, borderRadius: 99, width: `${Math.min(n.sov, 100)}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white))`, transition: 'width 0.5s ease' }} />
                    </div>

                    {/* Stats grid — 2 columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Mentions</div>
                        <div style={{ fontSize: 16, fontWeight: 700, ...s.mono, color: 'var(--text)' }}>{n.mentions}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}> / {n.total}</span></div>
                      </div>
                      {successRate !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Success Rate</div>
                          <div style={{ fontSize: 16, fontWeight: 700, ...s.mono, color: successRate >= 95 ? 'var(--green)' : successRate >= 80 ? 'var(--amber)' : 'var(--red)' }}>{successRate}%</div>
                        </div>
                      )}
                      {n.errors > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Errors</div>
                          <div style={{ fontSize: 16, fontWeight: 700, ...s.mono, color: 'var(--red)' }}>{n.errors}</div>
                        </div>
                      )}
                      {stats && stats.totalCalls > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>Calls (10 runs)</div>
                          <div style={{ fontSize: 16, fontWeight: 700, ...s.mono, color: 'var(--text)' }}>{stats.totalCalls}</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 18, color: 'var(--muted)' }}>?</div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>No data yet</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.7 }}>Run queries to see {name} results</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
