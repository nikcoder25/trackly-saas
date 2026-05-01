'use client';

/**
 * 4-week mention-rate sparkline. Reads up to 4 chronological
 * `mention_rate` snapshots for the same region from the user's recent
 * audits (passed in by the caller — usually from the loaded list).
 *
 * NO mock data. If we have <2 data points (i.e., a single audit or
 * none at all), we render an honest empty/single-dot state, never a
 * fake interpolation.
 */

interface Props {
  /** Per-region mention_rate snapshots, oldest → newest. Values in [0,1]. */
  values: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}

const STROKE = '#10b981';      // green = healthy mention rate
const STROKE_AT_RISK = '#d97706'; // amber when last point < 0.05
const TRACK = '#e7e7e2';

export default function MentionRateSparkline({
  values,
  width = 80,
  height = 24,
  ariaLabel,
}: Props) {
  // Defensive: filter to finite values in [0, 1]. Anything else is
  // garbage data and we'd rather render the single-dot empty state
  // than a wild line.
  const clean = values.filter(
    (v) => Number.isFinite(v) && v >= 0 && v <= 1,
  );

  // Empty state — no data points at all (e.g., region has only
  // queued/running audits). Render a flat dim track line.
  if (clean.length === 0) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel ?? 'No trend data yet'}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke={TRACK}
          strokeWidth={1.5}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  // Single-point state: one data point, render as a dot at the
  // appropriate y-height. Spec: "render a flat line (or just a single
  // dot)" — single dot is more honest than a flat line.
  if (clean.length === 1) {
    const y = height - 2 - clean[0] * (height - 4);
    return (
      <svg
        role="img"
        aria-label={ariaLabel ?? `Mention rate ${(clean[0] * 100).toFixed(1)}%`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <circle cx={width / 2} cy={y} r={2} fill={STROKE} />
      </svg>
    );
  }

  // Two+ points: real polyline.
  const stepX = (width - 4) / (clean.length - 1);
  const points = clean
    .map((v, i) => {
      const x = 2 + i * stepX;
      const y = height - 2 - v * (height - 4);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const last = clean[clean.length - 1];
  const stroke = last < 0.05 ? STROKE_AT_RISK : STROKE;

  const lastX = 2 + (clean.length - 1) * stepX;
  const lastY = height - 2 - last * (height - 4);

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Mention rate trend, ${clean.length} points, last ${(last * 100).toFixed(1)}%`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={1.8} fill={stroke} />
    </svg>
  );
}
