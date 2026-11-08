'use client';
/**
 * A site's keywords, opened inline under its row: count chips, a filter box,
 * bulk actions on the checked rows and one row per keyword. Starred keywords
 * sort first. Click a row for its position history.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RankSiteKeyword, RankSiteKeywords } from '@/lib/rank-tracking/types';
import { rtFetch, AiStatusText, srOnly } from '@/components/rank-tracking/RankUi';
import { siteKeywordOrder } from '@/lib/rank-tracking/order';
import { RankBadge, ChangeText, TrendSpark, Chevron, StarIcon, iconBtn, urlPath, fmtShort } from './bits';
import KeywordDetail from './KeywordDetail';
import { C } from './theme';

type Chip = 'all' | 'top3' | 'top10' | 'moved' | 'none';
const CHIPS: [Chip, string][] = [['all', 'All'], ['top3', 'Top 3'], ['top10', 'Top 10'], ['moved', 'Moved'], ['none', 'Not ranking']];
const TEST: Record<Chip, (k: RankSiteKeyword) => boolean> = {
  all: () => true,
  top3: (k) => k.current != null && k.current <= 3,
  top10: (k) => k.current != null && k.current <= 10,
  moved: (k) => k.hasPrevious && k.change !== 0,
  none: (k) => !!k.checkedAt && k.current == null,
};

const COLS = '36px 32px minmax(200px, 2.2fr) 58px 62px 50px 106px 70px minmax(140px, 1.5fr) 110px 70px 36px';

const chipStyle = (on: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, padding: '0 12px', height: 32, borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? C.indigo : C.line}`, background: on ? C.indigoSoft : '#fff', color: on ? C.navy : C.text, display: 'inline-flex', alignItems: 'center', gap: 6,
});
const smallBtn: React.CSSProperties = {
  font: 'inherit', fontSize: 13, fontWeight: 500, height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff',
  color: C.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function KeywordTable({ websiteId, domain, reloadKey, onChanged }: { websiteId: string; domain: string; reloadKey: number; onChanged: () => void }) {
  const [data, setData] = useState<RankSiteKeywords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<Chip>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await rtFetch<RankSiteKeywords>(`/api/rank/sites/${encodeURIComponent(websiteId)}/keywords`));
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to load keywords');
    }
  }, [websiteId]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const all = useMemo(() => data?.keywords ?? [], [data]);
  const anyPending = all.some((k) => k.pending);
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const needle = q.trim().toLowerCase();
  const rows = all.filter(TEST[chip]).filter((k) => !needle || k.keyword.includes(needle) || (k.rankingUrl || '').toLowerCase().includes(needle));
  const selected = all.filter((k) => sel.has(k.id));
  const allOn = rows.length > 0 && rows.every((k) => sel.has(k.id));

  function toggleAll() {
    setSel((s) => {
      const n = new Set(s);
      if (allOn) rows.forEach((k) => n.delete(k.id)); else rows.forEach((k) => n.add(k.id));
      return n;
    });
  }
  function toggleOne(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function star(k: RankSiteKeyword) {
    const next = !k.starred;
    setData((d) => d && { ...d, keywords: d.keywords.map((x) => (x.id === k.id ? { ...x, starred: next } : x)).sort(siteKeywordOrder) });
    try {
      await rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids: [k.id], starred: next });
    } catch (e) {
      setNote({ text: (e as Error).message || 'Could not save the star.', bad: true });
      load();
    }
  }

  async function bulk(action: 'delete' | 'group' | 'recheck' | 'export') {
    setMenu(false);
    const ids = selected.map((k) => k.id);
    if (!ids.length) return;
    if (action === 'export') {
      const head = ['Keyword', 'Location', 'Device', 'Rank', 'Previous', 'Change', 'Best', 'Volume', 'Ranking URL', 'AI answers', 'Checked'];
      const lines = selected.map((k) => [k.keyword, k.locationName, k.device, k.current ?? '', k.previous ?? '', k.change, k.best ?? '', k.volume ?? '', k.rankingUrl ?? '', k.ai ?? '', k.checkedAt ?? ''].map(csvCell).join(','));
      const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${domain}-keywords.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    let groupName = '';
    if (action === 'group') {
      groupName = (window.prompt(`Move ${ids.length} keyword${ids.length === 1 ? '' : 's'} to which group?`, data?.groups[0]?.name || '') || '').trim();
      if (!groupName) return;
    }
    if (action === 'delete' && !window.confirm(`Stop tracking ${ids.length} keyword${ids.length === 1 ? '' : 's'}? Their rank history is deleted too.`)) return;
    setBusy(true);
    setNote(null);
    try {
      if (action === 'delete') {
        const r = await rtFetch<{ deleted: number }>('/api/rank-tracking/keywords', 'DELETE', { ids });
        setNote({ text: `${r.deleted} keyword${r.deleted === 1 ? '' : 's'} deleted.` });
        setSel(new Set());
        onChanged();
      } else if (action === 'group') {
        await rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids, groupName });
        setNote({ text: `Moved ${ids.length} to “${groupName}”.` });
      } else {
        const r = await rtFetch<{ queued: number }>('/api/rank/keywords/recheck', 'POST', { ids });
        setNote({ text: r.queued ? `${r.queued} keyword${r.queued === 1 ? '' : 's'} queued. New positions show within about 10 minutes.` : 'Those keywords are already being checked.' });
      }
      await load();
    } catch (e) {
      setNote({ text: (e as Error).message || 'That did not work. Try again.', bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="Show keywords" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CHIPS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={chip === v} onClick={() => setChip(v)} className="rtc-chip" style={chipStyle(chip === v)}>
              {l}<span style={{ fontSize: 12, fontWeight: 600, color: chip === v ? C.indigo : C.muted }}>{data ? all.filter(TEST[v]).length : ''}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.line}`, borderRadius: 8, padding: '0 10px', height: 34, background: '#fff' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></svg>
            <span style={srOnly}>Filter keywords</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords"
              style={{ font: 'inherit', fontSize: 13, border: 0, outline: 'none', width: 150, height: 32, color: C.ink, background: 'transparent' }} />
          </label>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button type="button" aria-haspopup="menu" aria-expanded={menu} disabled={!selected.length || busy} onClick={() => setMenu((m) => !m)}
              style={{ ...smallBtn, opacity: selected.length ? 1 : 0.55, cursor: selected.length ? 'pointer' : 'not-allowed' }}>
              Bulk actions{selected.length ? ` (${selected.length})` : ''} <Chevron open={menu} />
            </button>
            {menu && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 38, zIndex: 20, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(15,23,42,.12)', padding: 4, minWidth: 180 }}>
                {([['recheck', 'Re-check now'], ['group', 'Move to group…'], ['export', 'Export CSV'], ['delete', 'Delete']] as const).map(([a, l]) => (
                  <button key={a} type="button" role="menuitem" onClick={() => bulk(a)} className="rtc-menu"
                    style={{ font: 'inherit', fontSize: 13, display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, borderRadius: 6, background: 'transparent', cursor: 'pointer', color: a === 'delete' ? C.downText : C.ink }}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {note && (
        <div role="status" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: note.bad ? '#fef2f2' : C.indigoSoft, color: note.bad ? C.downText : C.navy, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{note.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNote(null)} style={{ ...iconBtn, width: 22, height: 22 }}>×</button>
        </div>
      )}

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflowX: 'auto', background: '#fff' }}>
        <div style={{ minWidth: 1080 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 10px', height: 36, fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, background: C.bg, borderBottom: `1px solid ${C.line}` }}>
            <span><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all shown keywords" style={{ accentColor: C.indigo, width: 15, height: 15 }} /></span>
            <span><span style={srOnly}>Favourite</span></span>
            <span>Keyword</span><span>Rank</span><span>Change</span><span>Best</span><span>Trend</span><span>Volume</span><span>Ranking URL</span><span>AI answers</span><span>Checked</span>
            <span><span style={srOnly}>Details</span></span>
          </div>

          {error ? (
            <div role="alert" style={{ padding: '18px 14px', fontSize: 13, color: C.downText }}>{error}</div>
          ) : !data ? (
            <div aria-busy="true" style={{ padding: '22px 14px', fontSize: 13, color: C.muted }}>Loading keywords…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', color: C.muted, fontSize: 13 }}>{all.length ? 'No keywords match this filter.' : 'No keywords yet. Use + to add some.'}</div>
          ) : rows.map((k) => {
            const isOpen = open === k.id;
            const checking = k.pending && !k.checkedAt;
            const toggle = () => setOpen(isOpen ? null : k.id);
            return (
              <div key={k.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                <div className="rtc-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a,input,label')) toggle(); }}
                  style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 10px', minHeight: 50, fontSize: 13, cursor: 'pointer', background: isOpen ? '#f8faff' : sel.has(k.id) ? '#fafbff' : undefined }}>
                  <span><input type="checkbox" checked={sel.has(k.id)} onChange={() => toggleOne(k.id)} aria-label={`Select ${k.keyword}`} style={{ accentColor: C.indigo, width: 15, height: 15 }} /></span>
                  <span>
                    <button type="button" onClick={() => star(k)} aria-pressed={k.starred} aria-label={k.starred ? `Unstar ${k.keyword}` : `Star ${k.keyword}`} style={{ ...iconBtn, width: 28, height: 28 }}>
                      <StarIcon on={k.starred} />
                    </button>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '7px 8px 7px 0' }}>
                    <span style={{ fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.keyword}</span>
                    <span style={{ fontSize: 11, color: k.error ? C.downText : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {k.error ? k.error : `${k.location || 'Unknown'} · ${k.device === 'mobile' ? 'Mobile' : 'Desktop'}${k.groupName ? ` · ${k.groupName}` : ''}`}
                    </span>
                  </span>
                  <span>{checking ? <span style={{ color: C.muted, fontSize: 12 }}>…</span> : <RankBadge rank={k.current} />}</span>
                  <span>{k.hasPrevious ? <ChangeText v={k.change} /> : <span style={{ color: C.grey }}>–</span>}</span>
                  <span style={{ color: C.text }}>{k.best ?? '–'}</span>
                  <span><TrendSpark ranks={k.history} depth={k.depth} /></span>
                  <span style={{ color: C.text }}>{k.volume == null ? '–' : k.volume.toLocaleString('en-US')}</span>
                  <span title={k.rankingUrl ?? undefined} style={{ fontSize: 12, color: k.rankingUrl ? '#4338ca' : C.grey, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
                    {k.rankingUrl ? <a href={k.rankingUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{urlPath(k.rankingUrl)}</a> : k.checkedAt ? `Not in top ${k.depth}` : '–'}
                  </span>
                  <span style={{ fontSize: 12 }}><AiStatusText status={k.ai} /></span>
                  <span style={{ color: C.muted, fontSize: 12 }}>{checking ? 'Checking…' : fmtShort(k.checkedAt)}</span>
                  <span>
                    <button type="button" aria-label={`${isOpen ? 'Hide' : 'Show'} history for ${k.keyword}`} aria-expanded={isOpen} onClick={toggle} style={{ ...iconBtn, width: 28, height: 28 }}>
                      <Chevron open={isOpen} />
                    </button>
                  </span>
                </div>
                {isOpen && <KeywordDetail kw={k} websiteId={websiteId} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
