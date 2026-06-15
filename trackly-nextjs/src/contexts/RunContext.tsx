'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBrands } from './BrandContext';
import { useCredits } from './CreditsContext';

// ── Types ────────────────────────────────────────────
export interface LiveResult {
  platform: string;
  query: string;
  mentioned: boolean;
  recommended?: boolean;
  sentiment?: string;
  model?: string;
  error?: boolean;
  errorMessage?: string;
  context?: string;
  citations?: string[];
  listPosition?: number | null;
  ts: number;
}

export interface RunLiveState {
  running: boolean;
  runId: string | null;
  brandId: string | null;
  received: number;
  totalExpected: number;
  foundCount: number;
  errorCount: number;
  startTime: number;
  status: 'idle' | 'running' | 'done' | 'error';
  statusText: string;
  errorMsg: string | null;
  results: LiveResult[];
  liveSov: number | null;
  // Additive secondary message shown alongside the running progress when
  // the run is healthy but slower than usual (3-10 min without progress).
  // Hard stalls (>10 min) flip into status: 'error' instead.
  slowWarning: string | null;
}

interface StartRunOptions {
  auto?: boolean;
  queries?: string[];
  // Run a specific brand instead of the currently-selected one. Lets the
  // Tracked Prompts page (and the setup save/create flow) enqueue a run
  // deterministically, even if BrandContext's selection is momentarily
  // stale or pointing at a different brand.
  brandId?: string;
}

interface RunContextType {
  live: RunLiveState;
  elapsed: string;
  pct: number;
  startRun: (force?: boolean, options?: StartRunOptions) => Promise<void>;
  forceRun: () => Promise<void>;
}

const INITIAL_STATE: RunLiveState = {
  running: false, runId: null, brandId: null,
  received: 0, totalExpected: 0, foundCount: 0, errorCount: 0,
  startTime: 0, status: 'idle', statusText: '', errorMsg: null,
  results: [], liveSov: null, slowWarning: null,
};

const RunContext = createContext<RunContextType>({
  live: INITIAL_STATE, elapsed: '', pct: 0,
  startRun: async () => {}, forceRun: async () => {},
});

export function useRun() { return useContext(RunContext); }

function fmtTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
}

