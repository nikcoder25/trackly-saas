'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import { ApiError } from '@/lib/fetch-client';
import { RT, rtFetch, btnPrimary, btnSecondary, cardStyle } from '@/components/rank-tracking/RankUi';

interface SpendData {
  days: { day: string; provider: string; kind: string; units: number; cost: number }[];
  totals: { today: number; month: number; last30: number };
  queue: { due: number; pending: number; failing: number; keywords: number };
  topAccounts: { accountId: string; email: string | null; cost: number }[];
  providers: { name: string; costPerPage: number }[];
  locations: number;
}

const usd = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(4)}`;
const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-US');
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 600, color: RT.muted, borderBottom: `1px solid ${RT.line}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, color: RT.ink, borderBottom: `1px solid ${RT.lineSoft}`, whiteSpace: 'nowrap' };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: RT.ink };

function Tile({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '16px 18px' }}>
      <div style={{ fontSize: 13, color: RT.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || RT.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function fmtDate(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function RankSpendPage() {
  const [data, setData] = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notAdmin, setNotAdmin] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await rtFetch<SpendData>('/api/rank-tracking/admin/spend'));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401 || e.status === 403)) setNotAdmin(true);
      else setError((e as Error).message || 'Could not load the spend data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function reloadCities() {
    setReloading(true);
    setReloadMsg(null);
    try {
      const r = await rtFetch<{ ok: boolean; locations: number }>('/api/rank-tracking/admin/spend', 'POST', { action: 'refresh_locations' });
      setReloadMsg({ ok: true, text: `City list reloaded: ${num(r.locations)} locations.` });
      setData((d) => (d ? { ...d, locations: r.locations } : d));
    } catch (e) {
      setReloadMsg({ ok: false, text: (e as Error).message || 'Could not reload the city list.' });
    } finally {
      setReloading(false);
    }
  }

  if (notAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 16px' }}>
        <div style={{ ...cardStyle, padding: '40px 32px', textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: RT.ink }}>Not available</h1>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: RT.muted }}>This page is only for administrators.</p>
          <Link href="/dashboard" style={btnSecondary}>Back to dashboard</Link>
        </div>
      </div>
    );
  }

  // Total cost per day, shown on the first row of each day.
  const byDay = new Map<string, number>();
  data?.days.forEach((r) => byDay.set(r.day, (byDay.get(r.day) || 0) + (Number(r.cost) || 0)));

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <PageHead title="Rank data spend" sub="What rank checks and search volume cost us, by day, provider and account."
        actions={<button type="button" style={btnSecondary} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>} />

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: RT.down, fontSize: 14 }}>{error}</span>
          <button type="button" style={btnSecondary} onClick={load}>Try again</button>
        </div>
      )}
      {loading && !data && !error && <div role="status" style={{ padding: '60px 0', textAlign: 'center', color: RT.muted, fontSize: 14 }}>Loading…</div>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section aria-labelledby="sp-totals">
            <h2 id="sp-totals" style={h2}>Spend (USD)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <Tile label="Today" value={usd(data.totals?.today)} />
              <Tile label="This month" value={usd(data.totals?.month)} />
              <Tile label="Last 30 days" value={usd(data.totals?.last30)} />
            </div>
          </section>

          <section aria-labelledby="sp-queue">
            <h2 id="sp-queue" style={h2}>Check queue</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Tile label="Due now" value={num(data.queue?.due)} />
              <Tile label="Waiting on provider" value={num(data.queue?.pending)} />
              <Tile label="Failing" value={num(data.queue?.failing)} color={data.queue?.failing ? RT.down : undefined} />
              <Tile label="Keywords tracked" value={num(data.queue?.keywords)} />
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>
            <section aria-labelledby="sp-providers" style={{ ...cardStyle, padding: '18px 20px' }}>
              <h2 id="sp-providers" style={h2}>Providers in use</h2>
              {data.providers.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: RT.down }}>No rank data provider is set up. Add the provider keys to the environment.</p>
              ) : (
                <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {data.providers.map((p, i) => (
                    <li key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${RT.lineSoft}` : 'none', fontSize: 14 }}>
                      <span><span style={{ color: RT.muted }}>{i + 1}.</span> {p.name}{i === 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#3730a3', background: RT.indigoSoft, borderRadius: 999, padding: '2px 8px' }}>first choice</span>}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(p.costPerPage)} a page</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="sp-cities" style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 id="sp-cities" style={{ ...h2, margin: 0 }}>City list</h2>
              <div style={{ fontSize: 14, color: RT.text }}>{num(data.locations)} locations cached</div>
              <div>
                <button type="button" style={{ ...btnPrimary, opacity: reloading ? 0.6 : 1 }} onClick={reloadCities} disabled={reloading}>
                  {reloading ? 'Reloading…' : 'Reload city list'}
                </button>
              </div>
              {reloadMsg && <div role="status" style={{ fontSize: 14, color: reloadMsg.ok ? RT.up : RT.down }}>{reloadMsg.text}</div>}
            </section>
          </div>

          <section aria-labelledby="sp-days" style={{ ...cardStyle, padding: '18px 20px' }}>
            <h2 id="sp-days" style={h2}>Daily spend, last 30 days</h2>
            {data.days.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>No spend in the last 30 days.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead><tr>
                    <th scope="col" style={th}>Day</th><th scope="col" style={th}>Provider</th><th scope="col" style={th}>Kind</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Units</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Cost</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Day total</th>
                  </tr></thead>
                  <tbody>
                    {data.days.map((r, i) => {
                      const first = i === 0 || data.days[i - 1].day !== r.day;
                      return (
                        <tr key={`${r.day}-${r.provider}-${r.kind}`}>
                          <td style={{ ...td, fontWeight: first ? 600 : 400, color: first ? RT.ink : RT.muted }}>{first ? fmtDate(r.day) : ''}</td>
                          <td style={td}>{r.provider}</td>
                          <td style={td}>{r.kind}</td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(r.units)}</td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(r.cost)}</td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{first ? usd(byDay.get(r.day)) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="sp-accounts" style={{ ...cardStyle, padding: '18px 20px' }}>
            <h2 id="sp-accounts" style={h2}>Top accounts this month</h2>
            {data.topAccounts.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>No account has spent anything this month.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead><tr>
                    <th scope="col" style={th}>Account</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Cost</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Share</th>
                  </tr></thead>
                  <tbody>
                    {data.topAccounts.map((a) => (
                      <tr key={a.accountId}>
                        <td style={td}>{a.email || <span style={{ color: RT.muted }}>{a.accountId}</span>}</td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(a.cost)}</td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: RT.muted }}>
                          {data.totals?.month ? `${Math.round(((Number(a.cost) || 0) / data.totals.month) * 100)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
