'use client';

export default function CompetitorsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Competitors</h1>
      <p className="text-[var(--text-muted)] mb-6">Monitor competitor mentions and co-occurrence</p>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-[var(--text-muted)]">Competitor analysis will be available after query runs with competitor tracking enabled.</p>
      </div>
    </div>
  );
}
