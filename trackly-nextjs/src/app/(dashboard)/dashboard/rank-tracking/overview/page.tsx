'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { MoverDto, RankOverview } from '@/lib/rank-tracking/types';
import { RT, rtFetch, useBrandScope, RankTabs, RankBadge, Change, Toggle, fmtDay, btnPrimary, btnSecondary, cardStyle } from '@/components/rank-tracking/RankUi';

type Period = 'last' | '30' | '90';

const sectionStyle: React.CSSProperties = { ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const h2Style: React.CSSProperties = { margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: RT.ink };
const rowBorder = `1px solid ${RT.lineSoft}`;

function Tile({ label, children, color }: { label: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ fontSize: 13, color: RT.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: color || RT.ink }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, padding: '12px 0', borderTop: rowBorder, fontSize: 14, color: RT.muted }}>{children}</p>;
}

function MoverList({ title, items, emptyText }: { title: string; items: MoverDto[]; emptyText: string }) {
  return (
    <section style={sectionStyle} aria-labelledby={`ov-${title}`}>
      <h2 id={`ov-${title}`} style={h2Style}>{title}</h2>
      {items.length === 0 ? <Empty>{emptyText}</Empty> : items.map((g) => (
        <Link key={g.keywordId} href={`/dashboard/rank-tracking/${g.websiteId}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', minHeight: 44, borderTop: rowBorder, textDecoration: 'none', color: RT.ink }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{g.keyword}</span>
            <span style={{ fontSize: 12, color: RT.muted, overflowWrap: 'anywhere' }}>{g.domain}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
            <RankBadge rank={g.rank} />
            <span style={{ fontSize: 14, minWidth: 44, textAlign: 'right' }}><Change v={g.change} /></span>
          </div>
        </Link>
      ))}
    </section>
  );
}

const dotColor = (kind: string) => (kind === 'alert' ? RT.indigo : kind === 'event' ? RT.up : '#94a3b8');

export default function RankOverviewPage() {
  const [period, setPeriod] = useState<Period>('last');
  const [data, setData] = useState<RankOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const brand = useBrandScope();

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError('');
    try {
      setData(await rtFetch<RankOverview>(`/api/rank-tracking/overview?period=${p}${brand.query ? `&${brand.query}` : ''}`));
    } catch (e) {
      setError((e as Error).message || 'Could not load the overview.');
    } finally {
      setLoading(false);
    }
  }, [brand.query]);

  // Wait for the brand list so the page never shows another brand's websites.
  useEffect(() => { setData(null); }, [brand.query]);
  useEffect(() => { if (brand.ready) load(period); }, [load, period, brand.ready]);

  const s = data?.stats;
  const noKeywords = !!data && data.stats.total === 0;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <PageHead title="Overview" sub="Google rankings and AI mentions across all your clients."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: RT.muted }}>Compare with</span>
            <Toggle<Period> label="Compare with" value={period} onChange={setPeriod}
              options={[{ value: 'last', label: 'Last check' }, { value: '30', label: 'Month' }, { value: '90', label: '3 months' }]} />
          </div>
        } />
      <RankTabs />

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: RT.down, fontSize: 14 }}>{error}</span>
          <button type="button" style={btnSecondary} onClick={() => load(period)}>Try again</button>
        </div>
      )}

      {loading && !data && !error && (
        <div role="status" style={{ padding: '60px 0', textAlign: 'center', color: RT.muted, fontSize: 14 }}>Loading the overview…</div>
      )}

      {noKeywords && (
        <div style={{ ...cardStyle, padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>No keywords tracked yet</h2>
          <p style={{ margin: 0, fontSize: 14, color: RT.muted, maxWidth: 420 }}>Add the keywords your clients want to rank for. We check Google from their city and show what moved here.</p>
          <Link href="/dashboard/rank-tracking/add" style={btnPrimary}>Add keywords</Link>
        </div>
      )}

      {data && s && !noKeywords && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }} aria-busy={loading}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Tile label="Moved up" color={RT.up}>{s.up.toLocaleString('en-US')}</Tile>
            <Tile label="Moved down" color={RT.down}>{s.down.toLocaleString('en-US')}</Tile>
            <Tile label="In the top 10">{s.top10.toLocaleString('en-US')}</Tile>
            <Tile label="Keywords ranking">
              {s.ranking.toLocaleString('en-US')} <span style={{ fontSize: 16, color: RT.muted, fontWeight: 500 }}>/ {s.total.toLocaleString('en-US')}</span>
            </Tile>
            <Tile label="AI share of voice">{s.sov == null ? '-' : `${s.sov}%`}</Tile>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
            <MoverList title="Top gainers" items={data.gainers} emptyText="No keyword moved up in this period." />
            <MoverList title="Top losers" items={data.losers} emptyText="No keyword moved down in this period." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
            <section style={sectionStyle} aria-labelledby="ov-sites">
              <h2 id="ov-sites" style={h2Style}>Your sites</h2>
              {data.sites.length === 0 ? <Empty>No websites yet.</Empty> : data.sites.map((site) => (
                <Link key={site.id} href={`/dashboard/rank-tracking/${site.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', minHeight: 44, borderTop: rowBorder, textDecoration: 'none', color: RT.ink }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#3730a3', overflowWrap: 'anywhere' }}>{site.domain}</span>
                    <span style={{ fontSize: 12, color: RT.muted }}>
                      {site.keywords.toLocaleString('en-US')} {site.keywords === 1 ? 'keyword' : 'keywords'}{site.city ? ` · ${site.city}` : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, flex: 'none' }}><Change v={site.change} /></span>
                </Link>
              ))}
            </section>

            <section style={sectionStyle} aria-labelledby="ov-activity">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                <h2 id="ov-activity" style={{ ...h2Style, margin: 0 }}>Recent activity</h2>
                <Link href="/dashboard/rank-tracking/alerts" style={{ fontSize: 13, fontWeight: 500, color: '#4338ca', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>View all</Link>
              </div>
              {data.activity.length === 0 ? <Empty>Nothing yet. Alerts, rank milestones and sent reports show up here.</Empty> : data.activity.map((a, i) => (
                <div key={`${a.at}-${i}`} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: rowBorder, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, flex: 'none', background: dotColor(a.kind) }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{a.message}</span>
                    <span style={{ fontSize: 12, color: RT.muted }}>{fmtDay(a.at, true)}</span>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
