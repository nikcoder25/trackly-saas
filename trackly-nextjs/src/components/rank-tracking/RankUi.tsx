'use client';
/**
 * Small pieces every rank tracking page shares: the rank badge, the change
 * arrow, the position sparkline, the sub-navigation between the rank
 * tracking pages, the credits card and a JSON fetch helper that sends the
 * CSRF header. Indigo brand (#4f46e5 / #6366f1) per the design.
 */
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/fetch-client';
import { useUiFlag } from '@/contexts/UiFlagContext';
import { useBrands } from '@/contexts/BrandContext';
import type { RankCreditStatus } from '@/lib/rank-tracking/types';

export const RT = {
  indigo: '#4f46e5', indigoLight: '#6366f1', indigoDark: '#312e81', indigoSoft: '#eef2ff', indigoMid: '#e0e7ff',
  ink: '#0f172a', text: '#334155', muted: '#475569', line: '#e2e8f0', lineSoft: '#f1f5f9', bg: '#f8fafc',
  up: '#15803d', down: '#b91c1c',
};

/**
 * The brand picked in the sidebar, as a rank tracking scope. `domain` is the
 * brand's website ('' when it has none) and `query` is the `domain=` param the
 * summary and overview APIs filter on. No brand selected means every website.
 */
export function useBrandScope(): { ready: boolean; name: string | null; domain: string | undefined; query: string } {
  const { selectedBrand, loading } = useBrands();
  if (!selectedBrand) return { ready: !loading, name: null, domain: undefined, query: '' };
  const domain = typeof selectedBrand.website === 'string' ? selectedBrand.website.trim() : '';
  return { ready: true, name: selectedBrand.name, domain, query: `domain=${encodeURIComponent(domain)}` };
}

/** GET/POST/PATCH/DELETE JSON with the session cookie and CSRF header. Throws Error(message) on failure. */
export async function rtFetch<T = unknown>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
  return api<T>(method, path, body);
}

export function RankBadge({ rank, depth = 30 }: { rank: number | null; depth?: number }) {
  const top3 = rank != null && rank <= 3;
  const top10 = rank != null && rank <= 10;
  return (
    <span style={{
      display: 'inline-block', minWidth: 36, textAlign: 'center', padding: '4px 8px', borderRadius: 8, fontWeight: 700, fontSize: 13,
      background: top3 ? RT.indigoDark : top10 ? RT.indigoMid : RT.lineSoft, color: top3 ? '#fff' : top10 ? RT.indigoDark : RT.muted,
    }}>{rank ?? `${depth}+`}</span>
  );
}

/** Positions gained (positive) or lost (negative). */
export function Change({ v, decimals = false }: { v: number; decimals?: boolean }) {
  const n = decimals ? Math.abs(v) : Math.abs(Math.round(v));
  if (!v || n === 0) return <span style={{ color: RT.muted, fontWeight: 600 }}>0</span>;
  return <span style={{ color: v > 0 ? RT.up : RT.down, fontWeight: 600 }}>{v > 0 ? '▲' : '▼'} {n}</span>;
}

