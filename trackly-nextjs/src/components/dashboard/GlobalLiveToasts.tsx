'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRun } from '@/contexts/RunContext';
import { useBrands } from '@/contexts/BrandContext';

/**
 * Global live result notifications — fixed bottom-right cards shown while (and
 * shortly after) a scan runs.
 *
 * Scope: these are strictly *per brand*. Cards only ever reflect the brand the
 * user is currently viewing in the topbar dropdown; switching brands drops the
 * previous brand's cards immediately so one brand's run never bleeds into
 * another's view.
 *
 * Each tracked prompt gets one card showing whether the brand was mentioned or
 * not. We deliberately do NOT surface which AI engines/models were used — only
 * an aggregate count ("mentioned on 3/5 engines"). Cards auto-dismiss a few
 * seconds after their last update if the user doesn't touch them, and there's a
 * single "Clear all" control at the top to wipe them at once. Individual cards
 * can also be closed. Clicking a card opens that query's full detail view
 * (/dashboard/prompt-details?q=…) via soft navigation, so the live run state
 * survives and the detail page shows the in-progress results immediately.
 */
const AUTO_DISMISS_MS = 8000; // a card disappears this long after its last update

interface QueryGroup {
  id: number;
  query: string;
  engines: string[];   // platforms reported (kept only to count — never rendered)
  mentioned: number;
  errors: number;
  lastTs: number;
}

export default function GlobalLiveToasts() {
  const { live } = useRun();
  const { selectedBrand } = useBrands();
  const router = useRouter();
  const selectedId = selectedBrand?.id ?? null;

  // Clicking a card opens that query's full detail view. Soft (client-side)
  // navigation so the live RunContext state survives and the page renders the
  // already-known engine results immediately instead of a blank page.
  const openQuery = (query: string) =>
    router.push('/dashboard/prompt-details?q=' + encodeURIComponent(query));

  const [groups, setGroups] = useState<QueryGroup[]>([]);
  const groupIdRef = useRef(0);
  const consumedRef = useRef(0);            // how many of live.results we've folded in
  const runIdRef = useRef<string | null>(null);
  const groupsBrandRef = useRef<string | null>(null); // which brand the cards belong to

  // New run → clear the slate and bind the cards to the running brand.
  useEffect(() => {
    if (live.runId && live.runId !== runIdRef.current) {
      runIdRef.current = live.runId;
      groupsBrandRef.current = live.brandId;
      consumedRef.current = 0;
      groupIdRef.current = 0;
      setGroups([]);
    }
  }, [live.runId, live.brandId]);

  // Per-brand scoping: the instant the user switches to a different brand in
  // the dropdown, drop the previous brand's cards.
  useEffect(() => {
    if (groupsBrandRef.current && selectedId && selectedId !== groupsBrandRef.current) {
      groupsBrandRef.current = null;
      consumedRef.current = 0;
      setGroups([]);
    }
  }, [selectedId]);

  // Fold newly-arrived results into their per-query group — but ONLY for a run
  // that belongs to the brand currently being viewed.
  useEffect(() => {
    const forCurrentBrand = !!live.brandId && live.brandId === selectedId;
    if (!forCurrentBrand) return;
    if (live.results.length < consumedRef.current) { consumedRef.current = 0; return; }
    if (live.results.length === consumedRef.current) return;
    const fresh = live.results.slice(consumedRef.current);
    consumedRef.current = live.results.length;
    groupsBrandRef.current = live.brandId;

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
  }, [live.results.length, live.brandId, selectedId]);

  // Auto-dismiss: sweep cards that haven't updated for AUTO_DISMISS_MS. A card
  // still receiving engine results stays put; once it goes quiet it fades on
  // its own without the user clicking anything.
  useEffect(() => {
    if (groups.length === 0) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - AUTO_DISMISS_MS;
      setGroups(prev => {
        const filtered = prev.filter(g => g.lastTs > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [groups.length]);

  if (groups.length === 0) return null;

  const dismissOne = (id: number) => setGroups(prev => prev.filter(g => g.id !== id));
  const dismissAll = () => setGroups([]);

  // Oldest first → newest ends up nearest the corner; the Clear-all bar sits at
  // the very top of the stack.
  const ordered = [...groups].sort((a, b) => a.lastTs - b.lastTs);

  return (
    <>
      <div role="log" aria-live="polite" aria-label="Live query results" style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: '70vh', overflowY: 'auto', pointerEvents: 'none',
      }}>
        {/* Single Clear-all control, always available at the top of the stack */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', pointerEvents: 'auto' }}>
          <button onClick={dismissAll} aria-label="Dismiss all notifications" style={{
            padding: '5px 12px', fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
            background: 'var(--bg2)', color: 'var(--muted)', border: '1px solid var(--border)',
            borderRadius: 100, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.1)',
            letterSpacing: '.3px',
          }}>
            CLEAR ALL ✕
          </button>
        </div>
        {ordered.map(g => {
          const total = g.engines.length;
          const positive = g.mentioned > 0;
          const accent = positive ? 'var(--green)' : g.errors === total && total > 0 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={g.id}
              className="glt-card"
              role="button"
              tabIndex={0}
              title="Open this query's results"
              onClick={() => openQuery(g.query)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuery(g.query); } }}
              style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
              minWidth: 280, maxWidth: 380, animation: 'globalToastIn .35s ease',
              pointerEvents: 'auto', borderLeft: `3px solid ${accent}`, cursor: 'pointer',
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
              <button onClick={(e) => { e.stopPropagation(); dismissOne(g.id); }} aria-label="Dismiss" style={{
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
        .glt-card { transition: border-color .15s ease, box-shadow .15s ease; }
        .glt-card:hover { border-color: var(--primary); box-shadow: 0 6px 18px rgba(0,0,0,.22); }
      `}</style>
    </>
  );
}
