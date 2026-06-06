'use client';

import { useEffect, useState } from 'react';

/**
 * Animated radial progress ring for the Credits hero KPI. SVG donut,
 * 1.5px hairline track + thicker accent arc, gradient stroke. Animates
 * from 0 to its target on mount so the meter reads as alive.
 *
 * Owner / unlimited plans: caller passes `unlimited` and we render the
 * indigo gradient as a full ring with an "∞" centerpiece.
 */
interface CreditsRingProps {
  used: number;
  cap: number;
  unlimited?: boolean;
  size?: number;
  /** Aria label for screen readers; ring is decorative without it. */
  label?: string;
}

export default function CreditsRing({
  used,
  cap,
  unlimited = false,
  size = 168,
  label,
}: CreditsRingProps) {
  const STROKE = 12;
  const r = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = unlimited
    ? 1
    : cap > 0
      ? Math.min(1, used / cap)
      : 0;

  // Animate stroke-dashoffset on mount.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const offset = animated ? circumference * (1 - pct) : circumference;

  // State-driven color for the arc. Owner stays full indigo; capped
  // tiers shift toward amber/red as they near the limit.
  const ringColor = unlimited
    ? 'url(#creditsRingGrad)'
    : pct > 0.85
      ? '#ef4444'
      : pct >= 0.6
        ? '#f59e0b'
        : 'url(#creditsRingGrad)';

  const remaining = unlimited ? Infinity : Math.max(0, cap - used);
  const pctLabel = unlimited
    ? '∞'
    : `${Math.min(100, Math.round(pct * 100))}%`;

  return (
    <div
      role="img"
      aria-label={label ?? `Credit usage ${used} of ${unlimited ? 'unlimited' : cap}`}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="creditsRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <filter id="creditsRingGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Hairline track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={STROKE}
        />
        {/* Animated progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={pct > 0 ? 'url(#creditsRingGlow)' : undefined}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      {/* Centerpiece - big % or ∞ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: unlimited ? 44 : 30,
            fontWeight: 700,
            letterSpacing: -0.5,
            color: '#0f172a',
            lineHeight: 1,
          }}
        >
          {unlimited ? <span aria-hidden="true">∞</span> : pctLabel}
          {unlimited && <span className="sr-only">Unlimited credits</span>}
        </div>
        {!unlimited && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: '#64748b',
              fontFamily: 'var(--mono)',
            }}
          >
            {remaining.toLocaleString()} left
          </div>
        )}
      </div>
    </div>
  );
}
