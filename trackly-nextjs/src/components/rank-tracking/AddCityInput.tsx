'use client';
/**
 * City autocomplete for rank tracking: types into GET /api/rank-tracking/locations?q=
 * (debounced 250 ms) and shows a keyboard friendly listbox. The stored name is
 * the provider's "Austin,Texas,United States"; we show it with spaces.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { RT, rtFetch, inputStyle, labelStyle } from './RankUi';

export interface CityOption { code: number; name: string; type?: string }
/** code is null while the text is typed but not picked from the list. */
export interface CityValue { code: number | null; name: string }

export const cityLabel = (name: string): string => name.split(',').map((s) => s.trim()).filter(Boolean).join(', ');

export default function AddCityInput({ label, value, onChange, placeholder = 'Start typing a city', hint, required }: {
  label: string;
  value: CityValue;
  onChange: (v: CityValue) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  required?: boolean;
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [text, setText] = useState(value.code ? cityLabel(value.name) : value.name);
  const [options, setOptions] = useState<CityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const reqRef = useRef(0);

  // Keep the text in sync when the parent resets or prefills the value.
  useEffect(() => {
    if (value.code) setText(cityLabel(value.name));
    else if (!value.name) setText('');
  }, [value.code, value.name]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setOptions([]); setLoading(false); setError(''); return; }
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await rtFetch<{ locations: CityOption[] }>(`/api/rank-tracking/locations?q=${encodeURIComponent(q)}`);
        if (id !== reqRef.current) return;
        setOptions(r.locations || []);
        setActive(r.locations?.length ? 0 : -1);
        setError('');
      } catch (e) {
        if (id !== reqRef.current) return;
        setOptions([]);
        setError((e as Error).message || 'Could not load cities');
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (o: CityOption) => {
    setText(cityLabel(o.name));
    setOpen(false);
    setActive(-1);
    onChange({ code: o.code, name: o.name });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
    }
  };

  const showList = open && query.trim().length >= 2;
  const status = loading ? 'Searching…' : error ? error : options.length ? '' : 'No city found. Try the city name only.';

  return (
    <div style={{ ...labelStyle, position: 'relative' }}>
      <label htmlFor={`${baseId}-in`}>{label}</label>
      <input
        id={`${baseId}-in`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${baseId}-opt-${active}` : undefined}
        autoComplete="off"
        required={required}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          onChange({ code: null, name: e.target.value.trim() });
        }}
        onFocus={() => { if (text.trim().length >= 2 && !value.code) { setQuery(text); setOpen(true); } }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        style={{ ...inputStyle, fontWeight: 400 }}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label={label}
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '4px 0 0', padding: 4, listStyle: 'none', background: '#fff',
            border: `1px solid ${RT.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', maxHeight: 300, overflowY: 'auto' }}>
          {options.map((o, i) => (
            <li key={o.code} id={`${baseId}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, fontWeight: 400, color: RT.ink, background: i === active ? RT.indigoSoft : 'transparent' }}>
              <span>{cityLabel(o.name)}</span>
              {o.type && <span style={{ fontSize: 12, color: RT.muted }}>{o.type}</span>}
            </li>
          ))}
          {status && <li role="presentation" style={{ padding: '10px 12px', fontSize: 13, fontWeight: 400, color: error ? RT.down : RT.muted }}>{status}</li>}
        </ul>
      )}
      {hint && <span style={{ fontSize: 13, fontWeight: 400, color: RT.muted }}>{hint}</span>}
    </div>
  );
}
