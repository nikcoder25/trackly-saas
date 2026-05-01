'use client';

import { useMemo } from 'react';
import type { DailyUsagePoint } from '@/app/api/credits/usage/route';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const BAR_DEFAULT = '#7c6cf0';
const BAR_PEAK = '#5a4fcf';
const BAR_TRACK = '#f4f4f2';

interface DailyCreditChartProps {
  /** 30-day series from /api/credits/usage. */
  series: DailyUsagePoint[];
}

function fmtBucket(date: string, opts?: Intl.DateTimeFormatOptions): string {
  // The bucket key is YYYY-MM-DD (UTC); we format in UTC so the label
  // matches the bucket exactly across viewer timezones.
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', ...(opts ?? { month: 'short', day: 'numeric' }) });
}

export default function DailyCreditChart({ series }: DailyCreditChartProps) {
  const stats = useMemo(() => {
    if (!series.length) {
      return { avg: 0, peak: 0, peakDate: null as string | null, max: 1 };
    }
    let total = 0;
    let peak = 0;
    let peakDate: string | null = null;
    for (const p of series) {
      total += p.credits;
      if (p.credits > peak) {
        peak = p.credits;
        peakDate = p.date;
      }
    }
    const avg = Math.round(total / series.length);
    const max = Math.max(1, peak);
    return { avg, peak, peakDate, max };
  }, [series]);

  const hasData = series.length > 0 && stats.peak > 0;

  // Pick first / mid / last bucket for the x-axis labels so the
  // chart stays readable at any width.
  const firstBucket = series[0]?.date;
  const midBucket = series[Math.floor(series.length / 2)]?.date;
  const lastBucket = series[series.length - 1]?.date;

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        borderRadius: SURFACE_RADIUS,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
            Daily credit usage
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, fontVariantNumeric: 'tabular-nums' }}>
            {hasData ? (
              <>
                Average{' '}
                <strong style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>
                  {stats.avg.toLocaleString()}
                </strong>{' '}
                credits/day
                <span style={{ color: TEXT_MUTED, margin: '0 6px' }}>·</span>
                peak{' '}
                <strong style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>
                  {stats.peak.toLocaleString()}
                </strong>{' '}
                credits on {stats.peakDate ? fmtBucket(stats.peakDate) : '—'}
              </>
            ) : (
              'No credit usage yet in the last 30 days.'
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Last 30 days</div>
      </div>

      {/* Bars row */}
      <div
        role="img"
        aria-label={
          hasData
            ? `Daily credit usage chart, last 30 days. Average ${stats.avg} per day, peak ${stats.peak}.`
            : 'No credit usage in the last 30 days.'
        }
        style={{
          height: 144,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          padding: '4px 0',
        }}
      >
        {series.map((p) => {
          const h = hasData ? Math.max(2, Math.round((p.credits / stats.max) * 132)) : 2;
          const isPeak = p.date === stats.peakDate && p.credits > 0;
          return (
            <div
              key={p.date}
              title={`${fmtBucket(p.date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${p.credits.toLocaleString()} credits`}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${h}px`,
                  background: p.credits === 0 ? BAR_TRACK : isPeak ? BAR_PEAK : BAR_DEFAULT,
                  borderRadius: 4,
                  transition: 'height 600ms cubic-bezier(.16,1,.3,1)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: TEXT_MUTED,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{firstBucket ? fmtBucket(firstBucket) : ''}</span>
        <span>{midBucket ? fmtBucket(midBucket) : ''}</span>
        <span>{lastBucket ? fmtBucket(lastBucket) : ''}</span>
      </div>
    </div>
  );
}
