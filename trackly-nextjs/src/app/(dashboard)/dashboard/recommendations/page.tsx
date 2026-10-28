'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';
import { logger } from '@/lib/logger';
import { RECS_UPDATED_EVENT } from '@/components/dashboard/v3/hooks';
import { useUiFlag } from '@/contexts/UiFlagContext';
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
  const { isV3 } = useUiFlag();
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

  // Deep links from the Overview ("Do these next") arrive as #rec-<id>. The
  // cards mount after the fetch, so the browser's own hash jump lands on an
  // empty page; scroll once the list is in the DOM.
  const [hashHandled, setHashHandled] = useState(false);
  useEffect(() => {
    if (!recsLoaded || hashHandled || allRecs.length === 0) return;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (!hash.startsWith('#rec-')) return;
    setHashHandled(true);
    requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [recsLoaded, hashHandled, allRecs.length]);

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
      window.dispatchEvent(new CustomEvent(RECS_UPDATED_EVENT));
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
      // Sidebar badge and the Overview's "Do these next" list follow along.
      window.dispatchEvent(new CustomEvent(RECS_UPDATED_EVENT));
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
        sub={isV3 ? 'The changes most likely to get AI engines to name you. Tick them off as you go.' : 'AI-powered suggestions to improve your visibility across all platforms.'}
        actions={
          <button className="btn-p" onClick={() => generate()} disabled={generating} style={{ opacity: generating ? 0.6 : 1 }}>
            {generating ? 'Analyzing…' : 'Generate'}
          </button>
        }
      />
      <div className="page-body">
        {isV3 ? (
          <RecProgress total={allRecs.filter(r => r.status !== 'ignored').length} open={open} inProg={inProg} done={done}
            critical={allRecs.filter(r => r.status === 'open' && (r.severity === 'critical' || r.severity === 'high')).length} />
        ) : (
          <KPIRail items={[
            { k: 'Total', v: allRecs.length },
            { k: 'Open', v: open },
            { k: 'In progress', v: inProg },
            { k: 'Completed', v: done },
          ]} />
        )}

        <Filter>
          <Seg
            value={filterStatus || ''}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'All status' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'done', label: 'Done' },
              { value: 'ignored', label: 'Ignored' },
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
              <div className="lvx-emoji" style={{ fontSize: 28, marginBottom: 8, color: 'var(--warn)' }}>&#128274;</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Session expired</div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 14 }}>Please sign in to continue.</div>
              <Link href="/login" className="btn-p" style={{ textDecoration: 'none' }}>Sign in</Link>
            </div>
          </Card>
        ) : loadError ? (
          <Card>
            <div role="alert" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div className="lvx-emoji" style={{ fontSize: 28, marginBottom: 8, color: 'var(--danger)' }}>&#9888;</div>
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
                  <div className="lvx-emoji" style={{ fontSize: 28, marginBottom: 8 }}>&#9733;</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>No recommendations yet</div>
                  <div className="dim" style={{ fontSize: 12 }}>Run your first query scan to get AI recommendations.</div>
                </>
              )}
            </div>
          </Card>
        ) : isV3 ? (
          <RecGroups recs={recs} platformFor={platformFor} onStatus={updateStatus} />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {recs.map((r, idx) => {
              const isDone = r.status === 'done';
              const isIgnored = r.status === 'ignored';
              const p = platformFor(r.platform);
              return (
                <article key={r.id || idx} id={r.id ? `rec-${r.id}` : undefined} className={'rec-card' + (isDone ? ' rec-done' : '')} style={{ opacity: isIgnored ? 0.5 : undefined }}>
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
                          <div className="mono dim" style={{ fontSize: 11, letterSpacing: '0.08em' }}>Affects</div>
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

/* ─────────────── dashboard (v3) layout: progress + grouped checklist ─────────────── */

const SEV_GROUPS: { key: string; label: string; hint: string }[] = [
  { key: 'critical', label: 'Critical', hint: 'Fix these first' },
  { key: 'high', label: 'High impact', hint: 'Big wins' },
  { key: 'medium', label: 'Medium impact', hint: 'Worth doing this month' },
  { key: 'low', label: 'Low impact', hint: 'Nice to have' },
];

function RecProgress({ total, open, inProg, done, critical }: { total: number; open: number; inProg: number; done: number; critical: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <section className="rx-progress">
      <div className="rx-progress-top">
        <div>
          <div className="rx-progress-k">Your progress</div>
          <div className="rx-progress-v"><b>{done}</b> of {total} done</div>
        </div>
        <div className="rx-progress-stats">
          <span><i className="rx-dot open" />{open} to do</span>
          <span><i className="rx-dot prog" />{inProg} in progress</span>
          <span><i className="rx-dot done" />{done} done</span>
        </div>
      </div>
      <div className="rx-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Recommendations done">
        <i className="done" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        <i className="prog" style={{ width: `${total ? (inProg / total) * 100 : 0}%` }} />
      </div>
      <p className="rx-progress-note">
        {total === 0 ? 'New recommendations appear after each scan.'
          : done === total ? 'Everything is done. New ideas arrive with your next scan.'
          : critical > 0 ? `Start with the ${critical} high-impact fix${critical === 1 ? '' : 'es'} at the top.`
          : 'Keep going. Each fix gives AI another reason to name you.'}
      </p>
    </section>
  );
}

function RecGroups({ recs, platformFor, onStatus }: {
  recs: RecommendationRow[];
  platformFor: (p?: string) => Platform | undefined;
  onStatus: (id: string, status: string) => void;
}) {
  const groups = SEV_GROUPS.map(g => ({ ...g, items: recs.filter(r => (r.severity || 'low') === g.key) }))
    .concat([{ key: 'other', label: 'Other', hint: '', items: recs.filter(r => !SEV_GROUPS.some(g => g.key === (r.severity || 'low'))) }])
    .filter(g => g.items.length > 0);
  return (
    <div className="rx-groups">
      {groups.map(g => (
        <section key={g.key} className="rx-group" aria-labelledby={`rx-g-${g.key}`}>
          <header className="rx-group-h">
            <h2 id={`rx-g-${g.key}`}><i className={`rx-sev ${g.key}`} />{g.label}<span className="rx-count">{g.items.length}</span></h2>
            {g.hint && <span className="rx-hint">{g.hint}</span>}
          </header>
          <ul className="rx-list">
            {g.items.map((r, idx) => {
              const isDone = r.status === 'done';
              const isIgnored = r.status === 'ignored';
              const p = platformFor(r.platform);
              return (
                <li key={r.id || idx} id={r.id ? `rec-${r.id}` : undefined} className={'rx-item' + (isDone ? ' done' : '') + (isIgnored ? ' ignored' : '')}>
                  <button type="button" className="rx-check" aria-pressed={isDone}
                    aria-label={isDone ? `Mark "${r.title}" as not done` : `Mark "${r.title}" as done`}
                    onClick={() => onStatus(r.id, isDone ? 'open' : 'done')}>
                    {isDone && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
                  </button>
                  <div className="rx-body">
                    <h3 className="rx-title">{r.title}</h3>
                    {r.description && <p className="rx-desc">{r.description}</p>}
                    <div className="rx-meta">
                      {r.status === 'in_progress' && <span className="rx-chip prog">In progress</span>}
                      {isIgnored && <span className="rx-chip">Ignored</span>}
                      {r.category && <span className="rx-chip">{r.category.charAt(0).toUpperCase() + r.category.slice(1)}</span>}
                      {p && <span className="rx-chip"><PlatformTile p={p} size={16} />{p.name}</span>}
                    </div>
                  </div>
                  <div className="rx-actions">
                    {!isDone && r.status !== 'in_progress' && !isIgnored && (
                      <button type="button" className="rx-btn" onClick={() => onStatus(r.id, 'in_progress')}>Start</button>
                    )}
                    <select className="rx-sel" aria-label={`Status of "${r.title}"`} value={r.status} onChange={e => onStatus(r.id, e.target.value)}>
                      <option value="open">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                      <option value="ignored">Ignore</option>
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
