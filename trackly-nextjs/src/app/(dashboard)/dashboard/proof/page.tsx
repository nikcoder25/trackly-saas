'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { csvSafe } from '@/lib/csv';

interface Brand {
  id: string;
  name: string;
}

interface PromptResult {
  query: string;
  platform: string;
  model?: string;
  mentioned: boolean;
  sentiment?: string;
  position?: number;
  response?: string;
  snippet?: string;
  date?: string;
}

interface PromptRun {
  id?: string;
  date?: string;
  created_at?: string;
  allResults?: PromptResult[];
  results?: PromptResult[];
}

export default function ProofPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(0);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'mentioned' | 'not_mentioned'>('all');
  const [viewMode, setViewMode] = useState<'by_query' | 'all'>('by_query');

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
    fetch(`/api/brands/${selectedBrand.id}/prompt-runs`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const r = d.runs || d.promptRuns || [];
        setRuns(r);
        setSelectedRunIdx(r.length > 0 ? r.length - 1 : 0);
      })
      .catch(() => setRuns([]));
  }, [selectedBrand]);

  const currentRun = runs[selectedRunIdx] || null;
  const allResults: PromptResult[] = currentRun?.allResults || currentRun?.results || [];

  const platforms = useMemo(() => {
    const set = new Set<string>();
    allResults.forEach(r => { if (r.platform) set.add(r.platform); });
    return Array.from(set);
  }, [allResults]);

  const filtered = allResults.filter(r => {
    if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
    if (resultFilter === 'mentioned' && !r.mentioned) return false;
    if (resultFilter === 'not_mentioned' && r.mentioned) return false;
    return true;
  });

  const mentionedCount = allResults.filter(r => r.mentioned).length;
  const notMentionedCount = allResults.filter(r => !r.mentioned).length;
  const mentionRate = allResults.length ? Math.round((mentionedCount / allResults.length) * 100) : 0;

  const groupedByQuery = useMemo(() => {
    const groups: Record<string, PromptResult[]> = {};
    filtered.forEach(r => {
      (groups[r.query] ??= []).push(r);
    });
    return groups;
  }, [filtered]);

  function highlightBrand(text: string) {
    if (!selectedBrand || !text) return text;
    const name = selectedBrand.name;
    const regex = new RegExp(`(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part) =>
      regex.test(part)
        ? `<mark style="background:rgba(255,97,84,0.2);color:var(--text);padding:0 2px;border-radius:2px">${part}</mark>`
        : part
    ).join('');
  }

  function exportCSV() {
    if (!filtered.length) return;
    const headers = ['Query', 'Platform', 'Model', 'Mentioned', 'Sentiment', 'Position', 'Response'];
    const csvRows = [headers.join(',')];
    filtered.forEach(r => {
      csvRows.push([
        csvSafe(r.query || ''),
        csvSafe(r.platform || ''),
        csvSafe(r.model || ''),
        r.mentioned ? 'Yes' : 'No',
        r.sentiment || '',
        String(r.position ?? ''),
        csvSafe(r.response || r.snippet || ''),
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proof-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Evidence &amp; Proof</h1>
          <p className="text-[var(--muted)] mt-1">Every AI response about your brand &mdash; verified and organized.</p>
        </div>
        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:opacity-90 transition"
        >
          Export CSV
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

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={selectedRunIdx}
          onChange={e => setSelectedRunIdx(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          {runs.map((run, i) => (
            <option key={i} value={i}>
              Run {i + 1} {run.date || run.created_at ? `- ${new Date(run.date || run.created_at || '').toLocaleDateString()}` : ''}
            </option>
          ))}
          {runs.length === 0 && <option value={0}>No runs</option>}
        </select>

        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          <option value="all">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={resultFilter}
          onChange={e => setResultFilter(e.target.value as typeof resultFilter)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          <option value="all">All Results</option>
          <option value="mentioned">Mentioned</option>
          <option value="not_mentioned">Not Mentioned</option>
        </select>

        <div className="flex bg-[var(--bg2)] border border-[var(--border)] rounded-lg overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode('by_query')}
            className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'by_query' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'}`}
          >
            By Query
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'all' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'}`}
          >
            All
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="flex gap-4 mb-6 p-3 bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)]">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Total</span>
          <span className="font-mono font-bold text-[var(--text)]">{allResults.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
          <span className="text-xs text-[var(--muted)]">Mentioned</span>
          <span className="font-mono font-bold text-[var(--green)]">{mentionedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--red)]" />
          <span className="text-xs text-[var(--muted)]">Not Mentioned</span>
          <span className="font-mono font-bold text-[var(--red)]">{notMentionedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Rate</span>
          <span className={`font-mono font-bold ${mentionRate >= 50 ? 'text-[var(--green)]' : mentionRate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{mentionRate}%</span>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">No proof data available. Run queries from Brand Setup to collect AI responses.</p>
        </div>
      ) : viewMode === 'by_query' ? (
        <div className="space-y-4">
          {Object.entries(groupedByQuery).map(([query, results]) => (
            <div key={query} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <h3 className="font-semibold text-[var(--text)] mb-3">{query}</h3>
              <div className="space-y-3">
                {results.map((r, j) => (
                  <div key={j} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg)]">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[r.platform] || '#666' }} />
                        <span className="text-xs font-medium text-[var(--text)]">{r.platform}</span>
                      </span>
                      {r.model && <span className="text-xs text-[var(--muted)]">{r.model}</span>}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.mentioned ? 'bg-[rgba(16,185,129,0.1)] text-[var(--green)]' : 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]'}`}>
                        {r.mentioned ? 'Mentioned' : 'Not Mentioned'}
                      </span>
                      {r.sentiment && (
                        <span className={`text-xs ${r.sentiment === 'positive' ? 'text-[var(--green)]' : r.sentiment === 'negative' ? 'text-[var(--red)]' : 'text-[var(--muted)]'}`}>
                          {r.sentiment}
                        </span>
                      )}
                      {r.position && <span className="text-xs font-mono text-[var(--muted)]">Rank #{r.position}</span>}
                    </div>
                    {(r.response || r.snippet) && (
                      <div
                        className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: highlightBrand(r.response || r.snippet || '') }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <div key={i} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="text-sm font-medium text-[var(--text)]">{r.query}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[r.platform] || '#666' }} />
                  <span className="text-xs text-[var(--muted)]">{r.platform}</span>
                </span>
                {r.model && <span className="text-xs text-[var(--muted)]">{r.model}</span>}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.mentioned ? 'bg-[rgba(16,185,129,0.1)] text-[var(--green)]' : 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]'}`}>
                  {r.mentioned ? 'Mentioned' : 'Not Mentioned'}
                </span>
                {r.position && <span className="text-xs font-mono text-[var(--muted)]">#{r.position}</span>}
              </div>
              {(r.response || r.snippet) && (
                <div
                  className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: highlightBrand(r.response || r.snippet || '') }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