// ── Provider ─────────────────────────────────────────
export function RunProvider({ children }: { children: ReactNode }) {
  const { selectedBrand, refreshBrands } = useBrands();
  const { confirmRun, refresh: refreshCredits } = useCredits();
  const [live, setLive] = useState<RunLiveState>(INITIAL_STATE);
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const pollRef = useRef(false); // prevents duplicate poll loops
  const pendingQueriesRef = useRef<string[] | null>(null); // queued queries to run after current run

  // Live timer
  useEffect(() => {
    if (live.running && live.startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(fmtTime(Date.now() - live.startTime));
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else if (!live.running) {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [live.running, live.startTime]);

  useEffect(() => { runningRef.current = live.running; }, [live.running]);

  // When the user switches to a different brand, abandon UI tracking of the
  // previous brand's run so its progress + result toasts don't bleed into the
  // newly-selected brand's view. The server-side run continues independently.
  const prevSelectedBrandIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newBrandId = selectedBrand?.id ?? null;
    const prevBrandId = prevSelectedBrandIdRef.current;
    prevSelectedBrandIdRef.current = newBrandId;
    if (prevBrandId === null || newBrandId === null || prevBrandId === newBrandId) return;
    pollRef.current = false;
    runningRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    setLive(INITIAL_STATE);
    setElapsed('');
  }, [selectedBrand?.id]);

  const pct = live.totalExpected > 0 ? Math.round((live.received / live.totalExpected) * 100) : 0;

  // ── Poll run status from DB ────────────────────────
  const pollRunStatus = useCallback(async (brandId: string, runId: string) => {
    if (pollRef.current) return; // already polling
    pollRef.current = true;
    let pollErrors = 0;
    const MAX_POLL_ERRORS = 20;
    let pollDelay = 2000;
    let lastResultCount = 0;
    // Two-tier stall watchdog. SLOW_RUN_NUDGE_MS (3 min) surfaces an
    // additive yellow "still working" hint without tearing down the run.
    // HARD_STALL_MS (10 min) mirrors the server-side reconciler timeout
    // and flips the run into a retryable error state.
    // The watchdog only arms after the first real progress event so
    // initial AI-platform warmup cannot trigger a false stall.
    const SLOW_RUN_NUDGE_MS = 180_000;
    const HARD_STALL_MS = 600_000;
    let lastProgressReceived = 0;
    let lastProgressAt = 0; // 0 = not yet armed

    // Use iterative loop instead of recursive calls to avoid stack overflow on long runs
    const runPollLoop = async () => {
      while (pollRef.current) {
        try {
          const res = await fetch(`/api/brands/${brandId}/run-status/${runId}?since=${lastResultCount}`, { credentials: 'include' });
          if (!res.ok) throw new Error('Poll failed');
          const data = await res.json();
          pollErrors = 0;

          const newResults: LiveResult[] = (data.results || []).map((r: LiveResult) => ({ ...r, ts: Date.now() }));
          if (newResults.length > 0) {
            lastResultCount = data.totalResults !== undefined ? data.totalResults : (lastResultCount + newResults.length);
            pollDelay = 2000;
          } else {
            pollDelay = Math.min(pollDelay + 500, 5000);
          }

          const serverReceived = data.received || 0;
          if (serverReceived > lastProgressReceived) {
            lastProgressReceived = serverReceived;
            lastProgressAt = Date.now();
          }

          // Compute stall age. lastProgressAt === 0 means the watchdog
          // is not yet armed (no progress has been reported), so the
          // soft/hard checks below are skipped naturally.
          const stalledMs = lastProgressAt === 0 ? 0 : Date.now() - lastProgressAt;
          const slowWarning =
            data.status === 'running'
              && stalledMs > SLOW_RUN_NUDGE_MS
              && stalledMs <= HARD_STALL_MS
              ? 'Still working — taking longer than usual. We will keep checking...'
              : null;

          setLive(prev => ({
            ...prev,
            received: serverReceived || prev.received,
            totalExpected: data.totalExpected || prev.totalExpected,
            foundCount: data.foundCount || 0,
            errorCount: data.errorCount || 0,
            statusText: `${serverReceived}/${data.totalExpected || 0} - ${data.foundCount || 0} found`,
            results: newResults.length > 0 ? [...prev.results, ...newResults] : prev.results,
            slowWarning,
          }));

          // Race-safe terminal handler runs first: if the same poll
          // reports the run as done/error, fall through to the existing
          // terminal block regardless of any stall calculation. This
          // closes the race where a run finishes during the stall window
          // and the alarming toast fires anyway.
          if (data.status === 'done' || data.status === 'error') {
            pollRef.current = false;
            runningRef.current = false;
            localStorage.removeItem('livesov_active_run');
            const finalResult = data.finalData;
            if (data.status === 'done' && finalResult) {
              const queued = pendingQueriesRef.current;
              pendingQueriesRef.current = null;
              setLive(prev => ({
                ...prev, running: false, status: 'done',
                liveSov: finalResult.sov ?? null,
                statusText: queued
                  ? `Done! Running ${queued.length} queued queries next...`
                  : `Done! Found in ${finalResult.newMentions || finalResult.totalM || 0} of ${finalResult.totalQ || 0} responses`,
                slowWarning: null,
              }));
              setTimeout(() => {
                setLive(INITIAL_STATE); refreshBrands();
                window.dispatchEvent(new CustomEvent('livesov:run-complete'));
                // Auto-run queued queries that were added during the previous run
                if (queued && queued.length > 0) {
                  setTimeout(() => startRunRef.current(false, { auto: true, queries: queued }), 500);
                }
              }, 2500);
            } else {
              setLive(prev => ({
                ...prev, running: false, status: 'error',
                statusText: 'Run failed: ' + (data.error || 'Unknown error'),
                errorMsg: data.error || 'Unknown error',
                slowWarning: null,
              }));
              setTimeout(() => setLive(INITIAL_STATE), 5000);
            }
            return;
          }

          // Hard stall: only fires when the watchdog is armed
          // (lastProgressAt !== 0) and the server still reports the run
          // as 'running' after HARD_STALL_MS without progress. Mirrors
          // the server-side reconciler timeout.
          if (data.status === 'running'
              && lastProgressAt !== 0
              && stalledMs > HARD_STALL_MS) {
            pollRef.current = false;
            runningRef.current = false;
            localStorage.removeItem('livesov_active_run');
            setLive(prev => ({
              ...prev, running: false, status: 'error',
              statusText: 'Run appears stuck — no progress for 10 minutes. Retry?',
              errorMsg: 'stalled',
              slowWarning: null,
            }));
            return;
          }

          await new Promise(r => setTimeout(r, pollDelay));
        } catch {
          pollErrors++;
          if (pollErrors >= MAX_POLL_ERRORS) {
            pollRef.current = false;
            runningRef.current = false;
            localStorage.removeItem('livesov_active_run');
            setLive(prev => ({
              ...prev, running: false, status: 'error',
              statusText: 'Lost connection. Refresh to check status.',
              errorMsg: 'Lost connection to server',
              slowWarning: null,
            }));
            setTimeout(() => setLive(INITIAL_STATE), 5000);
            return;
          }
          pollDelay = Math.min(pollDelay * 2, 10000);
          await new Promise(r => setTimeout(r, pollDelay));
        }
      }
    };
    runPollLoop();
  }, [refreshBrands]);

  // ── Resume active run on mount ─────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('livesov_active_run');
    if (!stored) return;
    let runInfo: { runId: string; brandId: string; startedAt: number };
    try { runInfo = JSON.parse(stored); } catch { localStorage.removeItem('livesov_active_run'); return; }
    if (Date.now() - runInfo.startedAt > 10 * 60 * 1000) { localStorage.removeItem('livesov_active_run'); return; }

    const controller = new AbortController();
    fetch(`/api/brands/${runInfo.brandId}/run-status/${runInfo.runId}`, { credentials: 'include', signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then(data => {
        if (data.status === 'running') {
          runningRef.current = true;
          setLive({
            running: true, runId: runInfo.runId, brandId: runInfo.brandId,
            received: data.received || 0, totalExpected: data.totalExpected || 0,
            foundCount: data.foundCount || 0, errorCount: data.errorCount || 0,
            startTime: runInfo.startedAt, status: 'running',
            statusText: 'Resuming active run...', errorMsg: null,
            results: (data.results || []).map((r: LiveResult) => ({ ...r, ts: Date.now() })),
            liveSov: null, slowWarning: null,
          });
          pollRunStatus(runInfo.brandId, runInfo.runId);
        } else if (data.status === 'done') {
          localStorage.removeItem('livesov_active_run');
          refreshBrands();
                window.dispatchEvent(new CustomEvent('livesov:run-complete'));
        } else {
          localStorage.removeItem('livesov_active_run');
        }
      })
      .catch(() => { if (!controller.signal.aborted) localStorage.removeItem('livesov_active_run'); });
    return () => controller.abort();
  }, [pollRunStatus, refreshBrands]);

  // Ref to latest startRun for use in callbacks
  const startRunRef = useRef<(force?: boolean, options?: StartRunOptions) => Promise<void>>(async () => {});

  // ── Start run (POST + poll) ────────────────────────
  const startRun = useCallback(async (force = false, options?: StartRunOptions) => {
    // If a run is already active, queue the new queries to run after it finishes
    if (runningRef.current) {
      if (options?.queries && options.queries.length > 0) {
        const existing = pendingQueriesRef.current || [];
        const merged = [...new Set([...existing, ...options.queries])];
        pendingQueriesRef.current = merged;
        setLive(prev => ({ ...prev, statusText: prev.statusText + ` · ${merged.length} queries queued` }));
      }
      return;
    }
    // Pre-flight credit confirmation for manual user-initiated runs.
    // Auto runs (?auto=1) skip the modal because they're triggered by
    // setup wizards / suggestions, not a button click. The server
    // still enforces the cap in either case — this is purely UX so
    // the user knows the cost before clicking through.
    if (!options?.auto && selectedBrand) {
      const platforms = (selectedBrand as { platforms?: string[] })?.platforms?.length ?? 0;
      const queriesCount = options?.queries
        ? options.queries.length
        : ((selectedBrand as { queries?: string[] })?.queries?.length ?? 0);
      const cost = Math.max(1, queriesCount * Math.max(1, platforms || 5));
      const proceed = await confirmRun(cost, selectedBrand.name);
      if (!proceed) {
        // User cancelled or was blocked by the modal. Reset run state
        // entirely so a subsequent click of Run Query works again.
        return;
      }
    }

    runningRef.current = true;

    setLive({
      ...INITIAL_STATE, running: true, status: 'running',
      startTime: Date.now(), statusText: 'Connecting to AI platforms...',
    });

    try {
      // Target an explicit brandId when given (Tracked Prompts page, setup
      // save/create), otherwise fall back to BrandContext's selection.
      const brandId = options?.brandId || selectedBrand?.id;
      if (!brandId) {
        runningRef.current = false;
        setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'No brand set up', errorMsg: 'No brand set up' }));
        setTimeout(() => setLive(INITIAL_STATE), 3000);
        return;
      }
      const forceParam = force ? '&force=1' : '';
      const autoParam = options?.auto ? '&auto=1' : '';

      // POST to start the run - returns immediately with runId
      const response = await fetch(`/api/brands/${brandId}/run?x=1${forceParam}${autoParam}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: options?.queries ? JSON.stringify({ queries: options.queries }) : undefined,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        if (response.status === 409) {
          // Reachable when the client lost track of an in-progress run
          // (page refresh, closed tab, server restart) and the
          // server-side partial unique index still has a 'running' row.
          // Previously this branch silently reset to 'idle', leaving the
          // user confused about why nothing happened. Surface it as a
          // proper error state so:
          //   - Sidebar can render the FORCE RUN button (it already
          //     keys off errorMsg === 'concurrent')
          //   - Pages like /dashboard/mentions can show a toast pointing
          //     the user at force-run / wait
          runningRef.current = false;
          if (options?.queries && options.queries.length > 0) {
            const existing = pendingQueriesRef.current || [];
            pendingQueriesRef.current = [...new Set([...existing, ...options.queries])];
          }
          const concurrentMsg = errData.error || 'A run is already in progress for this brand. Wait for it to finish or use Force Run.';
          setLive(prev => ({
            ...prev,
            running: false,
            status: 'error',
            statusText: concurrentMsg,
            errorMsg: 'concurrent',
          }));
          return;
        }
        if (response.status === 429) {
          runningRef.current = false;
          // planLimit=true is the monthly run cap (persistent, shows upgrade hint).
          // Other 429s (concurrent-run lock, middleware rate limit) are transient -
          // auto-clear so they don't look like a plan limit the user needs to upgrade past.
          const isPlanLimit = errData.planLimit === true;
          const statusText = errData.error || (isPlanLimit ? 'Monthly run limit reached' : 'Try again in a moment');
          setLive(prev => ({
            ...prev, running: false, status: 'error',
            statusText, errorMsg: isPlanLimit ? 'run_limit' : 'rate_limit',
          }));
          if (!isPlanLimit) setTimeout(() => setLive(INITIAL_STATE), 5000);
          return;
        }
        if (response.status === 403 && errData.planLimit) {
          runningRef.current = false;
          setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'Brand locked - upgrade plan', errorMsg: 'plan_limit' }));
          return;
        }
        if (response.status === 402 || (typeof errData.code === 'string' && errData.code.startsWith('credits.'))) {
          // Out of credits / daily cap / cooldown / plan disallows
          // auto. The handler returns a structured payload; surface it
          // verbatim and refresh the meter so the dashboard banner
          // updates immediately.
          runningRef.current = false;
          await refreshCredits();
          setLive(prev => ({
            ...prev, running: false, status: 'error',
            statusText: errData.error || 'Out of AI credits',
            errorMsg: errData.code || 'credits',
          }));
          return;
        }
        throw new Error(errData.error || 'Request failed');
      }

      const data = await response.json();
      const runId = data.runId;
      const totalExpected = data.totalExpected || 0;

      // Save to localStorage for resume
      localStorage.setItem('livesov_active_run', JSON.stringify({ runId, brandId, startedAt: Date.now() }));

      setLive(prev => ({
        ...prev, runId, brandId, totalExpected,
        statusText: `Running ${data.queries?.length || 0} queries on ${data.platforms?.length || 0} platforms...`,
      }));

      // Start polling for results
      pollRunStatus(brandId, runId);

    } catch (err) {
      runningRef.current = false;
      const error = err as Error;
      setLive(prev => ({
        ...prev, running: false, status: 'error',
        statusText: 'Run failed: ' + error.message,
        errorMsg: error.message,
      }));
      setTimeout(() => setLive(INITIAL_STATE), 5000);
    }
  }, [pollRunStatus, selectedBrand, confirmRun, refreshCredits]);

  // Keep ref in sync so completion callback can use latest startRun
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);

  // ── Force-run ──────────────────────────────────────
  const forceRun = useCallback(async () => {
    pollRef.current = false; // stop any active poll
    try {
      let brandId = live.brandId;
      if (!brandId && selectedBrand) {
        brandId = selectedBrand.id;
      }
      if (brandId) {
        await fetch(`/api/brands/${brandId}/force-release`, { method: 'POST', credentials: 'include' });
      }
      runningRef.current = false;
      setLive(INITIAL_STATE);
      setTimeout(() => startRun(true), 300);
    } catch {
      setLive(prev => ({ ...prev, statusText: 'Failed to release lock.', status: 'error' }));
      setTimeout(() => setLive(INITIAL_STATE), 3000);
    }
  }, [live.brandId, startRun, selectedBrand]);

  return (
    <RunContext.Provider value={{ live, elapsed, pct, startRun, forceRun }}>
      {children}
    </RunContext.Provider>
  );
}
