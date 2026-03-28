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
  const [perPage, setPerPage] = useState(15);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBrand?.runs?.length) setSelectedRunIdx(selectedBrand.runs.length - 1);
    else setSelectedRunIdx(0);
    setCurrentPage(1);
    setExpandedItems(new Set());
  }, [selectedBrand]);

  const runs = selectedBrand?.runs || [];
  const currentRun = runs[selectedRunIdx] || null;
  const results: Mention[] = currentRun?.allResults || currentRun?.results || selectedBrand?.mentions || [];

  const platforms = useMemo(() => {
    const set = new Set<string>();
    results.forEach(m => { if (m.platform) set.add(m.platform); });
    return Array.from(set);
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter(m => {
      if (filter === 'mentioned' && !m.mentioned) return false;
      if (filter === 'not_mentioned' && m.mentioned) return false;
      if (filter === 'recommended' && !m.recommended) return false;
      if (filter === 'errors' && !m.error) return false;
      if (platformFilter !== 'all' && m.platform !== platformFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!m.query?.toLowerCase().includes(q) && !m.platform?.toLowerCase().includes(q) && !m.response?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [results, filter, platformFilter, searchQuery]);

  useEffect(() => { setCurrentPage(1); setExpandedItems(new Set()); }, [filter, platformFilter, searchQuery, selectedRunIdx]);

  const mentionedCount = results.filter(m => m.mentioned).length;
  const recommendedCount = results.filter(m => m.recommended).length;
  const mentionRate = results.length ? Math.round((mentionedCount / results.length) * 100) : 0;
  const recRate = results.length ? Math.round((recommendedCount / results.length) * 100) : 0;

  const totalPagesCalc = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedItems(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }, []);

  function highlightBrand(text: string): string {
    if (!selectedBrand || !text) return text;
    const escaped = selectedBrand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark style="background:rgba(255,97,84,.15);color:var(--primary);padding:1px 4px;border-radius:3px;font-weight:700">$1</mark>'
    );
  }

  function exportCSV() {
    if (!filtered.length) return;
    const rows = [['Query','Platform','Model','Status','Sentiment','Recommended','Position','Response'].join(',')];
    filtered.forEach(m => rows.push([csvSafe(m.query||''), csvSafe(m.platform||''), csvSafe(m.model||''), m.mentioned?'Found':'Not Found', m.sentiment||'', m.recommended?'Yes':'No', String(m.position??''), csvSafe(m.response||m.snippet||'')].join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `livesov-mentions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0' }}><div style={{ width:32,height:32,border:'2px solid var(--primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite' }}/></div>;

  return (
    <div>
      {/* Header — matches production exactly */}
      <div className="mt-header">
        <div>
          <div className="mt-title">AI Mentions</div>
          <div className="mt-subtitle">Track how AI platforms mention your brand across all queries.</div>
        </div>
        <div className="mt-header-right">
          <select className="mt-run-sel" value={selectedRunIdx} onChange={e => setSelectedRunIdx(Number(e.target.value))}>
            {runs.map((run, i) => {
              const d = run.date ? new Date(run.date) : null;
              const label = d ? `${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}, ${String(d.getHours()%12||12).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${d.getHours()>=12?'PM':'AM'} · SOV` : `Run ${i+1}`;
              return <option key={i} value={i}>{label}</option>;
            })}
            {runs.length === 0 && <option value={0}>No runs yet</option>}
          </select>
          <button className="mt-btn-export" onClick={exportCSV} disabled={!filtered.length}>↓ Export</button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="ov-card" style={{textAlign:'center',padding:48}}>
          <p style={{color:'var(--muted)',fontSize:14}}>No mention data yet. Run queries from Brand Setup to see results here.</p>
        </div>
      ) : (
        <>
          {/* KPI Score Cards — 4 cards like production */}
          <div className="mt-scores">
            <div className="mt-score">
              <div style={{fontSize:32,fontWeight:800,fontFamily:'var(--mono)',color:mentionRate>=50?'var(--green)':mentionRate>0?'var(--primary)':'var(--muted)',lineHeight:1}}>{mentionRate}%</div>
              <div className="mt-score-title">Mention Rate</div>
            </div>
            <div className="mt-score">
              <div style={{fontSize:28,fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)',lineHeight:1}}>{mentionedCount}/{results.length}</div>
              <div className="mt-score-title">Found / Total</div>
            </div>
            <div className="mt-score">
              <div style={{fontSize:28,fontWeight:800,fontFamily:'var(--mono)',color:'var(--text)',lineHeight:1}}>{platforms.length}</div>
              <div className="mt-score-title">Platforms</div>
            </div>
            <div className="mt-score">
              <div style={{fontSize:32,fontWeight:800,fontFamily:'var(--mono)',color:recRate>0?'var(--primary)':'var(--muted)',lineHeight:1}}>{recRate}%</div>
              <div className="mt-score-title">Recommended</div>
            </div>
          </div>

          {/* Platform Filter Chips */}
          <div className="mt-filterbar">
            <div className="mt-platforms">
              <button className={`mt-chip ${platformFilter==='all'?'mt-chip-active':''}`} onClick={()=>setPlatformFilter('all')}
                style={platformFilter==='all'?{background:'var(--primary)',color:'#fff',borderColor:'var(--primary)'}:{}}>All</button>
              {platforms.map(p => (
                <button key={p} className={`mt-chip ${platformFilter===p?'mt-chip-active':''}`} onClick={()=>setPlatformFilter(platformFilter===p?'all':p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Filter + Search Row */}
          <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
            <select className="mt-sel" value={filter} onChange={e=>setFilter(e.target.value as FilterMode)}>
              <option value="all">All Results</option>
              <option value="mentioned">Mentioned Only</option>
              <option value="not_mentioned">Not Mentioned</option>
              <option value="recommended">Recommended</option>
              <option value="errors">Errors Only</option>
            </select>
            <input className="mt-search" type="text" placeholder="Filter by keyword..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
          </div>

          {/* Results Table */}
          {paginated.length === 0 ? (
            <div className="ov-card" style={{textAlign:'center',padding:32}}>
              <p style={{color:'var(--muted)'}}>No results match your filters.</p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div style={{display:'grid',gridTemplateColumns:'140px 1fr 120px 120px 80px',padding:'10px 18px',borderBottom:'2px solid var(--border)',background:'var(--bg)',fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.3px'}}>
                <div>Platform</div>
                <div>Query</div>
                <div>Status</div>
                <div>Sentiment</div>
                <div>Position</div>
              </div>

              {/* Rows */}
              {paginated.map((m, i) => {
                const gIdx = (currentPage-1)*perPage + i;
                const expanded = expandedItems.has(gIdx);
                const hasResponse = !!(m.response || m.snippet);
                return (
                  <div key={gIdx} className={`mt-item${expanded?' mt-item-open':''}`} style={{'--accent-clr':PLATFORM_COLORS[m.platform]||'var(--border)'} as React.CSSProperties}>
                    {/* Row */}
                    <div className="mt-item-main" onClick={()=>toggleExpand(gIdx)} style={{cursor:hasResponse||m.error?'pointer':'default'}}>
                      <div style={{display:'grid',gridTemplateColumns:'140px 1fr 120px 120px 80px',alignItems:'center',width:'100%'}}>
                        <div className="mt-item-pname" style={{color:PLATFORM_COLORS[m.platform]||'var(--text)',fontWeight:700,fontSize:13}}>{m.platform}</div>
                        <div className="mt-item-query" style={{fontSize:13,color:'var(--text)'}}>{m.query}</div>
                        <div>
                          {m.error ? <span className="mt-tag mt-tag-err">ERROR</span>
                           : m.mentioned ? <span className="mt-tag mt-tag-yes">FOUND</span>
                           : <span className="mt-tag mt-tag-no">NOT FOUND</span>}
                        </div>
                        <div style={{fontSize:12,color:m.sentiment==='positive'?'var(--green)':m.sentiment==='negative'?'var(--red)':'var(--muted)'}}>
                          {m.sentiment ? m.sentiment.charAt(0).toUpperCase()+m.sentiment.slice(1) : '—'}
                        </div>
                        <div style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--muted)'}}>
                          {m.position ? `#${m.position}` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail — shows AI response with brand highlighted */}
                    {expanded && (hasResponse || m.error) && (
                      <div className="mt-detail">
                        <div className="mt-detail-body" style={{paddingTop:16}}>
                          {m.error ? (
                            <div style={{color:'var(--red)',fontSize:13,padding:12,background:'rgba(239,68,68,.05)',borderRadius:'var(--radius-xs)',border:'1px solid rgba(239,68,68,.15)'}}>
                              Error: {m.error}
                            </div>
                          ) : (
                            <div style={{borderLeft:'3px solid var(--primary)',paddingLeft:16,fontSize:13,lineHeight:1.8,color:'var(--text)',whiteSpace:'pre-wrap'}}
                              dangerouslySetInnerHTML={{__html: highlightBrand(m.response || m.snippet || '')}} />
                          )}
                          <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:12,paddingLeft:16}}>
                            Model: {m.model||'—'} · Position: {m.position||'—'} · Sentiment: {m.sentiment||'neutral'} · Recommended: {m.recommended?'Yes':'No'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination — matches production "Showing 1-15 of 95 · Show: 15 25 50 100 · ‹ ›" */}
              <div className="mt-pager">
                <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--muted)'}}>
                  Showing {Math.min((currentPage-1)*perPage+1,filtered.length)}-{Math.min(currentPage*perPage,filtered.length)} of {filtered.length} results
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:11,color:'var(--muted)'}}>Show:</span>
                  {[15,25,50,100].map(n => (
                    <button key={n} className={`mt-pg${perPage===n?' mt-pg-cur':''}`} onClick={()=>{setPerPage(n);setCurrentPage(1);}}>{n}</button>
                  ))}
                </div>
                <div style={{display:'flex',gap:4}}>
                  <button className="mt-pg" disabled={currentPage<=1} onClick={()=>setCurrentPage(p=>p-1)}>‹</button>
                  <button className="mt-pg" disabled={currentPage>=totalPagesCalc} onClick={()=>setCurrentPage(p=>p+1)}>›</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
