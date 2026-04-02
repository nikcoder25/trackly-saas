'use client';

import { useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { useBrandData } from '@/hooks/useBrandData';

interface SovPoint { date: string; overall: number; platforms?: Record<string, number>; }
interface Run { date?: string; time?: string; sov?: number; platforms?: Record<string, { sov?: number }> }
interface Brand { id: string; name: string; sovHistory?: SovPoint[]; runs?: Run[]; }

export default function TrendsPage() {
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;

  // Build history from sovHistory or runs
  const history: SovPoint[] = useMemo(() => {
    if (brand?.sovHistory?.length) return brand.sovHistory;
    return (brand?.runs || []).filter(r => r.date && r.sov !== undefined).map(r => ({
      date: r.date!,
      overall: r.sov!,
      platforms: r.platforms ? Object.fromEntries(Object.entries(r.platforms).map(([k, v]) => [k, v.sov || 0])) : {},
    }));
  }, [brand]);

  // All platforms across history
  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => set.add(p)); });
    return [...set];
  }, [history]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <LockedBrandBanner />
      <div className="view-title">SOV Trends</div>
      <div className="view-sub">Share of Voice over time — overall and per platform.</div>

      {/* Overall SOV Trend — bar chart */}
      <div className="card" style={{ padding: 20 }}>
        <div className="card-title">Overall SOV Trend</div>
        <div style={{ display: 'flex', height: 200 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 8, paddingTop: 16, paddingBottom: 16 }}>
            {[100, 75, 50, 25, 0].map(v => (
              <span key={v} style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', lineHeight: 1 }}>{v}%</span>
            ))}
          </div>
        <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'flex-end', gap: 4, padding: 16 }}>
          {history.length > 0 ? history.map((h, i) => {
            const pct = Math.max((h.overall / 100) * 100, 4);
            const opacity = 0.4 + (i / Math.max(history.length - 1, 1)) * 0.6;
            return (
              <div key={i} title={`${h.overall}% — ${new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                style={{ flex: 1, background: 'var(--primary)', borderRadius: '3px 3px 0 0', height: `${pct}%`, opacity, transition: 'height .3s ease' }} />
            );
          }) : (
            // Placeholder bars
            [40, 45, 50, 52, 55, 58, 60, 64, 68, 72].map((h, i) => (
              <div key={i} style={{ flex: 1, background: 'var(--primary)', borderRadius: '3px 3px 0 0', height: `${h}%`, opacity: 0.4 + i * 0.06 }} />
            ))
          )}
        </div>
        </div>
        {history.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{new Date(history[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{new Date(history[history.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
      </div>

      {/* Per-Platform SOV Trend — SVG line chart */}
      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div className="card-title">Per-Platform SOV Trend</div>

        {history.length > 1 && allPlatforms.length > 0 ? (
          <div>
            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {allPlatforms.map(p => (
                <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  <span style={{ display: 'inline-block', width: 16, height: 3, borderRadius: 2, background: PLATFORM_COLORS[p] || '#888' }} /> {p}
                </span>
              ))}
            </div>

            {/* SVG Chart */}
            <svg viewBox="0 0 700 300" style={{ width: '100%', height: 'auto', maxHeight: 300 }}>
              {/* Y-axis grid */}
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => {
                const y = 270 - (v / 100) * 240;
                return (
                  <g key={v}>
                    <line x1="40" y1={y} x2="680" y2={y} stroke="rgba(0,0,0,.06)" strokeWidth="0.5" />
                    <text x="35" y={y + 3} textAnchor="end" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
                  </g>
                );
              })}

              {/* X-axis labels */}
              {history.filter((_, i) => i === 0 || i === history.length - 1).map((h, i) => (
                <text key={i} x={i === 0 ? 40 : 680} y={290} textAnchor={i === 0 ? 'start' : 'end'} style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
                  {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              ))}

              {/* Lines per platform */}
              {allPlatforms.map(plat => {
                const color = PLATFORM_COLORS[plat] || '#888';
                const points = history.map((h, i) => {
                  const x = 40 + (i / (history.length - 1)) * 640;
                  const y = 270 - ((h.platforms?.[plat] || 0) / 100) * 240;
                  return { x, y, val: h.platforms?.[plat] || 0 };
                });
                return (
                  <g key={plat}>
                    <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {points.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--bg2)" stroke={color} strokeWidth="2">
                        <title>{plat}: {p.val}%</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
            <div style={{ fontSize: 36, opacity: 0.4 }}>📈</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Not Enough Data Yet</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: 0 }}>Run at least 2 query scans to see SOV trends across platforms.</p>
          </div>
        )}
      </div>
    </div>
  );
}
