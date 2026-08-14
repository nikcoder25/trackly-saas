'use client';

/**
 * The dashboard command palette (⌘K / Ctrl+K).
 *
 * Replaces a topbar element that looked like a search box but was a <Link>
 * wrapping a <span> - no input, no keyboard handler, and a ⌘K badge that did
 * nothing. This is the real thing: a focus-trapped dialog with a live query
 * against /api/search plus offline page navigation.
 *
 * Two result sources, deliberately different:
 *   Pages    - matched locally against the shared nav list. No network, so
 *              navigation stays instant and keeps working if search errors.
 *   Data     - prompts / mentions / sources from /api/search, debounced.
 *
 * A stale-response guard (`requestSeq`) is what stops the classic palette
 * bug where a slow response for "ch" lands after a fast one for "chatgpt"
 * and overwrites the correct results with older ones.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { allNavItems, matchesNavQuery, type NavItem } from '@/lib/dashboard-nav';

interface SearchResult {
  kind: 'prompt' | 'mention' | 'source';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  brandId: string;
  platform?: string;
  when?: string;
}

interface ApiResponse {
  results: { prompts: SearchResult[]; mentions: SearchResult[]; sources: SearchResult[] };
  total: number;
}

/** A row in the rendered list - either a page or a data result. */
type Row =
  | { type: 'page'; key: string; item: NavItem }
  | { type: 'result'; key: string; item: SearchResult };

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;
const MAX_PAGE_ROWS = 5;

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  prompt: 'Prompts',
  mention: 'Mentions',
  source: 'Sources',
};

/**
 * Controlled: the topbar button and the ⌘K shortcut have to drive the same
 * dialog, so `open` lives in the shell. The shortcut listener still lives
 * here, because it belongs to the palette rather than to the shell.
 */
