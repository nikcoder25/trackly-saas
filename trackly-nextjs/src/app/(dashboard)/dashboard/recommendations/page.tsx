'use client';

import { useState, useEffect } from 'react';

interface Brand {
  id: string;
  name: string;
}

interface Recommendation {
  id?: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  category?: string;
  action_items?: string[];
  platform?: string;
  created_at?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--red)',
  high: 'var(--amber)',
  medium: 'var(--primary)',
  low: 'var(--muted)',
};

const SEVERITY_BG: Record<string, string> = {
  critical: 'rgba(239,68,68,0.1)',
  high: 'rgba(245,158,11,0.1)',
  medium: 'rgba(255,97,84,0.1)',
  low: 'rgba(156,163,175,0.1)',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  dismissed: 'Dismissed',
};

export default function RecommendationsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) setSelectedBrand(b[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetchRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand]);

  function fetchRecommendations() {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
    })
      .then(r => r.json())
      .then(d => setRecommendations(d.recommendations || []))
      .catch(() => setRecommendations([]));
  }

  function handleGenerate() {
    if (!selectedBrand || generating) return;
    setGenerating(true);
    fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    })
      .then(r => r.json())
      .then(d => {
        setRecommendations(d.recommendations || []);
        setGenerating(false);
      })
      .catch(() => setGenerating(false));
  }

  const filtered = recommendations.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
    return true;
  });

  const total = recommendations.length;
  const critical = recommendations.filter(r => r.severity === 'critical').length;
  const high = recommendations.filter(r => r.severity === 'high').length;
  const completed = recommendations.filter(r => r.status === 'completed').length;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Recommendations</h1>
          <p className="text-[var(--muted)] mt-1">AI-powered suggestions to improve your visibility across all platforms.</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:opacity-90 transition disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate Recommendations'}
        </button>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Total</p>
          <p className="text-2xl font-bold font-mono text-[var(--text)]">{total}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Critical</p>
          <p className="text-2xl font-bold font-mono text-[var(--red)]">{critical}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">High</p>
          <p className="text-2xl font-bold font-mono text-[var(--amber)]">{high}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Completed</p>
          <p className="text-2xl font-bold font-mono text-[var(--green)]">{completed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Recommendation Cards */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">
            {recommendations.length === 0
              ? 'No recommendations yet. Click "Generate Recommendations" to get AI-powered suggestions.'
              : 'No recommendations match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rec, i) => (
            <div key={rec.id || i} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold uppercase"
                    style={{ color: SEVERITY_COLORS[rec.severity], background: SEVERITY_BG[rec.severity] }}
                  >
                    {rec.severity}
                  </span>
                  <h3 className="font-semibold text-[var(--text)]">{rec.title}</h3>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-[var(--bg3)] text-[var(--muted)] border border-[var(--border)]">
                  {STATUS_LABELS[rec.status] || rec.status}
                </span>
              </div>
              <p className="text-sm text-[var(--muted)] mb-3">{rec.description}</p>
              {rec.category && (
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-[var(--bg3)] text-[var(--muted)] mr-2 mb-2">
                  {rec.category}
                </span>
              )}
              {rec.platform && (
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-[var(--bg3)] text-[var(--muted)] mr-2 mb-2">
                  {rec.platform}
                </span>
              )}
              {rec.action_items && rec.action_items.length > 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">Action Items</p>
                  <ul className="space-y-1">
                    {rec.action_items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-[var(--text)]">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
