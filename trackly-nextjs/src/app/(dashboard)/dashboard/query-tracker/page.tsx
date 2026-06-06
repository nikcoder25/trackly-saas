'use client';

import { useState, useEffect, useMemo } from 'react';
import { getPlanPlatforms } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandData } from '@/hooks/useBrandData';
import { TableSkeleton } from '@/components/dashboard/Skeleton';
import { Card, KPIRail, Badge, Delta, Spark, Filter, Seg, PageHead, Info } from '@/app/dashboard-v2/ui';

interface KTKeyword { keyword: string; mentionRate: number; change: number | null; totalRuns: number; platformCount: number; avgPosition: number | null; lastUpdated: string; sparkline?: number[]; platforms?: Record<string, number>; }
interface Brand { id: string; name: string; queries?: string[]; runs?: Array<{ date?: string; time?: string; sov?: number; platforms?: Record<string, unknown>; allResults?: Array<{ query: string; platform: string; mentioned: boolean; position?: number }> }>; }

type SortField = 'keyword' | 'mentionRate' | 'change' | 'totalRuns' | 'platformCount' | 'avgPosition' | 'lastUpdated';

export default function QueryTrackerPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const [keywords, setKeywords] = useState<KTKeyword[]>([]);
  const [period, setPeriod] = useState('day');
  const [filterText, setFilterText] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<number | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  // Refresh keyword tracker data when a run completes.
  useEffect(() => {
    const handler = () => setRefreshTick(t => t + 1);
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, []);

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;

    // Try API first, fall back to computing from brand data
    fetch(`/api/brands/${brand.id}/keyword-tracker?period=${period}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then(d => {
        if (!cancelled && d.keywords && d.keywords.length > 0) {
          setKeywords(d.keywords);
        } else if (!cancelled) {
          computeFromBrand();
        }
      })
      .catch(() => { if (!cancelled) computeFromBrand(); });

    function computeFromBrand() {
      fetch(`/api/brands/${brand!.id}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
        .then(d => {
          if (!cancelled) computeFromRuns(d.brand || brand);
        })
        .catch(() => { if (!cancelled) computeFromRuns(brand!); });
    }

    function computeFromRuns(b: Brand) {
      const runs = b.runs || [];
      const brandQueries = b.queries || [];
      const map: Record<string, { keyword: string; totalRuns: number; mentionCount: number; platforms: Set<string>; posSum: number; posCount: number; lastDate: string; history: number[] }> = {};

      runs.forEach(run => {
        const results = run.allResults || [];
        const queryMap: Record<string, { mentioned: number; total: number }> = {};
        results.forEach(r => {
          if (!r.query) return;
          if (!queryMap[r.query]) queryMap[r.query] = { mentioned: 0, total: 0 };
          queryMap[r.query].total++;
          if (r.mentioned) queryMap[r.query].mentioned++;
          if (!map[r.query]) map[r.query] = { keyword: r.query, totalRuns: 0, mentionCount: 0, platforms: new Set(), posSum: 0, posCount: 0, lastDate: '', history: [] };
          map[r.query].platforms.add(r.platform);
          if (r.position) { map[r.query].posSum += r.position; map[r.query].posCount++; }
        });
        Object.entries(queryMap).forEach(([q, s]) => {
          if (!map[q]) return;
          map[q].totalRuns += s.total;
          map[q].mentionCount += s.mentioned;
          map[q].lastDate = run.date || run.time || map[q].lastDate;
          map[q].history.push(s.total > 0 ? Math.round(s.mentioned / s.total * 100) : 0);
        });
      });

      // Ensure all brand queries appear even if no allResults data
      for (const q of brandQueries) {
        if (!map[q]) {
          map[q] = { keyword: q, totalRuns: 0, mentionCount: 0, platforms: new Set(), posSum: 0, posCount: 0, lastDate: runs.length ? (runs[runs.length - 1].date || '') : '', history: [] };
        }
      }

      if (Object.keys(map).length === 0) { setKeywords([]); return; }

      const computed: KTKeyword[] = Object.values(map).map(m => ({
        keyword: m.keyword,
        mentionRate: m.totalRuns > 0 ? Math.round(m.mentionCount / m.totalRuns * 100) : 0,
        change: m.history.length >= 2 ? m.history[m.history.length - 1] - m.history[m.history.length - 2] : null,
        totalRuns: m.totalRuns,
        platformCount: m.platforms.size,
        avgPosition: m.posCount > 0 ? Math.round(m.posSum / m.posCount) : null,
        lastUpdated: m.lastDate,
        sparkline: m.history.length > 1 ? m.history.slice(-7) : undefined,
      }));
      setKeywords(computed);
    }

    return () => { cancelled = true; };
  }, [brand?.id, period, refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let rows = [...keywords];
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter(k => k.keyword.toLowerCase().includes(q));
    }
    if (sortField) {
      rows.sort((a, b) => {
        let va: number | string, vb: number | string;
        switch (sortField) {
          case 'keyword': va = a.keyword.toLowerCase(); vb = b.keyword.toLowerCase(); break;
          case 'mentionRate': va = a.mentionRate; vb = b.mentionRate; break;
          case 'change': va = a.change ?? -999; vb = b.change ?? -999; break;
          case 'totalRuns': va = a.totalRuns; vb = b.totalRuns; break;
          case 'platformCount': va = a.platformCount; vb = b.platformCount; break;
          case 'avgPosition': va = a.avgPosition ?? 999; vb = b.avgPosition ?? 999; break;
          case 'lastUpdated': va = a.lastUpdated || ''; vb = b.lastUpdated || ''; break;
          default: va = a.mentionRate; vb = b.mentionRate;
        }
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
        return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }
    return rows;
  }, [keywords, filterText, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'keyword' ? 'asc' : 'desc'); }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function formatDate(d: string) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Status derived from real visibility - categorises tracked queries for the badge/filter.
  function statusOf(kw: KTKeyword): 'priority' | 'tracking' | 'losing' | 'none' {
    if (kw.totalRuns === 0) return 'none';
    if (kw.mentionRate >= 30) return 'priority';
    if (kw.mentionRate < 15) return 'losing';
    return 'tracking';
  }

  // Real KPI metrics computed from the tracked-query set.
  const totalRunsCount = useMemo(() => keywords.reduce((a, k) => a + k.totalRuns, 0), [keywords]);
  const winningCount = useMemo(() => keywords.filter(k => k.totalRuns > 0 && k.mentionRate >= 30).length, [keywords]);
  const atRiskCount = useMemo(() => keywords.filter(k => k.totalRuns > 0 && k.mentionRate < 15).length, [keywords]);
  const missRate = useMemo(() => {
    const withData = keywords.filter(k => k.totalRuns > 0);
    if (withData.length === 0) return 0;
    return Math.round(withData.filter(k => k.mentionRate === 0).length / withData.length * 100);
  }, [keywords]);

  if (loading) return (
    <div className="lvx">
      <div className="page-head">
        <div>
          <div style={{ height: 22, width: 180, borderRadius: 6, background: 'var(--surface-3)', marginBottom: 8 }} />
          <div style={{ height: 13, width: 280, borderRadius: 4, background: 'var(--surface-3)' }} />
        </div>
      </div>
      <div className="page-body">
        <TableSkeleton rows={8} cols={6} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <PageHead
        title="Query Tracker"
        sub="Every buyer-intent prompt you're tracking - and how you perform on each across AI engines."
      />
      <div className="page-body">
        <KPIRail items={[
          { k: 'TRACKED', term: 'prompt', v: keywords.length },
          { k: 'WINNING (VIS ≥ 30%)', v: winningCount },
          { k: 'AT RISK (VIS < 15%)', v: atRiskCount, danger: atRiskCount > 0 },
          { k: 'MISS RATE', v: missRate, suffix: '%' },
          { k: 'TOTAL RUNS', v: totalRunsCount.toLocaleString() },
        ]} />

        <Filter>
          <div className="search-box">
            <span className="dim mono">⌕</span>
            <input
              placeholder="Search prompts…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              aria-label="Filter keywords"
            />
          </div>
          <Seg
            value={period}
            onChange={(p) => { setPeriod(p); setExpanded(null); setSortField(null); setFilterText(''); }}
            options={[{ value: 'day', label: 'DAY' }, { value: 'week', label: 'WEEK' }, { value: 'month', label: 'MONTH' }]}
          />
        </Filter>

        {keywords.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>◇</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text)' }}>No Query Data Yet</div>
              <div style={{ color: 'var(--mute)', fontSize: 12.5, maxWidth: 340, margin: '0 auto' }}>
                Run queries from Brand Setup to start tracking keyword visibility over time. Data will appear here after your first completed run.
              </div>
            </div>
          </Card>
        ) : (
          <Card padding={false} foot={<><span>Showing {filtered.length} of {keywords.length}</span><span>Auto-refreshing · live</span></>}>
            <table className="tbl">
              <thead><tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('keyword')}>QUERY{sortIcon('keyword')}</th>
                <th>STATUS</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('mentionRate')}>VISIBILITY{sortIcon('mentionRate')} <Info term="sov" /></th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('change')}>Δ{sortIcon('change')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalRuns')}>MENTIONS{sortIcon('totalRuns')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('platformCount')}>ENGINES{sortIcon('platformCount')}</th>
                <th>TREND</th>
                <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('lastUpdated')}>UPDATED{sortIcon('lastUpdated')}</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12.5 }}>
                      No keywords match your filter.
                    </td>
                  </tr>
                ) : filtered.map((kw, idx) => {
                  const status = statusOf(kw);
                  const statusTone = status === 'priority' ? 'acc' : status === 'losing' ? 'neg' : status === 'none' ? 'neu' : 'neu';
                  const statusLabel = status === 'none' ? 'NO DATA' : status.toUpperCase();
                  const isExpanded = expanded === idx;
                  return (
                    <tr
                      key={idx}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpanded(isExpanded ? null : idx)}
                      aria-expanded={isExpanded}
                    >
                      <td><b title={kw.keyword}>{kw.keyword}</b></td>
                      <td><Badge tone={statusTone}>{statusLabel}</Badge></td>
                      <td className="num"><b>{kw.mentionRate}%</b></td>
                      <td>{kw.change != null ? <Delta v={kw.change} suffix="%" /> : <span className="dim">-</span>}</td>
                      <td className="num">{kw.totalRuns}</td>
                      <td className="num">{kw.platformCount}/{planPlatforms.length}</td>
                      <td>
                        {kw.sparkline && kw.sparkline.length > 1
                          ? <Spark data={kw.sparkline} width={120} height={24} color={(kw.change ?? 0) >= 0 ? 'var(--primary)' : 'var(--danger)'} />
                          : <span className="dim">-</span>}
                      </td>
                      <td className="right num dim">{formatDate(kw.lastUpdated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
