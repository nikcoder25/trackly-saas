'use client';
/** Website keywords (screen 2): stats, the keyword table with filters, bulk actions and rank history. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { KeywordDto, WebsiteDetail } from '@/lib/rank-tracking/types';
import { RT, rtFetch, RankTabs, RankBadge, Change, RankSpark, AiStatusText, fmtDay, btnPrimary, btnSecondary, cardStyle } from '@/components/rank-tracking/RankUi';
import WebsiteKeywordPanel, { urlPath } from '@/components/rank-tracking/WebsiteKeywordPanel';
import WebsiteBulkBar from '@/components/rank-tracking/WebsiteBulkBar';

type Chip = 'all' | 'starred' | 'top10' | 'up' | 'down';
const COLS = '44px 44px minmax(220px, 2fr) 70px 80px 130px 80px 130px 150px 100px 44px';
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
const iconBtn: React.CSSProperties = { width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const joinAnd = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1].toLowerCase()}` : xs[0] ?? '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${RT.line}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: RT.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? RT.ink }}>{value}</div>
    </div>
  );
}

function StarIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
    </svg>
  );
}

export default function WebsiteKeywordsPage() {
  const params = useParams<{ websiteId: string }>();
  const websiteId = String(params?.websiteId ?? '');
  const [data, setData] = useState<WebsiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [chip, setChip] = useState<Chip>('all');
  const [group, setGroup] = useState<string>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string; bad?: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!websiteId) return;
    try {
      const d = await rtFetch<WebsiteDetail>(`/api/rank-tracking/websites/${encodeURIComponent(websiteId)}?period=last`);
      setData(d);
      setError(null);
      const ids = new Set(d.keywords.map((k) => k.id));
      setSel((s) => new Set([...s].filter((id) => ids.has(id))));
    } catch (e) {
      setError((e as Error).message || 'Failed to load the website');
    }
  }, [websiteId]);

  useEffect(() => { load(); }, [load]);

  // A link from the "By group" view lands with ?group=<id>.
  useEffect(() => {
    try { const g = new URLSearchParams(window.location.search).get('group'); if (g) setGroup(g); } catch { /* no query */ }
  }, []);

  const anyPending = !!data?.keywords.some((k) => k.pending);
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const kws = data?.keywords ?? [];
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return kws.filter((k) => {
      if (q && !k.keyword.toLowerCase().includes(q)) return false;
      if (group === '__none' ? k.groupId : group && k.groupId !== group) return false;
      if (chip === 'starred') return k.starred;
      if (chip === 'top10') return k.rank != null && k.rank <= 10;
      if (chip === 'up') return k.change > 0;
      if (chip === 'down') return k.change < 0;
      return true;
    });
  }, [kws, filter, chip, group]);

  const selected = kws.filter((k) => sel.has(k.id));
  const allVisibleSel = rows.length > 0 && rows.every((k) => sel.has(k.id));
  const someVisibleSel = rows.some((k) => sel.has(k.id));

  function toggleSel(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSel((s) => {
      const n = new Set(s);
      if (allVisibleSel) rows.forEach((k) => n.delete(k.id)); else rows.forEach((k) => n.add(k.id));
      return n;
    });
  }

  async function toggleStar(k: KeywordDto) {
    const starred = !k.starred;
    setData((d) => (d ? { ...d, keywords: d.keywords.map((x) => (x.id === k.id ? { ...x, starred } : x)) } : d));
    try {
      await rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids: [k.id], starred });
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not update the star.', bad: true });
    }
    load();
  }

  async function share() {
    setSharing(true);
    setNotice(null);
    try {
      const { url } = await rtFetch<{ url: string }>(`/api/rank-tracking/websites/${encodeURIComponent(websiteId)}/share`, 'POST');
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked: show the link */ }
      setNotice({ text: copied ? 'Share link copied:' : 'Share link:', url });
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not create the share link.', bad: true });
    } finally {
      setSharing(false);
    }
  }

  if (error && !data) {
    return (
      <div className="lvx" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
        <div className="page-body" style={{ paddingTop: 16 }}>
          <RankTabs />
          <Link href="/dashboard/rank-tracking" style={{ fontSize: 14, fontWeight: 500, textDecoration: 'none', color: '#4338ca', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>← All websites</Link>
          <div role="alert" style={{ ...cardStyle, padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" style={btnSecondary} onClick={load}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  const domain = data?.website.domain ?? '';
  const cities = uniq(kws.map((k) => k.city || k.locationName).filter(Boolean));
  const devices = uniq(kws.map((k) => k.device)).sort().map(cap);
  const freqs = uniq(kws.map((k) => k.frequency)).sort().reverse().map(cap);
  const depths = uniq(kws.map((k) => k.depth)).sort((a, b) => a - b);
  const maxDepth = depths.length ? depths[depths.length - 1] : 30;
  const chipStyle = (on: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, padding: '8px 14px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? RT.indigo : '#cbd5e1'}`, background: on ? RT.indigoSoft : '#fff', color: on ? '#3730a3' : RT.text,
  });
  const tag = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, padding: '6px 10px', borderRadius: 999, fontWeight: 500, fontSize: 13 });

  return (
    <div className="lvx" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <div className="page-body" style={{ paddingTop: 16, paddingBottom: 0, gap: 4 }}>
        <RankTabs />
        <Link href="/dashboard/rank-tracking" style={{ fontSize: 14, fontWeight: 500, textDecoration: 'none', color: '#4338ca', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifySelf: 'start' }}>← All websites</Link>
      </div>
      <PageHead
        title={domain || 'Loading…'}
        sub={data && kws.length > 0 ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {cities.map((c) => <span key={c} style={tag(RT.indigoSoft, '#3730a3')}>{c}</span>)}
            <span style={tag(RT.lineSoft, RT.text)}>Google · {joinAnd(devices)}</span>
            <span style={tag(RT.lineSoft, RT.text)}>{joinAnd(freqs)}</span>
            <span style={tag(RT.lineSoft, RT.text)}>Top {depths.join(' and ')}</span>
          </span>
        ) : undefined}
        actions={data ? (
          <>
            <button type="button" style={btnSecondary} onClick={share} disabled={sharing}>{sharing ? 'Creating link…' : 'Share link'}</button>
            <Link href={`/dashboard/rank-tracking/reports?website=${encodeURIComponent(websiteId)}`} style={btnSecondary}>Create report</Link>
            <Link href={`/dashboard/rank-tracking/add?website=${encodeURIComponent(domain)}`} style={btnPrimary}>+ Add keywords</Link>
          </>
        ) : undefined}
      />

      <div className="page-body" style={{ gap: 20 }}>
        {notice && (
          <div role="status" style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            background: notice.bad ? '#fef2f2' : RT.indigoSoft, color: notice.bad ? RT.down : '#3730a3' }}>
            <span>{notice.text}</span>
            {notice.url && <a href={notice.url} target="_blank" rel="noreferrer" style={{ color: '#3730a3', wordBreak: 'break-all', fontWeight: 600 }}>{notice.url}</a>}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" style={{ ...iconBtn, marginLeft: 'auto', color: 'inherit' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}

        {!data ? (
          <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 72, borderRadius: 12, background: RT.lineSoft }} />)}
            <span style={srOnly}>Loading keywords</span>
          </div>
        ) : kws.length === 0 ? (
          <section style={{ ...cardStyle, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>No keywords on {domain} yet</h2>
            <p style={{ margin: 0, fontSize: 14, color: RT.muted, maxWidth: 480 }}>Add the keywords this website should rank for. The first check starts right away.</p>
            <Link href={`/dashboard/rank-tracking/add?website=${encodeURIComponent(domain)}`} style={btnPrimary}>+ Add keywords</Link>
          </section>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <Tile label="Moved up" value={data.stats.up.toLocaleString('en-US')} color={RT.up} />
              <Tile label="Moved down" value={data.stats.down.toLocaleString('en-US')} color={RT.down} />
              <Tile label="In top 10" value={data.stats.top10.toLocaleString('en-US')} />
              <Tile label={`Ranking in top ${maxDepth}`} value={`${data.stats.ranking.toLocaleString('en-US')} / ${data.stats.total.toLocaleString('en-US')}`} />
              <Tile label="Next check" value={fmtDay(data.stats.nextCheck, true)} />
            </div>

            <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${RT.line}` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={srOnly}>Filter keywords</span>
                    <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to filter keywords"
                      style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', minHeight: 44, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, width: 220, maxWidth: '100%', color: RT.ink }} />
                  </label>
                  <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {([['all', `All ${kws.length}`], ['starred', 'Starred'], ['top10', 'Top 10'], ['up', 'Moved up'], ['down', 'Moved down']] as [Chip, string][]).map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={chip === v} onClick={() => setChip(v)} style={chipStyle(chip === v)}>{l}</button>
                    ))}
                  </div>
                  {data.groups.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: RT.text }}>Group
                      <select value={group} onChange={(e) => setGroup(e.target.value)}
                        style={{ font: 'inherit', fontSize: 13, padding: '8px 10px', minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', color: RT.ink }}>
                        <option value="">All groups</option>
                        {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.count})</option>)}
                        <option value="__none">No group</option>
                      </select>
                    </label>
                  )}
                </div>
                {selected.length > 0 ? (
                  <WebsiteBulkBar selected={selected} groups={data.groups} domain={domain}
                    onDone={(msg, clear) => { setNotice({ text: msg }); if (clear) setSel(new Set()); load(); }}
                    onError={(msg) => setNotice({ text: msg, bad: true })} />
                ) : (
                  <div style={{ fontSize: 13, color: RT.muted }}>Click any keyword to see its rank history</div>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 1060 }} aria-label={`Keywords for ${domain}`}>
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '10px 12px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: RT.muted, borderBottom: `1px solid ${RT.lineSoft}` }}>
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      <input type="checkbox" aria-label="Select all shown keywords" checked={allVisibleSel}
                        ref={(el) => { if (el) el.indeterminate = !allVisibleSel && someVisibleSel; }}
                        onChange={toggleAll} style={{ width: 18, height: 18, accentColor: RT.indigo }} />
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'center' }}><span style={srOnly}>Starred</span><span aria-hidden="true"><StarIcon on={false} /></span></span>
                    <span>Keyword</span>
                    <span>Rank</span>
                    <span>Change</span>
                    <span>Trend</span>
                    <span>Volume</span>
                    <span>In AI answers</span>
                    <span>Ranking page</span>
                    <span>Checked</span>
                    <span><span style={srOnly}>History</span></span>
                  </div>

                  {rows.length === 0 && (
                    <p style={{ margin: 0, padding: '28px 24px', fontSize: 14, color: RT.muted }}>No keywords match these filters.</p>
                  )}

                  {rows.map((k) => {
                    const isOpen = open === k.id;
                    const checking = k.pending && !k.checkedAt;
                    return (
                      <div key={k.id} style={{ borderBottom: `1px solid ${RT.lineSoft}`, background: isOpen ? '#f8faff' : '#fff' }}>
                        <div onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a,input,label,select')) setOpen(isOpen ? null : k.id); }}
                          style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '4px 12px', fontSize: 14, cursor: 'pointer' }}>
                          <label style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
                            <input type="checkbox" aria-label={`Select ${k.keyword}`} checked={sel.has(k.id)} onChange={() => toggleSel(k.id)} style={{ width: 18, height: 18, accentColor: RT.indigo }} />
                          </label>
                          <span>
                            <button type="button" aria-label={`Star ${k.keyword}`} aria-pressed={k.starred} onClick={() => toggleStar(k)} style={{ ...iconBtn, color: k.starred ? '#b45309' : '#64748b' }}>
                              <StarIcon on={k.starred} />
                            </button>
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.id)}
                              style={{ font: 'inherit', fontSize: 14, fontWeight: 500, textAlign: 'left', border: 0, background: 'transparent', padding: '10px 0', cursor: 'pointer', color: RT.ink, width: '100%' }}>
                              {k.keyword}
                              {checking && <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: RT.muted, marginTop: 2 }}>Checking…</span>}
                              {k.error && <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: RT.down, marginTop: 2 }}>{k.error}</span>}
                            </button>
                          </span>
                          <span>{k.checkedAt ? <RankBadge rank={k.rank} depth={k.depth} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                          <span>{k.hasPrev ? <Change v={k.change} /> : <span style={{ color: RT.muted }}>-</span>}</span>
                          <span><RankSpark ranks={k.spark} depth={k.depth} label={`8-check trend for ${k.keyword}`} /></span>
                          <span style={{ color: RT.text }}>{k.volume == null ? '-' : k.volume.toLocaleString('en-US')}</span>
                          <span><AiStatusText status={k.ai} /></span>
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
                        {isOpen && <WebsiteKeywordPanel kw={k} websiteId={websiteId} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
