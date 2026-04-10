'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBrands } from './BrandContext';

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
}

interface RunContextType {
  live: RunLiveState;
  elapsed: string;
  pct: number;
  startRun: (force?: boolean) => Promise<void>;
  forceRun: () => Promise<void>;
}

const INITIAL_STATE: RunLiveState = {
  running: false, runId: null, brandId: null,
  received: 0, totalExpected: 0, foundCount: 0, errorCount: 0,
  startTime: 0, status: 'idle', statusText: '', errorMsg: null,
  results: [], liveSov: null,
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
  const [live, setLive] = useState<RunLiveState>(INITIAL_STATE);
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const pollRef = useRef(false); // prevents duplicate poll loops

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

  const pct = live.totalExpected > 0 ? Math.round((live.received / live.totalExpected) * 100) : 0;

  // ── Poll run status from DB ────────────────────────
  const pollRunStatus = useCallback(async (brandId: string, runId: string) => {
    if (pollRef.current) return; // already polling
    pollRef.current = true;
    let pollErrors = 0;
    const MAX_POLL_ERRORS = 20;
    let pollDelay = 2000;
    let lastResultCount = 0;

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

          setLive(prev => ({
            ...prev,
            received: data.received || prev.received,
            totalExpected: data.totalExpected || prev.totalExpected,
            foundCount: data.foundCount || 0,
            errorCount: data.errorCount || 0,
            statusText: `${data.received || 0}/${data.totalExpected || 0} — ${data.foundCount || 0} found`,
            results: newResults.length > 0 ? [...prev.results, ...newResults] : prev.results,
          }));

          if (data.status === 'done' || data.status === 'error') {
            pollRef.current = false;
            runningRef.current = false;
            localStorage.removeItem('livesov_active_run');
            const finalResult = data.finalData;
            if (data.status === 'done' && finalResult) {
              setLive(prev => ({
                ...prev, running: false, status: 'done',
                liveSov: finalResult.sov ?? null,
                statusText: `Done! Found in ${finalResult.newMentions || finalResult.totalM || 0} of ${finalResult.totalQ || 0} responses`,
              }));
              setTimeout(() => { setLive(INITIAL_STATE); refreshBrands();
                window.dispatchEvent(new CustomEvent('livesov:run-complete')); }, 2500);
            } else {
              setLive(prev => ({
                ...prev, running: false, status: 'error',
                statusText: 'Run failed: ' + (data.error || 'Unknown error'),
                errorMsg: data.error || 'Unknown error',
              }));
              setTimeout(() => setLive(INITIAL_STATE), 5000);
            }
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
            liveSov: null,
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

  // ── Start run (POST + poll) ────────────────────────
  const startRun = useCallback(async (force = false) => {
    if (runningRef.current) return;
    runningRef.current = true;

    setLive({
      ...INITIAL_STATE, running: true, status: 'running',
      startTime: Date.now(), statusText: 'Connecting to AI platforms...',
    });

    try {
      // Use the currently selected brand from BrandContext
      if (!selectedBrand) {
        runningRef.current = false;
        setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'No brand set up', errorMsg: 'No brand set up' }));
        setTimeout(() => setLive(INITIAL_STATE), 3000);
        return;
      }

      const brandId = selectedBrand.id;
      const forceParam = force ? '&force=1' : '';

      // POST to start the run — returns immediately with runId
      const response = await fetch(`/api/brands/${brandId}/run?x=1${forceParam}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        if (response.status === 409) {
          runningRef.current = false;
          setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'A run is already in progress.', errorMsg: 'concurrent' }));
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
  }, [pollRunStatus, selectedBrand]);

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
