'use client';
/**
 * The Websites table on the rank tracking home page (screen 1): one row per
 * website or per keyword group, with avg position, top 3, top 10, change,
 * the position spread and row actions. Open a row to see its keywords inline.
 */
import React from 'react';
import Link from 'next/link';
import type { ComparePeriod, GroupSummary, WebsiteSummary } from '@/lib/rank-tracking/types';
import { RT, Change, SpreadBar, SiteMark, srOnly } from '@/components/rank-tracking/RankUi';
import SiteKeywords from '@/components/rank-tracking/SiteKeywords';

const COLS = '44px minmax(220px, 2fr) 90px 90px 70px 70px 90px minmax(180px, 1.6fr) 140px';
const iconBtn: React.CSSProperties = {
  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 8,
  background: 'transparent', color: RT.muted, cursor: 'pointer', padding: 0,
};

export interface SummaryRow {
  key: string;
  websiteId: string;
  /** Set when the table is in "By group" view. */
  groupId: string | null;
  domain: string;
  group: string | null;
  city: string;
  keywords: number;
  avg: number | null;
  top3: number;
  top10: number;
  change: number;
  spread: number[];
}

export const siteRow = (w: WebsiteSummary): SummaryRow => ({
  key: w.id, websiteId: w.id, groupId: null, domain: w.domain, group: null, city: w.city, keywords: w.keywords,
  avg: w.avg, top3: w.top3, top10: w.top10, change: w.change, spread: w.spread,
});

export const groupRow = (g: GroupSummary): SummaryRow => ({
  key: `g-${g.id}`, websiteId: g.websiteId, groupId: g.id, domain: g.domain, group: g.name, city: g.city, keywords: g.keywords,
  avg: g.avg, top3: g.top3, top10: g.top10, change: g.change, spread: g.spread,
});

export default function SummaryWebsitesTable({ rows, byGroup, busyId, openKey, period, onToggle, onShare, onDelete }: {
  rows: SummaryRow[];
  byGroup: boolean;
  busyId: string | null;
  openKey: string | null;
  period: ComparePeriod;
  onToggle: (key: string) => void;
  onShare: (r: SummaryRow) => void;
  onDelete: (r: SummaryRow) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 1040 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '10px 18px', fontSize: 12, fontWeight: 600, color: RT.muted,
          textTransform: 'uppercase', letterSpacing: 0.4, background: RT.bg, borderBottom: `1px solid ${RT.line}` }}>
          <span /><span>{byGroup ? 'Group' : 'Site'}</span><span>Keywords</span><span>Avg pos</span><span>Top 3</span><span>Top 10</span><span>Change</span>
          <span>Position spread</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {rows.map((r) => {
          const open = openKey === r.key;
          const name = r.group ?? r.domain;
          return (
            <div key={r.key} style={{ borderBottom: `1px solid ${RT.line}`, background: open ? '#fcfcff' : '#fff', boxShadow: open ? `inset 3px 0 0 ${RT.indigo}` : undefined }}>
              <div className="rt-row" style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '12px 18px', fontSize: 14 }}>
                <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} keywords for ${name}`} onClick={() => onToggle(r.key)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${RT.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={RT.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                <button type="button" onClick={() => onToggle(r.key)} aria-expanded={open}
                  style={{ font: 'inherit', border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <SiteMark domain={r.domain} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: RT.ink, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ fontSize: 12, color: RT.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.group ? `${r.domain}${r.city ? ` · ${r.city}` : ''}` : r.city || '-'}
                    </span>
                  </span>
                </button>
                <span>{r.keywords.toLocaleString('en-US')}</span>
                <span style={{ fontWeight: 600 }}>{r.avg == null ? '-' : r.avg.toFixed(1)}</span>
                <span>{r.top3.toLocaleString('en-US')}</span>
                <span>{r.top10.toLocaleString('en-US')}</span>
                <span><Change v={Math.round(r.change * 10) / 10} decimals /></span>
                <span style={{ paddingRight: 24 }}><SpreadBar spread={r.spread} label={`Position spread for ${name}`} /></span>
                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <Link href={`/dashboard/rank-tracking/add?website=${encodeURIComponent(r.domain)}`} aria-label={`Add keywords to ${r.domain}`} title="Add keywords" style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  </Link>
                  {!r.group && (
                    <>
                      <button type="button" aria-label={`Copy share link for ${r.domain}`} title="Copy client share link" disabled={busyId === r.websiteId} onClick={() => onShare(r)} style={iconBtn}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                      </button>
                      <button type="button" aria-label={`Delete ${r.domain}`} title="Stop tracking" disabled={busyId === r.websiteId} onClick={() => onDelete(r)} style={iconBtn}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                      </button>
                    </>
                  )}
                </span>
              </div>
              {open && <SiteKeywords websiteId={r.websiteId} groupId={r.groupId} period={period} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { srOnly };
