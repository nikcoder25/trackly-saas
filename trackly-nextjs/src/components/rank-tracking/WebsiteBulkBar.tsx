'use client';
/**
 * Bulk actions for selected keywords on the website page: move to group,
 * change location (city autocomplete), export CSV and delete.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { KeywordDto } from '@/lib/rank-tracking/types';
import { RT, rtFetch, AI_LABEL, inputStyle } from '@/components/rank-tracking/RankUi';
import { urlPath } from '@/components/rank-tracking/WebsiteKeywordPanel';

interface LocationOption { code: number; name: string; type: string | null }

const btn: React.CSSProperties = {
  font: 'inherit', fontSize: 13, padding: '8px 12px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, border: '1px solid #cbd5e1',
  background: '#fff', color: RT.ink, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = { ...btn, border: '1px solid #fecaca', background: '#fef2f2', color: RT.down };
const btnGo: React.CSSProperties = { ...btn, border: 0, background: RT.indigo, color: '#fff', fontWeight: 600 };
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: KeywordDto[], domain: string) {
  const head = ['Keyword', 'Rank', 'Change', 'Best', 'Volume', 'In AI answers', 'Ranking page', 'Tracked from', 'Device', 'Group', 'Starred', 'Checked'];
  const lines = rows.map((k) => [
    k.keyword, k.rank ?? (k.checkedAt ? `${k.depth}+` : ''), k.change, k.best ?? '', k.volume ?? '', k.ai ? AI_LABEL[k.ai] : 'Not tracked',
    k.url ?? '', k.city || k.locationName, k.device, k.groupName ?? '', k.starred ? 'yes' : '', k.checkedAt ? k.checkedAt.slice(0, 10) : '',
  ].map(csvCell).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${domain.replace(/[^a-z0-9.-]/gi, '_')}-keywords.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function WebsiteBulkBar({ selected, groups, domain, onDone, onError }: {
  selected: KeywordDto[];
  groups: { id: string; name: string }[];
  domain: string;
  onDone: (message: string, clearSelection: boolean) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<null | 'group' | 'location'>(null);
  const [busy, setBusy] = useState(false);
  const [groupPick, setGroupPick] = useState<string>(groups[0]?.id ?? '__new');
  const [groupName, setGroupName] = useState('');
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<LocationOption[]>([]);
  const [loc, setLoc] = useState<LocationOption | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = selected.map((k) => k.id);
  const n = selected.length;
  const what = `${n} keyword${n === 1 ? '' : 's'}`;

  useEffect(() => {
    if (mode !== 'location' || loc?.name === q) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setOpts([]); return; }
    let live = true;
    timer.current = setTimeout(() => {
      rtFetch<{ locations: LocationOption[] }>(`/api/rank-tracking/locations?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (live) setOpts(r.locations || []); })
        .catch(() => { if (live) setOpts([]); });
    }, 250);
    return () => { live = false; };
  }, [q, mode, loc]);

  async function run(fn: () => Promise<unknown>, msg: string, clear: boolean) {
    setBusy(true);
    try {
      await fn();
      setMode(null);
      onDone(msg, clear);
    } catch (e) {
      onError((e as Error).message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function applyGroup(e: React.FormEvent) {
    e.preventDefault();
    if (groupPick === '__new') {
      const name = groupName.trim();
      if (!name) { onError('Type a name for the new group.'); return; }
      run(() => rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids, groupName: name }), `Moved ${what} to ${name}.`, true);
    } else if (groupPick === '__none') {
      run(() => rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids, groupId: null }), `Removed ${what} from their group.`, true);
    } else {
      const g = groups.find((x) => x.id === groupPick);
      run(() => rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids, groupId: groupPick }), `Moved ${what} to ${g?.name ?? 'the group'}.`, true);
    }
  }

  function applyLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!loc) { onError('Pick a city from the list.'); return; }
    run(() => rtFetch('/api/rank-tracking/keywords', 'PATCH', { ids, locationCode: loc.code, locationName: loc.name }),
      `${what} now checked from ${loc.name}. New ranks show after the next check.`, true);
  }

  function remove() {
    if (!window.confirm(`Stop tracking ${what}? Their rank history is deleted too.`)) return;
    run(() => rtFetch('/api/rank-tracking/keywords', 'DELETE', { ids }), `Deleted ${what}.`, true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#3730a3' }} aria-live="polite">{n} selected</span>
        <button type="button" style={btn} disabled={busy} aria-expanded={mode === 'group'} onClick={() => setMode(mode === 'group' ? null : 'group')}>Move to group</button>
        <button type="button" style={btn} disabled={busy} aria-expanded={mode === 'location'} onClick={() => { setMode(mode === 'location' ? null : 'location'); setLoc(null); setQ(''); setOpts([]); }}>Change location</button>
        <button type="button" style={btn} disabled={busy} onClick={() => exportCsv(selected, domain)}>Export CSV</button>
        <button type="button" style={btnDanger} disabled={busy} onClick={remove}>Delete</button>
      </div>

      {mode === 'group' && (
        <form onSubmit={applyGroup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: RT.bg, border: `1px solid ${RT.line}`, borderRadius: 10, padding: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: RT.text }}>Group
            <select value={groupPick} onChange={(e) => setGroupPick(e.target.value)}
              style={{ font: 'inherit', fontSize: 14, padding: '10px', minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', color: RT.ink }}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new">New group…</option>
              <option value="__none">No group</option>
            </select>
          </label>
          {groupPick === '__new' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: RT.text }}>Group name
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} placeholder="Like Suburbs" autoFocus
                style={{ ...inputStyle, fontSize: 14, padding: '10px 12px', minHeight: 44, width: 200 }} />
            </label>
          )}
          <button type="submit" style={btnGo} disabled={busy}>{busy ? 'Saving…' : 'Move'}</button>
          <button type="button" style={btn} onClick={() => setMode(null)}>Cancel</button>
        </form>
      )}

      {mode === 'location' && (
        <form onSubmit={applyLocation} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: RT.bg, border: `1px solid ${RT.line}`, borderRadius: 10, padding: 12, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: RT.text }}>City
              <input value={q} autoFocus placeholder="Type a city, like Austin" autoComplete="off"
                role="combobox" aria-expanded={opts.length > 0 && !loc} aria-controls="rt-loc-list" aria-autocomplete="list"
                onChange={(e) => { setQ(e.target.value); setLoc(null); }}
                style={{ ...inputStyle, fontSize: 14, padding: '10px 12px', minHeight: 44, width: 240 }} />
            </label>
            {opts.length > 0 && !loc && (
              <ul id="rt-loc-list" role="listbox" aria-label="Matching cities"
                style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '4px 0 0', padding: 4, listStyle: 'none', background: '#fff',
                  border: `1px solid ${RT.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.12)', maxHeight: 260, overflowY: 'auto' }}>
                {opts.map((o) => (
                  <li key={o.code} role="option" aria-selected={false}>
                    <button type="button" onClick={() => { setLoc(o); setQ(o.name); setOpts([]); }}
                      style={{ font: 'inherit', fontSize: 13, width: '100%', textAlign: 'left', padding: '10px 10px', minHeight: 44, border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer', color: RT.ink }}>
                      {o.name}{o.type ? <span style={{ color: RT.muted }}> · {o.type}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" style={btnGo} disabled={busy || !loc}>{busy ? 'Saving…' : 'Change'}</button>
          <button type="button" style={btn} onClick={() => setMode(null)}>Cancel</button>
          <span style={srOnly} aria-live="polite">{opts.length && !loc ? `${opts.length} cities found` : ''}</span>
        </form>
      )}
    </div>
  );
}
