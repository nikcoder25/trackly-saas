'use client';

import { PLATFORM_COLORS } from '@/lib/constants';

export default function PlatformsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Platforms</h1>
      <p className="text-[var(--text-muted)] mb-6">Platform status and share of voice breakdown</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => (
          <div key={name} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-4 h-4 rounded-full" style={{ background: color }} />
              <h3 className="font-semibold text-white">{name}</h3>
            </div>
            <p className="text-2xl font-bold text-white">—</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">No data yet</p>
          </div>
        ))}
      </div>
    </div>
  );
}
