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
  const [perPage, setPerPage] = useState(15);

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

  const totalPagesCalc = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Highlight brand name in response text
  function highlightBrand(text: string): string {
    if (!selectedBrand || !text) return text;
    const name = selectedBrand.name;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark style="background:rgba(255,97,84,.15);color:var(--primary);padding:1px 4px;border-radius:3px;font-weight:600">$1</mark>');
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      {/* Header */}
      <div className="mt-header">
        <div>
          <div className="mt-title">AI Mentions</div>
          <div className="mt-subtitle">Track how AI platforms mention your brand across all queries.</div>
        </div>
        <div className="mt-header-right">
          <select className="mt-run-sel" value={selectedRunIdx} onChange={e => setSelectedRunIdx(Number(e.target.value))}>
            {runs.map((run, i) => (
              <option key={i} value={i}>
                {run.date ? new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `Run ${i + 1}`} · SOV
              </option>
            ))}
            {runs.length === 0 && <option value={0}>No runs</option>}
          </select>
          <button className="mt-btn-export" onClick={exportCSV} disabled={!filtered.length}>↓ Export</button>
        </div>
      </div>

      {results.length === 0 && runs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)' }}>No mention data yet. Run queries from Brand Setup to see results here.</p>
        </div>
      ) : (
        <>
          {/* KPI Score Cards */}
          <div className="mt-scores">
            <div className="mt-score">
              <div className="mt-score-ring">
                <svg viewBox="0 0 60 60" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                  <circle cx="30" cy="30" r="24" fill="none" stroke="var(--bg3)" strokeWidth="5" />
                  <circle cx="30" cy="30" r="24" fill="none" stroke={mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--primary)' : 'var(--bg4)'} strokeWidth="5" strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - mentionRate / 100)} strokeLinecap="round" />
                </svg>
                <span className="mt-score-pct" style={{ color: mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--primary)' : 'var(--muted)' }}>{mentionRate}%</span>
              </div>
              <div>
                <div className="mt-score-title">Mention Rate</div>
              </div>
            </div>
            <div className="mt-score">
              <div className="mt-score-ring">
                <svg viewBox="0 0 60 60" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                  <circle cx="30" cy="30" r="24" fill="none" stroke="var(--bg3)" strokeWidth="5" />
                  <circle cx="30" cy="30" r="24" fill="none" stroke="var(--green)" strokeWidth="5" strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - (results.length > 0 ? mentionedCount / results.length : 0))} strokeLinecap="round" />
                </svg>
                <span className="mt-score-pct">{mentionedCount}/{results.length}</span>
              </div>
              <div>
                <div className="mt-score-title">Found / Total</div>
              </div>
            </div>
            <div className="mt-score">
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{platforms.length}</div>
              <div><div className="mt-score-title">Platforms</div></div>
            </div>
            <div className="mt-score">
              <div className="mt-score-ring">
                <svg viewBox="0 0 60 60" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                  <circle cx="30" cy="30" r="24" fill="none" stroke="var(--bg3)" strokeWidth="5" />
                  <circle cx="30" cy="30" r="24" fill="none" stroke="var(--primary)" strokeWidth="5" strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - (results.length > 0 ? recommendedCount / results.length : 0))} strokeLinecap="round" />
                </svg>
                <span className="mt-score-pct" style={{ color: 'var(--primary)' }}>{results.length > 0 ? Math.round(recommendedCount / results.length * 100) : 0}%</span>
              </div>
              <div>
                <div className="mt-score-title">Recommended</div>
              </div>
            </div>
          </div>

          {/* Platform Filter Chips */}
          <div className="mt-filterbar">
            <div className="mt-platforms">
              <button className={`mt-chip ${platformFilter === 'all' ? 'mt-chip-active' : ''}`} onClick={() => setPlatformFilter('all')} style={platformFilter === 'all' ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}>All</button>
              {platforms.map(p => (
                <button key={p} className={`mt-chip ${platformFilter === p ? 'mt-chip-active' : ''}`} onClick={() => setPlatformFilter(platformFilter === p ? 'all' : p)}>
                  {p} <span className="mt-chip-n">{results.filter(m => m.platform === p).length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Filter Controls */}
          <div className="mt-filterbar" style={{ marginBottom: 0 }}>
            <div className="mt-filter-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <select className="mt-sel" value={filter} onChange={e => setFilter(e.target.value as FilterMode)}>
                <option value="all">All Results</option>
                <option value="mentioned">Mentioned Only</option>
                <option value="not_mentioned">Not Mentioned</option>
                <option value="recommended">Recommended</option>
                <option value="errors">Errors Only</option>
              </select>
              <input className="mt-search" type="text" placeholder="Filter by keyword..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          {/* Results Table */}
          <div style={{ marginTop: 16 }}>
            {paginated.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--muted)' }}>No results match your filters.</p>
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 80px', gap: 0, padding: '10px 18px', borderBottom: '2px solid var(--border)', background: 'var(--bg)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  <div>Platform</div>
                  <div>Query</div>
                  <div>Status</div>
                  <div>Sentiment</div>
                  <div>Position</div>
                </div>

                {/* Table Rows */}
                {paginated.map((m, i) => {
                  const globalIdx = (currentPage - 1) * perPage + i;
                  const isExpanded = expandedItems.has(globalIdx);
                  return (
                    <div key={globalIdx} className={`mt-item ${isExpanded ? 'mt-item-open' : ''}`} style={{ borderLeftColor: PLATFORM_COLORS[m.platform] || 'var(--border)' }}>
                      {/* Main Row */}
                      <div className="mt-item-main" onClick={() => toggleExpand(globalIdx)}>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 80px', gap: 0, alignItems: 'center', width: '100%' }}>
                          {/* Platform */}
                          <div className="mt-item-pname" style={{ color: PLATFORM_COLORS[m.platform] || 'var(--text)' }}>{m.platform}</div>
                          {/* Query */}
                          <div className="mt-item-query">{m.query}</div>
                          {/* Status */}
                          <div>
                            {m.error ? (
                              <span className="mt-tag mt-tag-err">ERROR</span>
                            ) : m.mentioned ? (
                              <span className="mt-tag mt-tag-yes">FOUND</span>
                            ) : (
                              <span className="mt-tag mt-tag-no">NOT FOUND</span>
                            )}
                          </div>
                          {/* Sentiment */}
                          <div style={{ fontSize: 12, color: m.sentiment === 'positive' ? 'var(--green)' : m.sentiment === 'negative' ? 'var(--red)' : 'var(--muted)' }}>
                            {m.sentiment ? m.sentiment.charAt(0).toUpperCase() + m.sentiment.slice(1) : '—'}
                          </div>
                          {/* Position */}
                          <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                            {m.position ? `#${m.position}` : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Detail — shows full AI response with brand name highlighted */}
                      {isExpanded && (
                        <div className="mt-detail">
                          <div className="mt-detail-body">
                            {m.error ? (
                              <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'rgba(239,68,68,.05)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(239,68,68,.15)' }}>Error: {m.error}</div>
                            ) : (m.response || m.snippet) ? (
                              <div className="mt-detail-text" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 16, fontSize: 13, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}
                                dangerouslySetInnerHTML={{ __html: highlightBrand(m.response || m.snippet || '') }}
                              />
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: 12 }}>No response text available.</div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 12, paddingLeft: 16 }}>
                              Model: {m.model || '—'} · Position: {m.position || '—'} · Sentiment: {m.sentiment || 'neutral'} · Recommended: {m.recommended ? 'Yes' : 'No'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Pagination */}
                <div className="mt-pager">
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                    Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} of {filtered.length} results
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Show:</span>
                    {[15, 25, 50, 100].map(n => (
                      <button key={n} className={`mt-pg ${perPage === n ? 'mt-pg-cur' : ''}`} onClick={() => { setPerPage(n); setCurrentPage(1); }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="mt-pg" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
                    <button className="mt-pg" disabled={currentPage >= totalPagesCalc} onClick={() => setCurrentPage(p => p + 1)}>›</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
