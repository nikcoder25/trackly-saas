'use client';
/** Rank Tracking: all websites (screen 1). Tiles, then every website with its keywords inline; open a keyword for its history. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { ComparePeriod, RankSummary } from '@/lib/rank-tracking/types';
import { RT, rtFetch, useBrandScope, RankTabs, Toggle, SpreadLegend, fmtDay, btnPrimary, btnSecondary, cardStyle, srOnly } from '@/components/rank-tracking/RankUi';
import SummaryKeywordsTable from '@/components/rank-tracking/SummaryKeywordsTable';
import SummaryWebsitesTable, { siteRow, groupRow, type SummaryRow } from '@/components/rank-tracking/SummaryWebsitesTable';

type View = 'site' | 'group' | 'keywords';

const PERIODS: { value: ComparePeriod; label: string }[] = [
  { value: 'last', label: 'Last check' },
  { value: '7', label: 'Week' },
  { value: '30', label: 'Month' },
  { value: '90', label: '3 months' },
];
const VIEWS: { value: View; label: string }[] = [
  { value: 'site', label: 'By site' },
  { value: 'group', label: 'By group' },
  { value: 'keywords', label: 'All keywords' },
];

function changeText(v: number, unit = ''): { text: string; color: string } | null {
  const n = Math.round(Math.abs(v) * 10) / 10;
  if (!n) return null;
  return { text: `${v > 0 ? '▲' : '▼'} ${n}${unit}`, color: v > 0 ? RT.up : RT.down };
}

function StatTile({ label, value, change, note }: { label: string; value: string; change?: { text: string; color: string } | null; note?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: RT.muted }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: RT.ink }}>{value}</span>
        {change && <span style={{ fontSize: 13, fontWeight: 600, color: change.color }}>{change.text}</span>}
        {note && <span style={{ fontSize: 13, color: RT.muted }}>{note}</span>}
      </span>
    </div>
  );
}

export default function RankTrackingPage() {
  const [period, setPeriod] = useState<ComparePeriod>('last');
  const [data, setData] = useState<RankSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('site');
  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string; bad?: boolean } | null>(null);

  const brand = useBrandScope();

  const load = useCallback(async (p: ComparePeriod) => {
    try {
      setError(null);
      setData(await rtFetch<RankSummary>(`/api/rank-tracking/summary?period=${p}${brand.query ? `&${brand.query}` : ''}`));
    } catch (e) {
      setError((e as Error).message || 'Failed to load rankings');
    }
  }, [brand.query]);

  // Wait for the brand list so the page never flashes another brand's websites.
  useEffect(() => { setData(null); setOpenKey(undefined); }, [brand.query]);
  useEffect(() => { if (brand.ready) load(period); }, [load, period, brand.ready]);

  const rows: SummaryRow[] = useMemo(() => {
    if (!data) return [];
    const all = view === 'group' ? data.groups.map(groupRow) : data.websites.map(siteRow);
    const q = filter.trim().toLowerCase();
    return q ? all.filter((r) => `${r.domain} ${r.group ?? ''} ${r.city}`.toLowerCase().includes(q)) : all;
  }, [data, view, filter]);
  // The first row starts open, like the design; after that the user decides.
  const open = openKey === undefined ? rows[0]?.key ?? null : openKey;

  async function share(r: SummaryRow) {
    setBusyId(r.websiteId);
    setNotice(null);
    try {
      const { url } = await rtFetch<{ url: string }>(`/api/rank-tracking/websites/${encodeURIComponent(r.websiteId)}/share`, 'POST');
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked: show the link instead */ }
      setNotice({ text: copied ? `Share link for ${r.domain} copied:` : `Share link for ${r.domain}:`, url });
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not create the share link.', bad: true });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r: SummaryRow) {
    if (!window.confirm(`Stop tracking ${r.domain}? This deletes its keywords and rank history.`)) return;
    setBusyId(r.websiteId);
    setNotice(null);
    try {
      await rtFetch(`/api/rank-tracking/websites/${encodeURIComponent(r.websiteId)}`, 'DELETE');
      setNotice({ text: `${r.domain} deleted.` });
      await load(period);
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not delete the website.', bad: true });
    } finally {
      setBusyId(null);
    }
  }

  const s = data?.stats;
  const byGroup = view === 'group';
  const cr = data?.credits;
  const crPct = cr && cr.allowance ? Math.min(100, Math.round((cr.committed / cr.allowance) * 100)) : 100;
  const addHref = brand.domain ? `/dashboard/rank-tracking/add?website=${encodeURIComponent(brand.domain)}` : '/dashboard/rank-tracking/add';

  return (
    <div className="lvx" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <style>{'.rt-row:hover{background:#f8f9fd}'}</style>
      <div className="page-body" style={{ paddingTop: 16, paddingBottom: 0 }}><RankTabs /></div>
      <PageHead
        title="Rank tracking"
        sub={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Google positions for every site and keyword, checked from the exact city you choose.
            {data?.lastCheck && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: RT.text, border: `1px solid ${RT.line}`, borderRadius: 999, padding: '4px 10px', background: '#fff' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: '#16a34a' }} />Last check {fmtDay(data.lastCheck, true)}
              </span>
            )}
          </span>
        }
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Toggle label="Compare with" value={period} options={PERIODS} onChange={setPeriod} />
            <Link href="/dashboard/rank-tracking/reports" style={{ ...btnSecondary, fontSize: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
              Export
            </Link>
            <Link href={addHref} style={btnPrimary}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add keywords
            </Link>
          </div>
        }
      />

      <div className="page-body" style={{ gap: 20 }}>
        {error && (
          <div role="alert" style={{ ...cardStyle, padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" style={btnSecondary} onClick={() => load(period)}>Try again</button>
          </div>
        )}

        {!data && !error && (
          <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ ...cardStyle, height: 84, background: RT.lineSoft }} />)}
            <span style={srOnly}>Loading rankings</span>
          </div>
        )}

        {data && !data.providersConfigured && (
          <div role="status" style={{ ...cardStyle, padding: '14px 18px', background: '#fffbeb', borderColor: '#fde68a', color: '#78350f', fontSize: 14 }}>
            No SERP provider is configured, so rank checks cannot run yet. Ask an admin to add a provider key.
          </div>
        )}

        {data && s && data.websites.length === 0 && (
          <section style={{ ...cardStyle, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {brand.name ? `No keywords tracked for ${brand.name} yet` : 'No websites tracked yet'}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: RT.muted, maxWidth: 520 }}>
              {brand.name && !brand.domain
                ? `${brand.name} has no website set. Add its website in Brand Setup, then add keywords here.`
                : brand.name
                  ? `Add the keywords ${brand.domain} should rank for. We check Google from the city you pick and show the results here.`
                  : 'Add a website and the keywords you want to rank for. We check Google from the city you pick and show the results here.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {brand.name && !brand.domain
                ? <Link href="/dashboard/setup" style={btnPrimary}>Open Brand Setup</Link>
                : <Link href={addHref} style={btnPrimary}>+ Add keywords</Link>}
            </div>
          </section>
        )}

        {data && s && data.websites.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <StatTile label="Average position" value={s.avg == null ? '-' : s.avg.toFixed(1)} change={changeText(s.avgChange)} />
              <StatTile label="In top 3" value={s.top3.toLocaleString('en-US')} change={changeText(s.top3Change)} />
              <StatTile label="In top 10" value={s.top10.toLocaleString('en-US')} change={changeText(s.top10Change)} />
              <StatTile label="Visibility score" value={s.visibility == null ? '-' : `${s.visibility.toFixed(1)}%`} change={changeText(s.visibilityChange)} />
              <StatTile label="AI share of voice" value={s.sov == null ? '-' : `${s.sov}%`} note={`across ${s.keywords.toLocaleString('en-US')} keywords`} />
              {cr && (
                <div style={{ ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: RT.muted }}>
                    <span>Credits used</span>
                    <span style={{ fontWeight: 600, color: RT.ink }}>{cr.committed.toLocaleString('en-US')} / {cr.allowance.toLocaleString('en-US')}</span>
                  </div>
                  <div style={{ height: 6, background: RT.lineSoft, borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${crPct}%`, height: 6, background: RT.indigo, borderRadius: 999 }} /></div>
                  <span style={{ fontSize: 12, color: RT.muted }}>Next check: {fmtDay(data.nextCheck, true)}</span>
                </div>
              )}
            </div>

            {view === 'keywords' && (
              <div role="group" aria-label="View" style={{ display: 'flex', gap: 4 }}>
                {VIEWS.map((v) => <ViewButton key={v.value} on={view === v.value} onClick={() => setView(v.value)}>{v.label}</ViewButton>)}
              </div>
            )}

            {view === 'keywords' ? (
              <SummaryKeywordsTable websites={data.websites} reloadKey={data} />
            ) : (
              <section style={{ ...cardStyle, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${RT.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div role="group" aria-label="View" style={{ display: 'flex', gap: 4 }}>
                      {VIEWS.map((v) => <ViewButton key={v.value} on={view === v.value} onClick={() => setView(v.value)}>{v.label}</ViewButton>)}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${RT.line}`, borderRadius: 8, padding: '0 10px', height: 36 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={RT.muted} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></svg>
                      <span style={srOnly}>{byGroup ? 'Filter groups' : 'Filter websites'}</span>
                      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={byGroup ? 'Filter groups' : 'Filter sites'}
                        style={{ font: 'inherit', fontSize: 13, border: 0, outline: 'none', width: 160, height: 34, color: RT.ink, background: 'transparent' }} />
                    </label>
                  </div>
                  <SpreadLegend />
                </div>

                {notice && (
                  <div role="status" style={{ margin: '12px 18px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                    background: notice.bad ? '#fef2f2' : RT.indigoSoft, color: notice.bad ? RT.down : '#3730a3' }}>
                    <span>{notice.text}</span>
                    {notice.url && <a href={notice.url} target="_blank" rel="noreferrer" style={{ color: '#3730a3', wordBreak: 'break-all', fontWeight: 600 }}>{notice.url}</a>}
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"
                      style={{ marginLeft: 'auto', width: 36, height: 36, border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                )}

                {rows.length > 0 ? (
                  <SummaryWebsitesTable rows={rows} byGroup={byGroup} busyId={busyId} openKey={open} period={period}
                    onToggle={(k) => setOpenKey(open === k ? null : k)} onShare={share} onDelete={remove} />
                ) : (
                  <p style={{ margin: 0, padding: '28px 24px', fontSize: 14, color: RT.muted }}>
                    {filter.trim() ? 'Nothing matches that filter.' : byGroup ? 'No keyword groups yet. Open a website and use Move to group to make one.' : 'No websites yet.'}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ViewButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ font: 'inherit', height: 36, padding: '0 14px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 500,
        background: on ? RT.ink : 'transparent', color: on ? '#fff' : RT.text }}>
      {children}
    </button>
  );
}
