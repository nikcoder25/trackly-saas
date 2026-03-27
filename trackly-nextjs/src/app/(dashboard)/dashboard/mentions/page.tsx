'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { csvSafe } from '@/lib/csv';

interface Mention {
  query: string;
  platform: string;
  mentioned: boolean;
  recommended?: boolean;
  sentiment?: string;
  position?: number;
  model?: string;
  date?: string;
  snippet?: string;
  response?: string;
  error?: string;
}

interface Run {
  id?: string;
  date?: string;
  created_at?: string;
  allResults?: Mention[];
  results?: Mention[];
}

interface Brand {
  id: string;
  name: string;
  mentions?: Mention[];
  runs?: Run[];
}

const ITEMS_PER_PAGE = 20;

const PLATFORM_ICONS: Record<string, string> = {
  ChatGPT: 'C',
  Perplexity: 'P',
  Claude: 'A',
  Gemini: 'G',
  Grok: 'X',
};

type FilterMode = 'all' | 'mentioned' | 'not_mentioned' | 'recommended' | 'errors';

export default function MentionsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(0);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [retryingIdx, setRetryingIdx] = useState<number | null>(null);

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

  // Set selected run index when brand changes
  useEffect(() => {
    if (selectedBrand?.runs?.length) {
      setSelectedRunIdx(selectedBrand.runs.length - 1);
    } else {
      setSelectedRunIdx(0);
    }
    setCurrentPage(1);
    setExpandedItems(new Set());
  }, [selectedBrand]);

  const runs = selectedBrand?.runs || [];
  const currentRun = runs[selectedRunIdx] || null;
  const results: Mention[] = currentRun?.allResults || currentRun?.results || selectedBrand?.mentions || [];

  // Derive unique platforms
  const platforms = useMemo(() => {
    const set = new Set<string>();
    results.forEach(m => { if (m.platform) set.add(m.platform); });
    return Array.from(set);
  }, [results]);

  // Apply all filters
  const filtered = useMemo(() => {
    return results.filter(m => {
      // Status filter
      if (filter === 'mentioned' && !m.mentioned) return false;
      if (filter === 'not_mentioned' && m.mentioned) return false;
      if (filter === 'recommended' && !m.recommended) return false;
      if (filter === 'errors' && !m.error) return false;
      // Platform filter
      if (platformFilter !== 'all' && m.platform !== platformFilter) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery = m.query?.toLowerCase().includes(q);
        const matchesPlatform = m.platform?.toLowerCase().includes(q);
        const matchesModel = m.model?.toLowerCase().includes(q);
        const matchesSnippet = m.snippet?.toLowerCase().includes(q);
        const matchesResponse = m.response?.toLowerCase().includes(q);
        if (!matchesQuery && !matchesPlatform && !matchesModel && !matchesSnippet && !matchesResponse) return false;
      }
      return true;
    });
  }, [results, filter, platformFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedItems = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedItems(new Set());
  }, [filter, platformFilter, searchQuery, selectedRunIdx]);

  // KPI counts
  const mentionedCount = results.filter(m => m.mentioned).length;
  const notMentionedCount = results.filter(m => !m.mentioned).length;
  const recommendedCount = results.filter(m => m.recommended).length;
  const errorCount = results.filter(m => m.error).length;
  const mentionRate = results.length ? Math.round((mentionedCount / results.length) * 100) : 0;

  const toggleExpand = useCallback((idx: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const copyQuery = useCallback((query: string, idx: number) => {
    navigator.clipboard.writeText(query).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }, []);

  const retryQuery = useCallback(async (mention: Mention, idx: number) => {
    if (!selectedBrand || retryingIdx !== null) return;
    setRetryingIdx(idx);
    try {
      await fetch(`/api/brands/${selectedBrand.id}/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [mention.query], platforms: [mention.platform] }),
      });
      // Reload brand data
      const res = await fetch('/api/brands', { credentials: 'include' });
      const data = await res.json();
      const b = data.brands || [];
      setBrands(b);
      const updated = b.find((br: Brand) => br.id === selectedBrand.id);
      if (updated) {
        setSelectedBrand(updated);
        if (updated.runs?.length) setSelectedRunIdx(updated.runs.length - 1);
      }
    } catch {
      // silently fail
    } finally {
      setRetryingIdx(null);
    }
  }, [selectedBrand, retryingIdx]);

  function exportCSV() {
    if (!filtered.length) return;
    const headers = ['Query', 'Platform', 'Model', 'Mentioned', 'Recommended', 'Sentiment', 'Position', 'Response', 'Error'];
    const csvRows = [headers.join(',')];
    filtered.forEach(m => {
      csvRows.push([
        csvSafe(m.query || ''),
        csvSafe(m.platform || ''),
        csvSafe(m.model || ''),
        m.mentioned ? 'Yes' : 'No',
        m.recommended ? 'Yes' : 'No',
        m.sentiment || '',
        String(m.position ?? ''),
        csvSafe(m.response || m.snippet || ''),
        csvSafe(m.error || ''),
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mentions-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Header with Export */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Mentions</h1>
          <p className="text-[var(--text-muted)] mt-1">Track AI mentions across all platforms</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!filtered.length}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </button>
      </div>

      {/* Brand selector */}
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {results.length === 0 && runs.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-muted)]">No mention data yet. Run queries from Brand Setup to see results here.</p>
        </div>
      ) : (
        <>
          {/* Run Selector */}
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

            {/* Filter dropdown */}
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as FilterMode)}
              className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
            >
              <option value="all">All Results</option>
              <option value="mentioned">Mentioned Only</option>
              <option value="not_mentioned">Not Mentioned</option>
              <option value="recommended">Recommended</option>
              <option value="errors">Errors Only</option>
            </select>

            {/* Search input */}
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search queries, platforms, models..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          {/* Platform filter chips */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              onClick={() => setPlatformFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${platformFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--primary)]'}`}
            >
              All Platforms
            </button>
            {platforms.map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(platformFilter === p ? 'all' : p)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${platformFilter === p ? 'text-white' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--primary)]'}`}
                style={platformFilter === p ? { background: PLATFORM_COLORS[p] || '#666' } : {}}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: PLATFORM_COLORS[p] || '#666' }}
                />
                {p}
                <span className="opacity-70">
                  ({results.filter(m => m.platform === p).length})
                </span>
              </button>
            ))}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Total Results</p>
              <p className="text-xl font-bold text-[var(--text)]">{results.length}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Mentioned</p>
              <p className="text-xl font-bold text-[var(--green)]">{mentionedCount}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Not Mentioned</p>
              <p className="text-xl font-bold text-[var(--red)]">{notMentionedCount}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Recommended</p>
              <p className="text-xl font-bold text-[var(--primary)]">{recommendedCount}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Mention Rate</p>
              <p className="text-xl font-bold" style={{ color: mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--amber)' : 'var(--red)' }}>{mentionRate}%</p>
            </div>
          </div>

          {/* Results list */}
          {paginatedItems.length === 0 ? (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
              <p className="text-[var(--text-muted)]">No results match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedItems.map((m, i) => {
                const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + i;
                const isExpanded = expandedItems.has(globalIdx);
                const hasDetail = m.response || m.snippet || m.error;

                return (
                  <div key={globalIdx} className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg overflow-hidden">
                    {/* Main row */}
                    <div
                      className={`p-4 flex items-center gap-3 ${hasDetail ? 'cursor-pointer hover:bg-[var(--bg)]' : ''} transition`}
                      onClick={() => hasDetail && toggleExpand(globalIdx)}
                    >
                      {/* Platform icon */}
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: PLATFORM_COLORS[m.platform] || '#666' }}
                        title={m.platform}
                      >
                        {PLATFORM_ICONS[m.platform] || m.platform?.charAt(0) || '?'}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] font-medium truncate">{m.query}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-[var(--text-muted)]">{m.platform}</span>
                          {m.model && (
                            <span className="text-xs text-[var(--text-muted)]">{m.model}</span>
                          )}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Found/Not Found badge */}
                        {m.error ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[rgba(239,68,68,0.1)] text-[var(--red)]">
                            Error
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.mentioned ? 'bg-[rgba(16,185,129,0.1)] text-[var(--green)]' : 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]'}`}>
                            {m.mentioned ? 'Found' : 'Not Found'}
                          </span>
                        )}

                        {/* Sentiment badge */}
                        {m.sentiment && !m.error && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            m.sentiment === 'positive' ? 'bg-[rgba(16,185,129,0.1)] text-[var(--green)]' :
                            m.sentiment === 'negative' ? 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]' :
                            'bg-[rgba(107,114,128,0.1)] text-[var(--text-muted)]'
                          }`}>
                            {m.sentiment.charAt(0).toUpperCase() + m.sentiment.slice(1)}
                          </span>
                        )}

                        {/* Recommended badge */}
                        {m.recommended && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[rgba(139,92,246,0.1)] text-[#8b5cf6]">
                            Recommended
                          </span>
                        )}

                        {/* Position */}
                        {m.position && (
                          <span className="text-xs font-mono text-[var(--text-muted)]">#{m.position}</span>
                        )}

                        {/* Expand indicator */}
                        {hasDetail && (
                          <svg
                            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && hasDetail && (
                      <div className="border-t border-[var(--border)] p-4 bg-[var(--bg)]">
                        {m.error ? (
                          <div className="text-sm text-[var(--red)] bg-[rgba(239,68,68,0.05)] rounded-lg p-3 mb-3">
                            <span className="font-medium">Error:</span> {m.error}
                          </div>
                        ) : (
                          <div className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap bg-[var(--bg2)] rounded-lg p-3 mb-3 max-h-[400px] overflow-y-auto">
                            {m.response || m.snippet || ''}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyQuery(m.query, globalIdx); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--primary)] transition flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            {copiedIdx === globalIdx ? 'Copied!' : 'Copy Query'}
                          </button>

                          {m.error && (
                            <button
                              onClick={(e) => { e.stopPropagation(); retryQuery(m, globalIdx); }}
                              disabled={retryingIdx !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <svg className={`w-3.5 h-3.5 ${retryingIdx === globalIdx ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              {retryingIdx === globalIdx ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs text-[var(--text-muted)]">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} results
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .reduce<(number | string)[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-xs text-[var(--text-muted)]">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition ${currentPage === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)]'}`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
