'use client';
/** Add keywords dialog: URL, keywords (one per line), search settings (location · device) and Cancel / Add keywords. */
import React, { useEffect, useRef, useState } from 'react';
import { rtFetch, Toggle, btnPrimary, btnSecondary, inputStyle, labelStyle } from '@/components/rank-tracking/RankUi';
import AddCityInput, { cityLabel, type CityValue } from '@/components/rank-tracking/AddCityInput';
import { C } from './theme';

const US: CityValue = { code: 2840, name: 'United States' };

export default function AddKeywordsModal({ initialUrl, onClose, onAdded }: { initialUrl: string; onClose: () => void; onAdded: (msg: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState('');
  const [city, setCity] = useState<CityValue>(US);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const count = new Set(text.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean)).size;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setError('Enter the website URL, like example.com.'); return; }
    if (!count) { setError('Add at least one keyword, one per line.'); return; }
    if (!city.code && !city.name) { setError('Pick a location from the list.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await rtFetch<{ added: number; skipped: number }>('/api/rank-tracking/keywords', 'POST', {
        domain: url.trim(), keywords: text, locationCode: city.code ?? undefined, locationName: city.name, device, frequency: 'weekly', depth: 30,
      });
      onAdded(`${r.added} keyword${r.added === 1 ? '' : 's'} added${r.skipped ? `, ${r.skipped} already tracked` : ''}. First positions show in a few minutes.`);
    } catch (err) {
      setError((err as Error).message || 'Could not add the keywords.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px 16px', overflowY: 'auto' }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="rtc-add-title"
        style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15,23,42,.25)', fontFamily: 'Inter, system-ui, sans-serif', color: C.ink }}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="rtc-add-title" style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>Add keywords</h2>
            <button type="button" aria-label="Close" onClick={onClose} disabled={busy}
              style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={labelStyle}>
              URL
              <input ref={(el) => { if (!initialUrl) first.current = el; }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" autoComplete="url" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>Keywords <span style={{ fontWeight: 500, color: C.muted }}>{count ? `${count} keyword${count === 1 ? '' : 's'}` : 'One per line'}</span></span>
              <textarea ref={(el) => { if (initialUrl) first.current = el; }} value={text} onChange={(e) => setText(e.target.value)} rows={7}
                placeholder={'plumber near me\nemergency plumber\nwater heater repair'} style={{ ...inputStyle, resize: 'vertical', fontSize: 14, lineHeight: 1.5 }} />
            </label>

            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: C.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Search settings</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{cityLabel(city.name) || 'Pick a location'} · {device === 'mobile' ? 'Mobile' : 'Desktop'}</span>
                </span>
                <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing}
                  style={{ font: 'inherit', fontSize: 13, fontWeight: 600, border: 0, background: 'transparent', color: C.indigo, cursor: 'pointer', padding: 6 }}>
                  {editing ? 'Done' : 'Change'}
                </button>
              </div>
              {editing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <AddCityInput label="Location" value={city} onChange={setCity} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
                    Device
                    <Toggle<'desktop' | 'mobile'> label="Device" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
                  </div>
                </div>
              )}
            </div>

            {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.downText, background: '#fef2f2', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}
          </div>

          <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} disabled={busy} style={{ ...btnSecondary, minHeight: 40, padding: '0 16px' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, minHeight: 40, padding: '0 18px', opacity: busy ? 0.7 : 1 }}>{busy ? 'Adding…' : 'Add keywords'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
