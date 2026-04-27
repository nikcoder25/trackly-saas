'use client';

/**
 * Tiny overlapping-avatar stack for the Brands KPI tile. Each avatar
 * is a colored circle with the brand's first initial; colors are
 * derived deterministically from the name so the stack is stable
 * across renders.
 *
 * Visually overlaps left-to-right with a 1.5px white ring on each
 * avatar so the stack reads cleanly against any panel tint. A "+N"
 * pill appears when the stack overflows.
 */
const AVATAR_PALETTE = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#3b82f6', // blue
  '#14b8a6', // teal
];

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

interface AvatarStackProps {
  brands: Array<{ id: string; name: string }>;
  maxVisible?: number;
  size?: number;
}

export default function AvatarStack({
  brands,
  maxVisible = 4,
  size = 28,
}: AvatarStackProps) {
  if (!brands.length) {
    return <span style={{ fontSize: 13, color: '#94a3b8' }}>—</span>;
  }
  const visible = brands.slice(0, maxVisible);
  const overflow = Math.max(0, brands.length - maxVisible);
  const overlap = Math.round(size * 0.32); // amount each avatar tucks under the prior one

  return (
    <div
      style={{ display: 'flex', alignItems: 'center' }}
      aria-label={`Brands: ${brands.map((b) => b.name).join(', ')}`}
    >
      {visible.map((b, i) => {
        const color = hashColor(b.id || b.name);
        const initial = (b.name || '?').trim().charAt(0).toUpperCase() || '?';
        return (
          <div
            key={b.id || b.name + i}
            title={b.name}
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -overlap,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${color}, ${color}cc)`,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.max(10, Math.round(size * 0.42)),
              fontWeight: 700,
              fontFamily: 'var(--font)',
              boxShadow: '0 0 0 2px #ffffff, 0 1px 3px rgba(15,23,42,0.12)',
              zIndex: visible.length - i,
              userSelect: 'none',
            }}
            aria-hidden="true"
          >
            {initial}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: -overlap,
            height: size,
            minWidth: size,
            padding: '0 8px',
            borderRadius: 999,
            background: '#eef2ff',
            color: '#4338ca',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--mono)',
            boxShadow: '0 0 0 2px #ffffff, 0 1px 3px rgba(15,23,42,0.08)',
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
