'use client';

import { useMemo, useState, useRef } from 'react';
import { PLATFORM_COLORS, getPlanPlatforms } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, ChartSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';

interface SovPoint { date: string; overall: number; platforms?: Record<string, number>; }
interface Run { date?: string; time?: string; sov?: number; platforms?: Record<string, { sov?: number }> }
interface Brand { id: string; name: string; sovHistory?: SovPoint[]; runs?: Run[]; }

/* ── Helpers ── */
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateFull = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ── Smooth curve path with clamped control points ── */
function smoothPath(pts: { x: number; y: number }[], yMin?: number, yMax?: number): string {
  // Filter out any NaN points
  const valid = pts.filter(p => !isNaN(p.x) && !isNaN(p.y));
  if (valid.length < 2) return '';
  if (valid.length === 2) return `M${valid[0].x},${valid[0].y}L${valid[1].x},${valid[1].y}`;
  pts = valid;
  const clampY = (v: number) => {
    if (yMin !== undefined && v < yMin) return yMin;
    if (yMax !== undefined && v > yMax) return yMax;
    return v;
  };
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
  }
  return d;
}

export default function TrendsPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;

  const history: SovPoint[] = useMemo(() => {
    if (brand?.sovHistory?.length) {
      return brand.sovHistory.map(h => ({ ...h, overall: Number(h.overall) || 0 }));
    }
    return (brand?.runs || [])
      .filter(r => r.date && r.sov != null && !isNaN(Number(r.sov)))
      .map(r => ({
        date: r.date!,
        overall: Number(r.sov) || 0,
        platforms: r.platforms
          ? Object.fromEntries(Object.entries(r.platforms).map(([k, v]) => [k, Number(v.sov) || 0]))
          : {},
      }));
  }, [brand]);

  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => set.add(p)); });
    return [...set].filter(p => planPlatforms.includes(p));
  }, [history, planPlatforms]);

  // Stats — guard against NaN with || 0
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const sovDelta = latest && prev ? (latest.overall - prev.overall) : null;
  const validOveralls = history.map(h => h.overall).filter(v => !isNaN(v));
  const avgSov = validOveralls.length > 0 ? Math.round(validOveralls.reduce((s, v) => s + v, 0) / validOveralls.length) : 0;
  const peakSov = validOveralls.length > 0 ? Math.max(...validOveralls) : 0;
  const lowSov = validOveralls.length > 0 ? Math.min(...validOveralls) : 0;

  if (loading) return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 22, width: 160, borderRadius: 6, background: 'var(--bg3)', marginBottom: 8 }} />
        <div style={{ height: 13, width: 340, borderRadius: 4, background: 'var(--bg3)' }} />
      </div>
      <KpiCardsSkeleton count={4} />
      <ChartSkeleton h={280} />
      <div style={{ marginTop: 20 }}><ChartSkeleton h={320} /></div>
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

  const W = 960, H = 340, PL = 50, PR = 20, PT = 20, PB = 44;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const yTop = PT, yBottom = PT + chartH;

  const pts = history.map((h, i) => {
    const val = Number(h.overall) || 0;
    return {
      x: PL + (i / Math.max(history.length - 1, 1)) * chartW,
      y: PT + chartH - (Math.min(Math.max(val, 0), 100) / 100) * chartH,
    };
  });

  const pathD = smoothPath(pts, yTop, yBottom);
  const areaD = pts.length >= 2
    ? pathD + `L${pts[pts.length - 1].x},${yBottom}L${pts[0].x},${yBottom}Z`
    : '';

  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const xTickCount = Math.min(history.length, 10);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => Math.round(i * (history.length - 1) / Math.max(xTickCount - 1, 1)));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - PL) / chartW) * (history.length - 1));
    setHover(Math.max(0, Math.min(idx, history.length - 1)));
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', minHeight: 280 }}
      onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="sovGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
          <stop offset="60%" stopColor="var(--primary)" stopOpacity={0.06} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map(v => {
        const y = PT + chartH - (v / 100) * chartH;
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={v === 0 ? 0.8 : 0.4} strokeDasharray={v === 0 ? 'none' : '3,4'} opacity={v % 20 === 0 ? 0.8 : 0.4} />
            {v % 20 === 0 && (
              <text x={PL - 10} y={y + 4} textAnchor="end" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
            )}
          </g>
        );
      })}

      {/* X labels */}
      {xTicks.map(idx => (
        <text key={idx} x={pts[idx].x} y={H - 10} textAnchor="middle" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
          {fmtDate(history[idx].date)}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="url(#sovGrad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <g key={i}>
          {hover === i && <circle cx={p.x} cy={p.y} r={10} fill="var(--primary)" opacity={0.1} />}
          <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill={hover === i ? 'var(--primary)' : 'var(--bg2)'} stroke="var(--primary)" strokeWidth={2} style={{ transition: 'r 0.15s' }} />
        </g>
      ))}

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const h = history[hover];
        const p = pts[hover];
        const tooltipW = 120, tooltipH = 50;
        let tx = p.x - tooltipW / 2;
        if (tx < PL) tx = PL;
        if (tx + tooltipW > W - PR) tx = W - PR - tooltipW;
        let ty = p.y - tooltipH - 16;
        if (ty < 4) ty = p.y + 16;
        return (
          <g>
            <line x1={p.x} y1={yTop} x2={p.x} y2={yBottom} stroke="var(--primary)" strokeWidth={0.6} strokeDasharray="4,3" opacity={0.35} />
            <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={8} fill="var(--text)" opacity={0.93} />
            <text x={tx + tooltipW / 2} y={ty + 18} textAnchor="middle" style={{ fontSize: 10, fill: 'rgba(255,255,255,.55)', fontFamily: 'var(--mono)' }}>{fmtDate(h.date)}</text>
            <text x={tx + tooltipW / 2} y={ty + 38} textAnchor="middle" style={{ fontSize: 18, fill: '#fff', fontWeight: 800, fontFamily: 'var(--mono)' }}>{h.overall}%</text>
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

  const W = 960, H = 380, PL = 50, PR = 20, PT = 20, PB = 44;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const yTop = PT, yBottom = PT + chartH;

  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const xTickCount = Math.min(history.length, 10);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => Math.round(i * (history.length - 1) / Math.max(xTickCount - 1, 1)));

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
            <button key={p} onClick={() => togglePlatform(p)} aria-label={`${active ? 'Hide' : 'Show'} ${p}`} aria-pressed={active}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all .15s', background: active ? `color-mix(in srgb, ${color} 10%, transparent)` : 'var(--bg3)', borderColor: active ? `color-mix(in srgb, ${color} 30%, transparent)` : 'var(--border)', color: active ? color : 'var(--muted)', opacity: active ? 1 : 0.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : 'var(--muted)' }} />
              {p}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', minHeight: 320 }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {platforms.map(p => (
            <linearGradient key={p} id={`grad-${p.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PLATFORM_COLORS[p] || '#888'} stopOpacity={0.15} />
              <stop offset="60%" stopColor={PLATFORM_COLORS[p] || '#888'} stopOpacity={0.04} />
              <stop offset="100%" stopColor={PLATFORM_COLORS[p] || '#888'} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {yTicks.map(v => {
          const y = PT + chartH - (v / 100) * chartH;
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth={v === 0 ? 0.8 : 0.4} strokeDasharray={v === 0 ? 'none' : '3,4'} opacity={v % 20 === 0 ? 0.8 : 0.4} />
              {v % 20 === 0 && (
                <text x={PL - 10} y={y + 4} textAnchor="end" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
              )}
            </g>
          );
        })}

        {/* X labels */}
        {xTicks.map(idx => {
          const x = PL + (idx / Math.max(history.length - 1, 1)) * chartW;
          return (
            <text key={idx} x={x} y={H - 10} textAnchor="middle" style={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>
              {fmtDate(history[idx].date)}
            </text>
          );
        })}

        {/* Platform lines */}
        {platforms.filter(p => activePlatforms.has(p)).map(plat => {
          const color = PLATFORM_COLORS[plat] || '#888';
          const pts = history.map((h, i) => ({
            x: PL + (i / Math.max(history.length - 1, 1)) * chartW,
            y: PT + chartH - (Math.min(Math.max(h.platforms?.[plat] || 0, 0), 100) / 100) * chartH,
          }));
          const pathD = smoothPath(pts, yTop, yBottom);
          const areaD = pathD + `L${pts[pts.length - 1].x},${yBottom}L${pts[0].x},${yBottom}Z`;
          return (
            <g key={plat}>
              <path d={areaD} fill={`url(#grad-${plat.replace(/\s/g, '')})`} />
              <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <g key={i}>
                  {hover === i && <circle cx={p.x} cy={p.y} r={9} fill={color} opacity={0.1} />}
                  <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill={hover === i ? color : 'var(--bg2)'} stroke={color} strokeWidth={2} style={{ transition: 'r 0.15s' }} />
                </g>
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
