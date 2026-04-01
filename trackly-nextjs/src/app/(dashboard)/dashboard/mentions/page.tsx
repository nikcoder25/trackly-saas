'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { csvSafe } from '@/lib/csv';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';

interface Mention { query: string; platform: string; mentioned: boolean; recommended?: boolean; sentiment?: string; position?: number; model?: string; date?: string; snippet?: string; response?: string; error?: string; raw?: string; context?: string; listPosition?: number; errorMessage?: string; }
interface Run { id?: string; date?: string; created_at?: string; time?: string; sov?: number; allResults?: Mention[]; results?: Mention[]; }
interface Brand { id: string; name: string; mentions?: Mention[]; runs?: Run[]; }
type FilterMode = 'all' | 'mentioned' | 'not_mentioned' | 'recommended' | 'errors';

export default function MentionsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(15);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(async (d) => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) {
          // Fetch full brand data (unstripped) for complete AI response text
          try {
            const fullRes = await fetch(`/api/brands/${b[0].id}`, { credentials: 'include' });
            const fullData = await fullRes.json();
            setSelectedBrand(fullData.brand || b[0]);
          } catch {
            setSelectedBrand(b[0]);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const runs = useMemo(() => (selectedBrand?.runs || []).slice().reverse(), [selectedBrand]);
  useEffect(() => { if (runs.length && !selectedRunId) setSelectedRunId(runs[0].id || '0'); }, [runs, selectedRunId]);

  const currentRun = useMemo(() => {
    if (!selectedRunId) return runs[0] || null;
    return (selectedBrand?.runs || []).find(r => r.id === selectedRunId) || runs[0] || null;
  }, [selectedRunId, runs, selectedBrand]);

  const all: Mention[] = currentRun?.allResults || currentRun?.results || [];

  const platformCounts = useMemo(() => {
    const pc: Record<string, { t: number; f: number }> = {};
    all.forEach(r => { if (!pc[r.platform]) pc[r.platform] = { t: 0, f: 0 }; pc[r.platform].t++; if (r.mentioned) pc[r.platform].f++; });
    return pc;
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter(r => {
      if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
      if (filter === 'mentioned' && !r.mentioned) return false;
      if (filter === 'not_mentioned' && (r.mentioned || r.error)) return false;
      if (filter === 'recommended' && !r.recommended) return false;
      if (filter === 'errors' && !r.error) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${r.platform} ${r.query} ${r.response || r.raw || r.context || r.snippet || ''} ${r.model || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, platformFilter, filter, searchQuery]);

  useEffect(() => { setPage(0); setExpandedRow(null); }, [filter, platformFilter, searchQuery, selectedRunId]);

  // Stats based on filtered results so they update when filters change
  const statsSource = platformFilter !== 'all' || filter !== 'all' || searchQuery.trim() ? filtered : all;
  const ok = statsSource.filter(r => !r.error);
  const found = statsSource.filter(r => r.mentioned);
  const rec = statsSource.filter(r => r.recommended);
  const sovPct = ok.length ? Math.round(found.length / ok.length * 100) : 0;
  const recPct = ok.length ? Math.round(rec.length / ok.length * 100) : 0;

  const effectivePerPage = perPage === 0 ? filtered.length : perPage;
  const totalPages = effectivePerPage > 0 ? Math.ceil(filtered.length / effectivePerPage) : 1;
  const from = page * effectivePerPage;
  const slice = filtered.slice(from, from + effectivePerPage);

  function highlightBrand(text: string): string {
    if (!selectedBrand || !text) return escHtml(text);
    const escaped = escHtml(selectedBrand.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'),
      '<mark style="background:rgba(16,185,129,.12);color:var(--green);border-radius:3px;padding:1px 4px;">$1</mark>');
  }
  function escHtml(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function exportCSV() {
    if (!filtered.length) return;
    const rows = [['Platform','Model','Query','Status','Sentiment','Recommended','Response Preview'].join(',')];
    filtered.forEach(m => {
      const preview = (m.response || m.raw || m.context || m.snippet || '').replace(/[\n\r]/g,' ').substring(0, 300);
      rows.push([csvSafe(m.platform), csvSafe(m.model||''), csvSafe(m.query), m.error?'ERROR':m.mentioned?'Found':'Not Found', m.sentiment||'neutral', m.recommended?'Yes':'No', csvSafe(preview)].join(','));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `livesov-mentions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0' }}><div style={{ width:32,height:32,border:'2px solid var(--primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite' }}/></div>;

  return (
    <div>
      <LockedBrandBanner />
      {/* Header — exact match */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4 }}>
        <div>
          <div className="view-title">AI Mentions</div>
          <div className="view-sub">Track how AI platforms mention your brand across all queries.</div>
        </div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <select className="brand-select" style={{ width:210,margin:0,fontSize:11 }} value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)}>
            {runs.map((r, i) => {
              const d = new Date(r.time || r.date || 0);
              const label = isNaN(d.getTime()) ? `Run ${i+1}` : `${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}, ${d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · SOV`;
              return <option key={r.id || i} value={r.id || String(i)}>{label}</option>;
            })}
            {runs.length === 0 && <option value="">No runs yet</option>}
          </select>
          <button className="pbtn" onClick={exportCSV} disabled={!filtered.length}>↓ Export</button>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ textAlign:'center',padding:48 }}>
          <div style={{ fontSize:36,opacity:.4,marginBottom:12 }}>◎</div>
          <div style={{ fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:6 }}>No Mentions Yet</div>
          <p style={{ color:'var(--muted)',fontSize:13,maxWidth:360,margin:'0 auto 16px' }}>Run queries to start tracking how AI platforms mention your brand.</p>
          <a href="/dashboard" style={{ display:'inline-block',background:'var(--primary)',color:'#fff',padding:'8px 20px',borderRadius:'var(--radius-xs)',fontSize:12,fontWeight:700,textDecoration:'none' }}>Go to Overview</a>
        </div>
      ) : (
        <>
          {/* KPI Cards — 4 score cards */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:16 }}>
            <div className="stat-card" style={{ textAlign:'center' }}>
              <div style={{ fontSize:24,fontWeight:800,fontFamily:'var(--mono)',color:'var(--green)' }}>{sovPct}%</div>
              <div style={{ fontSize:10,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginTop:4 }}>Mention Rate</div>
            </div>
            <div className="stat-card" style={{ textAlign:'center' }}>
              <div style={{ fontSize:24,fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)' }}>{found.length}/{ok.length}</div>
              <div style={{ fontSize:10,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginTop:4 }}>Found / Total</div>
            </div>
            <div className="stat-card" style={{ textAlign:'center' }}>
              <div style={{ fontSize:24,fontWeight:800,fontFamily:'var(--mono)',color:'var(--blue)' }}>{Object.keys(platformCounts).length}</div>
              <div style={{ fontSize:10,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginTop:4 }}>Platforms</div>
            </div>
            <div className="stat-card" style={{ textAlign:'center' }}>
              <div style={{ fontSize:24,fontWeight:800,fontFamily:'var(--mono)',color:'var(--purple)' }}>{recPct}%</div>
              <div style={{ fontSize:10,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginTop:4 }}>Recommended</div>
            </div>
          </div>

          {/* Platform filter chips */}
          <div style={{ display:'flex',gap:5,marginBottom:14,flexWrap:'wrap' }}>
            <span className={`plat-filter ${platformFilter==='all'?'active-filter':''}`} onClick={()=>{setPlatformFilter('all');}} style={{ cursor:'pointer' }}>All</span>
            {Object.keys(PLATFORM_COLORS).map(p => {
              const c = platformCounts[p];
              return <span key={p} className={`plat-filter ${platformFilter===p?'active-filter':''}`} onClick={()=>setPlatformFilter(platformFilter===p?'all':p)} style={{ cursor:'pointer', opacity: c?.t ? 1 : 0.45 }}>{p}</span>;
            })}
          </div>

          {/* Filter + search */}
          <div style={{ display:'flex',gap:8,marginBottom:14,alignItems:'center' }}>
            <select className="brand-select" style={{ width:140,margin:0 }} value={filter} onChange={e=>setFilter(e.target.value as FilterMode)}>
              <option value="all">All Results</option>
              <option value="mentioned">Mentioned Only</option>
              <option value="not_mentioned">Not Mentioned</option>
              <option value="recommended">Recommended</option>
              <option value="errors">Errors Only</option>
            </select>
            <input className="brand-select" type="text" placeholder="Filter by keyword..." style={{ width:160,margin:0 }} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
          </div>

          {/* Results Table — matches legacy exactly */}
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign:'center',padding:48 }}>
              <div style={{ fontSize:36,opacity:.4,marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:6 }}>No Matching Results</div>
              <p style={{ color:'var(--muted)',fontSize:13 }}>Try adjusting your filters to see more results.</p>
            </div>
          ) : (
            <div className="card" style={{ padding:0,overflow:'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:600 }}>
                <thead>
                  <tr style={{ background:'var(--bg3)' }}>
                    <th className="th" style={{ width:'14%' }}>Platform</th>
                    <th className="th">Query</th>
                    <th className="th" style={{ width:'12%' }}>Status</th>
                    <th className="th" style={{ width:'12%' }}>Sentiment</th>
                    <th className="th" style={{ width:'8%' }}>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((r, i) => {
                    const globalIdx = from + i;
                    const isExpanded = expandedRow === globalIdx;
                    const responseText = r.response || r.raw || r.context || r.snippet || '';
                    const posLabel = r.mentioned && (r.listPosition || r.position) ? `#${r.listPosition || r.position}` : '—';
                    const sentColor = r.sentiment === 'positive' ? 'var(--green)' : r.sentiment === 'negative' ? 'var(--red)' : 'var(--muted)';

                    return (
                      <>
                        <tr key={globalIdx} className="trow" style={{ cursor: responseText || r.error ? 'pointer' : 'default' }} onClick={() => { if (responseText || r.error) setExpandedRow(isExpanded ? null : globalIdx); }}>
                          <td className="td" style={{ color: PLATFORM_COLORS[r.platform] || '#888', fontWeight:700 }}>{r.platform}</td>
                          <td className="td">{r.query}</td>
                          <td className="td">{r.error ? <span style={{ color:'var(--amber)',fontFamily:'var(--mono)',fontSize:10,fontWeight:700 }}>ERROR</span> : r.mentioned ? <span className="status-found">FOUND</span> : <span className="status-notfound">NOT FOUND</span>}</td>
                          <td className="td">{!r.mentioned && !r.error ? '—' : <span style={{ color: sentColor }}>{r.sentiment ? r.sentiment.charAt(0).toUpperCase()+r.sentiment.slice(1) : '—'}</span>}</td>
                          <td className="td">{posLabel}</td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${globalIdx}-detail`}>
                            <td colSpan={5} style={{ padding:0 }}>
                              <div style={{ padding:16,background:'var(--bg)',borderTop:'1px solid var(--bg3)' }}>
                                {r.error ? (
                                  <div style={{ fontSize:12,color:'var(--red)',padding:12,background:'rgba(239,68,68,.05)',borderRadius:'var(--radius-xs)',border:'1px solid rgba(239,68,68,.15)' }}>
                                    {r.errorMessage || r.error}
                                  </div>
                                ) : (
                                  <div style={{ background:'var(--bg3)',padding:14,borderRadius:'var(--radius-xs)',fontSize:12,color:'var(--text)',lineHeight:1.7,borderLeft:`3px solid ${r.mentioned ? 'var(--green)' : 'var(--red)'}`,whiteSpace:'pre-wrap' }}
                                    dangerouslySetInnerHTML={{ __html: highlightBrand(responseText) }} />
                                )}
                                <div style={{ marginTop:8,fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)' }}>
                                  Model: {r.model || '—'} · Position: {posLabel} · Sentiment: {r.sentiment || 'neutral'} · Recommended: {r.recommended ? 'Yes' : 'No'}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Pagination — matches legacy exactly */}
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',flexWrap:'wrap',gap:8 }}>
            <div style={{ fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)' }}>
              Showing {from+1}–{Math.min(from + effectivePerPage, filtered.length)} of {filtered.length} results
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <span style={{ fontSize:11,color:'var(--muted)' }}>Show:</span>
              {[15, 25, 50, 100].map(n => (
                <button key={n} onClick={() => { setPerPage(n); setPage(0); setExpandedRow(null); }}
                  style={{ padding:'4px 10px',border:`1px solid ${perPage===n?'var(--primary)':'var(--border)'}`,background:perPage===n?'var(--primary)':'var(--bg2)',color:perPage===n?'#fff':'var(--muted)',fontFamily:'var(--mono)',fontSize:10,fontWeight:600,cursor:'pointer',borderRadius:'var(--radius-xs)' }}>{n}</button>
              ))}
            </div>
          </div>

          {/* Page numbers */}
          {totalPages > 1 && (
            <div style={{ display:'flex',justifyContent:'center',gap:4,marginTop:4 }}>
              {page > 0 && <button className="pbtn" onClick={() => { setPage(p => p-1); setExpandedRow(null); }}>‹</button>}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const ps = Math.max(0, Math.min(page - 2, totalPages - 5));
                const p = ps + i;
                if (p >= totalPages) return null;
                return <button key={p} className="pbtn" style={p===page ? { background:'var(--primary)',color:'#fff',borderColor:'var(--primary)' } : {}} onClick={() => { setPage(p); setExpandedRow(null); }}>{p+1}</button>;
              })}
              {page < totalPages-1 && <button className="pbtn" onClick={() => { setPage(p => p+1); setExpandedRow(null); }}>›</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
