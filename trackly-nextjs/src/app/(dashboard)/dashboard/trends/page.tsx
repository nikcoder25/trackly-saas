'use client';

import { useMemo, useState, useRef } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { useBrandData } from '@/hooks/useBrandData';

interface SovPoint { date: string; overall: number; platforms?: Record<string, number>; }
interface Run { date?: string; time?: string; sov?: number; platforms?: Record<string, { sov?: number }> }
interface Brand { id: string; name: string; sovHistory?: SovPoint[]; runs?: Run[]; }

/* ── Helpers ── */
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateFull = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ── Smooth curve path (catmull-rom → cubic bezier) ── */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
  }
  return d;
}

export default function TrendsPage() {
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;

  const history: SovPoint[] = useMemo(() => {
    if (brand?.sovHistory?.length) return brand.sovHistory;
    return (brand?.runs || []).filter(r => r.date && r.sov !== undefined).map(r => ({
      date: r.date!,
      overall: r.sov!,
      platforms: r.platforms ? Object.fromEntries(Object.entries(r.platforms).map(([k, v]) => [k, v.sov || 0])) : {},
    }));
  }, [brand]);

  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => set.add(p)); });
    return [...set];
  }, [history]);

  // Stats
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const sovDelta = latest && prev ? latest.overall - prev.overall : null;
  const avgSov = history.length > 0 ? Math.round(history.reduce((s, h) => s + h.overall, 0) / history.length) : 0;
  const peakSov = history.length > 0 ? Math.max(...history.map(h => h.overall)) : 0;
  const lowSov = history.length > 0 ? Math.min(...history.map(h => h.overall)) : 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  const s = {
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--app-shadow)' } as const,
    label: { fontSize: 11, fontWeight: 700 as const, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    mono: { fontFamily: 'var(--mono)' },
  };

  return (
    <div>
      <LockedBrandBanner />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', margin: 0 }}>SOV Trends</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Share of Voice over time — track how AI platforms mention your brand.
          {history.length > 0 && <span> · {history.length} data points</span>}
        </p>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Current SOV', value: latest ? `${latest.overall}%` : '—', color: 'var(--primary)', delta: sovDelta },
          { label: 'Average SOV', value: `${avgSov}%`, color: 'var(--text)', delta: null },
          { label: 'Peak SOV', value: `${peakSov}%`, color: 'var(--green)', delta: null },
          { label: 'Lowest SOV', value: `${lowSov}%`, color: 'var(--amber)', delta: null },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...s.card, padding: '16px 20px' }}>
            <div style={s.label}>{kpi.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 800, ...s.mono, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
              {kpi.delta !== null && kpi.delta !== 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: kpi.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {kpi.delta > 0 ? '▲' : '▼'} {Math.abs(kpi.delta)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Overall SOV area chart ── */}
      <div style={{ ...s.card, padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Overall SOV Trend</div>
          {history.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDateFull(history[0].date)} — {fmtDateFull(history[history.length - 1].date)}</span>
          )}
        </div>
        {history.length > 1 ? (
          <OverallChart history={history} />
        ) : (
          <EmptyState text="Run at least 2 scans to see the overall trend." />
        )}
      </div>

      {/* ── Per-platform line chart ── */}
      <div style={{ ...s.card, padding: '24px 28px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Per-Platform SOV Trend</div>
        {history.length > 1 && allPlatforms.length > 0 ? (
          <PlatformChart history={history} platforms={allPlatforms} />
        ) : (
          <EmptyState text="Run at least 2 scans to see per-platform trends." />
        )}
      </div>
    </div>
  );
}

/* ═══ Overall Area Chart ═══ */
function OverallChart({ history }: { history: SovPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 900, H = 260, PL = 45, PR = 16, PT = 16, PB = 40;
  const chartW = W - PL - PR, chartH = H - PT - PB;

  const pts = history.map((h, i) => ({
    x: PL + (i / Math.max(history.length - 1, 1)) * chartW,
    y: PT + chartH - (h.overall / 100) * chartH,
  }));

  const pathD = smoothPath(pts);
  const areaD = pathD + `L${pts[pts.length - 1].x},${PT + chartH}L${pts[0].x},${PT + chartH}Z`;

  // Grid lines
  const yTicks = [0, 25, 50, 75, 100];
  // X ticks — show evenly spaced dates
  const xTickCount = Math.min(history.length, 8);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => Math.round(i * (history.length - 1) / (xTickCount - 1)));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - PL) / chartW) * (history.length - 1));
    setHover(Math.max(0, Math.min(idx, history.length - 1)));
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}
      onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="sovGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map(v => {
        const y = PT + chartH - (v / 100) * chartH;
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v === 0 ? 'none' : '4,4'} />
            <text x={PL - 8} y={y + 4} textAnchor="end" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
          </g>
        );
      })}

      {/* X labels */}
      {xTicks.map(idx => (
        <text key={idx} x={pts[idx].x} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
          {fmtDate(history[idx].date)}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="url(#sovGrad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill={hover === i ? 'var(--primary)' : 'var(--bg2)'} stroke="var(--primary)" strokeWidth={2} style={{ transition: 'r 0.15s' }} />
      ))}

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const h = history[hover];
        const p = pts[hover];
        const tooltipW = 110, tooltipH = 42;
        let tx = p.x - tooltipW / 2;
        if (tx < PL) tx = PL;
        if (tx + tooltipW > W - PR) tx = W - PR - tooltipW;
        const ty = p.y - tooltipH - 12;
        return (
          <g>
            <line x1={p.x} y1={PT} x2={p.x} y2={PT + chartH} stroke="var(--primary)" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.4} />
            <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={6} fill="var(--text)" opacity={0.92} />
            <text x={tx + tooltipW / 2} y={ty + 16} textAnchor="middle" style={{ fontSize: 10, fill: 'rgba(255,255,255,.6)', fontFamily: 'var(--mono)' }}>{fmtDate(h.date)}</text>
            <text x={tx + tooltipW / 2} y={ty + 33} textAnchor="middle" style={{ fontSize: 16, fill: '#fff', fontWeight: 700, fontFamily: 'var(--mono)' }}>{h.overall}%</text>
          </g>
        );
      })()}
    </svg>
  );
}

