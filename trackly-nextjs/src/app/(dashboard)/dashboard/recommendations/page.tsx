'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useBrandData } from '@/hooks/useBrandData';

interface Recommendation {
  id: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  category?: string;
  platform?: string;
  playbook_id?: string;
}

interface Brand { id: string; name: string; }

export default function RecommendationsPage() {
  const { brand: selectedBrand, brands, loading } = useBrandData();
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRecs = useCallback(async () => {
    if (!selectedBrand) return;
    // Build the URL with URLSearchParams so the trailing '?' is only
    // present when at least one filter is set. The previous string-
    // concat builder always emitted '?' even with zero filters, which
    // is what surfaced as the puzzling trailing-'?' GET in production.
    const search = new URLSearchParams();
    if (filterStatus) search.set('status', filterStatus);
    if (filterSeverity) search.set('severity', filterSeverity);
    const qs = search.toString();
    const url = `/api/brands/${selectedBrand.id}/recommendations${qs ? `?${qs}` : ''}`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        let serverMsg = '';
        try { serverMsg = (await res.json())?.error || ''; } catch { /* non-JSON body */ }
        throw new Error(serverMsg || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAllRecs(data.recommendations || []);
      setLoadError(null);
      setRecsLoaded(true);
    } catch (err) {
      setAllRecs([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load recommendations.');
      setRecsLoaded(true);
    }
  }, [selectedBrand, filterStatus, filterSeverity]);

  useEffect(() => { loadRecs(); }, [loadRecs]);

  // Reload recommendations when a run completes so new suggestions (derived
  // from fresh run data) appear without requiring a manual refresh.
  useEffect(() => {
    const handler = () => loadRecs();
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [loadRecs]);

  const generate = async () => {
    if (!selectedBrand || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      if (!res.ok) throw new Error('Generation failed');
      await loadRecs();
    } catch { /* loadRecs will show current state */ } finally { setGenerating(false); }
  };

  // Auto-generate recommendations on page load if data exists but recommendations are empty
  useEffect(() => {
    if (!selectedBrand || loading || generating || autoGenTriggered || !recsLoaded) return;
    // Don't auto-generate after a load failure — the user should see the
    // error and decide whether to retry, not have the page silently start
    // running an unrelated POST.
    if (loadError) return;
    if (allRecs.length === 0 && brands.length > 0) {
      setAutoGenTriggered(true);
      generate();
    }
  }, [selectedBrand?.id, loading, allRecs.length, brands.length, recsLoaded, loadError]);

  const updateStatus = async (id: string, status: string) => {
    if (!selectedBrand) return;
    try {
      await fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      await loadRecs();
    } catch {}
  };

  // KPIs from allRecs
  const open = allRecs.filter(r => r.status === 'open').length;
  const inProg = allRecs.filter(r => r.status === 'in_progress').length;
  const done = allRecs.filter(r => r.status === 'done').length;

  // Filter: hide done/ignored unless status filter is set
  const recs = useMemo(() => {
    let list = [...allRecs];
    if (!filterStatus) list = list.filter(r => r.status !== 'done' && r.status !== 'ignored');
    return list;
  }, [allRecs, filterStatus]);

  const sevColors: Record<string, string> = { critical: 'var(--red)', high: 'var(--red)', medium: 'var(--amber)', low: 'var(--blue)' };
  const sevLabels: Record<string, string> = { critical: 'HIGH', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

  if (loading || (generating && allRecs.length === 0)) return (
    <div style={{ padding: '20px 0' }}>
      <div className="view-title">Recommendations</div>
      <div className="view-sub" style={{ marginBottom: 20 }}>AI-powered suggestions to improve your visibility across all platforms.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ padding: '20px', opacity: 0.5 }}>
            <div style={{ height: 14, width: '60%', background: 'var(--bg3)', borderRadius: 4, marginBottom: 10 }} />
            <div style={{ height: 10, width: '90%', background: 'var(--bg3)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 10, width: '40%', background: 'var(--bg3)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>Analyzing your data and generating recommendations...</div>
    </div>
  );

  return (
    <div>
      {/* Header - matches screenshot */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4 }}>
        <div>
          <div className="view-title">Recommendations</div>
          <div className="view-sub">AI-powered suggestions to improve your visibility across all platforms.</div>
        </div>
        <button className="pbtn" onClick={generate} disabled={generating}
          style={{ background:'var(--primary)',color:'#fff',borderColor:'var(--primary)',fontWeight:700,flexShrink:0,opacity:generating?0.6:1 }}>
          {generating ? 'Analyzing...' : 'Generate'}
        </button>
      </div>

      {/* KPI Cards - 4 score-cards matching screenshot */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:16 }}>
        <div className="score-card">
          <div className="score-val" style={{ fontSize:24 }}>{allRecs.length}</div>
          <div className="score-label">Total</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize:24,color:open>0?'var(--amber)':'var(--muted)' }}>{open}</div>
          <div className="score-label">Open</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize:24,color:'var(--blue)' }}>{inProg}</div>
          <div className="score-label">In Progress</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize:24,color:'var(--green)' }}>{done}</div>
          <div className="score-label">Completed</div>
        </div>
      </div>

      {/* Filters - matching screenshot */}
      <div style={{ display:'flex',gap:8,marginBottom:14,alignItems:'center' }}>
        <select className="finp" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:140,margin:0 }}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="ignored">Ignored</option>
        </select>
        <select className="finp" value={filterSeverity} onChange={e=>setFilterSeverity(e.target.value)} style={{ width:140,margin:0 }}>
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
      </div>

      {/* Error state takes precedence over empty state — falling through
          to "No Recommendations Yet" on a 500 was the bug that masked
          the production failure. */}
      {loadError ? (
        <div className="card" role="alert" style={{ padding:32,textAlign:'center',borderLeft:'3px solid var(--red)' }}>
          <div style={{ fontSize:28,marginBottom:8,color:'var(--red)' }}>&#9888;</div>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:4,color:'var(--text)' }}>Couldn&apos;t load recommendations</div>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:14 }}>{loadError}</div>
          <button onClick={loadRecs} className="pbtn"
            style={{ background:'var(--primary)',color:'#fff',borderColor:'var(--primary)',fontWeight:700 }}>
            Try again
          </button>
        </div>
      ) : recs.length === 0 ? (
        <div className="card" style={{ padding:32,textAlign:'center',color:'var(--muted)' }}>
          {allRecs.some(r => r.status === 'done' || r.status === 'ignored') ? (
            <>
              <div style={{ fontSize:28,marginBottom:8 }}>&#10003;</div>
              <div style={{ fontWeight:700,fontSize:14,marginBottom:4 }}>All Caught Up!</div>
              <div style={{ fontSize:12 }}>{done} recommendation{done!==1?'s':''} completed. Use the status filter to review.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize:28,marginBottom:8 }}>&#9733;</div>
              <div style={{ fontWeight:700,fontSize:14,marginBottom:4 }}>No Recommendations Yet</div>
              <div style={{ fontSize:12 }}>Run your first query scan to get AI recommendations.</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {recs.map((r, idx) => {
            const isDone = r.status === 'done';
            const isIgnored = r.status === 'ignored';
            const color = isDone ? 'var(--green)' : isIgnored ? 'var(--muted)' : (sevColors[r.severity] || 'var(--blue)');
            const label = isDone ? 'DONE' : isIgnored ? 'IGNORED' : (sevLabels[r.severity] || 'LOW');
            const dimmed = isDone || isIgnored;
            const bgColor = color==='var(--red)' ? 'rgba(239,68,68,.08)' : color==='var(--amber)' ? 'rgba(245,158,11,.08)' : color==='var(--green)' ? 'rgba(16,185,129,.08)' : 'rgba(59,130,246,.08)';

            return (
              <div key={r.id||idx} className="card" style={{ padding:'16px 20px',borderLeft:`3px solid ${color}`,opacity:dimmed?0.5:1,marginBottom:0 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:4,textDecoration:isDone?'line-through':'none' }}>{r.title}</div>
                    <div style={{ fontSize:12,color:'var(--muted)',lineHeight:1.6,marginBottom:10 }}>{r.description||''}</div>
                    <div style={{ display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
                      {!isDone && (
                        <button onClick={()=>updateStatus(r.id,'done')} style={{ fontFamily:'var(--mono)',fontSize:9,background:'none',border:'1px solid var(--green)',color:'var(--green)',padding:'4px 10px',cursor:'pointer',borderRadius:100 }}>
                          &#10003; Mark Done
                        </button>
                      )}
                      <select className="finp" value={r.status} onChange={e=>updateStatus(r.id,e.target.value)} style={{ width:110,margin:0,fontSize:10,padding:'3px 6px' }}>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                        <option value="ignored">Ignored</option>
                      </select>
                    </div>
                  </div>
                  <span style={{ fontFamily:'var(--mono)',fontSize:9,fontWeight:700,padding:'4px 10px',borderRadius:100,color,background:bgColor,whiteSpace:'nowrap',flexShrink:0 }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
