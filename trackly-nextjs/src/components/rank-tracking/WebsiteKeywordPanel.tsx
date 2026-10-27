'use client';
/** Expanded keyword row on the website page: rank history chart plus a facts panel. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { KeywordDto, KeywordHistory } from '@/lib/rank-tracking/types';
import { RT, rtFetch, AiStatusText } from '@/components/rank-tracking/RankUi';
import WebsiteHistoryChart from '@/components/rank-tracking/WebsiteHistoryChart';

type Range = '30' | '90' | '365' | 'all';
const RANGES: { value: Range; label: string; long: string }[] = [
  { value: '30', label: '30d', long: 'the last 30 days' },
  { value: '90', label: '90d', long: 'the last 90 days' },
  { value: '365', label: '1y', long: 'the last year' },
  { value: 'all', label: 'All', long: 'all time' },
];

export function urlPath(url: string | null): string {
  if (!url) return '-';
  try { const u = new URL(url); return u.pathname + u.search || '/'; } catch { return url; }
}

const smallBtn: React.CSSProperties = {
  font: 'inherit', fontSize: 13, padding: '8px 12px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, border: '1px solid #cbd5e1',
  background: '#fff', color: RT.ink, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
};

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${RT.line}` }}>
      <span style={{ color: RT.muted }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  );
}

export default function WebsiteKeywordPanel({ kw, websiteId }: { kw: KeywordDto; websiteId: string }) {
  const [range, setRange] = useState<Range>('90');
  const [hist, setHist] = useState<KeywordHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHist(null);
    setError(null);
    rtFetch<KeywordHistory>(`/api/rank-tracking/keywords/${encodeURIComponent(kw.id)}/history?range=${range}`)
      .then((h) => { if (live) setHist(h); })
      .catch((e) => { if (live) setError((e as Error).message || 'Could not load the history.'); });
    return () => { live = false; };
  }, [kw.id, range, kw.checkedAt]);

  const depth = hist?.depth ?? kw.depth;
  const out = `${depth}+`;
  const rangeLong = RANGES.find((r) => r.value === range)!.long;

  return (
    <div style={{ padding: '8px 24px 24px 100px', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
      <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Rank history · {kw.keyword}</div>
          <div role="group" aria-label="Time range" style={{ display: 'flex', background: RT.lineSoft, borderRadius: 10, padding: 4, gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}
                style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', minHeight: 40, border: 0, borderRadius: 8, cursor: 'pointer',
                  background: range === r.value ? RT.indigoDark : 'transparent', color: range === r.value ? '#fff' : RT.text }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <div role="alert" style={{ height: 250, border: `1px solid ${RT.line}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RT.down, fontSize: 14, padding: 16, boxSizing: 'border-box' }}>{error}</div>
        ) : !hist ? (
          <div aria-busy="true" style={{ height: 250, border: `1px solid ${RT.line}`, borderRadius: 12, background: RT.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RT.muted, fontSize: 14 }}>Loading history…</div>
        ) : hist.points.length === 0 ? (
          <div style={{ height: 250, border: `1px solid ${RT.line}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RT.muted, fontSize: 14, padding: 16, boxSizing: 'border-box', textAlign: 'center' }}>
            No checks in {rangeLong} yet.
          </div>
        ) : (
          <WebsiteHistoryChart points={hist.points} depth={depth}
            label={`Rank history for ${kw.keyword} over ${rangeLong}, ${hist.points.length} checks. Position 1 is at the top.`} />
        )}
      </div>
      <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', background: RT.bg, border: `1px solid ${RT.line}`, borderRadius: 12, padding: '6px 16px', fontSize: 14 }}>
        <Fact k="Current"><span style={{ fontWeight: 700 }}>{kw.rank ?? (kw.checkedAt ? out : '-')}</span></Fact>
        <Fact k="Best in range">{hist ? (hist.best ?? (hist.points.length ? out : '-')) : '…'}</Fact>
        <Fact k="Worst in range">{hist ? (hist.points.length ? (hist.points.some((p) => p.rank == null) ? out : hist.worst ?? out) : '-') : '…'}</Fact>
        <Fact k="Ranking page">{kw.url ? <a href={kw.url} target="_blank" rel="noreferrer" style={{ color: '#4338ca' }}>{urlPath(kw.url)}</a> : '-'}</Fact>
        <Fact k="Tracked from">{kw.city || kw.locationName || '-'}</Fact>
        <Fact k="AI answers"><AiStatusText status={kw.ai} /></Fact>
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', flexWrap: 'wrap' }}>
          <a href={`https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}`} target="_blank" rel="noreferrer" style={smallBtn}>See Google results</a>
          <Link href={`/dashboard/rank-tracking/alerts?website=${encodeURIComponent(websiteId)}`} style={smallBtn}>Add alert</Link>
        </div>
      </div>
    </div>
  );
}
