'use client';

import { useMemo } from 'react';
import { PLATFORM_COLORS, getPlanPlatforms } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandData } from '@/hooks/useBrandData';

import { KpiCardsSkeleton, CardsSkeleton } from '@/components/dashboard/Skeleton';
import {
  PageHead, KPIRail, Card, Pill, Badge, Bar, Spark, PlatformTile,
  PLATFORMS, type Platform,
} from '@/app/dashboard-v2/ui';

interface PlatformData {
  sov?: number;
  queries?: number;
  mentions?: number;
  total?: number;
  errors?: number;
  latency?: number;
  successRate?: number;
  calls24h?: number;
}

interface Run {
  date?: string;
  time?: string;
  platforms?: Record<string, PlatformData>;
}

function runTimestampMs(run: { time?: string; date?: string } | null | undefined): number | null {
  if (!run) return null;
  const t = run.time;
  if (t) { const ms = new Date(t).getTime(); if (!Number.isNaN(ms)) return ms; }
  if (run.date) { const ms = new Date(run.date).getTime(); if (!Number.isNaN(ms)) return ms; }
  return null;
}

interface Brand {
  id: string;
  name: string;
  runs?: Run[];
  selected_platforms?: string[];
}

function normPlatform(pd: unknown): { sov: number; total: number; mentions: number; errors: number } {
  if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
  if (typeof pd === 'object' && pd !== null) {
    const o = pd as Record<string, number>;
    return { sov: o.sov || 0, total: o.total || o.queries || 0, mentions: o.mentions || 0, errors: o.errors || 0 };
  }
  return { sov: 0, total: 0, mentions: 0, errors: 0 };
}

function healthStatus(pd: unknown): { label: string; color: string; bg: string } {
  const n = normPlatform(pd);
  if (n.sov === 0 && n.total === 0 && n.mentions === 0)
    return { label: 'No Data', color: 'var(--muted)', bg: 'var(--bg3)' };
  if (n.errors && n.total && n.errors / n.total > 0.3)
    return { label: 'Degraded', color: 'var(--red)', bg: 'rgba(239,68,68,.08)' };
  if (n.errors > 0)
    return { label: 'Issues', color: 'var(--amber)', bg: 'rgba(245,158,11,.08)' };
  return { label: 'Healthy', color: 'var(--green)', bg: 'rgba(16,185,129,.08)' };
}

// Map a real platform name onto a design PLATFORMS tile (by name), falling back
// to a synthesized Platform-shaped object so the colored tile always renders.
function platformTileFor(name: string): Platform {
  const found = PLATFORMS.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return { id: name.toLowerCase(), name, short: name.slice(0, 3).toUpperCase(), sov: 0, delta: 0, ok: true, ms: 0 };
}