/** Rank over time: up is better, so position 1 sits at the top. Nulls ("not ranking") sit at the bottom. */
export function RankSpark({ ranks, depth = 30, width = 110, height = 28, label }: { ranks: (number | null)[]; depth?: number; width?: number; height?: number; label?: string }) {
  if (!ranks || ranks.length < 2) return <span style={{ color: RT.muted, fontSize: 12 }}>-</span>;
  const max = Math.max(depth + 1, ...ranks.filter((r): r is number => r != null));
  const pts = ranks.map((r, i) => {
    const x = 3 + (i / (ranks.length - 1)) * (width - 6);
    const y = 3 + (((r ?? max) - 1) / (max - 1)) * (height - 6);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const firstR = ranks.find((r) => r != null);
  const lastR = [...ranks].reverse().find((r) => r != null);
  const better = firstR != null && lastR != null ? lastR < firstR : null;
  const color = better === null ? RT.indigo : better ? RT.indigo : '#94a3b8';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label || `Rank moved from ${firstR ?? 'not ranking'} to ${lastR ?? 'not ranking'}`}>
      <path d={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const AI_LABEL: Record<string, string> = { recommended: 'Recommended', mentioned: 'Mentioned', not_mentioned: 'Not mentioned' };
export function AiStatusText({ status }: { status: string | null }) {
  const color = status === 'recommended' ? RT.up : status === 'mentioned' ? '#3730a3' : RT.muted;
  return <span style={{ color, fontWeight: 500 }}>{status ? AI_LABEL[status] : 'Not tracked'}</span>;
}

/** Short tag for an activity line, from its wording. */
export function activityTag(message: string, kind: string): { label: string; fg: string; bg: string } {
  const m = message.toLowerCase();
  const up = { fg: RT.up, bg: '#ecfdf3' };
  if (/ai answers|mentioned/.test(m)) return { label: 'AI', fg: RT.indigoDark, bg: RT.indigoSoft };
  const top = m.match(/entered the top (\d+)/);
  if (top) return { label: `TOP ${top[1]}`, ...up };
  if (/new best/.test(m)) return { label: 'BEST', ...up };
  if (/gained/.test(m)) return { label: 'UP', ...up };
  if (/left the top|new worst|lost|drop/.test(m)) return { label: 'DROP', fg: RT.down, bg: '#fef2f2' };
  if (/report/.test(m)) return { label: 'REPORT', fg: RT.text, bg: RT.lineSoft };
  return { label: kind === 'alert' ? 'ALERT' : 'MOVE', fg: RT.indigoDark, bg: RT.indigoSoft };
}

export function fmtDay(iso: string | null | undefined, withWeekday = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', withWeekday ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
}

const TABS = [
  { href: '/dashboard/rank-tracking', label: 'Websites' },
  { href: '/dashboard/rank-tracking/overview', label: 'Overview' },
  { href: '/dashboard/rank-tracking/alerts', label: 'Alerts' },
  { href: '/dashboard/rank-tracking/reports', label: 'Reports' },
  { href: '/dashboard/rank-tracking/clients', label: 'Clients' },
];

/** Tabs between the rank tracking pages (the v3 shell draws its own section tabs, so only the classic layout needs these). */
export function RankTabs() {
  const pathname = usePathname() || '';
  const { isV3 } = useUiFlag();
  const active = (href: string) => (href === '/dashboard/rank-tracking'
    ? pathname === href || (/^\/dashboard\/rank-tracking\/(?!overview|alerts|reports|clients)/.test(pathname))
    : pathname.startsWith(href));
  if (isV3) return null;
  return (
    <nav aria-label="Rank tracking" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${RT.line}`, marginBottom: 20 }}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? 'page' : undefined}
          style={{ padding: '10px 14px', minHeight: 44, boxSizing: 'border-box', fontSize: 14, fontWeight: active(t.href) ? 600 : 500, textDecoration: 'none',
            color: active(t.href) ? '#3730a3' : RT.muted, borderBottom: `2px solid ${active(t.href) ? RT.indigo : 'transparent'}`, marginBottom: -1 }}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function CreditsCard({ credits }: { credits: RankCreditStatus | null }) {
  if (!credits) return null;
  const pct = credits.allowance ? Math.min(100, Math.round((credits.committed / credits.allowance) * 100)) : 100;
  return (
    <div style={{ background: RT.lineSoft, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
      <div style={{ fontSize: 12, color: RT.muted, fontWeight: 500 }}>Keyword credits a month</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: RT.ink }}>{credits.committed.toLocaleString('en-US')} of {credits.allowance.toLocaleString('en-US')} used</div>
      <div style={{ height: 6, background: RT.line, borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: 6, background: RT.indigo }} /></div>
      <div style={{ fontSize: 12, color: RT.muted }}>{credits.usedThisMonth.toLocaleString('en-US')} spent this month · resets {fmtDay(credits.resetsAt)}</div>
    </div>
  );
}

export const btnPrimary: React.CSSProperties = {
  font: 'inherit', fontSize: 14, fontWeight: 600, padding: '12px 18px', minHeight: 44, boxSizing: 'border-box', borderRadius: 10, border: 0,
  background: RT.indigo, color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6,
};
export const btnSecondary: React.CSSProperties = {
  font: 'inherit', fontSize: 14, fontWeight: 500, padding: '12px 16px', minHeight: 44, boxSizing: 'border-box', borderRadius: 10, border: `1px solid #cbd5e1`,
  background: '#fff', color: RT.ink, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6,
};
export const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
export const cardStyle: React.CSSProperties = { background: '#fff', border: `1px solid ${RT.line}`, borderRadius: 14 };
export const inputStyle: React.CSSProperties = { font: 'inherit', fontSize: 15, padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 10, color: RT.ink, background: '#fff', boxSizing: 'border-box', width: '100%' };
export const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600, color: RT.text };

/** Two-or-more option segmented toggle: white bordered track, the picked option filled dark. */
export function Toggle<T extends string | number>({ value, options, onChange, label, small = false }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', background: '#fff', border: `1px solid ${RT.line}`, borderRadius: small ? 8 : 10, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            style={{ flex: 1, font: 'inherit', fontSize: small ? 12 : 13, fontWeight: on ? 600 : 500, minHeight: small ? 32 : 38, padding: small ? '4px 10px' : '6px 12px', border: 0,
              borderRadius: small ? 6 : 7, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? RT.ink : 'transparent', color: on ? '#fff' : RT.text }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Position bands, best first, matching the spread arrays the API returns. */
export const SPREAD_BANDS = [
  { label: '1 to 3', color: '#312e81' },
  { label: '4 to 10', color: '#6366f1' },
  { label: '11 to 20', color: '#a5b4fc' },
  { label: '21 to 100', color: '#dde1fb' },
  { label: 'Not ranking', color: '#eef0f5' },
];

/** Thin stacked bar of keywords per position band. */
export function SpreadBar({ spread, height = 10, label }: { spread: number[]; height?: number; label?: string }) {
  const total = spread.reduce((a, b) => a + b, 0);
  return (
    <div role="img" aria-label={label ?? SPREAD_BANDS.map((b, i) => `${b.label}: ${spread[i] ?? 0}`).join(', ')}
      style={{ display: 'flex', height, borderRadius: 999, overflow: 'hidden', background: '#eef0f5', width: '100%' }}>
      {total > 0 && spread.map((n, i) => n > 0 && i < 4 && <span key={i} style={{ width: `${(n / total) * 100}%`, background: SPREAD_BANDS[i].color }} />)}
    </div>
  );
}

export function SpreadLegend({ withNone = true }: { withNone?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: RT.text }}>
      {SPREAD_BANDS.slice(0, withNone ? 5 : 4).map((b, i) => (
        <span key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: b.color, boxSizing: 'border-box', border: i === 4 ? '1px solid #cbd5e1' : 0 }} />
          {b.label}
        </span>
      ))}
    </div>
  );
}

const SITE_COLORS = ['#4f46e5', '#0f766e', '#b45309', '#7c3aed', '#be185d', '#0369a1'];
/** Letter tile for a website, its colour fixed by the domain. */
export function SiteMark({ domain, size = 30 }: { domain: string; size?: number }) {
  let h = 0;
  for (const ch of domain) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flex: 'none', borderRadius: 8, background: SITE_COLORS[h % SITE_COLORS.length], color: '#fff',
      fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {(domain.replace(/^www\./, '').charAt(0) || '?').toUpperCase()}
    </span>
  );
}
