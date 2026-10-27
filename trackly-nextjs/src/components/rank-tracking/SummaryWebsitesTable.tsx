'use client';
/**
 * The Websites table on the rank tracking home page (screen 1): one row per
 * website or per keyword group, with avg position, top 10, change, AI share
 * of voice, an 8-week trend and row actions.
 */
import React from 'react';
import Link from 'next/link';
import type { GroupSummary, WebsiteSummary } from '@/lib/rank-tracking/types';
import { RT, Change, RankSpark } from '@/components/rank-tracking/RankUi';

const th: React.CSSProperties = { padding: '12px 12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '16px 12px' };
const iconBtn: React.CSSProperties = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8,
  background: 'transparent', color: RT.muted, cursor: 'pointer', padding: 0,
};

export interface SummaryRow {
  key: string;
  websiteId: string;
  domain: string;
  /** Group name when the table is in "By group" view. */
  group: string | null;
  city: string;
  keywords: number;
  avg: number | null;
  top10: number;
  change: number;
  sov: number | null;
  trend: (number | null)[];
}

export const siteRow = (w: WebsiteSummary): SummaryRow => ({
  key: w.id, websiteId: w.id, domain: w.domain, group: null, city: w.city, keywords: w.keywords,
  avg: w.avg, top10: w.top10, change: w.change, sov: w.sov, trend: w.trend,
});

export const groupRow = (g: GroupSummary): SummaryRow => ({
  key: `g-${g.id}`, websiteId: g.websiteId, domain: g.domain, group: g.name, city: g.city, keywords: g.keywords,
  avg: g.avg, top10: g.top10, change: g.change, sov: null, trend: g.trend,
});

function trendLabel(t: (number | null)[]): string {
  const first = t.find((x) => x != null);
  const last = [...t].reverse().find((x) => x != null);
  if (first == null || last == null) return 'No trend data yet';
  return `Average position moved from ${first.toFixed(1)} to ${last.toFixed(1)} over 8 weeks`;
}

export default function SummaryWebsitesTable({ rows, byGroup, busyId, onShare, onDelete }: {
  rows: SummaryRow[];
  byGroup: boolean;
  busyId: string | null;
  onShare: (r: SummaryRow) => void;
  onDelete: (r: SummaryRow) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: RT.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <th scope="col" style={{ ...th, padding: '12px 24px' }}>{byGroup ? 'Group' : 'Website'}</th>
            <th scope="col" style={th}>Tracked from</th>
            <th scope="col" style={th}>Keywords</th>
            <th scope="col" style={th}>Avg. position</th>
            <th scope="col" style={th}>Top 10</th>
            <th scope="col" style={th}>Change</th>
            <th scope="col" style={th}>AI share of voice</th>
            <th scope="col" style={th}>8-week trend</th>
            <th scope="col" style={{ ...th, padding: '12px 24px' }}><span className="sr-only" style={srOnly}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = `/dashboard/rank-tracking/${encodeURIComponent(r.websiteId)}${r.group ? `?group=${encodeURIComponent(r.key.slice(2))}` : ''}`;
            const sov = r.sov == null ? null : Math.max(0, Math.min(100, r.sov));
            return (
              <tr key={r.key} style={{ borderTop: `1px solid ${RT.lineSoft}` }}>
                <td style={{ ...td, padding: '16px 24px' }}>
                  <Link href={href} style={{ fontWeight: 600, textDecoration: 'none', color: '#4338ca' }}>{r.group ?? r.domain}</Link>
                  {r.group && <div style={{ fontSize: 12, color: RT.muted, marginTop: 2 }}>{r.domain}</div>}
                </td>
                <td style={{ ...td, color: RT.text }}>{r.city || '-'}</td>
                <td style={td}>{r.keywords.toLocaleString('en-US')}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.avg == null ? '-' : r.avg.toFixed(1)}</td>
                <td style={td}>{r.top10.toLocaleString('en-US')}</td>
                <td style={td}><Change v={Math.round(r.change * 10) / 10} decimals /></td>
                <td style={td}>
                  {sov == null ? <span style={{ color: RT.muted }}>-</span> : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 80, height: 6, background: RT.line, borderRadius: 999, overflow: 'hidden' }} aria-hidden="true">
                        <div style={{ height: 6, background: RT.indigo, width: `${sov}%` }} />
                      </div>
                      <span style={{ fontWeight: 500 }}>{Math.round(sov)}%</span>
                    </div>
                  )}
                </td>
                <td style={td}><RankSpark ranks={r.trend} width={110} height={30} label={trendLabel(r.trend)} /></td>
                <td style={{ padding: '8px 24px 8px 0' }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <Link href={`/dashboard/rank-tracking/add?website=${encodeURIComponent(r.domain)}`} aria-label={`Add keywords to ${r.domain}`} style={{ ...iconBtn, color: RT.muted }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </Link>
                    {!r.group && (
                      <>
                        <button type="button" aria-label={`Copy share link for ${r.domain}`} disabled={busyId === r.websiteId} onClick={() => onShare(r)} style={iconBtn}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                        </button>
                        <button type="button" aria-label={`Delete ${r.domain}`} disabled={busyId === r.websiteId} onClick={() => onDelete(r)} style={iconBtn}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
