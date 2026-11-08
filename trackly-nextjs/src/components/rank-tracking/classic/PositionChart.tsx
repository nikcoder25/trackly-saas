'use client';
/**
 * Position history for one keyword, drawn as plain SVG.
 *
 *  - Y axis inverted: rank 1 at the top, ticks picked from the data range.
 *  - Indigo line with a circle on every check and a soft gradient under it.
 *  - Checks where the site was not ranking sit on an "UNRANKED" baseline
 *    below the lowest tick, reached by a dashed grey line.
 *  - Hover (or arrow keys) shows a guide line and a dark tooltip.
 *  - Five date labels across the bottom.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RankHistoryRow } from '@/lib/rank-tracking/types';
import { C } from './theme';

const H = 280;
const PAD = { left: 92, right: 20, top: 18, bottom: 34 };
const BASE_GAP = 30;

/** Rank ticks from the best to the worst rank in the data: about 5 round numbers, 1 always allowed at the top. */
export function rankTicks(ranks: number[]): { lo: number; hi: number; ticks: number[] } {
  if (!ranks.length) return { lo: 1, hi: 10, ticks: [1, 4, 7, 10] };
  const min = Math.min(...ranks), max = Math.max(...ranks);
  const span = Math.max(1, max - min);
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 5) ?? 100;
  const lo = Math.max(1, Math.floor(min / step) * step);
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  if (lo === 1 && step > 1) ticks.push(1);
  for (let t = lo === 1 && step > 1 ? step : lo; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

const fmtTip = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const fmtAxis = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function PositionChart({ points, label }: { points: RankHistoryRow[]; label: string }) {
  const gradId = `pc-grad-${useId().replace(/:/g, '')}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const set = () => setW(Math.max(320, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const ranked = points.map((p) => p.position).filter((r): r is number => r != null);
    const { lo, hi, ticks } = rankTicks(ranked);
    const plotBottom = H - PAD.bottom - BASE_GAP;
    const baseY = H - PAD.bottom - 6;
    const y = (r: number) => PAD.top + ((r - lo) / Math.max(1, hi - lo)) * (plotBottom - PAD.top);
    const times = points.map((p) => new Date(p.date).getTime());
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const x0 = PAD.left, x1 = W - PAD.right;
    const x = (i: number) => (points.length < 2 ? (x0 + x1) / 2 : t1 === t0 ? x0 + (i / (points.length - 1)) * (x1 - x0) : x0 + ((times[i] - t0) / (t1 - t0)) * (x1 - x0));
    const pts = points.map((p, i) => ({ x: x(i), y: p.position == null ? baseY : y(p.position), r: p.position, date: p.date }));
    // Solid indigo runs between ranked checks; dashed grey wherever a check is unranked.
    const solid: string[] = [], dashed: string[] = [], area: string[] = [];
    let run: typeof pts = [];
    const f = (n: number) => n.toFixed(1);
    const flush = () => {
      if (run.length > 1) {
        solid.push(run.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' '));
        area.push(`M${f(run[0].x)} ${f(plotBottom)} ${run.map((p) => `L${f(p.x)} ${f(p.y)}`).join(' ')} L${f(run[run.length - 1].x)} ${f(plotBottom)} Z`);
      }
      run = [];
    };
    pts.forEach((p, i) => {
      if (p.r != null) run.push(p); else flush();
      const prev = pts[i - 1];
      if (prev && (prev.r == null || p.r == null)) dashed.push(`M${f(prev.x)} ${f(prev.y)} L${f(p.x)} ${f(p.y)}`);
    });
    flush();
    const anyUnranked = pts.some((p) => p.r == null);
    const xTicks = points.length < 2 || t1 === t0
      ? [{ x: (x0 + x1) / 2, t: t0 }]
      : Array.from({ length: 5 }, (_, i) => ({ x: x0 + (i / 4) * (x1 - x0), t: t0 + (i / 4) * (t1 - t0) }));
    return { ticks, y, pts, solid, dashed, area, baseY, plotBottom, anyUnranked, xTicks, x0, x1 };
  }, [points, W]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    g.pts.forEach((p, i) => { if (Math.abs(p.x - mx) < Math.abs(g.pts[best].x - mx)) best = i; });
    setHover(best);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = g.pts.length;
    setHover((h) => (h == null ? n - 1 : Math.max(0, Math.min(n - 1, h + (e.key === 'ArrowRight' ? 1 : -1)))));
  }

  const hp = hover != null ? g.pts[hover] : null;
  const tipW = 148;
  const tipX = hp ? Math.min(Math.max(hp.x - tipW / 2, 4), W - tipW - 4) : 0;
  const tipY = hp ? (hp.y - 62 < 4 ? hp.y + 14 : hp.y - 62) : 0;

  return (
    <div ref={wrap} style={{ width: '100%', position: 'relative' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
        style={{ display: 'block', outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.indigo} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.indigo} stopOpacity="0" />
          </linearGradient>
        </defs>

        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={g.x0} x2={g.x1} y1={g.y(t)} y2={g.y(t)} stroke={C.lineSoft} />
            <text x={g.x0 - 10} y={g.y(t) + 4} textAnchor="end" fontSize="11" fill={C.muted}>{t}</text>
          </g>
        ))}

        {g.anyUnranked && (
          <g>
            <line x1={g.x0} x2={g.x1} y1={g.baseY} y2={g.baseY} stroke={C.grey} strokeDasharray="3 4" />
            <g transform={`translate(6 ${g.baseY - 10})`}>
              <rect width="78" height="20" rx="10" fill={C.lineSoft} stroke={C.line} />
              <text x="39" y="14" textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="0.5" fill={C.muted}>◂ UNRANKED</text>
            </g>
          </g>
        )}

        {g.area.map((d, i) => <path key={`a${i}`} d={d} fill={`url(#${gradId})`} />)}
        {g.dashed.map((d, i) => <path key={`d${i}`} d={d} fill="none" stroke={C.grey} strokeWidth="1.5" strokeDasharray="4 4" />)}
        {g.solid.map((d, i) => <path key={`s${i}`} d={d} fill="none" stroke={C.indigo} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />)}

        {g.pts.map((p, i) => (
          p.r == null
            ? <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill="#fff" stroke={C.grey} strokeWidth="1.5" />
            : <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.5} fill="#fff" stroke={C.indigo} strokeWidth="2" />
        ))}

        {g.xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 10} fontSize="11" fill={C.muted}
            textAnchor={g.xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === g.xTicks.length - 1 ? 'end' : 'middle'}>{fmtAxis(t.t)}</text>
        ))}

        {hp && (
          <g pointerEvents="none">
            <line x1={hp.x} x2={hp.x} y1={PAD.top - 6} y2={g.baseY} stroke={C.indigoMuted} strokeWidth="1" />
            <g transform={`translate(${tipX} ${tipY})`}>
              <rect width={tipW} height="46" rx="8" fill={C.navy} />
              <text x="12" y="19" fontSize="13" fontWeight="700" fill="#fff">{hp.r == null ? 'Not ranking' : `Rank ${hp.r}`}</text>
              <text x="12" y="36" fontSize="11" fill="#c7d2fe">{fmtTip(hp.date)}</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
