'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';
import { logger } from '@/lib/logger';
import { loadRecsWithRetry, defaultRefresh, type RecommendationRow } from './load-recs';

type Recommendation = RecommendationRow;

interface Brand { id: string; name: string; }

export default function RecommendationsPage() {
  const { brand: selectedBrand, brands, loading } = useBrandData();
  const { toast } = useToast();
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

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

    const outcome = await loadRecsWithRetry(url, {
      fetch: (u, init) => fetch(u, init),
      refresh: defaultRefresh,
      logger,
    });

    if (outcome.kind === 'ok') {
      setAllRecs(outcome.recommendations);
      setLoadError(null);
      setSessionExpired(false);
    } else if (outcome.kind === 'session-expired') {
      setAllRecs([]);
      setLoadError(null);
      setSessionExpired(true);
    } else {
      setAllRecs([]);
      setSessionExpired(false);
      setLoadError(outcome.message);
    }
    setRecsLoaded(true);
  }, [selectedBrand, filterStatus, filterSeverity]);

  useEffect(() => { loadRecs(); }, [loadRecs]);

  // Reload recommendations when a run completes so new suggestions (derived
  // from fresh run data) appear without requiring a manual refresh.
  useEffect(() => {
    const handler = () => loadRecs();
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [loadRecs]);

  const generate = async (opts: { silent?: boolean } = {}) => {
    if (!selectedBrand || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}/recommendations`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      if (!res.ok) {
        let msg = 'Generation failed';
        try { msg = (await res.json())?.error || msg; } catch { /* non-JSON body */ }
        throw new Error(msg);
      }
      const data = await res.json().catch(() => ({} as { generated?: number }));
      // Always refresh the list after a successful POST so the new
      // recommendations show up without a page reload.
      await loadRecs();
      if (!opts.silent) {
        const n = typeof data?.generated === 'number' ? data.generated : 0;
        toast(
          n > 0
            ? `Generated ${n} recommendation${n === 1 ? '' : 's'}`
            : 'No new recommendations — your data is up to date',
          'success',
        );
      }
    } catch (err) {
      if (!opts.silent) {
        toast(
          err instanceof Error && err.message ? err.message : "Couldn't generate, try again",
          'error',
        );
      }
      // Best-effort refresh so the UI reflects whatever state the
      // server is now in (the POST may have partially completed).
      await loadRecs();
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate recommendations on page load if data exists but recommendations are empty
  useEffect(() => {
    if (!selectedBrand || loading || generating || autoGenTriggered || !recsLoaded) return;
    // Don't auto-generate after a load failure — the user should see the
    // error and decide whether to retry, not have the page silently start
    // running an unrelated POST.
    if (loadError || sessionExpired) return;
    if (allRecs.length === 0 && brands.length > 0) {
      setAutoGenTriggered(true);
      // Silent: this is an automatic background trigger on first load,
      // not a user-initiated action, so it should not toast.
      generate({ silent: true });
    }
  }, [selectedBrand?.id, loading, allRecs.length, brands.length, recsLoaded, loadError, sessionExpired]);

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
      {/* Header — see .recs-page-header in legacy.css for the
          mobile-stacking rules (PR #469/#470 mentions-page-header
          pattern). The title block must be min-width:0 so its
          description wraps instead of forcing the page wider than
          the viewport. */}
      <div className="recs-page-header">
        <div className="recs-page-header__title">
          <div className="view-title">Recommendations</div>
          <div className="view-sub">AI-powered suggestions to improve your visibility across all platforms.</div>
        </div>
        <button className="pbtn recs-page-header__cta" onClick={() => generate()} disabled={generating}
          style={{ background:'var(--primary)',color:'#fff',borderColor:'var(--primary)',fontWeight:700,opacity:generating?0.6:1 }}>
          {generating ? 'Analyzing...' : 'Generate'}
        </button>
      </div>

      {/* KPI Cards — see .recs-stat-grid in legacy.css. 2-up <=767px,
          4-up >=768px. Cards stretch to fill their grid cell, no
          fixed widths. */}
      <div className="recs-stat-grid">
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

      {/* Error / session-expired states take precedence over the empty
          state — falling through to "No Recommendations Yet" on a 500
          was the bug that masked the production failure (see PR #472),
          and a 401 deserves a different CTA from a 500 because Try-again
          would just 401 again. */}
      {sessionExpired ? (
        <div className="card" role="alert" style={{ padding:32,textAlign:'center',borderLeft:'3px solid var(--amber)' }}>
          <div style={{ fontSize:28,marginBottom:8,color:'var(--amber)' }}>&#128274;</div>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:4,color:'var(--text)' }}>Session expired</div>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:14 }}>Please sign in to continue.</div>
          <Link href="/login" className="pbtn"
            style={{ background:'var(--primary)',color:'#fff',borderColor:'var(--primary)',fontWeight:700,textDecoration:'none',display:'inline-block' }}>
            Sign in
          </Link>
        </div>
      ) : loadError ? (
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
