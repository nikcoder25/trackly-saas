'use client';
/** A keyword row opened inline: position history chart with a range toggle, four stat tiles and two actions. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { RankHistoryRange, RankHistoryRow, RankSiteKeyword } from '@/lib/rank-tracking/types';
import { rtFetch, Toggle } from '@/components/rank-tracking/RankUi';
import PositionChart from './PositionChart';
import { C } from './theme';

const RANGES: { value: RankHistoryRange; label: string; long: string }[] = [
  { value: '30d', label: '30d', long: 'the last 30 days' },
  { value: '90d', label: '90d', long: 'the last 90 days' },
  { value: '1y', label: '1y', long: 'the last year' },
  { value: 'all', label: 'All', long: 'all time' },
];

const btn: React.CSSProperties = {
  font: 'inherit', fontSize: 13, fontWeight: 500, padding: '0 14px', height: 38, borderRadius: 8, border: `1px solid #cbd5e1`,
  background: '#fff', color: C.ink, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
};

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
    </div>
  );
}

const show = (r: number | null | undefined) => (r == null ? <span style={{ color: C.grey }}>Not ranking</span> : r);

export default function KeywordDetail({ kw, websiteId }: { kw: RankSiteKeyword; websiteId: string }) {
  const [range, setRange] = useState<RankHistoryRange>('30d');
  const [rows, setRows] = useState<RankHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    rtFetch<{ history: RankHistoryRow[] }>(`/api/rank/keywords/${encodeURIComponent(kw.id)}/history?range=${range}`)
      .then((h) => { if (live) setRows(h.history); })
      .catch((e) => { if (live) setError((e as Error).message || 'Could not load the history.'); });
    return () => { live = false; };
  }, [kw.id, range, kw.checkedAt]);

  const long = RANGES.find((r) => r.value === range)!.long;
  const ranked = (rows ?? []).map((p) => p.position).filter((r): r is number => r != null);
  const first = rows?.[0];
  const google = `https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}`;

  return (
    <div style={{ background: C.bg, borderTop: `1px solid ${C.lineSoft}`, padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Position history</span>
          <span style={{ fontSize: 12, color: C.muted }}>{kw.keyword} · {kw.location} · {kw.device === 'mobile' ? 'Mobile' : 'Desktop'}</span>
        </div>
        <Toggle<RankHistoryRange> small label="Time range" value={range} onChange={setRange} options={RANGES} />
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 12px 4px' }}>
        {error ? (
          <div role="alert" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.downText, fontSize: 14 }}>{error}</div>
        ) : !rows ? (
          <div aria-busy="true" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>Loading history…</div>
        ) : rows.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14, textAlign: 'center' }}>No checks in {long} yet.</div>
        ) : (
          <PositionChart points={rows} label={`Position history for ${kw.keyword} over ${long}: ${rows.length} checks. Rank 1 is at the top.`} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Tile label="Current" value={show(kw.current)} />
        <Tile label="Started at" value={rows ? (first ? show(first.position) : '–') : '…'} sub={first ? new Date(first.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined} />
        <Tile label="Best in range" value={rows ? (ranked.length ? Math.min(...ranked) : rows.length ? show(null) : '–') : '…'} />
        <Tile label="Worst in range" value={rows ? (!rows.length ? '–' : rows.some((p) => p.position == null) ? show(null) : Math.max(...ranked)) : '…'} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={google} target="_blank" rel="noreferrer" style={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></svg>
          See Google results
        </a>
        <Link href={`/dashboard/rank-tracking/alerts?website=${encodeURIComponent(websiteId)}`} style={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
          Add alert
        </Link>
      </div>
    </div>
  );
}
