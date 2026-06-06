'use client';

/**
 * 14-point sparkline used inside the Tracked Prompts tile.
 *
 * - Hand-rolled SVG polyline (no chart library - 14 points doesn't
 *   warrant a recharts import).
 * - Renders an indigo stroke + a soft area fill so the trend reads at
 *   a glance even at small sizes.
 * - Last-point dot pulses subtly to draw the eye to "today".
 */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke + dot color. Defaults to brand indigo. */
  color?: string;
  /** Lighter rgba area fill. Defaults to the stroke at 18% alpha. */
  areaColor?: string;
  /** Aria-label override; defaults to a generic summary. */
  label?: string;
}

export default function Sparkline({
  data,
  width = 96,
  height = 28,
  color = '#6366f1',
  areaColor,
  label,
}: SparklineProps) {
  if (!data.length) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke="#e2e8f0" strokeWidth={1} />
      </svg>
    );
  }

  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = Math.max(1, max - min);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const padY = 3;
  const usableH = height - padY * 2;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padY + (usableH - ((v - min) / range) * usableH);
    return [x, y] as const;
  });

  const polylinePts = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  // Area path: extend the polyline down to the baseline + close.
  const areaPath = [
    `M 0 ${(height - 0.5).toFixed(2)}`,
    ...points.map(([x, y], i) => `${i === 0 ? 'L' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`),
    `L ${(width).toFixed(2)} ${(height - 0.5).toFixed(2)}`,
    'Z',
  ].join(' ');

  const [lastX, lastY] = points[points.length - 1];
  const fill = areaColor ?? color;

  const total = data.reduce((a, b) => a + b, 0);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={label ?? `Last ${data.length} days · ${total} credits used`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="sparkAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.25" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkAreaGrad)" />
      <polyline
        points={polylinePts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* "Today" dot with a halo. */}
      <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r={3.5} fill={color} opacity={0.18} />
      <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r={2} fill={color} />
    </svg>
  );
}
