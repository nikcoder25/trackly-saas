'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, KPIRail, Badge, Pill, PageHead, Filter, Seg, LineChart, type LineSeries } from '@/app/dashboard-v2/ui';

interface SeriesPoint { day: string; score: number | null; cohortSize: number }
interface VolatilitySeries { platform: string; points: SeriesPoint[]; latest: number | null }
interface VolatilityResponse { series: VolatilitySeries[]; days: number; minCohort: number }

const WINDOWS = [
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: '180', label: '180D' },
];

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#10a37f',
  Perplexity: '#20808d',
  Gemini: '#4285f4',
  Claude: '#d97757',
  Grok: '#8b8b8b',
};

/** Bands mirror how the score is read, not arbitrary thirds. */
function band(score: number | null): { tone: string; label: string } {
  if (score === null) return { tone: 'neu', label: 'NO DATA' };
  if (score >= 70) return { tone: 'neg', label: 'HIGH' };
  if (score >= 40) return { tone: 'warn', label: 'ELEVATED' };
  return { tone: 'acc', label: 'NORMAL' };
}

export default function VolatilityPage() {
  const [data, setData] = useState<VolatilityResponse | null>(null);
  const [days, setDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/volatility?days=${days}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then((d: VolatilityResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) { setData(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const series = data?.series || [];
  const selected = useMemo(
    () => series.find(s => s.platform === active) || series[0] || null,
    [series, active],
  );

  // Nulls are days whose cohort was too thin to score. The chart cannot
  // draw a gap, so they carry the previous value forward and the caption
  // below says how many days that applied to - better than plotting a
  // zero, which would read as "the engine was perfectly stable".
  const { chartSeries, gapDays } = useMemo(() => {
    if (!selected) return { chartSeries: [] as LineSeries[], gapDays: 0 };
    let last = 0;
    let gaps = 0;
    const values = selected.points.map(p => {
      if (p.score === null) { gaps++; return last; }
      last = p.score;
      return p.score;
    });
    return {
      chartSeries: [{
        id: selected.platform,
        label: selected.platform,
        color: PLATFORM_COLORS[selected.platform] || 'var(--primary)',
        data: values,
        fill: true,
        bold: true,
      }] as LineSeries[],
      gapDays: gaps,
    };
  }, [selected]);

  const xLabels = useMemo(
    () => (selected?.points || []).map(p => p.day.slice(5)),
    [selected],
  );

  const latestCohort = useMemo(() => {
    if (!selected) return 0;
    for (let i = selected.points.length - 1; i >= 0; i--) {
      if (selected.points[i].score !== null) return selected.points[i].cohortSize;
    }
    return 0;
  }, [selected]);

  return (
    <div className="lvx">
      <PageHead
        title="AI Volatility Index"
        sub="How much each engine's answers moved day over day. High scores mean the engines are rewriting their answers more than usual - often a model or index update."
      />
      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
            <span className="spinner" style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
          </div>
        ) : failed ? (
          <Card title="AI Volatility Index">
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12 }}>
              Couldn’t load the volatility index.
            </div>
          </Card>
        ) : series.length === 0 ? (
          <Card title="AI Volatility Index">
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12, lineHeight: 1.7 }}>
              No index yet.
              <br />
              The index is computed nightly from the previous day’s measurements
              and needs two consecutive days of data before it can report a
              first score.
            </div>
          </Card>
        ) : (
          <>
            <KPIRail items={series.slice(0, 5).map(s => ({
              k: s.platform.toUpperCase(),
              v: s.latest ?? '—',
              danger: (s.latest ?? 0) >= 70,
            }))} />

            <Filter>
              <Seg value={days} onChange={setDays} options={WINDOWS} />
              <span style={{ flex: 1 }} />
              <Seg
                value={selected?.platform || ''}
                onChange={setActive}
                options={series.map(s => ({ value: s.platform, label: s.platform }))}
              />
            </Filter>

            {selected && (
              <Card
                title={selected.platform}
                right={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Badge tone={band(selected.latest).tone}>{band(selected.latest).label}</Badge>
                    <Pill>{selected.latest ?? '—'}</Pill>
                  </span>
                }
                foot={
                  <span style={{ fontSize: 11, color: 'var(--mute)' }}>
                    Latest score compares {latestCohort.toLocaleString()} prompts measured on both
                    days on this engine.
                    {gapDays > 0 && ` ${gapDays} day${gapDays === 1 ? '' : 's'} in this window had too few comparable prompts to score and are shown flat.`}
                  </span>
                }
              >
                <LineChart series={chartSeries} xLabels={xLabels} valSuffix="" height={280} />
              </Card>
            )}

            <Card
              title="How this is measured"
              lede="Worth reading before you act on a spike."
            >
              <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--mute)' }}>
                <p style={{ marginBottom: 10 }}>
                  Each day is compared against the day before, using only the prompts
                  that were measured on <b>both</b> days for that engine. That
                  same-prompt cohort is what stops normal churn in what people track
                  from being reported as engines changing their minds.
                </p>
                <p style={{ marginBottom: 10 }}>
                  The score blends three signals: how much the <b>cited sources</b>{' '}
                  changed (weighted heaviest — retrieval moves before the prose does),
                  how often a brand <b>flipped</b> between mentioned and not, and how
                  far <b>list positions</b> moved.
                </p>
                <p>
                  A high score is not a problem in itself. It means the answers were
                  unstable that day, so a drop in your own numbers is more likely to be
                  the engine moving than anything you did — and a gain is less likely to
                  be durable.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
