'use client';
/**
 * Rank history line chart for one keyword (screen 2, expanded row). Inline
 * SVG like the design: position 1 at the top, the tracking depth at the
 * bottom, and a dashed "Not in top N" baseline where unranked checks sit.
 */
import React from 'react';
import type { HistoryPoint } from '@/lib/rank-tracking/types';
import { RT } from '@/components/rank-tracking/RankUi';

const X0 = 64, X1 = 964, TOP = 22, BOTTOM = 192, BASE = 210;

export default function WebsiteHistoryChart({ points, depth, label }: { points: HistoryPoint[]; depth: number; label: string }) {
  const d = Math.max(2, depth);
  const Y = (v: number | null) => (v == null ? BASE : TOP + ((Math.min(v, d) - 1) / (d - 1)) * (BOTTOM - TOP));
  const times = points.map((p) => new Date(p.at).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const X = (i: number) => (points.length < 2 || t1 === t0
    ? (points.length < 2 ? (X0 + X1) / 2 : X0 + (i / (points.length - 1)) * (X1 - X0))
    : X0 + ((times[i] - t0) / (t1 - t0)) * (X1 - X0));
  const pts = points.map((p, i) => ({ x: X(i), y: Y(p.rank), v: p.rank }));
  const f = (n: number) => n.toFixed(1);

  const full = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
  let solid = '', area = '';
  let run: typeof pts = [];
  const flush = () => {
    if (run.length) {
      solid += run.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ') + ' ';
      if (run.length > 1) area += `M${f(run[0].x)} ${BASE} ${run.map((p) => `L${f(p.x)} ${f(p.y)}`).join(' ')} L${f(run[run.length - 1].x)} ${BASE} Z `;
    }
    run = [];
  };
  pts.forEach((p) => { if (p.v == null) flush(); else run.push(p); });
  flush();

  const ticks = d <= 30 ? [1, 10, 20, 30].filter((t) => t <= d) : [1, 25, 50, 75, 100].filter((t) => t <= d);
  const longSpan = t1 - t0 > 180 * 86400000;
  const fmt = (i: number) => {
    const dt = new Date(points[i].at);
    return dt.toLocaleDateString('en-US', longSpan ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' });
  };
  const n = points.length;
  const xl = [...new Set(n === 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])];
  const r = n > 60 ? 2.5 : 4;

  return (
    <svg viewBox="0 0 1000 250" role="img" aria-label={label}
      style={{ width: '100%', height: 250, background: '#fff', boxSizing: 'border-box' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={56} y1={Y(t)} x2={980} y2={Y(t)} stroke={RT.lineSoft} strokeWidth={1} />
          <text x={44} y={Y(t) + 4} fontSize={12} fill={RT.muted} textAnchor="end" fontFamily="Inter, sans-serif">{t}</text>
        </g>
      ))}
      <line x1={56} y1={BASE} x2={980} y2={BASE} stroke="#cbd5e1" strokeDasharray="4 4" />
      <text x={64} y={BASE - 6} fontSize={11} fill={RT.muted} fontFamily="Inter, sans-serif">Not in top {depth}</text>
      {n > 1 && <path d={full} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" />}
      {area && <path d={area} fill={RT.indigoSoft} stroke="none" />}
      {solid && <path d={solid} fill="none" stroke={RT.indigo} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((p, i) => (
        <circle key={i} cx={f(p.x)} cy={f(p.y)} r={r} fill="#fff" stroke={p.v == null ? '#94a3b8' : RT.indigo} strokeWidth={2}>
          <title>{`${new Date(points[i].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${p.v ?? `not in top ${depth}`}`}</title>
        </circle>
      ))}
      {xl.map((i) => (
        <text key={i} x={f(pts[i].x)} y={240} fontSize={12} fill={RT.muted} fontFamily="Inter, sans-serif"
          textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{fmt(i)}</text>
      ))}
    </svg>
  );
}
