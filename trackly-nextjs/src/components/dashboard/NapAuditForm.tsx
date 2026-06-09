'use client';

import React, { useState } from 'react';
import { extractUrlsFromText } from '@/lib/nap-verify';

// Shared create/edit form for a saved NAP audit. Owns all field state, the
// "Pull from Google" prefill, bulk CSV import, and the over-cap notice.
// The parent supplies onSubmit (does the POST/PUT and throws on failure).

// Keep in sync with NAP_MAX_URLS in lib/nap-audit-run.ts. Hard-coded here
// rather than imported so this client component doesn't pull the
// server-only fetcher into the bundle.
const NAP_MAX_URLS = 500;
// Soft client-side cap so a CSV with thousands of citations imports
// without truncation; the new-audit flow then chunks the list into
// NAP_MAX_URLS-sized audits ("Acme (1/4)", "Acme (2/4)", …). Stops
// pathological "10M-line file" imports from blowing the page up.
const NAP_PASTE_CAP = 5_000;

export interface NapAuditFormValues {
  label: string;
  canonical: {
    name: string;
    phone?: string;
    street?: string;
    suite?: string;
    city?: string;
    region?: string;
    postcode?: string;
    country?: string;
    website?: string;
  };
  urls: string;
}

/** Extra business details returned by /api/nap-audits/gbp-lookup. */
interface GbpExtras {
  formattedAddress?: string;
  category?: string;
  businessStatus?: string;
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  hours?: string[];
}

interface Props {
  initial?: Partial<{
    label: string;
    canonical: {
      name?: string;
      phone?: string;
      street?: string;
      suite?: string;
      city?: string;
      region?: string;
      postcode?: string;
      country?: string;
      website?: string;
    };
    urls: string[];
  }>;
  /**
   * Pre-fills the "Pull from Google" search box so the button is usable
   * on first open. The new-audit flow passes the active brand's name +
   * city — the user already chose that brand in the top-bar dropdown,
   * so asking them to retype it just to enable the Pull button is the
   * UX hole that made the button look broken.
   */
  defaultGbpQuery?: string;
  submitLabel: string;
  onSubmit: (values: NapAuditFormValues) => Promise<void>;
  onCancel: () => void;
  allowGoogle?: boolean;
  /**
   * When true, the form allows up to NAP_PASTE_CAP URLs and shows a
   * "we'll split into N audits" note instead of the truncation warning.
   * The parent's onSubmit is responsible for actually chunking the list
   * into NAP_MAX_URLS-sized audits and posting each one. Used by the
   * new-audit flow; edit flow leaves it off (you can't split an existing
   * audit row).
   */
  allowAutoSplit?: boolean;
  /** When the parent is mid-batch this overrides the submit button copy. */
  submitProgressLabel?: string;
}

const labelCss: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
};
const inputCss: React.CSSProperties = { width: '100%', margin: 0 };

