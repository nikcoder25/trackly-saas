'use client';
/**
 * A website's keywords, opened inline under its row in the Websites table
 * (screen 1). Filter chips, a text filter and one row per keyword; click a
 * keyword for its position history.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ComparePeriod, WebsiteDetail } from '@/lib/rank-tracking/types';
import { RT, rtFetch, RankBadge, Change, RankSpark, AiStatusText, fmtDay, srOnly } from './RankUi';
import WebsiteKeywordPanel, { urlPath } from './WebsiteKeywordPanel';

type Chip = 'all' | 'top3' | 'top10' | 'moved' | 'none';

const COLS = 'minmax(200px, 2.2fr) 70px 80px 60px 120px 80px minmax(150px, 1.4fr) 120px 90px 44px';
const chipStyle = (on: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, padding: '6px 12px', minHeight: 36, borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? RT.indigo : RT.line}`, background: on ? RT.indigoSoft : '#fff', color: on ? RT.indigoDark : RT.text,
});

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function SiteKeywords({ websiteId, groupId, period }: { websiteId: string; groupId?: string | null; period: ComparePeriod }) {
  const [data, setData] = useState<WebsiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<Chip>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await rtFetch<WebsiteDetail>(`/api/rank-tracking/websites/${encodeURIComponent(websiteId)}?period=${period}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to load keywords');
    }
  }, [websiteId, period]);

  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => (data?.keywords ?? []).filter((k) => !groupId || k.groupId === groupId), [data, groupId]);
  const anyPending = all.some((k) => k.pending);
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const test: Record<Chip, (k: (typeof all)[number]) => boolean> = {
    all: () => true,
    top3: (k) => k.rank != null && k.rank <= 3,
    top10: (k) => k.rank != null && k.rank <= 10,
    moved: (k) => k.hasPrev && k.change !== 0,
    none: (k) => !!k.checkedAt && k.rank == null,
  };
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter(test[chip])
    .filter((k) => !needle || k.keyword.includes(needle))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.keyword.localeCompare(b.keyword));

  const chips: [Chip, string][] = [['all', 'All'], ['top3', 'Top 3'], ['top10', 'Top 10'], ['moved', 'Moved'], ['none', 'Not ranking']];
  const editHref = `/dashboard/rank-tracking/${encodeURIComponent(websiteId)}${groupId ? `?group=${encodeURIComponent(groupId)}` : ''}`;

  return (
    <div style={{ padding: '4px 24px 20px 64px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="Show keywords" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={chip === v} onClick={() => setChip(v)} style={chipStyle(chip === v)}>
              {l} <span style={{ opacity: 0.75 }}>{data ? all.filter(test[v]).length : ''}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${RT.line}`, borderRadius: 8, padding: '0 10px', height: 36, background: '#fff' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={RT.muted} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></svg>
            <span style={srOnly}>Filter keywords</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords"
              style={{ font: 'inherit', fontSize: 13, border: 0, outline: 'none', width: 160, height: 34, color: RT.ink, background: 'transparent' }} />
          </label>
          <Link href={editHref} style={{ font: 'inherit', fontSize: 13, height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${RT.line}`, background: '#fff', color: RT.ink, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Edit keywords
          </Link>
        </div>
      </div>

      <div style={{ border: `1px solid ${RT.line}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '9px 14px', fontSize: 11, fontWeight: 600, color: RT.muted, textTransform: 'uppercase', letterSpacing: 0.4, background: RT.bg, borderBottom: `1px solid ${RT.line}` }}>
          <span>Keyword</span><span>Rank</span><span>Change</span><span>Best</span><span>Trend</span><span>Volume</span><span>Ranking URL</span><span>AI answers</span><span>Checked</span>
          <span><span style={srOnly}>History</span></span>
        </div>

        {error ? (
          <div role="alert" style={{ padding: '20px 14px', fontSize: 13, color: RT.down }}>{error}</div>
        ) : !data ? (
          <div aria-busy="true" style={{ padding: '24px 14px', fontSize: 13, color: RT.muted }}>Loading keywords…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: RT.muted, fontSize: 13 }}>{all.length ? 'No keywords match this filter.' : 'No keywords yet.'}</div>
        ) : rows.map((k) => {
          const isOpen = open === k.id;
          const checking = k.pending && !k.checkedAt;
          const toggle = () => setOpen(isOpen ? null : k.id);
          return (
            <div key={k.id} style={{ borderBottom: `1px solid ${RT.lineSoft}` }}>
              <div className="rt-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a')) toggle(); }}
                style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '4px 14px', fontSize: 13, cursor: 'pointer', background: isOpen ? '#f8faff' : undefined }}>
                <button type="button" aria-expanded={isOpen} onClick={toggle}
                  style={{ font: 'inherit', border: 0, background: 'transparent', padding: '8px 8px 8px 0', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: RT.ink, fontSize: 13 }}>{k.keyword}</span>
                  <span style={{ fontSize: 11, color: k.error ? RT.down : RT.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                    {k.error ? k.error : checking ? 'Checking…' : <><PinIcon />{k.city || k.locationName} · {k.device === 'mobile' ? 'Mobile' : 'Desktop'}</>}
                  </span>
                </button>
                <span>{k.checkedAt ? <RankBadge rank={k.rank} depth={k.depth} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                <span>{k.hasPrev ? <Change v={k.change} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                <span style={{ color: RT.text }}>{k.best ?? '-'}</span>
                <span><RankSpark ranks={k.spark} depth={k.depth} width={96} label={`8-check trend for ${k.keyword}`} /></span>
                <span style={{ color: RT.text }}>{k.volume == null ? '-' : k.volume.toLocaleString('en-US')}</span>
                <span title={k.url ?? undefined} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: k.url ? '#4338ca' : RT.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {k.url ? urlPath(k.url) : k.checkedAt ? `Not in top ${k.depth}` : '-'}
                </span>
                <span style={{ fontSize: 12 }}><AiStatusText status={k.ai} /></span>
                <span style={{ color: RT.muted, fontSize: 12 }}>{checking ? 'Checking…' : fmtDay(k.checkedAt)}</span>
                <span>
                  <button type="button" aria-label={`${isOpen ? 'Hide' : 'Show'} history for ${k.keyword}`} aria-expanded={isOpen} onClick={toggle}
                    style={{ width: 36, height: 36, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RT.muted }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={isOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                    </svg>
                  </button>
                </span>
              </div>
              {isOpen && <WebsiteKeywordPanel kw={k} websiteId={websiteId} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
