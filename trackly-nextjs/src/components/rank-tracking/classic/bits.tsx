'use client';
/** Small pieces of the classic rank tracker: rank badge, change, trend sparkline, movement bar, icons. */
import React from 'react';
import { C } from './theme';

/** Dark navy for 1-3, indigo for 4-10, grey otherwise, "–" when not ranking. */
export function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span aria-label="Not ranking" style={{ display: 'inline-block', minWidth: 34, textAlign: 'center', color: C.grey, fontWeight: 700 }}>–</span>;
  const top3 = rank <= 3, top10 = rank <= 10;
  return (
    <span style={{
      display: 'inline-block', minWidth: 34, textAlign: 'center', padding: '4px 8px', borderRadius: 7, fontWeight: 700, fontSize: 13, lineHeight: '16px',
      background: top3 ? C.navy : top10 ? C.indigo : C.lineSoft, color: top3 || top10 ? '#fff' : C.text,
    }}>{rank}</span>
  );
}

/** ▲N green, ▼N red, 0 grey. */
export function ChangeText({ v }: { v: number }) {
  if (!v) return <span style={{ color: C.grey, fontWeight: 600 }}>0</span>;
  return <span style={{ color: v > 0 ? C.upText : C.downText, fontWeight: 600, whiteSpace: 'nowrap' }}>{v > 0 ? '▲' : '▼'}{Math.abs(v)}</span>;
}

/**
 * Last checks as a sparkline: green if the keyword improved over them, red if
 * it dropped, grey if flat. Breaks in the line where it was not ranking.
 */
export function TrendSpark({ ranks, depth, width = 96, height = 26 }: { ranks: (number | null)[]; depth: number; width?: number; height?: number }) {
  const ranked = ranks.filter((r): r is number => r != null);
  if (ranks.length < 2 || !ranked.length) return <span style={{ color: C.grey, fontSize: 12 }}>–</span>;
  const pos = (r: number | null) => (r == null ? depth + 1 : r);
  const delta = pos(ranks[0]) - pos(ranks[ranks.length - 1]);
  const color = delta > 0 ? C.up : delta < 0 ? C.down : C.grey;
  const lo = Math.min(...ranked), hi = Math.max(...ranked);
  const x = (i: number) => 2 + (i / (ranks.length - 1)) * (width - 4);
  const y = (r: number) => (hi === lo ? height / 2 : 3 + ((r - lo) / (hi - lo)) * (height - 6));
  let d = '';
  let pen = false;
  const dots: { x: number; y: number }[] = [];
  ranks.forEach((r, i) => {
    if (r == null) { pen = false; return; }
    const next = ranks[i + 1];
    const prev = ranks[i - 1];
    if ((prev == null || i === 0) && (next == null || i === ranks.length - 1)) dots.push({ x: x(i), y: y(r) });
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r).toFixed(1)} `;
    pen = true;
  });
  const first = ranks[0], last = ranks[ranks.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Trend over the last ${ranks.length} checks: from ${first ?? 'not ranking'} to ${last ?? 'not ranking'}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={color} />)}
    </svg>
  );
}

/** One 110px bar: green share improved, red share dropped, grey unchanged. */
export function MovementBar({ improved, dropped, unchanged }: { improved: number; dropped: number; unchanged: number }) {
  const total = improved + dropped + unchanged;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <span role="img" aria-label={`${improved} improved, ${dropped} dropped, ${unchanged} unchanged`}
      title={`${improved} improved · ${dropped} dropped · ${unchanged} unchanged`}
      style={{ display: 'inline-flex', width: 110, height: 8, borderRadius: 999, overflow: 'hidden', background: C.greyBar, verticalAlign: 'middle' }}>
      {total > 0 && <span style={{ width: `${pct(improved)}%`, background: C.up }} />}
      {total > 0 && <span style={{ width: `${pct(dropped)}%`, background: C.down }} />}
    </span>
  );
}

export function Chevron({ open, dir = 'down' }: { open: boolean; dir?: 'down' | 'right' }) {
  const rot = dir === 'right' ? (open ? 90 : 0) : open ? 180 : 0;
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: `rotate(${rot}deg)`, transition: 'transform .15s' }}>
      <path d={dir === 'right' ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

export function StarIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? C.star : 'none'} stroke={on ? C.star : C.grey} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export const iconBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8,
  background: 'transparent', color: C.muted, cursor: 'pointer', padding: 0, textDecoration: 'none',
};

export function urlPath(url: string | null): string {
  if (!url) return '';
  try { const u = new URL(url); return (u.pathname + u.search) || '/'; } catch { return url; }
}

export function fmtShort(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