export default function NapAuditForm({
  initial,
  defaultGbpQuery,
  submitLabel,
  onSubmit,
  onCancel,
  allowGoogle = true,
  allowAutoSplit = false,
  submitProgressLabel,
}: Props) {
  const c = initial?.canonical ?? {};
  const [label, setLabel] = useState(initial?.label ?? '');
  const [name, setName] = useState(c.name ?? '');
  const [phone, setPhone] = useState(c.phone ?? '');
  const [street, setStreet] = useState(c.street ?? '');
  const [suite, setSuite] = useState(c.suite ?? '');
  const [city, setCity] = useState(c.city ?? '');
  const [region, setRegion] = useState(c.region ?? '');
  const [postcode, setPostcode] = useState(c.postcode ?? '');
  const [country, setCountry] = useState(c.country ?? '');
  const [website, setWebsite] = useState(c.website ?? '');
  const [urls, setUrls] = useState((initial?.urls ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [gbpQuery, setGbpQuery] = useState(defaultGbpQuery?.trim() ?? '');
  const [gbpLoading, setGbpLoading] = useState(false);
  const [gbpNote, setGbpNote] = useState<string | null>(null);
  const [gbpError, setGbpError] = useState(false);
  // Extra business details from the most recent Pull. Persisted only in
  // the form so the operator can review the full match before saving;
  // the audit row continues to store just the canonical NAP.
  const [gbpExtras, setGbpExtras] = useState<GbpExtras | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Hard ceiling that applies to both the paste path and the CSV import.
  // The new-audit flow lets the parent split into multiple audits below
  // this cap; the edit flow uses the smaller per-audit cap so we never
  // silently grow an existing row past NAP_MAX_URLS.
  const inputCap = allowAutoSplit ? NAP_PASTE_CAP : NAP_MAX_URLS;
  const parsedCount = extractUrlsFromText(urls, NAP_PASTE_CAP).length;
  const overPerAuditCap = parsedCount > NAP_MAX_URLS;
  // Number of audits the parent will create on submit. Always ≥1 once
  // any URL is present; floor-divided so the last batch carries the
  // remainder rather than spawning a single-URL audit at the end.
  const auditChunks = Math.max(1, Math.ceil(parsedCount / NAP_MAX_URLS));

  function mergeUrls(incoming: string[]) {
    const existing = extractUrlsFromText(urls, inputCap);
    const seen = new Set(existing);
    const merged = [...existing];
    let added = 0;
    for (const u of incoming) {
      if (merged.length >= inputCap) break;
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
        const found = extractUrlsFromText(await file.text(), inputCap);
        if (found.length === 0) setImportNote('No URLs found in that file.');
        else {
          const { added, total } = mergeUrls(found);
          setImportNote(`Imported ${added} new URL${added === 1 ? '' : 's'} (${total}/${inputCap}).`);
        }
      } catch { setImportNote('Could not read that file.'); }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function pullFromGoogle() {
    if (gbpLoading || !gbpQuery.trim()) return;
    setGbpLoading(true); setGbpNote(null); setGbpError(false); setGbpExtras(null);
    try {
      const res = await fetch('/api/nap-audits/gbp-lookup', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gbpQuery.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGbpError(true);
        setGbpNote((typeof data?.error === 'string' && data.error) || `Lookup failed (HTTP ${res.status})`);
        return;
      }
      const g = data.canonical || {};
      if (g.name) setName(g.name);
      if (g.phone) setPhone(g.phone);
      if (g.street) setStreet(g.street);
      if (g.suite) setSuite(g.suite);
      if (g.city) setCity(g.city);
      if (g.region) setRegion(g.region);
      if (g.postcode) setPostcode(g.postcode);
      if (g.country) setCountry(g.country);
      if (g.website) setWebsite(g.website);
      if (!label.trim() && g.name) setLabel(g.name);
      if (data.extras && typeof data.extras === 'object') {
        setGbpExtras(data.extras as GbpExtras);
      }
      setGbpNote('Prefilled from Google. Review before saving.');
    } catch (err) { setGbpError(true); setGbpNote((err as Error).message || 'Lookup failed'); }
    finally { setGbpLoading(false); }
  }

  /** Prepend the brand's homepage to the citation list so it gets audited. */
  function addWebsiteToCitations() {
    if (!website.trim()) return;
    const w = website.trim();
    const existing = extractUrlsFromText(urls, inputCap);
    if (existing.includes(w)) {
      setImportNote('Website is already in the citation list.');
      return;
    }
    setUrls([w, ...existing].join('\n'));
    setImportNote('Website added to the citation list.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        label: label.trim(),
        canonical: {
          name: name.trim(),
          phone: phone.trim() || undefined,
          street: street.trim() || undefined,
          suite: suite.trim() || undefined,
          city: city.trim() || undefined,
          region: region.trim() || undefined,
          postcode: postcode.trim() || undefined,
          country: country.trim() || undefined,
          website: website.trim() || undefined,
        },
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
          {gbpNote && <div style={{ fontSize: 11.5, marginTop: 6, color: gbpError ? 'var(--red)' : 'var(--muted)' }}>{gbpNote}</div>}
          {gbpExtras && (
            <div style={{ marginTop: 10, padding: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-xs)', display: 'grid', gap: 6, fontSize: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Matched on Google</div>
              {gbpExtras.formattedAddress && (
                <div><strong>Address:</strong> <span className="quiet">{gbpExtras.formattedAddress}</span></div>
              )}
              {gbpExtras.category && (
                <div><strong>Category:</strong> <span className="quiet">{gbpExtras.category}</span></div>
              )}
              {gbpExtras.businessStatus && gbpExtras.businessStatus !== 'OPERATIONAL' && (
                <div style={{ color: 'var(--amber, #b45309)' }}>
                  <strong>Status:</strong> {gbpExtras.businessStatus.replace(/_/g, ' ').toLowerCase()}
                </div>
              )}
              {Array.isArray(gbpExtras.hours) && gbpExtras.hours.length > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Opening hours</summary>
                  <div className="quiet" style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.5 }}>
                    {gbpExtras.hours.map((h, i) => <div key={i}>{h}</div>)}
                  </div>
                </details>
              )}
              {gbpExtras.mapsUrl && (
                <div>
                  <a href={gbpExtras.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: 11.5 }}>
                    Open on Google Maps ↗
                  </a>
                </div>
              )}
            </div>
          )}
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div><label htmlFor="na-city" style={labelCss}>City / town</label><input id="na-city" className="brand-select" style={inputCss} maxLength={200} placeholder="London" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><label htmlFor="na-region" style={labelCss}>State / region</label><input id="na-region" className="brand-select" style={inputCss} maxLength={100} placeholder="TN" value={region} onChange={(e) => setRegion(e.target.value)} /></div>
        <div><label htmlFor="na-country" style={labelCss}>Country</label><input id="na-country" className="brand-select" style={inputCss} maxLength={3} placeholder="US" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="na-website" style={labelCss}>Website</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="na-website" className="brand-select" style={{ ...inputCss, flex: 1 }} maxLength={500} placeholder="https://example.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {website.trim() && (
            <button type="button" className="btn-g" onClick={addWebsiteToCitations} style={{ whiteSpace: 'nowrap', padding: '4px 10px', fontSize: 12 }}>
              + Add to URLs
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <label htmlFor="na-urls" style={{ ...labelCss, marginBottom: 0 }}>
          Citation URLs — one per line
          {allowAutoSplit
            ? ` (up to ${NAP_PASTE_CAP.toLocaleString()}; we’ll auto-split into audits of ${NAP_MAX_URLS})`
            : ` (up to ${NAP_MAX_URLS})`}
        </label>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} style={{ display: 'none' }} />
        <button type="button" className="btn-g" onClick={() => fileRef.current?.click()} style={{ padding: '4px 10px', fontSize: 12 }}>↑ Import CSV</button>
      </div>
      <textarea id="na-urls" className="brand-select" required rows={6} style={{ ...inputCss, resize: 'vertical', fontFamily: 'var(--mono)' }}
        placeholder={'https://www.yelp.com/biz/...\nhttps://www.yell.com/...'} value={urls}
        onChange={(e) => { setUrls(e.target.value); setImportNote(null); }} />
      {importNote && <div className="quiet" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--green)' }}>{importNote}</div>}
      {overPerAuditCap && allowAutoSplit && (
        <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--primary)' }}>
          {parsedCount.toLocaleString()} URLs detected — we’ll create {auditChunks} audits of up to {NAP_MAX_URLS} URLs each, labelled “… (1/{auditChunks})”, “… (2/{auditChunks})”, …
        </div>
      )}
      {overPerAuditCap && !allowAutoSplit && (
        <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber, #b45309)' }}>
          You added {parsedCount.toLocaleString()} URLs — only the first {NAP_MAX_URLS} will be used.
        </div>
      )}

      {error && <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} className="pbtn" style={{ minHeight: 44 }}>Cancel</button>
        <button type="submit" disabled={submitting}
          style={{ minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? (submitProgressLabel ?? 'Saving…') : submitLabel}
        </button>
      </div>
    </form>
  );
}
