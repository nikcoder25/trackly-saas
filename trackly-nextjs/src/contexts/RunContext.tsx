'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

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
  ts: number; // client-side timestamp for ordering
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
  /** Final SOV from this run (set on completion) */
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

// ── Helpers ──────────────────────────────────────────
function fmtTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
}

// ── Provider ─────────────────────────────────────────
export function RunProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<RunLiveState>(INITIAL_STATE);
  const [elapsed, setElapsed] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

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

  // Computed
  const pct = live.totalExpected > 0 ? Math.round((live.received / live.totalExpected) * 100) : 0;

  // ── Poll fallback ──────────────────────────────────
  const pollRunStatus = useCallback(async (brandId: string, runId: string) => {
    let pollErrors = 0;
    const MAX_POLL_ERRORS = 15;
    let pollDelay = 2000;
    let lastResultCount = 0;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/brands/${brandId}/run-status/${runId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Poll failed');
        const data = await res.json();
        pollErrors = 0;

        const newResults: LiveResult[] = [];
        if (data.results && data.results.length > lastResultCount) {
          pollDelay = 2000;
          for (let i = lastResultCount; i < data.results.length; i++) {
            const r = data.results[i];
            newResults.push({ ...r, ts: Date.now() });
          }
          lastResultCount = data.results.length;
        } else {
          pollDelay = Math.min(pollDelay * 1.5, 10000);
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
          localStorage.removeItem('livesov_active_run');
          const finalResult = data.finalData?.result;
          if (data.status === 'done' && finalResult) {
            setLive(prev => ({
              ...prev, running: false, status: 'done',
              liveSov: finalResult.sov ?? null,
              statusText: `Done! Found in ${finalResult.newMentions || finalResult.totalM || 0} of ${finalResult.totalQ || 0} responses`,
            }));
            setTimeout(() => { setLive(INITIAL_STATE); window.location.reload(); }, 2500);
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
        return poll();
      } catch {
        pollErrors++;
        if (pollErrors >= MAX_POLL_ERRORS) {
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
        return poll();
      }
    };
    return poll();
  }, []);

  // ── Resume active run on mount ─────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('livesov_active_run');
    if (!stored) return;
    let runInfo: { runId: string; brandId: string; startedAt: number };
    try { runInfo = JSON.parse(stored); } catch { localStorage.removeItem('livesov_active_run'); return; }
    if (Date.now() - runInfo.startedAt > 10 * 60 * 1000) { localStorage.removeItem('livesov_active_run'); return; }

    fetch(`/api/brands/${runInfo.brandId}/run-status/${runInfo.runId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'running') {
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
          window.location.reload();
        } else {
          localStorage.removeItem('livesov_active_run');
        }
      })
      .catch(() => { localStorage.removeItem('livesov_active_run'); });
  }, [pollRunStatus]);

  // Keep ref in sync
  useEffect(() => { runningRef.current = live.running; }, [live.running]);

  // ── Start run with SSE streaming ───────────────────
  const startRun = useCallback(async (force = false) => {
    if (runningRef.current) return;
    runningRef.current = true;

    setLive({
      ...INITIAL_STATE, running: true, status: 'running',
      startTime: Date.now(), statusText: 'Connecting to AI platforms...',
    });

    try {
      const brandRes = await fetch('/api/brands', { credentials: 'include' });
      const brandData = await brandRes.json();
      const b = (brandData.brands || [])[0];
      if (!b) {
        runningRef.current = false;
        setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'No brand set up', errorMsg: 'No brand set up' }));
        setTimeout(() => setLive(INITIAL_STATE), 3000);
        return;
      }

      const brandId = b.id;
      const abortCtrl = new AbortController();
      abortRef.current = abortCtrl;
      const fetchTimeout = setTimeout(() => abortCtrl.abort(), 10 * 60 * 1000);

      const forceParam = force ? '&force=1' : '';
      const response = await fetch(`/api/brands/${brandId}/run?stream=1${forceParam}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
      });

      if (!response.ok) {
        clearTimeout(fetchTimeout);
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        if (response.status === 409) {
          runningRef.current = false;
          setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'A run is already in progress.', errorMsg: 'concurrent' }));
          return;
        }
        throw new Error(errData.error || 'Request failed');
      }

      clearTimeout(fetchTimeout);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let activeRunId: string | null = null;
      let sseReceived = 0;
      let sseTotalExpected = 0;
      let sseFoundCount = 0;
      let sseErrorCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let finalData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          if (evt.type === 'start') {
            sseTotalExpected = evt.totalExpected || 0;
            activeRunId = evt.runId || null;
            if (activeRunId) {
              localStorage.setItem('livesov_active_run', JSON.stringify({ runId: activeRunId, brandId, startedAt: Date.now() }));
            }
            setLive(prev => ({
              ...prev, runId: activeRunId, brandId, totalExpected: sseTotalExpected,
              statusText: `Running ${evt.queries?.length || 0} queries on ${evt.platforms?.length || 0} platforms...`,
            }));
          } else if (evt.type === 'result') {
            sseReceived++;
            const r = evt.result;
            if (r.error) sseErrorCount++;
            else if (r.mentioned) sseFoundCount++;

            const liveResult: LiveResult = { ...r, ts: Date.now() };

            // Update on every result for the live feed + toasts; throttle status text every 3rd
            setLive(prev => ({
              ...prev,
              received: sseReceived,
              foundCount: sseFoundCount,
              errorCount: sseErrorCount,
              results: [...prev.results, liveResult],
              ...(sseReceived % 3 === 0 || sseReceived >= sseTotalExpected
                ? { statusText: `${sseReceived}/${sseTotalExpected} — ${sseFoundCount} found` }
                : {}),
            }));
          } else if (evt.type === 'done') {
            finalData = evt;
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'Server error');
          }
        }
      }

      localStorage.removeItem('livesov_active_run');
      const result = finalData?.result || {
        totalQ: sseReceived, totalM: sseFoundCount,
        sov: sseReceived > 0 ? Math.round((sseFoundCount / sseReceived) * 100) : 0,
        newMentions: sseFoundCount, errorCount: sseErrorCount,
      };

      runningRef.current = false;
      setLive(prev => ({
        ...prev, running: false, status: 'done',
        received: sseReceived, foundCount: sseFoundCount, errorCount: sseErrorCount,
        liveSov: result.sov ?? null,
        statusText: `Done! Found in ${result.newMentions} of ${result.totalQ} responses`,
      }));

      setTimeout(() => { setLive(INITIAL_STATE); window.location.reload(); }, 2500);
    } catch (err) {
      const error = err as Error;
      const isAbort = error.name === 'AbortError';

      // Read current state to decide: poll fallback or show error
      // (can't call pollRunStatus inside setLive updater — side effects not allowed)
      setLive(prev => {
        if (prev.runId && prev.brandId) {
          // Keep running=true, runningRef stays true — polling will reset them
          return { ...prev, statusText: 'Reconnecting — queries still running...' };
        }
        runningRef.current = false;
        return {
          ...prev, running: false, status: 'error' as const,
          statusText: isAbort ? 'Connection timed out' : 'Run failed: ' + error.message,
          errorMsg: error.message,
        };
      });

      // Schedule polling fallback outside the state updater
      // Use a microtask so the setLive above resolves first
      queueMicrotask(() => {
        // Re-read from ref-accessible state — if still running, we have a runId to poll
        setLive(prev => {
          if (prev.running && prev.runId && prev.brandId) {
            pollRunStatus(prev.brandId, prev.runId);
          }
          return prev; // no state change
        });
      });

      // If no runId, auto-clear after 5s
      setTimeout(() => setLive(prev => {
        if (prev.status === 'error') { runningRef.current = false; return INITIAL_STATE; }
        return prev;
      }), 5000);
    }
  }, [pollRunStatus]);

  // ── Force-run ──────────────────────────────────────
  const forceRun = useCallback(async () => {
    try {
      let brandId = live.brandId;
      if (!brandId) {
        const brandRes = await fetch('/api/brands', { credentials: 'include' });
        const brandData = await brandRes.json();
        const b = (brandData.brands || [])[0];
        if (b) brandId = b.id;
      }
      if (brandId) {
        await fetch(`/api/brands/${brandId}/force-release`, { method: 'POST', credentials: 'include' });
      }
      setLive(INITIAL_STATE);
      setTimeout(() => startRun(true), 300);
    } catch {
      setLive(prev => ({ ...prev, statusText: 'Failed to release lock.', status: 'error' }));
      setTimeout(() => setLive(INITIAL_STATE), 3000);
    }
  }, [live.brandId, startRun]);

  return (
    <RunContext.Provider value={{ live, elapsed, pct, startRun, forceRun }}>
      {children}
    </RunContext.Provider>
  );
}