export default function CommandPalette({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedBrand } = useBrands();

  const [query, setQuery] = useState('');
  const [data, setData] = useState<ApiResponse['results'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Monotonic request counter; only the newest response is allowed to win.
  const requestSeq = useRef(0);
  // Where focus was before opening, so Escape returns the user to it.
  const restoreFocusRef = useRef<Element | null>(null);

  const isAdmin = user?.plan === 'owner' || user?.role === 'admin';

  // ── Open / close ──────────────────────────────────────────────

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setData(null);
    setFailed(false);
    setActiveIndex(0);
    // Bump the counter so any in-flight response is discarded rather than
    // landing in state after the palette has closed.
    requestSeq.current++;
    if (restoreFocusRef.current instanceof HTMLElement) restoreFocusRef.current.focus();
  }, [onOpenChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!open) restoreFocusRef.current = document.activeElement;
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Freeze background scrolling while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // ── Fetching ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setData(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (selectedBrand?.id) params.set('brandId', selectedBrand.id);

      fetch(`/api/search?${params}`, { credentials: 'include', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: ApiResponse) => {
          // Discard if a newer keystroke has already fired.
          if (seq !== requestSeq.current) return;
          setData(json.results);
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || seq !== requestSeq.current) return;
          setFailed(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, selectedBrand?.id]);

  // ── Rows ──────────────────────────────────────────────────────

  const pageRows = useMemo<Row[]>(() => {
    const q = query.trim();
    return allNavItems
      .filter((item) => (item.adminOnly ? isAdmin : true))
      .filter((item) => matchesNavQuery(item.label, q))
      .slice(0, MAX_PAGE_ROWS)
      .map((item) => ({ type: 'page' as const, key: `page:${item.href}`, item }));
  }, [query, isAdmin]);

  const groupedResults = useMemo(() => {
    if (!data) return [] as Array<{ label: string; rows: Row[] }>;
    return ([
      ['prompt', data.prompts],
      ['mention', data.mentions],
      ['source', data.sources],
    ] as Array<[SearchResult['kind'], SearchResult[]]>)
      .filter(([, list]) => list.length > 0)
      .map(([kind, list]) => ({
        label: KIND_LABEL[kind],
        rows: list.map((item) => ({ type: 'result' as const, key: item.id, item })),
      }));
  }, [data]);

  // One flat list drives keyboard navigation; the groups are only visual.
  const flatRows = useMemo<Row[]>(
    () => [...pageRows, ...groupedResults.flatMap((g) => g.rows)],
    [pageRows, groupedResults]
  );

  // Any change to the result set resets the highlight to the top, so Enter
  // never fires the row that happened to sit at the old index.
  useEffect(() => { setActiveIndex(0); }, [flatRows.length, query]);

  const select = useCallback((row: Row) => {
    const href = row.type === 'page' ? row.item.href : row.item.href;
    close();
    router.push(href);
  }, [close, router]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (flatRows.length ? (i + 1) % flatRows.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (flatRows.length ? (i - 1 + flatRows.length) % flatRows.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = flatRows[activeIndex];
      if (row) select(row);
    }
  };

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  const trimmed = query.trim();
  const showEmpty = !loading && !failed && trimmed.length >= MIN_QUERY && flatRows.length === 0;

  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(8,10,20,.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, calc(100vw - 32px))', maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg2, #fff)', color: 'var(--text, #111)',
          border: '1px solid var(--border, #e5e7eb)', borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,.28)', overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: .5 }} aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search prompts, mentions, sources…"
            aria-label="Search prompts, mentions and sources"
            role="combobox"
            aria-expanded={flatRows.length > 0}
            aria-controls="command-palette-list"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, color: 'inherit', fontFamily: 'inherit',
            }}
          />
          {loading && (
            <span style={{ width: 14, height: 14, border: '2px solid var(--primary, #6366f1)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'cp-spin .8s linear infinite' }} aria-hidden="true" />
          )}
          <kbd style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border, #e5e7eb)', opacity: .6 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-list" role="listbox" style={{ overflowY: 'auto', padding: '6px 0' }}>
          {pageRows.length > 0 && (
            <Group label="Pages">
              {pageRows.map((row) => {
                const idx = flatRows.indexOf(row);
                return (
                  <RowButton
                    key={row.key}
                    active={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(row)}
                    icon={(row.item as NavItem).icon}
                    title={(row.item as NavItem).label}
                    subtitle={(row.item as NavItem).href}
                  />
                );
              })}
            </Group>
          )}

          {groupedResults.map((group) => (
            <Group key={group.label} label={group.label}>
              {group.rows.map((row) => {
                const idx = flatRows.indexOf(row);
                const item = row.item as SearchResult;
                return (
                  <RowButton
                    key={row.key}
                    active={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(row)}
                    icon={item.kind === 'prompt' ? '◈' : item.kind === 'mention' ? '◎' : '◇'}
                    title={item.title}
                    subtitle={item.subtitle}
                  />
                );
              })}
            </Group>
          ))}

          {trimmed.length < MIN_QUERY && (
            <p style={{ padding: '18px 18px 20px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>
              Type at least {MIN_QUERY} characters to search your prompts, mentions and sources.
            </p>
          )}
          {showEmpty && (
            <p style={{ padding: '18px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>
              Nothing matches “{trimmed}”.
            </p>
          )}
          {failed && (
            <p style={{ padding: '18px', fontSize: 13, color: 'var(--red, #ef4444)' }}>
              Search is unavailable right now. Page navigation above still works.
            </p>
          )}
        </div>

        {/* Footer hints */}
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: '1px solid var(--border, #e5e7eb)', fontSize: 11, color: 'var(--muted, #6b7280)' }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          {selectedBrand?.name && <span style={{ marginLeft: 'auto' }}>Searching {selectedBrand.name}</span>}
        </div>
      </div>

      <style>{`@keyframes cp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted, #6b7280)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function RowButton({ active, onClick, onMouseEnter, icon, title, subtitle }: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-active={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
        padding: '9px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
        background: active ? 'var(--bg3, #f3f4f6)' : 'transparent',
        color: 'inherit', font: 'inherit',
      }}
    >
      <span style={{ flexShrink: 0, opacity: .6, lineHeight: 1.5 }} aria-hidden="true">{icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
