'use client';

/* ── Skeleton loading primitives ── */

export function SkeletonBox({ w, h, r = 8 }: { w?: string | number; h?: string | number; r?: number }) {
  return (
    <div style={{
      width: w || '100%', height: h || 16, borderRadius: r,
      background: 'linear-gradient(90deg, var(--bg3) 25%, var(--bg4, #e5e7eb) 50%, var(--bg3) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease infinite',
    }} />
  );
}

export function SkeletonText({ lines = 1, w }: { lines?: number; w?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox key={i} h={12} w={i === lines - 1 && lines > 1 ? '60%' : (w || '100%')} r={4} />
      ))}
    </div>
  );
}

/* ── Page-level skeleton layouts ── */

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)`, gap: 14, marginBottom: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
          <SkeletonBox h={10} w={80} r={4} />
          <div style={{ marginTop: 10 }}><SkeletonBox h={28} w={60} r={6} /></div>
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <SkeletonBox w={32} h={32} r={8} />
            <div style={{ flex: 1 }}>
              <SkeletonBox h={14} w="60%" r={4} />
              <div style={{ marginTop: 6 }}><SkeletonBox h={10} w="40%" r={4} /></div>
            </div>
          </div>
          <SkeletonBox h={6} r={99} />
          <div style={{ marginTop: 16 }}>
            <SkeletonText lines={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '14px 18px', borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBox key={i} h={10} w={i === 0 ? '80%' : '60%'} r={4} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonBox key={ci} h={12} w={ci === 0 ? '90%' : '50%'} r={4} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ h = 280 }: { h?: number }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
      <SkeletonBox h={14} w={160} r={4} />
      <div style={{ marginTop: 20 }}>
        <SkeletonBox h={h} r={8} />
      </div>
    </div>
  );
}

/* Shimmer animation — injected globally once */
export function SkeletonStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  );
}
