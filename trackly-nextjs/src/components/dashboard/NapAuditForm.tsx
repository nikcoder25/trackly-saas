'use client';

import React, { useState } from 'react';
import { extractUrlsFromText } from '@/lib/nap-verify';

// Shared create/edit form for a saved NAP audit. Owns all field state, the
// "Pull from Google" prefill, bulk CSV import, and the over-50 truncation note.
// The parent supplies onSubmit (does the POST/PUT and throws on failure).

const NAP_MAX_URLS = 50;

export interface NapAuditFormValues {
  label: string;
  canonical: { name: string; phone?: string; street?: string; suite?: string; city?: string; postcode?: string };
  urls: string;
}

interface Props {
  initial?: Partial<{
    label: string;
    canonical: { name?: string; phone?: string; street?: string; suite?: string; city?: string; postcode?: string };
    urls: string[];
  }>;
  submitLabel: string;
  onSubmit: (values: NapAuditFormValues) => Promise<void>;
  onCancel: () => void;
  allowGoogle?: boolean;
}

const labelCss: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
};
const inputCss: React.CSSProperties = { width: '100%', margin: 0 };

export default function NapAuditForm({ initial, submitLabel, onSubmit, onCancel, allowGoogle = true }: Props) {
  const c = initial?.canonical ?? {};
  const [label, setLabel] = useState(initial?.label ?? '');
  const [name, setName] = useState(c.name ?? '');
  const [phone, setPhone] = useState(c.phone ?? '');
  const [street, setStreet] = useState(c.street ?? '');
  const [suite, setSuite] = useState(c.suite ?? '');
  const [city, setCity] = useState(c.city ?? '');
  const [postcode, setPostcode] = useState(c.postcode ?? '');
  const [urls, setUrls] = useState((initial?.urls ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [gbpQuery, setGbpQuery] = useState('');
  const [gbpLoading, setGbpLoading] = useState(false);
  const [gbpNote, setGbpNote] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const parsedCount = extractUrlsFromText(urls, 10_000).length;
  const overCap = parsedCount > NAP_MAX_URLS;

  function mergeUrls(incoming: string[]) {
    const existing = extractUrlsFromText(urls, NAP_MAX_URLS);
    const seen = new Set(existing);
    const merged = [...existing];
    let added = 0;
    for (const u of incoming) {
      if (merged.length >= NAP_MAX_URLS) break;
      if (seen.has(u)) continue;
      seen.add(u); merged.push(u); added++;
    }
    setUrls(merged.join('\n'));
    return { added, total: merged.length };
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const found = extractUrlsFromText(await file.text(), NAP_MAX_URLS);
        if (found.length === 0) setImportNote('No URLs found in that file.');
        else {
          const { added, total } = mergeUrls(found);
          setImportNote(`Imported ${added} new URL${added === 1 ? '' : 's'} (${total}/${NAP_MAX_URLS}).`);
        }
      } catch { setImportNote('Could not read that file.'); }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function pullFromGoogle() {
    if (gbpLoading || !gbpQuery.trim()) return;
    setGbpLoading(true); setGbpNote(null);
    try {
      const res = await fetch('/api/nap-audits/gbp-lookup', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gbpQuery.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setGbpNote((typeof data?.error === 'string' && data.error) || `Lookup failed (HTTP ${res.status})`); return; }
      const g = data.canonical || {};
      if (g.name) setName(g.name);
      if (g.phone) setPhone(g.phone);
      if (g.street) setStreet(g.street);
      if (g.suite) setSuite(g.suite);
      if (g.city) setCity(g.city);
      if (g.postcode) setPostcode(g.postcode);
      if (!label.trim() && g.name) setLabel(g.name);
      setGbpNote('Prefilled from Google. Review before saving.');
    } catch (err) { setGbpNote((err as Error).message || 'Lookup failed'); }
    finally { setGbpLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        label: label.trim(),
        canonical: { name: name.trim(), phone: phone.trim(), street: street.trim(), suite: suite.trim(), city: city.trim(), postcode: postcode.trim() },
        urls,
      });
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {allowGoogle && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg3)', borderRadius: 'var(--radius-xs)' }}>
          <label htmlFor="na-gbp" style={labelCss}>Pull from Google <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional source of truth)</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="na-gbp" className="brand-select" style={{ flex: 1, margin: 0 }} maxLength={200}
              placeholder="Business name + city, e.g. Acme Dental London"
              value={gbpQuery} onChange={(e) => setGbpQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pullFromGoogle(); } }} />
            <button type="button" className="btn-g" disabled={gbpLoading || !gbpQuery.trim()} onClick={pullFromGoogle} style={{ whiteSpace: 'nowrap' }}>
              {gbpLoading ? '…' : 'Pull'}
            </button>
          </div>
          {gbpNote && <div className="quiet" style={{ fontSize: 11.5, marginTop: 6 }}>{gbpNote}</div>}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="na-label" style={labelCss}>Client / label</label>
        <input id="na-label" className="brand-select" style={inputCss} required maxLength={120}
          placeholder="e.g. Acme Dental Care — Q2 audit" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="na-name" style={labelCss}>Business name</label>
        <input id="na-name" className="brand-select" style={inputCss} required maxLength={200}
          placeholder="e.g. Acme Dental Care" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div><label htmlFor="na-phone" style={labelCss}>Phone</label><input id="na-phone" className="brand-select" style={inputCss} maxLength={200} placeholder="020 7946 0123" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><label htmlFor="na-postcode" style={labelCss}>Postcode</label><input id="na-postcode" className="brand-select" style={inputCss} maxLength={200} placeholder="SW1A 1AA" value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
        <div><label htmlFor="na-street" style={labelCss}>Street</label><input id="na-street" className="brand-select" style={inputCss} maxLength={200} placeholder="12 High Street" value={street} onChange={(e) => setStreet(e.target.value)} /></div>
        <div><label htmlFor="na-suite" style={labelCss}>Suite / unit</label><input id="na-suite" className="brand-select" style={inputCss} maxLength={200} placeholder="Suite 4" value={suite} onChange={(e) => setSuite(e.target.value)} /></div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="na-city" style={labelCss}>City / town</label>
        <input id="na-city" className="brand-select" style={inputCss} maxLength={200} placeholder="London" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <label htmlFor="na-urls" style={{ ...labelCss, marginBottom: 0 }}>Citation URLs — one per line (up to {NAP_MAX_URLS})</label>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} style={{ display: 'none' }} />
        <button type="button" className="btn-g" onClick={() => fileRef.current?.click()} style={{ padding: '4px 10px', fontSize: 12 }}>↑ Import CSV</button>
      </div>
      <textarea id="na-urls" className="brand-select" required rows={6} style={{ ...inputCss, resize: 'vertical', fontFamily: 'var(--mono)' }}
        placeholder={'https://www.yelp.com/biz/...\nhttps://www.yell.com/...'} value={urls}
        onChange={(e) => { setUrls(e.target.value); setImportNote(null); }} />
      {importNote && <div className="quiet" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--green)' }}>{importNote}</div>}
      {overCap && <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber, #b45309)' }}>You added {parsedCount} URLs — only the first {NAP_MAX_URLS} will be used.</div>}

      {error && <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} className="pbtn" style={{ minHeight: 44 }}>Cancel</button>
        <button type="submit" disabled={submitting}
          style={{ minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
