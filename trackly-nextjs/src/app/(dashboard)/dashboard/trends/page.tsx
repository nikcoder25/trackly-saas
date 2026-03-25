'use client';

export default function TrendsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Trends</h1>
      <p className="text-[var(--text-muted)] mb-6">Share of Voice trends over time</p>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-[var(--text-muted)]">Trend charts will appear after multiple query runs.</p>
      </div>
    </div>
  );
}
