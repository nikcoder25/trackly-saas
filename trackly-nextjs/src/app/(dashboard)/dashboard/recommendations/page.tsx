'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';
import { logger } from '@/lib/logger';
import { loadRecsWithRetry, defaultRefresh, type RecommendationRow } from './load-recs';
import {
  PageHead,
  KPIRail,
  Filter,
  Seg,
  Card,
  Badge,
  PlatformTile,
  PLATFORMS,
  type Platform,
} from '@/app/dashboard-v2/ui';

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
            : 'No new recommendations - your data is up to date',
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
    // Don't auto-generate after a load failure - the user should see the
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

  // Map the real recommendation severity onto the design's priority rail
  // (high / med / low) and badge label. critical+high collapse to HIGH.
  const prioClass = (severity: string): string =>
    severity === 'critical' || severity === 'high' ? 'high' : severity === 'medium' ? 'med' : 'low';
  const prioLabel = (severity: string): string =>
    severity === 'critical' || severity === 'high' ? 'HIGH' : severity === 'medium' ? 'MED' : 'LOW';
  // Badge tone for the recommendation's category (when present).
  const catTone = (category?: string): string =>
    category === 'correction' ? 'warn' : category === 'tech' ? 'info' : category === 'content' ? 'acc' : 'neu';
  // Resolve a real `platform` value onto a design PlatformTile, if it matches a known engine.
  const platformFor = (platform?: string): Platform | undefined => {
    if (!platform) return undefined;
    const key = platform.toLowerCase();
    return PLATFORMS.find(p => p.id === key || p.short.toLowerCase() === key || p.name.toLowerCase() === key);
  };

  if (loading || (generating && allRecs.length === 0)) return (
    <div className="lvx">
      <PageHead title="Recommendations" sub="AI-powered suggestions to improve your visibility across all platforms." />
      <div className="page-body">
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="rec-card" style={{ opacity: 0.5 }}>
              <span className="rec-prio low" />
              <div className="rec-body">
                <div style={{ height: 15, width: '60%', background: 'var(--surface-3)', borderRadius: 4 }} />
                <div style={{ height: 12, width: '90%', background: 'var(--surface-3)', borderRadius: 4 }} />
                <div style={{ height: 12, width: '40%', background: 'var(--surface-3)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mono dim" style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
          Analyzing your data and generating recommendations...
        </div>
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <PageHead
        title="Recommendations"
        sub="AI-powered suggestions to improve your visibility across all platforms."
        actions={
          <button className="btn-p" onClick={() => generate()} disabled={generating} style={{ opacity: generating ? 0.6 : 1 }}>
            {generating ? 'Analyzing…' : 'Generate'}
          </button>
        }
      />
      <div className="page-body">
        <KPIRail items={[
          { k: 'TOTAL', v: allRecs.length },
          { k: 'OPEN', v: open },
          { k: 'IN PROGRESS', v: inProg },
          { k: 'COMPLETED', v: done },
        ]} />

        <Filter>
          <Seg
            value={filterStatus || ''}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'ALL STATUS' },
              { value: 'open', label: 'OPEN' },
              { value: 'in_progress', label: 'IN PROGRESS' },
              { value: 'done', label: 'DONE' },
              { value: 'ignored', label: 'IGNORED' },
            ]}
          />
          <select className="sel" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
            <option value="">All severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </Filter>

        {/* Error / session-expired states take precedence over the empty
            state - falling through to "No Recommendations Yet" on a 500
            was the bug that masked the production failure (see PR #472),
            and a 401 deserves a different CTA from a 500 because Try-again
            would just 401 again. */}
        {sessionExpired ? (
          <Card>
            <div role="alert" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--warn)' }}>&#128274;</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Session expired</div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 14 }}>Please sign in to continue.</div>
              <Link href="/login" className="btn-p" style={{ textDecoration: 'none' }}>Sign in</Link>
            </div>
          </Card>
        ) : loadError ? (
          <Card>
            <div role="alert" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--danger)' }}>&#9888;</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Couldn&apos;t load recommendations</div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 14 }}>{loadError}</div>
              <button onClick={loadRecs} className="btn-p">Try again</button>
            </div>
          </Card>
        ) : recs.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              {allRecs.some(r => r.status === 'done' || r.status === 'ignored') ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--success)' }}>&#10003;</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>All caught up!</div>
                  <div className="dim" style={{ fontSize: 12 }}>{done} recommendation{done !== 1 ? 's' : ''} completed. Use the status filter to review.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>&#9733;</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>No recommendations yet</div>
                  <div className="dim" style={{ fontSize: 12 }}>Run your first query scan to get AI recommendations.</div>
                </>
              )}
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {recs.map((r, idx) => {
              const isDone = r.status === 'done';
              const isIgnored = r.status === 'ignored';
              const p = platformFor(r.platform);
              return (
                <article key={r.id || idx} className={'rec-card' + (isDone ? ' rec-done' : '')} style={{ opacity: isIgnored ? 0.5 : undefined }}>
                  <span className={'rec-prio ' + prioClass(r.severity)}>{isDone ? '✓' : isIgnored ? 'IGNORED' : prioLabel(r.severity)}</span>
                  <div className="rec-body">
                    <div className="rec-top">
                      <h3 className="rec-t">{r.title}</h3>
                      {r.category && (
                        <div className="rec-meta mono">
                          <Badge tone={catTone(r.category)}>{r.category.toUpperCase()}</Badge>
                        </div>
                      )}
                    </div>
                    {r.description && <p className="rec-d">{r.description}</p>}
                    <div className="rec-foot">
                      {p && (
                        <>
                          <div className="mono dim" style={{ fontSize: 11, letterSpacing: '0.08em' }}>AFFECTS</div>
                          <PlatformTile p={p} size={20} />
                        </>
                      )}
                      <div style={{ flex: 1 }} />
                      {isDone ? (
                        <span className="rec-done-tag"><span className="pos">✓ Done</span> · nice work</span>
                      ) : (
                        <>
                          <select
                            className="sel"
                            value={r.status}
                            onChange={e => updateStatus(r.id, e.target.value)}
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                            <option value="ignored">Ignored</option>
                          </select>
                          <button className="btn-p" style={{ fontSize: 11 }} onClick={() => updateStatus(r.id, 'done')}>Mark done</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
