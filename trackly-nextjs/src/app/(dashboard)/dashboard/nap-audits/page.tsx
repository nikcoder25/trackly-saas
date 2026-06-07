'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, PageHead, KPIRail } from '@/app/dashboard-v2/ui';
import NapAuditForm, { type NapAuditFormValues } from '@/components/dashboard/NapAuditForm';
import { useBrands } from '@/contexts/BrandContext';

type NapAuditStatus = 'queued' | 'running' | 'done' | 'failed';

interface NapAuditListItem {
  id: string;
  label: string;
  canonical: { name: string };
  urlCount: number;
  status: NapAuditStatus;
  error: string | null;
  score: number | null;
  summary: {
    total: number;
    clean: number;
    withIssues: number;
    deadLinks: number;
    blocked?: number;
    duplicateListings: number;
  } | null;
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

function NewAuditModal({ brandId, onClose, onCreated }: { brandId: string; onClose: () => void; onCreated: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function create(values: NapAuditFormValues) {
    const res = await fetch('/api/nap-audits', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, brandId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || `Failed (HTTP ${res.status})`);
    onCreated();
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="New NAP audit" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>New NAP audit</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        <NapAuditForm submitLabel="Create & run" onSubmit={create} onCancel={onClose} />
      </div>
    </div>
  );
}

export default function NapAuditsPage() {
  const { selectedBrand, loading: brandsLoading } = useBrands();
  const brandId: string | null = selectedBrand?.id ?? null;
  const brandName: string | null = (selectedBrand?.name as string | undefined) ?? null;
  const [audits, setAudits] = useState<NapAuditListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function fetchAudits(bId: string | null = brandId) {
    if (!bId) { setAudits([]); setError(null); return; }
    try {
      const res = await fetch(`/api/nap-audits?brandId=${encodeURIComponent(bId)}`, { credentials: 'include' });
      if (!res.ok) { if (audits === null) setError(`Failed to load (HTTP ${res.status})`); return; }
      const data = await res.json();
      setAudits(Array.isArray(data?.audits) ? data.audits : []);
      setError(null);
    } catch (e) {
      if (audits === null) setError((e as Error).message || 'Network error');
    }
  }

  // Re-fetch whenever the active brand changes. Reset the cached list to
  // null first so the user sees a loading state instead of stale rows
  // from the previous brand bleeding through during the swap.
  useEffect(() => {
    if (brandsLoading) return;
    setAudits(null);
    fetchAudits(brandId);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [brandId, brandsLoading]);

  useEffect(() => {
    const active = (audits ?? []).some((a) => a.status === 'queued' || a.status === 'running');
    if (active && !pollRef.current) {
      pollRef.current = setInterval(() => fetchAudits(brandId), 4000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [audits, brandId]);

  async function rerun(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/nap-audits/${id}`, { method: 'POST', credentials: 'include' });
      if (res.ok) flash('Re-run started.'); else flash('Could not start re-run.');
      await fetchAudits(brandId);
    } finally { setBusyId(null); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this saved audit? This cannot be undone.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/nap-audits/${id}`, { method: 'DELETE', credentials: 'include' });
      flash(res.ok ? 'Audit deleted.' : 'Could not delete audit.');
      await fetchAudits(brandId);
    } finally { setBusyId(null); }
  }

  const all = audits ?? [];
  const scored = all.filter((a) => a.score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) : 0;
  const sum = (pick: (s: NonNullable<NapAuditListItem['summary']>) => number) =>
    all.reduce((acc, a) => acc + (a.summary ? pick(a.summary) : 0), 0);
  const citations = all.reduce((s, a) => s + a.urlCount, 0);
  const clean = sum((s) => s.clean);
  const withIssues = sum((s) => s.withIssues);
  const blocked = sum((s) => s.blocked ?? 0);
  const deadOnly = Math.max(0, sum((s) => s.deadLinks) - blocked);
  const dupes = sum((s) => s.duplicateListings);

  return (
    <div className="lvx">
      <PageHead
        title="NAP Audits"
        sub={brandName
          ? `Saved citation audits for ${brandName}. Switch brand in the top bar to view another client's audits.`
          : 'Save a citation audit per client and re-run it to track NAP consistency improving over time.'}
        actions={
          <button
            type="button"
            className="btn-p"
            disabled={!brandId}
            title={!brandId ? 'Select a brand first' : ''}
            style={!brandId ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            onClick={() => setModalOpen(true)}
          >
            + New audit
          </button>
        }
      />

      <div className="page-body">
        {all.length > 0 && (
          <KPIRail items={[
            { k: 'SAVED AUDITS', v: String(all.length) },
            { k: 'CITATIONS CHECKED', v: String(citations) },
            { k: 'AVG. CONSISTENCY', v: `${avg}/100` },
            { k: 'CLEAN', v: String(clean) },
            { k: 'WITH ISSUES', v: String(withIssues) },
            { k: 'BLOCKED', v: String(blocked) },
            { k: 'DEAD LINKS', v: String(deadOnly) },
            { k: 'DUPLICATE LISTINGS', v: String(dupes) },
          ]} />
        )}

        {audits === null && !error ? (
          <Card title="Audits">
            <div style={{ padding: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 44, marginBottom: 10, borderRadius: 8, background: 'linear-gradient(90deg,var(--bg3),var(--surface-2),var(--bg3))', opacity: 0.6 }} />
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card title="Audits" right={<Badge tone="neg">ERROR</Badge>}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Couldn&apos;t load audits</div>
              <div className="quiet" style={{ fontSize: 12, marginBottom: 14 }}>{error}</div>
              <button onClick={() => fetchAudits(brandId)} className="btn-g">Retry</button>
            </div>
          </Card>
        ) : all.length === 0 ? (
          <Card title="Audits">
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 36, opacity: 0.4, marginBottom: 12 }}>📍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                {brandId ? `No saved audits for ${brandName ?? 'this brand'} yet` : 'No saved audits yet'}
              </div>
              <p className="quiet" style={{ fontSize: 13, maxWidth: 380, margin: '0 auto 16px' }}>
                {brandId
                  ? 'Create an audit for this brand — enter its canonical NAP and citation URLs. We’ll fetch each page, flag mismatches, and keep a consistency score you can track over time.'
                  : 'Select a brand in the top bar to view or create audits.'}
              </p>
              {brandId && (
                <button onClick={() => setModalOpen(true)} className="btn-p">Create your first audit</button>
              )}
            </div>
          </Card>
        ) : (
          <Card title="Saved audits" padding={false}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    {['Client / label', 'Score', 'URLs', 'Duplicates', 'Last run', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.map((a) => (
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
                        <button className="btn-g" disabled={busyId === a.id || a.status === 'queued' || a.status === 'running'} onClick={() => rerun(a.id)} style={{ marginRight: 6 }}>{busyId === a.id ? '…' : 'Re-run'}</button>
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

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--surface)', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 1100, boxShadow: 'var(--shadow-2)' }}>{toast}</div>
      )}

      {modalOpen && brandId && (
        <NewAuditModal
          brandId={brandId}
          onClose={() => setModalOpen(false)}
          onCreated={() => fetchAudits(brandId)}
        />
      )}
    </div>
  );
}
