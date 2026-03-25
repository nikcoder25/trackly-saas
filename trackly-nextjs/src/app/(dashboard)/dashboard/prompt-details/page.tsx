'use client';

import { useState, useEffect } from 'react';

interface PromptRun { id: string; query: string; platform: string; model?: string; mentioned: boolean; sentiment?: string; recommended?: boolean; rank?: number; response?: string; date: string; }

export default function PromptDetailsPage() {
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuery, setSelectedQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState('30');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands?.[0];
        if (b) {
          if (b.queries) setQueries(b.queries);
          return fetch(`/api/brands/${b.id}/prompt-runs?days=${daysFilter}`, { credentials: 'include' });
        }
        setLoading(false);
      })
      .then(r => r?.json())
      .then(d => { if (d?.runs) setRuns(d.runs); setLoading(false); })
      .catch(() => setLoading(false));
  }, [daysFilter]);

  const filtered = runs.filter(r =>
    (!selectedQuery || r.query === selectedQuery) &&
    (!platformFilter || r.platform === platformFilter)
  );

  const platforms = [...new Set(runs.map(r => r.platform))];
  const totalMentions = filtered.filter(r => r.mentioned).length;
  const mentionRate = filtered.length ? Math.round((totalMentions / filtered.length) * 100) : 0;
  const positiveSentiment = filtered.filter(r => r.sentiment === 'positive').length;
  const recommended = filtered.filter(r => r.recommended).length;

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Prompt Details</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">Deep analytics for each tracked query &mdash; visibility, sentiment, competitors, and trends per platform.</p>
        </div>
        <button className="px-4 py-2 bg-[var(--bg3)] border border-[var(--border)] text-[var(--muted)] text-xs font-semibold rounded-md hover:border-[var(--primary)] hover:text-[var(--primary)] transition">Export CSV</button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">Query</label>
          <select value={selectedQuery} onChange={e => setSelectedQuery(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-xs px-2.5 py-[5px] rounded-md focus:border-[var(--primary)] focus:outline-none min-w-[200px]">
            <option value="">All Queries</option>
            {queries.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">Platform</label>
          <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-xs px-2.5 py-[5px] rounded-md focus:border-[var(--primary)] focus:outline-none">
            <option value="">All Platforms</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">Period</label>
          <select value={daysFilter} onChange={e => setDaysFilter(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-xs px-2.5 py-[5px] rounded-md focus:border-[var(--primary)] focus:outline-none">
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <div className="ml-auto text-[11px] text-[var(--muted)] font-mono self-end pb-1">{filtered.length} runs</div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        <MetricCard label="Mention Rate" value={`${mentionRate}%`} color={mentionRate >= 50 ? 'var(--green)' : 'var(--amber)'} />
        <MetricCard label="Total Runs" value={String(filtered.length)} />
        <MetricCard label="Positive Sentiment" value={String(positiveSentiment)} color="var(--green)" />
        <MetricCard label="Recommended" value={String(recommended)} color="var(--primary)" />
      </div>

      {/* Prompt Classification */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Prompt Classification</div>
        <div className="flex gap-5 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Search Intent</label>
            <select className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-2.5 py-2 rounded-md">
              <option value="">— Select —</option>
              <option>Awareness</option><option>Comparison</option><option>Commercial Investigation</option><option>Navigational</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Funnel Stage</label>
            <select className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-2.5 py-2 rounded-md">
              <option value="">— Select —</option>
              <option>Awareness (TOFU)</option><option>Consideration (MOFU)</option><option>Decision (BOFU)</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Tags</label>
            <input placeholder="Comma-separated tags" className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-2.5 py-2 rounded-md" />
          </div>
          <button className="self-end px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md shrink-0">Save</button>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Recent Query Runs</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted)] text-sm">No prompt data yet. Run queries first.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.slice(0, 50).map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--bg3)] transition text-sm">
                <span className="text-[var(--muted)] text-xs font-mono w-[100px] shrink-0">{new Date(r.date).toLocaleDateString()}</span>
                <span className="font-medium text-[var(--text)] flex-1 truncate">{r.query}</span>
                <span className="text-xs font-bold" style={{ color: r.mentioned ? 'var(--green)' : 'var(--red)' }}>{r.mentioned ? 'FOUND' : 'NOT FOUND'}</span>
                <span className="text-[11px] text-[var(--muted)]">{r.platform}</span>
                {r.sentiment && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.sentiment === 'positive' ? 'bg-[rgba(16,185,129,.08)] text-[var(--green)]' : r.sentiment === 'negative' ? 'bg-[rgba(239,68,68,.06)] text-[var(--red)]' : 'bg-[var(--bg3)] text-[var(--muted)]'}`}>{r.sentiment}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
      <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-lg font-extrabold font-mono mt-1" style={{ color: color || 'var(--text)' }}>{value}</p>
    </div>
  );
}
