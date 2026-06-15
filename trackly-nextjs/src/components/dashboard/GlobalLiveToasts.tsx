'use client';

import { useState, useEffect, useRef } from 'react';
import { useRun } from '@/contexts/RunContext';

/**
 * Global live result notifications — fixed bottom-right cards shown across ALL
 * dashboard pages while (and after) a query run is active.
 *
 * Unlike a raw per-(platform,query) feed, results are aggregated *per query*:
 * one card per tracked prompt that updates in real time as each engine reports,
 * e.g. "best crm for startups — mentioned on 3/5 engines". Cards persist until
 * the user dismisses them (individually, or via Clear all) or a new run starts,
 * so the user can review what happened after the scan finishes.
 */
interface QueryGroup {
  id: number;
  query: string;
  engines: string[];   // platforms that have reported for this query
  mentioned: number;   // engines where the brand was mentioned
  errors: number;      // engines that errored
  lastTs: number;
}

export default function GlobalLiveToasts() {
  const { live } = useRun();
  const [groups, setGroups] = useState<QueryGroup[]>([]);
  const groupIdRef = useRef(0);
  const consumedRef = useRef(0);   // how many of live.results we've folded in
  const runIdRef = useRef<string | null>(null);

  // A new run clears the previous run's cards so they don't bleed together.
  useEffect(() => {
    if (live.runId && live.runId !== runIdRef.current) {
      runIdRef.current = live.runId;
      consumedRef.current = 0;
      groupIdRef.current = 0;
      setGroups([]);
    }
  }, [live.runId]);

  // Fold newly-arrived results into their per-query group. We accumulate into
  // local state (not derived from live.results) so the cards survive the
  // RunContext reset to INITIAL_STATE that fires shortly after completion.
  useEffect(() => {
    if (live.results.length < consumedRef.current) {
      // live.results was reset (run finished / brand switch). Keep our cards;
      // just rewind the cursor so the next run starts folding from zero.
      consumedRef.current = 0;
      return;
    }
    if (live.results.length === consumedRef.current) return;
    const fresh = live.results.slice(consumedRef.current);
    consumedRef.current = live.results.length;

    setGroups(prev => {
      const next = prev.map(g => ({ ...g, engines: [...g.engines] }));
      for (const r of fresh) {
        const q = r.query || '(query)';
        let g = next.find(x => x.query === q);
        if (!g) {
          g = { id: ++groupIdRef.current, query: q, engines: [], mentioned: 0, errors: 0, lastTs: 0 };
          next.push(g);
        }
        if (r.platform && !g.engines.includes(r.platform)) g.engines.push(r.platform);
        if (r.error) g.errors += 1;
        else if (r.mentioned) g.mentioned += 1;
        g.lastTs = r.ts || Date.now();
      }
      return next;
    });
  }, [live.results.length]);

  if (groups.length === 0) return null;

  const dismissOne = (id: number) => setGroups(prev => prev.filter(g => g.id !== id));
  const dismissAll = () => setGroups([]);

  // Most-recently-updated first (column-reverse renders newest at the bottom).
  const ordered = [...groups].sort((a, b) => a.lastTs - b.lastTs);

  return (
    <>
      <div role="log" aria-live="polite" aria-label="Live query results" style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        maxHeight: '60vh', overflowY: 'auto', pointerEvents: 'none',
      }}>
        {groups.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', pointerEvents: 'auto' }}>
            <button onClick={dismissAll} aria-label="Dismiss all notifications" style={{
              padding: '5px 12px', fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
              background: 'var(--bg2)', color: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 100, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.1)',
              letterSpacing: '.3px',
            }}>
              CLEAR ALL
            </button>
          </div>
        )}
        {ordered.map(g => {
          const total = g.engines.length;
          const positive = g.mentioned > 0;
          const accent = g.mentioned > 0 ? 'var(--green)' : g.errors === total && total > 0 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
              minWidth: 280, maxWidth: 380, animation: 'globalToastIn .35s ease',
              pointerEvents: 'auto', borderLeft: `3px solid ${accent}`,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: positive ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)',
                color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>
                {positive ? '✓' : g.errors === total && total > 0 ? '!' : '–'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {g.query}
                </div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  {positive
                    ? `mentioned on ${g.mentioned}/${total} engine${total === 1 ? '' : 's'}`
                    : g.errors === total && total > 0
                      ? `error on ${g.errors}/${total} engine${total === 1 ? '' : 's'}`
                      : `not mentioned · ${total} engine${total === 1 ? '' : 's'} checked`}
                </div>
              </div>
              <button onClick={() => dismissOne(g.id)} aria-label="Dismiss" style={{
                background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: 0.5,
              }}>&times;</button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes globalToastIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
