'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRun, type LiveResult } from '@/contexts/RunContext';
import { PLATFORM_COLORS } from '@/lib/constants';

const AUTO_DISMISS_MS = 4000;
const FADE_OUT_MS = 500;

/**
 * Global live result toasts — shown as fixed bottom-right cards
 * across ALL dashboard pages when a query run is active.
 * Each new result slides in and auto-dismisses after a few seconds.
 */
export default function GlobalLiveToasts() {
  const { live } = useRun();
  const [toasts, setToasts] = useState<Array<LiveResult & { id: number }>>([]);
  const [fadingIds, setFadingIds] = useState<Set<number>>(new Set());
  const toastIdRef = useRef(0);
  const lastCountRef = useRef(0);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const startFadeAndDismiss = useCallback((id: number) => {
    setFadingIds(prev => new Set(prev).add(id));
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      setFadingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      timersRef.current.delete(id);
    }, FADE_OUT_MS);
    timersRef.current.set(id, removeTimer);
  }, []);

  useEffect(() => {
    if (live.results.length <= lastCountRef.current) return;
    const newResults = live.results.slice(lastCountRef.current);
    lastCountRef.current = live.results.length;
    const newToasts = newResults.map(r => ({ ...r, id: ++toastIdRef.current }));
    setToasts(prev => [...prev, ...newToasts].slice(-6));

    // Schedule individual auto-dismiss for each new toast
    newToasts.forEach(t => {
      const fadeTimer = setTimeout(() => startFadeAndDismiss(t.id), AUTO_DISMISS_MS);
      timersRef.current.set(t.id, fadeTimer);
    });
  }, [live.results.length, startFadeAndDismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); timers.clear(); };
  }, []);

  // Reset counter when run finishes
  useEffect(() => {
    if (!live.running && live.status === 'idle') {
      lastCountRef.current = 0;
    }
  }, [live.running, live.status]);

  if (toasts.length === 0) return null;

  const dismissOne = (id: number) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    startFadeAndDismiss(id);
  };
  const dismissAll = () => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current.clear();
    const ids = toasts.map(t => t.id);
    setFadingIds(new Set(ids));
    setTimeout(() => { setToasts([]); setFadingIds(new Set()); }, FADE_OUT_MS);
  };

  return (
    <>
      <div role="log" aria-live="polite" aria-label="Live query results" style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        maxHeight: '50vh', pointerEvents: 'none',
      }}>
        {/* Clear All button */}
        {toasts.length > 1 && (
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
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            minWidth: 280, maxWidth: 380,
            animation: fadingIds.has(t.id) ? `globalToastOut ${FADE_OUT_MS}ms ease forwards` : 'globalToastIn .35s ease',
            pointerEvents: 'auto',
            borderLeft: `3px solid ${t.error ? 'var(--amber)' : t.mentioned ? 'var(--green)' : 'var(--red)'}`,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: PLATFORM_COLORS[t.platform] || 'var(--bg3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0,
            }}>
              {t.platform[0]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: PLATFORM_COLORS[t.platform] || 'var(--muted)', fontWeight: 700 }}>
                {t.platform}{t.model ? ` · ${t.model}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.query}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100,
              background: t.error ? 'rgba(245,158,11,.1)' : t.mentioned ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.08)',
              color: t.error ? 'var(--amber)' : t.mentioned ? 'var(--green)' : 'var(--red)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {t.error ? 'ERROR' : t.mentioned ? 'FOUND' : 'NOT FOUND'}
            </span>
            <button onClick={() => dismissOne(t.id)} aria-label="Dismiss" style={{
              background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
              fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: 0.5,
            }}>&times;</button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes globalToastIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes globalToastOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(40px); }
        }
      `}</style>
    </>
  );
}
