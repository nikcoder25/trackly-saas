'use client';

export default function MentionsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Mentions</h1>
      <p className="text-[var(--text-muted)] mb-6">Track AI mentions across all platforms</p>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-[var(--text-muted)]">Mentions view will be available after brand setup and first query run.</p>
      </div>
    </div>
  );
}
