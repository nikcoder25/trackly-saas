'use client';

export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
      <p className="text-[var(--text-muted)] mb-6">Detailed analytics and query performance</p>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-[var(--text-muted)]">Analytics will populate after your first brand tracking run.</p>
      </div>
    </div>
  );
}
