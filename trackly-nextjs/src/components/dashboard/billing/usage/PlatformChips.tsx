'use client';

import { PLATFORM_COLORS } from '@/lib/constants';

/**
 * Small pill-chips listing the configured AI platforms for the brand
 * portfolio. Each chip carries the platform's brand color as a leading
 * dot so the user can scan ChatGPT / Claude / etc. at a glance.
 *
 * Falls back to a quiet "-" when none are configured so the tile
 * doesn't render with empty whitespace.
 */
interface PlatformChipsProps {
  platforms: string[];
  /** Cap visible chips; the rest collapse into "+N". Default 4. */
  maxVisible?: number;
}

export default function PlatformChips({ platforms, maxVisible = 4 }: PlatformChipsProps) {
  if (!platforms.length) {
    return <span style={{ fontSize: 13, color: '#94a3b8' }}>-</span>;
  }
  const visible = platforms.slice(0, maxVisible);
  const overflow = Math.max(0, platforms.length - maxVisible);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {visible.map((p) => {
        const color = PLATFORM_COLORS[p] ?? '#94a3b8';
        return (
          <span
            key={p}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: '#334155',
              background: '#f8fafc',
              border: '1px solid rgba(15,23,42,0.06)',
              fontFamily: 'var(--font)',
              letterSpacing: 0.1,
              transition: 'all 150ms ease',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: color,
                boxShadow: `0 0 0 2px ${color}22`,
              }}
            />
            {p}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            background: '#f1f5f9',
            border: '1px solid rgba(15,23,42,0.05)',
            fontFamily: 'var(--mono)',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
