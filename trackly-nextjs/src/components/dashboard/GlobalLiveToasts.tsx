'use client';

import { useState, useEffect, useRef } from 'react';
import { useRun, type LiveResult } from '@/contexts/RunContext';
import { PLATFORM_COLORS } from '@/lib/constants';

/**
 * Global live result toasts — shown as fixed bottom-right cards
 * across ALL dashboard pages when a query run is active.
 * Each new result slides in and auto-dismisses after 4s.
 */
export default function GlobalLiveToasts() {
  const { live } = useRun();
  const [toasts, setToasts] = useState<Array<LiveResult & { id: number }>>([]);
  const toastIdRef = useRef(0);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (live.results.length <= lastCountRef.current) return;
    const newResults = live.results.slice(lastCountRef.current);
    lastCountRef.current = live.results.length;
    const newToasts = newResults.map(r => ({ ...r, id: ++toastIdRef.current }));
    setToasts(prev => [...prev, ...newToasts].slice(-6));
    const ids = newToasts.map(t => t.id);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => !ids.includes(t.id)));
    }, 3500);
    return () => clearTimeout(timer);
  }, [live.results.length]);

  // Reset counter when run finishes
  useEffect(() => {
    if (!live.running && live.status === 'idle') {
      lastCountRef.current = 0;
    }
  }, [live.running, live.status]);

  if (toasts.length === 0) return null;

  return (
    <>
      <div role="log" aria-live="polite" aria-label="Live query results" style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        maxHeight: '50vh', pointerEvents: 'none',
      }}>
        {toasts.length > 1 && (
          <button
            onClick={() => setToasts([])}
            aria-label="Close all notifications"
            style={{
              pointerEvents: 'auto', alignSelf: 'flex-end',
              padding: '4px 10px', fontSize: 10, fontWeight: 700,
              fontFamily: 'var(--mono)', color: 'var(--muted)',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              transition: 'all .2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            Close All
          </button>
        )}
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            minWidth: 280, maxWidth: 380, animation: 'globalToastIn .35s ease',
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
              whiteSpace: 'nowrap',
            }}>
              {t.error ? 'ERROR' : t.mentioned ? 'FOUND' : 'NOT FOUND'}
            </span>
          </div>
        ))}
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
