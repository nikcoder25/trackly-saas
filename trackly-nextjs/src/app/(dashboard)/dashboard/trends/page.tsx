'use client';

import { useMemo, useState } from 'react';
import { PLATFORM_COLORS, getPlanPlatforms } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, ChartSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';
import {
  PageHead,
  Card,
  KPIRail,
  Filter,
  Pill,
  Spark,
  Delta,
  LineChart,
  type LineSeries,
} from '@/app/dashboard-v2/ui';

interface SovPoint { date: string; overall: number; platforms?: Record<string, number>; }
interface Run { date?: string; time?: string; sov?: number; platforms?: Record<string, { sov?: number }> }
interface Brand { id: string; name: string; sovHistory?: SovPoint[]; runs?: Run[]; }

/* ── Helpers ── */
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateFull = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function TrendsPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;

  const history: SovPoint[] = useMemo(() => {
    if (brand?.sovHistory?.length) {
      return brand.sovHistory.map(h => ({ ...h, overall: Number(h.overall) || 0 }));
    }
    return (brand?.runs || [])
      .filter(r => r.date && r.sov != null && !isNaN(Number(r.sov)))
      .map(r => ({
        date: r.date!,
        overall: Number(r.sov) || 0,
        platforms: r.platforms
          ? Object.fromEntries(Object.entries(r.platforms).map(([k, v]) => [k, Number(v.sov) || 0]))
          : {},
      }));
  }, [brand]);

  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => set.add(p)); });
    return [...set].filter(p => planPlatforms.includes(p));
  }, [history, planPlatforms]);

  // Stats - guard against NaN with || 0
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const sovDelta = latest && prev ? (latest.overall - prev.overall) : null;
  const validOveralls = history.map(h => h.overall).filter(v => !isNaN(v));
  const avgSov = validOveralls.length > 0 ? Math.round(validOveralls.reduce((s, v) => s + v, 0) / validOveralls.length) : 0;
  const peakSov = validOveralls.length > 0 ? Math.max(...validOveralls) : 0;
  const lowSov = validOveralls.length > 0 ? Math.min(...validOveralls) : 0;

  // Interactive per-platform legend (preserves original toggle behaviour).
  const [activePlatforms, setActivePlatforms] = useState<Set<string>>(new Set());
  const visiblePlatforms = useMemo(
    () => allPlatforms.filter(p => activePlatforms.size === 0 || activePlatforms.has(p)),
    [allPlatforms, activePlatforms],
  );
  function togglePlatform(p: string) {
    setActivePlatforms(prev => {
      const base = prev.size === 0 ? new Set(allPlatforms) : new Set(prev);
      if (base.has(p)) { if (base.size > 1) base.delete(p); } else base.add(p);
      return base;
    });
  }

  // Build LineChart series + xLabels from the REAL trend history.
  const xLabels = useMemo(() => history.map(h => fmtDate(h.date)), [history]);

  const overallSeries: LineSeries[] = useMemo(() => ([
    {
      id: 'overall',
      label: 'Overall SOV',
      color: 'var(--primary)',
      bold: true,
      fill: true,
      dots: true,
      cur: latest ? latest.overall : undefined,
      data: history.map(h => Number(h.overall) || 0),
    },
  ]), [history, latest]);

  const platformSeries: LineSeries[] = useMemo(
    () => visiblePlatforms.map(p => {
      const data = history.map(h => Number(h.platforms?.[p] ?? 0) || 0);
      return {
        id: p,
        label: p,
        color: PLATFORM_COLORS[p] || '#888',
        data,
        cur: data.length ? data[data.length - 1] : undefined,
      };
    }),
    [history, visiblePlatforms],
  );

  if (loading) return (
    <div className="lvx">
      <PageHead title="SOV Trends" sub="Share of Voice over time - track how AI platforms mention your brand." />
      <div className="page-body">
        <KpiCardsSkeleton count={4} />
        <ChartSkeleton h={340} />
        <ChartSkeleton h={320} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="SOV Trends"
        sub={
          <>
            Share of Voice over time - track how AI platforms mention your brand.
            {history.length > 0 && <span> · {history.length} data points</span>}
          </>
        }
      />
      <div className="page-body">
        {/* ── KPI rail ── */}
        <KPIRail items={[
          { k: 'CURRENT SOV', term: 'sov', v: latest ? `${latest.overall}%` : '-', d: sovDelta ?? undefined },
          { k: 'AVERAGE SOV', v: `${avgSov}%` },
          { k: 'PEAK SOV', v: `${peakSov}%` },
          { k: 'LOWEST SOV', v: `${lowSov}%` },
        ]} />

        {/* ── Main Share of Voice chart ── */}
        <Card
          title="Share of Voice"
          info="sov"
          lede="Overall Share of Voice over time, built from your real scan history."
          right={
            history.length > 0 ? (
              <span className="mono dim" style={{ fontSize: 11 }}>
                {fmtDateFull(history[0].date)} – {fmtDateFull(history[history.length - 1].date)}
              </span>
            ) : undefined
          }
        >
          {history.length > 1 ? (
            <LineChart series={overallSeries} xLabels={xLabels} height={340} />
          ) : (
            <EmptyState text="Run at least 2 scans to see the overall trend." />
          )}
        </Card>

        {/* ── Per-platform trend ── */}
        <Card
          title="SOV by engine"
          right={<span className="mono dim" style={{ fontSize: 11 }}>PER-PLATFORM TREND</span>}
        >
          {history.length > 1 && allPlatforms.length > 0 ? (
            <>
              <Filter>
                {allPlatforms.map(p => {
                  const active = activePlatforms.size === 0 || activePlatforms.has(p);
                  const color = PLATFORM_COLORS[p] || '#888';
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      aria-label={`${active ? 'Hide' : 'Show'} ${p}`}
                      aria-pressed={active}
                      className="btn-d"
                      style={{ opacity: active ? 1 : 0.45 }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : 'var(--mute)', display: 'inline-block' }} />
                      {p}
                    </button>
                  );
                })}
                <span style={{ flex: 1 }} />
                {sovDelta != null && sovDelta !== 0 && (
                  <Pill tone={sovDelta > 0 ? 'acc' : 'neg'}>{sovDelta > 0 ? '+' : ''}{sovDelta} pp · latest</Pill>
                )}
              </Filter>
              <LineChart series={platformSeries} xLabels={xLabels} height={320} />
            </>
          ) : (
            <EmptyState text="Run at least 2 scans to see per-platform trends." />
          )}
        </Card>

        {/* ── Latest per-engine sparklines ── */}
        {allPlatforms.length > 0 && history.length > 0 && (
          <Card title="Latest by engine" right={<span className="mono dim" style={{ fontSize: 11 }}>SPARKLINES</span>}>
            <div style={{ display: 'grid', gap: 12 }}>
              {allPlatforms.map(p => {
                const data = history.map(h => Number(h.platforms?.[p] ?? 0) || 0);
                const cur = data.length ? data[data.length - 1] : 0;
                const prevVal = data.length > 1 ? data[data.length - 2] : null;
                const delta = prevVal != null ? cur - prevVal : null;
                const color = PLATFORM_COLORS[p] || '#888';
                return (
                  <div key={p} style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                        {p}
                      </span>
                      <span className="mono"><b>{cur}%</b> {delta != null && <Delta v={delta} suffix="%" />}</span>
                    </div>
                    {data.length > 1 && <Spark data={data} width={300} height={26} color={color} fill />}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ═══ Empty state ═══ */
function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📈</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Not Enough Data Yet</div>
      <p style={{ color: 'var(--mute)', fontSize: 13, textAlign: 'center', margin: 0, maxWidth: 340 }}>{text}</p>
    </div>
  );
}