/* ═══ Per-Platform Line Chart ═══ */
function PlatformChart({ history, platforms }: { history: SovPoint[]; platforms: string[] }) {
  const [activePlatforms, setActivePlatforms] = useState<Set<string>>(new Set(platforms));
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 900, H = 320, PL = 45, PR = 16, PT = 16, PB = 40;
  const chartW = W - PL - PR, chartH = H - PT - PB;

  const yTicks = [0, 20, 40, 60, 80, 100];
  const xTickCount = Math.min(history.length, 8);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => Math.round(i * (history.length - 1) / (xTickCount - 1)));

  function togglePlatform(p: string) {
    setActivePlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) { if (next.size > 1) next.delete(p); } else next.add(p);
      return next;
    });
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - PL) / chartW) * (history.length - 1));
    setHover(Math.max(0, Math.min(idx, history.length - 1)));
  }

  return (
    <div>
      {/* Interactive legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {platforms.map(p => {
          const active = activePlatforms.has(p);
          const color = PLATFORM_COLORS[p] || '#888';
          return (
            <button key={p} onClick={() => togglePlatform(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all .15s', background: active ? `color-mix(in srgb, ${color} 10%, transparent)` : 'var(--bg3)', borderColor: active ? `color-mix(in srgb, ${color} 30%, transparent)` : 'var(--border)', color: active ? color : 'var(--muted)', opacity: active ? 1 : 0.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : 'var(--muted)' }} />
              {p}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {platforms.map(p => (
            <linearGradient key={p} id={`grad-${p.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PLATFORM_COLORS[p] || '#888'} stopOpacity={0.12} />
              <stop offset="100%" stopColor={PLATFORM_COLORS[p] || '#888'} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {yTicks.map(v => {
          const y = PT + chartH - (v / 100) * chartH;
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v === 0 ? 'none' : '4,4'} />
              <text x={PL - 8} y={y + 4} textAnchor="end" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
            </g>
          );
        })}

        {/* X labels */}
        {xTicks.map(idx => {
          const x = PL + (idx / Math.max(history.length - 1, 1)) * chartW;
          return (
            <text key={idx} x={x} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
              {fmtDate(history[idx].date)}
            </text>
          );
        })}

        {/* Platform lines */}
        {platforms.filter(p => activePlatforms.has(p)).map(plat => {
          const color = PLATFORM_COLORS[plat] || '#888';
          const pts = history.map((h, i) => ({
            x: PL + (i / Math.max(history.length - 1, 1)) * chartW,
            y: PT + chartH - ((h.platforms?.[plat] || 0) / 100) * chartH,
          }));
          const pathD = smoothPath(pts);
          const areaD = pathD + `L${pts[pts.length - 1].x},${PT + chartH}L${pts[0].x},${PT + chartH}Z`;
          return (
            <g key={plat}>
              <path d={areaD} fill={`url(#grad-${plat.replace(/\s/g, '')})`} />
              <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill={hover === i ? color : 'var(--bg2)'} stroke={color} strokeWidth={2} style={{ transition: 'r 0.15s' }} />
              ))}
            </g>
          );
        })}

        {/* Hover crosshair + tooltip */}
        {hover !== null && (() => {
          const hx = PL + (hover / Math.max(history.length - 1, 1)) * chartW;
          const h = history[hover];
          const visiblePlatforms = platforms.filter(p => activePlatforms.has(p));
          const tooltipW = 140, lineH = 18, tooltipH = 24 + visiblePlatforms.length * lineH;
          let tx = hx + 14;
          if (tx + tooltipW > W - PR) tx = hx - tooltipW - 14;
          const ty = PT + 10;
          return (
            <g>
              <line x1={hx} y1={PT} x2={hx} y2={PT + chartH} stroke="var(--muted)" strokeWidth={0.5} strokeDasharray="4,3" opacity={0.5} />
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={8} fill="var(--text)" opacity={0.92} />
              <text x={tx + 12} y={ty + 16} style={{ fontSize: 10, fill: 'rgba(255,255,255,.5)', fontFamily: 'var(--mono)' }}>{fmtDate(h.date)}</text>
              {visiblePlatforms.map((p, i) => {
                const val = h.platforms?.[p] || 0;
                const color = PLATFORM_COLORS[p] || '#888';
                return (
                  <g key={p}>
                    <circle cx={tx + 16} cy={ty + 30 + i * lineH} r={3} fill={color} />
                    <text x={tx + 26} y={ty + 34 + i * lineH} style={{ fontSize: 11, fill: 'rgba(255,255,255,.8)' }}>{p}</text>
                    <text x={tx + tooltipW - 12} y={ty + 34 + i * lineH} textAnchor="end" style={{ fontSize: 11, fill: '#fff', fontWeight: 700, fontFamily: 'var(--mono)' }}>{val}%</text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ═══ Empty state ═══ */
function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📈</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Not Enough Data Yet</div>
      <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: 0, maxWidth: 340 }}>{text}</p>
    </div>
  );
}
