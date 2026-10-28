'use client';
/** Rank Tracking overview (screen 2): what moved, keywords by position over 12 weeks, recent alerts, gainers and losers. */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { MoverDto, RankOverview } from '@/lib/rank-tracking/types';
import { RT, rtFetch, useBrandScope, RankTabs, RankBadge, Change, Toggle, SpreadLegend, SPREAD_BANDS, activityTag, fmtDay, btnPrimary, btnSecondary, cardStyle } from '@/components/rank-tracking/RankUi';

type Period = 'last' | '30' | '90';

const sectionStyle: React.CSSProperties = { ...cardStyle, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const h2Style: React.CSSProperties = { margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: RT.ink };
const rowBorder = `1px solid ${RT.lineSoft}`;

function Tile({ label, children, color, sub, subColor }: { label: string; children: React.ReactNode; color?: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ ...cardStyle, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 13, color: RT.muted }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 700, color: color || RT.ink, lineHeight: 1.1 }}>{children}</span>
      {sub && <span style={{ fontSize: 12, color: subColor || RT.muted, fontWeight: subColor ? 600 : 400 }}>{sub}</span>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, padding: '12px 0', borderTop: rowBorder, fontSize: 14, color: RT.muted }}>{children}</p>;
}

function MoverList({ title, items, emptyText, color }: { title: string; items: MoverDto[]; emptyText: string; color: string }) {
  return (
    <section style={{ ...sectionStyle, flex: 1 }} aria-labelledby={`ov-${title}`}>
      <h2 id={`ov-${title}`} style={{ ...h2Style, color }}>{title}</h2>
      {items.length === 0 ? <Empty>{emptyText}</Empty> : items.map((g) => (
        <Link key={g.keywordId} href={`/dashboard/rank-tracking/${g.websiteId}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', minHeight: 44, borderTop: rowBorder, textDecoration: 'none', color: RT.ink }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{g.keyword}</span>
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

const VS: Record<Period, string> = { last: 'the last check', '30': 'last month', '90': '3 months ago' };

/** Keywords per position band at the end of each of the last 12 weeks. */
function WeeksChart({ weeks }: { weeks: RankOverview['weeks'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.spread.reduce((a, b) => a + b, 0)));
  const label = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <>
      <div role="img" aria-label={`Keywords by position over the last 12 weeks. ${weeks.map((w) => `${label(w.end)}: ${w.spread.map((n, i) => `${SPREAD_BANDS[i].label} ${n}`).join(', ')}`).join('; ')}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 220, borderBottom: `1px solid ${RT.line}`, paddingTop: 8 }}>
        {weeks.map((w) => (
          <div key={w.end} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', borderRadius: '6px 6px 0 0', overflow: 'hidden', minWidth: 0 }}>
            {w.spread.map((n, i) => <div key={i} style={{ height: `${(n / max) * 210}px`, background: SPREAD_BANDS[i].color }} />)}
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 10, fontSize: 11, color: RT.muted }}>
        {weeks.map((w) => <span key={w.end} style={{ flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>{label(w.end)}</span>)}
      </div>
      <SpreadLegend withNone={false} />
    </>
  );
}

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
  const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <PageHead title="Overview"
        sub={s && data && !noKeywords ? `${plural(s.total, 'keyword')} across ${plural(data.sites.length, 'site')} · compared with ${VS[period]}` : 'Google rankings and AI mentions across all your clients.'}
        actions={
          <Toggle<Period> label="Compare with" value={period} onChange={setPeriod}
            options={[{ value: 'last', label: 'Last check' }, { value: '30', label: 'Month' }, { value: '90', label: '3 months' }]} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }} aria-busy={loading}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Tile label="Moved up" color={RT.up} sub={s.up ? `Avg gain ${s.upAvg} positions` : 'Nothing moved up'}>▲ {s.up.toLocaleString('en-US')}</Tile>
            <Tile label="Moved down" color={RT.down} sub={s.down ? `Avg loss ${s.downAvg} positions` : 'Nothing moved down'}>▼ {s.down.toLocaleString('en-US')}</Tile>
            <Tile label="In top 10" sub="Keywords on page 1">{s.top10.toLocaleString('en-US')}</Tile>
            <Tile label="Ranking" sub={s.total - s.ranking > 0 ? `${(s.total - s.ranking).toLocaleString('en-US')} not ranking yet` : 'Every keyword ranks'}>
              {s.ranking.toLocaleString('en-US')} <span style={{ fontSize: 16, color: RT.muted, fontWeight: 500 }}>/ {s.total.toLocaleString('en-US')}</span>
            </Tile>
            <Tile label="AI share of voice" sub="Across AI answers">{s.sov == null ? '-' : `${s.sov}%`}</Tile>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <section style={{ ...sectionStyle, flex: '2 1 520px', gap: 14 }} aria-labelledby="ov-weeks">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 id="ov-weeks" style={{ ...h2Style, margin: 0 }}>Keywords by position, last 12 weeks</h2>
                <span style={{ fontSize: 12, color: RT.muted }}>Last rank each week</span>
              </div>
              <WeeksChart weeks={data.weeks} />
            </section>

            <section style={{ ...sectionStyle, flex: '1 1 300px', gap: 10 }} aria-labelledby="ov-activity">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 id="ov-activity" style={{ ...h2Style, margin: 0 }}>Recent alerts</h2>
                <Link href="/dashboard/rank-tracking/alerts" style={{ fontSize: 13, fontWeight: 600, color: '#4338ca', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>All alerts</Link>
              </div>
              {data.activity.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Nothing yet. Alerts, rank milestones and sent reports show up here.</p>
              ) : data.activity.slice(0, 6).map((a, i) => {
                const t = activityTag(a.message, a.kind);
                return (
                  <div key={`${a.at}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: t.bg }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, whiteSpace: 'nowrap' }}>{t.label}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: RT.ink, overflowWrap: 'anywhere' }}>{a.message}</span>
                      <span style={{ fontSize: 12, color: RT.muted }}>{fmtDay(a.at, true)}</span>
                    </span>
                  </div>
                );
              })}
            </section>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex' }}>
              <MoverList title="Top gainers" color={RT.up} items={data.gainers} emptyText="No keyword moved up in this period." />
            </div>
            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex' }}>
              <MoverList title="Top losers" color={RT.down} items={data.losers} emptyText="No keyword moved down in this period." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
