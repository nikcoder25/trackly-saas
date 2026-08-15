'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useBrandData } from '@/hooks/useBrandData';
import { Card, KPIRail, Badge, Bar, Pill, PageHead, Filter, Seg } from '@/app/dashboard-v2/ui';

interface FanoutAggregate {
  query: string;
  timesSeen: number;
  platforms: string[];
  prompts: string[];
  lastSeen: string;
}

interface FanoutResponse {
  aggregates: FanoutAggregate[];
  totalObservations: number;
  distinctQueries: number;
  reportingPlatforms: string[];
  days: number;
}

const WINDOWS = [
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
];

export default function FanoutPage() {
  const { brand, loading } = useBrandData();
  const [data, setData] = useState<FanoutResponse | null>(null);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('');

  const brandId = brand?.id;

  const load = useCallback((id: string, window: string) => {
    setBusy(true);
    setFailed(false);
    fetch(`/api/brands/${id}/fanout?days=${window}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then((d: FanoutResponse) => setData(d))
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!brandId) return;
    load(brandId, days);
  }, [brandId, days, load]);

  useEffect(() => {
    if (!brandId) return;
    const handler = () => load(brandId, days);
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brandId, days, load]);

  const rows = useMemo(() => {
    const all = data?.aggregates || [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      a => a.query.toLowerCase().includes(q) || a.prompts.some(p => p.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  const maxSeen = rows.length ? rows[0].timesSeen : 1;

  if (loading) return (
    <div className="lvx">
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
        <span className="spinner" style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <PageHead
        title="Fan-out Queries"
        sub="The searches engines actually ran while answering your prompts - not what we think they ran, what they reported running."
        actions={<Badge tone="warn">BETA</Badge>}
      />
      <div className="page-body">
        <KPIRail items={[
          { k: 'DISTINCT SUB-QUERIES', v: data?.distinctQueries ?? '—' },
          { k: 'OBSERVATIONS', v: data?.totalObservations ?? '—' },
          { k: 'REPORTING ENGINES', v: data?.reportingPlatforms?.length || 0 },
        ]} />

        <Filter>
          <Seg value={days} onChange={setDays} options={WINDOWS} />
          <div className="search-box">
            <span className="dim mono">⌕</span>
            <input
              placeholder="Filter sub-queries or prompts…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
        </Filter>

        <Card
          title="Observed fan-out"
          right={<Pill>{rows.length} shown</Pill>}
          padding={false}
          lede="One row per sub-query an engine issued. A prompt you track can expand into searches that never contain your prompt's wording - those are the queries you are really competing in."
        >
          {busy ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12 }}>
              Loading…
            </div>
          ) : failed ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12 }}>
              Couldn’t load fan-out data.{' '}
              <button type="button" className="btn-d" onClick={() => brandId && load(brandId, days)}>Retry</button>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12, lineHeight: 1.7 }}>
              No fan-out recorded in this window.
              <br />
              Fan-out is only captured from engines that report it. Today that means
              grounded Gemini — make sure Gemini is one of your tracked platforms,
              then run your prompts.
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>SUB-QUERY</th>
                  <th>SEEN</th>
                  <th>SHARE</th>
                  <th>ENGINES</th>
                  <th>FROM YOUR PROMPTS</th>
                </tr></thead>
                <tbody>
                  {rows.map(a => (
                    <tr key={a.query}>
                      <td style={{ maxWidth: 320 }}>{a.query}</td>
                      <td className="num"><b>{a.timesSeen}</b></td>
                      <td style={{ width: 120 }}><Bar value={a.timesSeen} max={maxSeen} /></td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                          {a.platforms.map(p => <Pill key={p}>{p}</Pill>)}
                        </span>
                      </td>
                      <td style={{ maxWidth: 320, color: 'var(--mute)', fontSize: 12 }}>
                        {a.prompts.slice(0, 2).join(' · ')}
                        {a.prompts.length > 2 && ` +${a.prompts.length - 2} more`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