export default function PlatformsPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { brand: rawBrand, brands, loading } = useBrandData({ fullData: true });
  const selectedBrand = rawBrand as Brand | null;

  const sortedRuns = useMemo(
    () => [...(selectedBrand?.runs || [])].sort((a, b) => (runTimestampMs(a) ?? 0) - (runTimestampMs(b) ?? 0)),
    [selectedBrand?.runs]
  );
  const latestRun = sortedRuns.length ? sortedRuns[sortedRuns.length - 1] : null;
  const latestRunTs = runTimestampMs(latestRun);
  const platformData = latestRun?.platforms || {};

  // Aggregate stats across last 10 runs
  const platformStats = useMemo(() => {
    const stats: Record<string, { totalCalls: number; totalErrors: number; sovHistory: number[] }> = {};
    const recentRuns = sortedRuns.slice(-10);
    recentRuns.forEach(run => {
      if (!run.platforms) return;
      Object.entries(run.platforms).forEach(([name, pd]) => {
        if (!stats[name]) stats[name] = { totalCalls: 0, totalErrors: 0, sovHistory: [] };
        const n = normPlatform(pd);
        stats[name].totalCalls += n.total;
        stats[name].totalErrors += n.errors;
        stats[name].sovHistory.push(n.sov);
      });
    });
    return stats;
  }, [sortedRuns]);

  // Summary counts
  const activePlatforms = Object.keys(platformData).length;
  const healthyCount = planPlatforms.filter(name => {
    const pd = platformData[name];
    return pd !== undefined && pd !== null && healthStatus(pd).label === 'Healthy';
  }).length;
  const totalErrors = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).errors, 0);
  const totalMentions = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).mentions, 0);
  const totalQueries = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).total, 0);
  const overallSov = totalQueries > 0 ? Math.round((totalMentions / totalQueries) * 100) : 0;
  const totalPlatforms = planPlatforms.length;

  // Best & worst performing platform
  const ranked = planPlatforms
    .map(name => ({ name, ...normPlatform(platformData[name]) }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.sov - a.sov);
  const best = ranked[0] || null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  if (loading) return (
    <div className="lvx">
      <div className="page-body">
        <KpiCardsSkeleton count={4} />
        <CardsSkeleton count={5} />
      </div>
    </div>
  );

  const lastRunLabel = latestRunTs !== null
    ? (() => {
        const dt = new Date(latestRunTs);
        return `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      })()
    : null;

  return (
    <div className="lvx">
      <PageHead
        title="Platform Status"
        sub={`Real-time health and performance across ${totalPlatforms} AI platforms.${lastRunLabel ? ` · Last run ${lastRunLabel}` : ''}`}
      />

      <div className="page-body">
        <KPIRail items={[
          { k: 'ACTIVE ENGINES', v: `${activePlatforms}/${totalPlatforms}` },
          { k: 'HEALTHY', v: `${healthyCount}`, info: `of ${activePlatforms} active` },
          { k: 'OVERALL SOV', v: `${overallSov}`, suffix: '%', term: 'sov', info: `${totalMentions} of ${totalQueries}` },
          { k: 'MENTIONS', v: `${totalMentions}`, term: 'mention', info: `of ${totalQueries}` },
          { k: 'ERRORS', v: `${totalErrors}`, danger: totalErrors > 0, info: totalErrors === 0 ? 'none' : 'total' },
        ]} />

        {best && worst && best.name !== worst.name && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Pill tone="acc">Best: {best.name} · {best.sov}% SOV</Pill>
            <Pill tone="neg">Worst: {worst.name} · {worst.sov}% SOV</Pill>
          </div>
        )}

        <div className="g2">
          {planPlatforms.map(name => {
            const color = PLATFORM_COLORS[name] || '#888';
            const tile = platformTileFor(name);
            const raw = platformData[name];
            const n = normPlatform(raw);
            const hasData = raw !== undefined && raw !== null;
            const health = healthStatus(raw);
            const stats = platformStats[name];
            const successRate = stats && stats.totalCalls > 0
              ? Math.round(((stats.totalCalls - stats.totalErrors) / stats.totalCalls) * 100)
              : null;
            const sovHistory = stats?.sovHistory || [];

            const operational = hasData && health.label !== 'Degraded' && health.label !== 'No Data';

            return (
              <Card key={name}
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><PlatformTile p={tile} size={26} /> {name}</span>}
                right={operational
                  ? <Pill tone="acc"><span className="pulse" style={{ width: 5, height: 5 }} /> {health.label.toUpperCase()}</Pill>
                  : <Pill tone={hasData ? 'neg' : 'neu'}>{hasData ? '⚠ ' : ''}{health.label.toUpperCase()}</Pill>}>
                {hasData ? (
                  <div className="plat-grid">
                    <div>
                      <div className="eyebrow">SHARE OF VOICE</div>
                      <div className="kpi-v mono" style={{ fontSize: 22 }}>{n.sov}<i>%</i></div>
                      {sovHistory.length >= 2
                        ? <Spark data={sovHistory} width={140} height={28} color={color} fill />
                        : <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{n.mentions} of {n.total} responses</div>}
                    </div>
                    <div>
                      <div className="eyebrow">SUCCESS RATE</div>
                      <div className="kpi-v mono" style={{ fontSize: 22 }}>{successRate !== null ? successRate : '—'}{successRate !== null && <i>%</i>}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>
                        {stats && stats.totalCalls > 0 ? `last ${stats.totalCalls} calls` : 'no calls yet'}
                      </div>
                    </div>
                    <div>
                      <div className="eyebrow">MENTIONS</div>
                      <div className="kpi-v mono" style={{ fontSize: 22 }}>{n.mentions}<i> / {n.total}</i></div>
                      <Bar value={n.mentions} max={Math.max(n.total, 1)} color={color} />
                    </div>
                    <div>
                      <div className="eyebrow">{n.errors > 0 ? 'ERRORS' : 'LAST RUN'}</div>
                      {n.errors > 0 ? (
                        <>
                          <div className="kpi-v mono" style={{ fontSize: 22, color: 'var(--danger)' }}>{n.errors}</div>
                          <div className="mono" style={{ fontSize: 11, color: 'var(--danger)' }}>✗ {n.errors} failed call{n.errors === 1 ? '' : 's'}</div>
                        </>
                      ) : (
                        <>
                          <div className="mono" style={{ fontSize: 13 }}>{lastRunLabel || '—'}</div>
                          <div className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>✓ success</div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
                    <Badge tone="neu">NO DATA</Badge>
                    <p className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginTop: 10 }}>Run queries to see {name} results</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
