'use client';
/**
 * Every tracked keyword with its Google position, on the all-websites page,
 * so ranks show without opening a website. Loads each website's keywords
 * (the same data as the website page) and merges them, best rank first.
 * Click a keyword for its rank history.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { KeywordDto, WebsiteDetail, WebsiteSummary } from '@/lib/rank-tracking/types';
import { RT, rtFetch, RankBadge, Change, RankSpark, fmtDay, cardStyle } from './RankUi';
import WebsiteKeywordPanel, { urlPath } from './WebsiteKeywordPanel';
import { srOnly } from './SummaryWebsitesTable';

type Chip = 'all' | 'top10' | 'up' | 'down' | 'none';
type Row = KeywordDto & { websiteId: string; domain: string };

const MAX_SITES = 25;
const COLS = 'minmax(200px, 2fr) minmax(140px, 1fr) 120px 70px 80px 60px 130px minmax(140px, 1fr) 90px 44px';
const iconBtn: React.CSSProperties = { width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

const chipStyle = (on: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? RT.indigo : '#cbd5e1'}`, background: on ? RT.indigoSoft : '#fff', color: on ? '#3730a3' : RT.text,
});

export default function SummaryKeywordsTable({ websites, reloadKey }: { websites: WebsiteSummary[]; reloadKey: unknown }) {
  const [kws, setKws] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [chip, setChip] = useState<Chip>('all');
  const [open, setOpen] = useState<string | null>(null);

  const ids = websites.slice(0, MAX_SITES).map((w) => w.id).join(',');
  const load = useCallback(async () => {
    try {
      const sites = await Promise.all(ids.split(',').filter(Boolean).map((id) =>
        rtFetch<WebsiteDetail>(`/api/rank-tracking/websites/${encodeURIComponent(id)}?period=last`)));
      setKws(sites.flatMap((d) => d.keywords.map((k) => ({ ...k, websiteId: d.website.id, domain: d.website.domain }))));
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to load keywords');
    }
  }, [ids]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const anyPending = !!kws?.some((k) => k.pending);
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (kws ?? [])
      .filter((k) => !q || `${k.keyword} ${k.domain} ${k.city}`.toLowerCase().includes(q))
      .filter((k) => chip === 'all'
        || (chip === 'top10' && k.rank != null && k.rank <= 10)
        || (chip === 'up' && k.hasPrev && k.change > 0)
        || (chip === 'down' && k.hasPrev && k.change < 0)
        || (chip === 'none' && k.checkedAt && k.rank == null))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.keyword.localeCompare(b.keyword));
  }, [kws, filter, chip]);

  const many = websites.length > 1;

  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 24px', borderBottom: `1px solid ${RT.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Keywords</h2>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            <span style={srOnly}>Filter keywords</span>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to filter keywords"
              style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', minHeight: 44, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, width: 220, maxWidth: '100%', color: RT.ink }} />
          </label>
          <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {([['all', `All ${kws?.length ?? ''}`.trim()], ['top10', 'Top 10'], ['up', 'Moved up'], ['down', 'Moved down'], ['none', 'Not ranking']] as [Chip, string][]).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={chip === v} onClick={() => setChip(v)} style={chipStyle(chip === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 13, color: RT.muted }}>Click any keyword to see its rank history</div>
      </div>

      {error ? (
        <div role="alert" style={{ padding: '20px 24px', fontSize: 14, color: RT.down }}>{error}</div>
      ) : !kws ? (
        <div aria-busy="true" style={{ padding: '28px 24px', fontSize: 14, color: RT.muted }}>Loading keywords…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1040 }} aria-label="All keywords">
            <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '10px 24px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: RT.muted, borderBottom: `1px solid ${RT.lineSoft}` }}>
              <span>Keyword</span>
              <span>{many ? 'Website' : 'Tracked from'}</span>
              <span>{many ? 'City' : 'Device'}</span>
              <span>Rank</span>
              <span>Change</span>
              <span>Best</span>
              <span>Trend</span>
              <span>Ranking page</span>
              <span>Checked</span>
              <span><span style={srOnly}>History</span></span>
            </div>

            {rows.length === 0 && (
              <p style={{ margin: 0, padding: '28px 24px', fontSize: 14, color: RT.muted }}>
                {kws.length ? 'No keywords match these filters.' : 'No keywords yet.'}
              </p>
            )}

            {rows.map((k) => {
              const isOpen = open === k.id;
              const checking = k.pending && !k.checkedAt;
              return (
                <div key={k.id} style={{ borderBottom: `1px solid ${RT.lineSoft}`, background: isOpen ? '#f8faff' : '#fff' }}>
                  <div onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a')) setOpen(isOpen ? null : k.id); }}
                    style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '4px 24px', fontSize: 14, cursor: 'pointer' }}>
                    <span style={{ minWidth: 0 }}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.id)}
                        style={{ font: 'inherit', fontSize: 14, fontWeight: 500, textAlign: 'left', border: 0, background: 'transparent', padding: '10px 12px 10px 0', cursor: 'pointer', color: RT.ink, width: '100%' }}>
                        {k.keyword}
                        {checking && <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: RT.muted, marginTop: 2 }}>Checking…</span>}
                        {k.error && <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: RT.down, marginTop: 2 }}>{k.error}</span>}
                      </button>
                    </span>
                    {many ? (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                        <Link href={`/dashboard/rank-tracking/${encodeURIComponent(k.websiteId)}`} style={{ color: RT.indigo, fontWeight: 500, textDecoration: 'none' }}>{k.domain}</Link>
                      </span>
                    ) : (
                      <span style={{ color: RT.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{k.city}</span>
                    )}
                    <span style={{ color: RT.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {many ? k.city : k.device === 'mobile' ? 'Mobile' : 'Desktop'}
                    </span>
                    <span>{k.checkedAt ? <RankBadge rank={k.rank} depth={k.depth} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                    <span>{k.hasPrev ? <Change v={k.change} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                    <span style={{ color: RT.text }}>{k.best ?? '-'}</span>
                    <span><RankSpark ranks={k.spark} depth={k.depth} label={`8-check trend for ${k.keyword}`} /></span>
                    <span style={{ color: RT.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }} title={k.url ?? undefined}>{urlPath(k.url)}</span>
                    <span style={{ color: RT.muted }}>{checking ? 'Checking…' : fmtDay(k.checkedAt)}</span>
                    <span>
                      <button type="button" aria-label={`${isOpen ? 'Hide' : 'Show'} history for ${k.keyword}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.id)} style={{ ...iconBtn, color: RT.muted }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d={isOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                        </svg>
                      </button>
                    </span>
                  </div>
                  {isOpen && <WebsiteKeywordPanel kw={k} websiteId={k.websiteId} />}
                </div>
              );
            })}
          </div>
          {websites.length > MAX_SITES && (
            <p style={{ margin: 0, padding: '14px 24px', fontSize: 13, color: RT.muted }}>
              Showing keywords from the first {MAX_SITES} websites. Open a website above to see the rest.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
