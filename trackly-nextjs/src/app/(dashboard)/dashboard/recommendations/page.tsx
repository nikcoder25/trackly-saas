'use client';

import { useState, useEffect, useMemo } from 'react';

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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const loadRecs = async () => {
    if (!selectedBrand) return;
    try {
      let url = `/api/brands/${selectedBrand.id}/recommendations?`;
      if (filterStatus) url += `status=${filterStatus}&`;
      if (filterSeverity) url += `severity=${filterSeverity}&`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      setAllRecs(data.recommendations || []);
    } catch { setAllRecs([]); }
  };

  useEffect(() => { loadRecs(); }, [selectedBrand, filterStatus, filterSeverity]);

  const generate = async () => {
    if (!selectedBrand || generating) return;
    setGenerating(true);
    try {
      await fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      await loadRecs();
    } catch {} finally { setGenerating(false); }
  };

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

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0' }}><div style={{ width:32,height:32,border:'2px solid var(--primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite' }}/></div>;

  return (
    <div>
      {/* Header — matches screenshot */}
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

      {/* KPI Cards — 4 score-cards matching screenshot */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16 }}>
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

      {/* Filters — matching screenshot */}
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

      {/* Recommendations List — matches legacy renderRecommendations() exactly */}
      {recs.length === 0 ? (
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
              <div style={{ fontSize:12 }}>Click &quot;Generate&quot; to analyze your data and get actionable suggestions.</div>
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
