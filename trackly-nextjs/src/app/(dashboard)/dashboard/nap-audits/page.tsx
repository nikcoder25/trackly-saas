'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, PageHead, KPIRail } from '@/app/dashboard-v2/ui';

type NapAuditStatus = 'queued' | 'running' | 'done' | 'failed';

interface NapAuditListItem {
  id: string;
  label: string;
  canonical: { name: string };
  urlCount: number;
  status: NapAuditStatus;
  error: string | null;
  score: number | null;
  summary: { duplicateListings: number; deadLinks: number } | null;
  createdAt: string;
  lastRunAt: string | null;
}

function scoreTone(score: number | null): 'pos' | 'warn' | 'neg' | 'neu' {
  if (score == null) return 'neu';
  if (score >= 85) return 'pos';
  if (score >= 60) return 'warn';
  return 'neg';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

const labelCss: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
};

function NewAuditModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [suite, setSuite] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [urls, setUrls] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gbpQuery, setGbpQuery] = useState('');
  const [gbpLoading, setGbpLoading] = useState(false);
  const [gbpNote, setGbpNote] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function pullFromGoogle() {
    if (gbpLoading || !gbpQuery.trim()) return;
    setGbpLoading(true);
    setGbpNote(null);
    try {
      const res = await fetch('/api/nap-audits/gbp-lookup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gbpQuery.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setGbpNote((typeof data?.error === 'string' && data.error) || `Lookup failed (HTTP ${res.status})`); return; }
      const c = data.canonical || {};
      if (c.name) setName(c.name);
      if (c.phone) setPhone(c.phone);
      if (c.street) setStreet(c.street);
      if (c.suite) setSuite(c.suite);
      if (c.city) setCity(c.city);
      if (c.postcode) setPostcode(c.postcode);
      if (!label.trim() && c.name) setLabel(c.name);
      setGbpNote('Prefilled from Google. Review the fields before running.');
    } catch (err) {
      setGbpNote((err as Error).message || 'Lookup failed');
    } finally {
      setGbpLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/nap-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          canonical: { name: name.trim(), phone: phone.trim(), street: street.trim(), suite: suite.trim(), city: city.trim(), postcode: postcode.trim() },
          urls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((typeof data?.error === 'string' && data.error) || `Failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Network error');
      setSubmitting(false);
    }
  }

  const inputCss: React.CSSProperties = { width: '100%', margin: 0 };

  return (
    <div role="dialog" aria-modal="true" aria-label="New NAP audit" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>New NAP audit</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        <form onSubmit={submit}>
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
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="na-label" style={labelCss}>Client / label</label>
            <input id="na-label" className="brand-select" style={inputCss} required maxLength={120}
              placeholder="e.g. Acme Dental Care — Q2 audit" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="na-name" style={labelCss}>Business name</label>
            <input id="na-name" className="brand-select" style={inputCss} required maxLength={200}
              placeholder="e.g. Acme Dental Care" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><label htmlFor="na-phone" style={labelCss}>Phone</label><input id="na-phone" className="brand-select" style={inputCss} maxLength={200} placeholder="020 7946 0123" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div><label htmlFor="na-postcode" style={labelCss}>Postcode</label><input id="na-postcode" className="brand-select" style={inputCss} maxLength={200} placeholder="SW1A 1AA" value={postcode} onChange={e => setPostcode(e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
            <div><label htmlFor="na-street" style={labelCss}>Street</label><input id="na-street" className="brand-select" style={inputCss} maxLength={200} placeholder="12 High Street" value={street} onChange={e => setStreet(e.target.value)} /></div>
            <div><label htmlFor="na-suite" style={labelCss}>Suite / unit</label><input id="na-suite" className="brand-select" style={inputCss} maxLength={200} placeholder="Suite 4" value={suite} onChange={e => setSuite(e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="na-city" style={labelCss}>City / town</label>
            <input id="na-city" className="brand-select" style={inputCss} maxLength={200} placeholder="London" value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="na-urls" style={labelCss}>Citation URLs — one per line (up to 50)</label>
            <textarea id="na-urls" className="brand-select" required rows={6} style={{ ...inputCss, resize: 'vertical', fontFamily: 'var(--mono)' }}
              placeholder={'https://www.yelp.com/biz/...\nhttps://www.yell.com/...'} value={urls} onChange={e => setUrls(e.target.value)} />
          </div>
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 12 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="pbtn" style={{ minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={submitting}
              style={{ minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Running…' : 'Create & run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NapAuditsPage() {
  const [audits, setAudits] = useState<NapAuditListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAudits() {
    try {
      const res = await fetch('/api/nap-audits', { credentials: 'include' });
      if (!res.ok) {
        if (audits === null) setError(`Failed to load (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setAudits(Array.isArray(data?.audits) ? data.audits : []);
      setError(null);
    } catch (e) {
      if (audits === null) setError((e as Error).message || 'Network error');
    }
  }

  useEffect(() => {
    fetchAudits();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Poll while any audit is still queued/running so the score fills in live.
  useEffect(() => {
    const active = (audits ?? []).some((a) => a.status === 'queued' || a.status === 'running');
    if (active && !pollRef.current) {
      pollRef.current = setInterval(fetchAudits, 4000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [audits]);

  async function rerun(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/nap-audits/${id}`, { method: 'POST', credentials: 'include' });
      await fetchAudits();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this saved audit? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await fetch(`/api/nap-audits/${id}`, { method: 'DELETE', credentials: 'include' });
      await fetchAudits();
    } finally {
      setBusyId(null);
    }
  }

  const all = audits ?? [];
  const avg = all.length ? Math.round(all.reduce((s, a) => s + (a.score ?? 0), 0) / all.length) : 0;
  const dupes = all.reduce((s, a) => s + (a.summary?.duplicateListings ?? 0), 0);

  return (
    <div className="lvx">
      <PageHead
        title="NAP Audits"
        sub="Save a citation audit per client and re-run it to track NAP consistency improving over time."
        actions={<button type="button" className="btn-p" onClick={() => setModalOpen(true)}>+ New audit</button>}
      />

      <div className="page-body">
        {all.length > 0 && (
          <KPIRail items={[
            { k: 'SAVED AUDITS', v: String(all.length) },
            { k: 'AVG. CONSISTENCY', v: `${avg}/100` },
            { k: 'DUPLICATE LISTINGS', v: String(dupes) },
          ]} />
        )}

        {audits === null && !error ? (
          <Card title="Audits"><div className="quiet" style={{ textAlign: 'center', padding: 32, fontSize: 13 }}>Loading…</div></Card>
        ) : error ? (
          <Card title="Audits" right={<Badge tone="neg">ERROR</Badge>}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Couldn&apos;t load audits</div>
              <div className="quiet" style={{ fontSize: 12, marginBottom: 14 }}>{error}</div>
              <button onClick={fetchAudits} className="btn-g">Retry</button>
            </div>
          </Card>
        ) : all.length === 0 ? (
          <Card title="Audits">
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 36, opacity: 0.4, marginBottom: 12 }}>📍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No saved audits yet</div>
              <p className="quiet" style={{ fontSize: 13, maxWidth: 380, margin: '0 auto 16px' }}>
                Create an audit for a client — enter their canonical NAP and citation URLs. We&apos;ll fetch each page, flag mismatches, and keep a consistency score you can track over time.
              </p>
              <button onClick={() => setModalOpen(true)} className="btn-p">Create your first audit</button>
            </div>
          </Card>
        ) : (
          <Card title="Saved audits" padding={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    {['Client / label', 'Score', 'URLs', 'Duplicates', 'Last run', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <Link href={`/dashboard/nap-audits/${a.id}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>{a.label}</Link>
                        <div className="quiet" style={{ fontSize: 11 }}>{a.canonical?.name}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {a.status === 'queued' || a.status === 'running' ? (
                          <Badge tone="neu">{a.status === 'queued' ? 'QUEUED' : 'RUNNING…'}</Badge>
                        ) : a.status === 'failed' ? (
                          <Badge tone="neg">FAILED</Badge>
                        ) : (
                          <Badge tone={scoreTone(a.score)}>{a.score == null ? '—' : `${a.score}/100`}</Badge>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }} className="mono">{a.urlCount}</td>
                      <td style={{ padding: '12px 14px' }} className="mono">{a.summary?.duplicateListings ?? 0}</td>
                      <td style={{ padding: '12px 14px' }} className="quiet">{fmtDate(a.lastRunAt)}</td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <Link href={`/dashboard/nap-audits/${a.id}`} className="btn-g" style={{ marginRight: 6 }}>View</Link>
                        <button className="btn-g" disabled={busyId === a.id} onClick={() => rerun(a.id)} style={{ marginRight: 6 }}>{busyId === a.id ? '…' : 'Re-run'}</button>
                        <button className="btn-g" disabled={busyId === a.id} onClick={() => remove(a.id)} style={{ color: 'var(--red)' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {modalOpen && <NewAuditModal onClose={() => setModalOpen(false)} onCreated={fetchAudits} />}
    </div>
  );
}
