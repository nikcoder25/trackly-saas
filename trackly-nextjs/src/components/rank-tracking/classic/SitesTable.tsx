'use client';
/**
 * Sites table (classic rank tracker): Site | Change | High | Low | Keywords |
 * Movement | actions. Click a row to open its keyword table inline.
 */
import React from 'react';
import type { RankSiteRow } from '@/lib/rank-tracking/types';
import { SiteMark } from '@/components/rank-tracking/RankUi';
import { ChangeText, MovementBar, Chevron, iconBtn } from './bits';
import KeywordTable from './KeywordTable';
import { C } from './theme';

const COLS = 'minmax(240px, 2.4fr) 90px 70px 70px 90px 130px 150px';

export default function SitesTable({ sites, openId, busyId, reloadKey, onToggle, onAdd, onShare, onDelete, onChanged }: {
  sites: RankSiteRow[];
  openId: string | null;
  busyId: string | null;
  reloadKey: number;
  onToggle: (id: string) => void;
  onAdd: (s: RankSiteRow) => void;
  onShare: (s: RankSiteRow) => void;
  onDelete: (s: RankSiteRow) => void;
  onChanged: () => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 900 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 18px', height: 40, fontSize: 11, fontWeight: 600, color: C.muted,
          textTransform: 'uppercase', letterSpacing: 0.4, background: C.bg, borderBottom: `1px solid ${C.line}` }}>
          <span>Site</span><span>Change</span><span>High</span><span>Low</span><span>Keywords</span><span>Movement</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {sites.map((s) => {
          const open = openId === s.id;
          return (
            <div key={s.id} style={{ borderBottom: `1px solid ${C.line}`, borderLeft: `3px solid ${open ? C.indigo : 'transparent'}`, background: open ? '#fcfcff' : '#fff' }}>
              <div className="rtc-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a')) onToggle(s.id); }}
                style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 15px', minHeight: 60, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <SiteMark domain={s.domain} size={32} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                    <span style={{ fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.domain}</span>
                    <span style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.location || 'No location'} · {s.device === 'mobile' ? 'Mobile' : 'Desktop'}
                    </span>
                  </span>
                </span>
                <span><ChangeText v={s.change} /></span>
                <span style={{ fontWeight: 600 }}>{s.high ?? '–'}</span>
                <span style={{ color: C.text }}>{s.low ?? '–'}</span>
                <span>{s.keywords.toLocaleString('en-US')}</span>
                <span><MovementBar improved={s.improved} dropped={s.dropped} unchanged={s.unchanged} /></span>
                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <button type="button" onClick={() => onAdd(s)} aria-label={`Add keywords to ${s.domain}`} title="Add keywords" style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                  <button type="button" onClick={() => onShare(s)} disabled={busyId === s.id} aria-label={`Copy share link for ${s.domain}`} title="Copy share link" style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  </button>
                  <button type="button" onClick={() => onDelete(s)} disabled={busyId === s.id} aria-label={`Delete ${s.domain}`} title="Stop tracking" style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                  </button>
                  <button type="button" onClick={() => onToggle(s.id)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} keywords for ${s.domain}`} style={{ ...iconBtn, color: open ? C.indigo : C.muted }}>
                    <Chevron open={open} />
                  </button>
                </span>
              </div>
              {open && <KeywordTable websiteId={s.id} domain={s.domain} reloadKey={reloadKey} onChanged={onChanged} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
