'use client';
/** Rank Tracking: all websites (screen 1). Tiles, position spread and the websites table. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { ComparePeriod, RankSummary } from '@/lib/rank-tracking/types';
import { RT, rtFetch, RankTabs, CreditsCard, Toggle, fmtDay, btnPrimary, btnSecondary, cardStyle } from '@/components/rank-tracking/RankUi';
import SummaryWebsitesTable, { siteRow, groupRow, srOnly, type SummaryRow } from '@/components/rank-tracking/SummaryWebsitesTable';

const PERIODS: { value: ComparePeriod; label: string }[] = [
  { value: 'last', label: 'Last check' },
  { value: '7', label: 'Week' },
  { value: '30', label: 'Month' },
  { value: '90', label: '3 months' },
];
const VS: Record<ComparePeriod, string> = { last: 'vs last check', '7': 'vs last week', '30': 'vs last month', '90': 'vs 3 months ago' };
const SPREAD = [
  { label: 'Top 3', color: '#312e81' },
  { label: '4 to 10', color: '#4f46e5' },
  { label: '11 to 20', color: '#818cf8' },
  { label: '21 to 30', color: '#c7d2fe' },
  { label: 'Not ranking', color: '#e2e8f0' },
];

function changeSub(v: number, unit: string, vs: string): { text: string; color: string } {
  const n = Math.round(Math.abs(v) * 10) / 10;
  if (!n) return { text: `No change ${vs}`, color: RT.muted };
  return { text: `${v > 0 ? '▲' : '▼'} ${n}${unit} ${vs}`, color: v > 0 ? RT.up : RT.down };
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, color: RT.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: RT.ink }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{sub}</div>
    </div>
  );
}

export default function RankTrackingPage() {
  const [period, setPeriod] = useState<ComparePeriod>('last');
  const [data, setData] = useState<RankSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [byGroup, setByGroup] = useState(false);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string; bad?: boolean } | null>(null);

  const load = useCallback(async (p: ComparePeriod) => {
    try {
      setError(null);
      setData(await rtFetch<RankSummary>(`/api/rank-tracking/summary?period=${p}`));
    } catch (e) {
      setError((e as Error).message || 'Failed to load rankings');
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  const rows: SummaryRow[] = useMemo(() => {
    if (!data) return [];
    const all = byGroup ? data.groups.map(groupRow) : data.websites.map(siteRow);
    const q = filter.trim().toLowerCase();
    return q ? all.filter((r) => `${r.domain} ${r.group ?? ''} ${r.city}`.toLowerCase().includes(q)) : all;
  }, [data, byGroup, filter]);

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
  const spreadTotal = data ? data.spread.reduce((a, b) => a + b, 0) : 0;
  const vs = VS[period];

  return (
    <div className="lvx" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <div className="page-body" style={{ paddingTop: 16, paddingBottom: 0 }}><RankTabs /></div>
      <PageHead
        title="Rank Tracking"
        sub="Google rankings checked from each client's city, next to their AI share of voice."
        actions={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link href="/dashboard/rank-tracking/reports" style={btnSecondary}>Export report</Link>
              <Link href="/dashboard/rank-tracking/add" style={btnPrimary}>+ Add keywords</Link>
            </div>
            {data && <CreditsCard credits={data.credits} />}
          </div>
        }
      />

      <div className="page-body" style={{ gap: 24 }}>
        {error && (
          <div role="alert" style={{ ...cardStyle, padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" style={btnSecondary} onClick={() => load(period)}>Try again</button>
          </div>
        )}

        {!data && !error && (
          <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ ...cardStyle, height: 110, background: RT.lineSoft }} />)}
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>No websites tracked yet</h2>
            <p style={{ margin: 0, fontSize: 14, color: RT.muted, maxWidth: 520 }}>
              Add a website and the keywords you want to rank for. We check Google from the city you pick and show the results here.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              <Link href="/dashboard/rank-tracking/add" style={btnPrimary}>+ Add keywords</Link>
              <Link href="/dashboard/rank-tracking/add?tab=import" style={btnSecondary}>Import CSV</Link>
            </div>
          </section>
        )}

        {data && s && data.websites.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <StatTile label="Keywords tracked" value={s.keywords.toLocaleString('en-US')} sub={`${s.websites} website${s.websites === 1 ? '' : 's'}`} color={RT.muted} />
              {(() => { const c = changeSub(s.avgChange, '', vs); return <StatTile label="Average position" value={s.avg == null ? '-' : s.avg.toFixed(1)} sub={c.text} color={c.color} />; })()}
              {(() => { const c = changeSub(s.top3Change, ' keywords', vs); return <StatTile label="In top 3" value={s.top3.toLocaleString('en-US')} sub={c.text} color={c.color} />; })()}
              {(() => { const c = changeSub(s.top10Change, ' keywords', vs); return <StatTile label="In top 10" value={s.top10.toLocaleString('en-US')} sub={c.text} color={c.color} />; })()}
              <StatTile label="Dropped out of top 30" value={s.dropped.toLocaleString('en-US')}
                sub={s.dropped > 0 ? 'Needs a look' : 'All good'} color={s.dropped > 0 ? RT.down : RT.muted} />
            </div>

            <section style={{ ...cardStyle, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Position spread, all websites</h2>
                <div style={{ fontSize: 13, color: RT.muted }}>Last check: {fmtDay(data.lastCheck, true)} · Next: {fmtDay(data.nextCheck, true)}</div>
              </div>
              <div role="img" aria-label={SPREAD.map((x, i) => `${x.label}: ${data.spread[i]}`).join(', ')}
                style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: spreadTotal ? 2 : 0, background: RT.line }}>
                {spreadTotal > 0 && SPREAD.map((x, i) => data.spread[i] > 0 && (
                  <div key={x.label} style={{ width: `${(data.spread[i] / spreadTotal) * 100}%`, background: x.color }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13, color: RT.text }}>
                {SPREAD.map((x, i) => (
                  <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: x.color, boxSizing: 'border-box', border: i === 4 ? '1px solid #cbd5e1' : 0 }} />
                    {x.label} · {data.spread[i].toLocaleString('en-US')}
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 24px', borderBottom: `1px solid ${RT.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Websites</h2>
                  <div role="group" aria-label="View by" style={{ display: 'flex', gap: 4 }}>
                    {[false, true].map((g) => (
                      <button key={String(g)} type="button" aria-pressed={byGroup === g} onClick={() => setByGroup(g)}
                        style={{ font: 'inherit', fontSize: 13, fontWeight: byGroup === g ? 600 : 500, padding: '8px 12px', minHeight: 44, border: 0, cursor: 'pointer',
                          borderBottom: `2px solid ${byGroup === g ? RT.indigo : 'transparent'}`, background: 'transparent', color: byGroup === g ? '#3730a3' : RT.muted }}>
                        {g ? 'By group' : 'By website'}
                      </button>
                    ))}
                  </div>
                  <label style={{ fontSize: 13, color: RT.muted }}>
                    <span style={srOnly}>Filter websites</span>
                    <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={byGroup ? 'Type to filter groups' : 'Type to filter websites'}
                      style={{ font: 'inherit', fontSize: 14, padding: '11px 12px', minHeight: 44, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, width: 220, maxWidth: '100%', color: RT.ink }} />
                  </label>
                </div>
                <Toggle label="Compare period" value={period} options={PERIODS} onChange={setPeriod} />
              </div>

              {notice && (
                <div role="status" style={{ margin: '12px 24px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                  background: notice.bad ? '#fef2f2' : RT.indigoSoft, color: notice.bad ? RT.down : '#3730a3' }}>
                  <span>{notice.text}</span>
                  {notice.url && <a href={notice.url} target="_blank" rel="noreferrer" style={{ color: '#3730a3', wordBreak: 'break-all', fontWeight: 600 }}>{notice.url}</a>}
                  <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"
                    style={{ marginLeft: 'auto', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              )}

              {rows.length > 0 ? (
                <SummaryWebsitesTable rows={rows} byGroup={byGroup} busyId={busyId} onShare={share} onDelete={remove} />
              ) : (
                <p style={{ margin: 0, padding: '28px 24px', fontSize: 14, color: RT.muted }}>
                  {filter.trim() ? 'Nothing matches that filter.' : byGroup ? 'No keyword groups yet. Open a website and use Move to group to make one.' : 'No websites yet.'}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
