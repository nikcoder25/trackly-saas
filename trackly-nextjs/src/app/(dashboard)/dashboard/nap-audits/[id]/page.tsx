'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageHead } from '@/app/dashboard-v2/ui';
import NapResults, { type NapResultsData, scoreColor } from '@/components/tools/NapResults';
import NapAuditForm, { type NapAuditFormValues } from '@/components/dashboard/NapAuditForm';

interface CanonicalNap {
  name: string; phone?: string; street?: string; suite?: string; city?: string; postcode?: string;
}
interface HistoryPoint { at: string; score: number }
type NapAuditStatus = 'queued' | 'running' | 'done' | 'failed';
type NapAuditSchedule = 'off' | 'weekly' | 'monthly';
interface NapAuditRecord extends NapResultsData {
  id: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
  status: NapAuditStatus;
  error: string | null;
  schedule: NapAuditSchedule;
  history: HistoryPoint[];
  overrides: Record<string, boolean>;
  createdAt: string;
  lastRunAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Tiny inline score-over-time sparkline (SVG, no deps). */
function ScoreHistory({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="quiet" style={{ fontSize: 12, margin: 0 }}>Re-run this audit over time to see a consistency trend here.</p>;
  }
  const w = 320, h = 64, pad = 6;
  const pts = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = pad + (1 - p.score / 100) * (h - pad * 2);
    return { x, y, p };
  });
  const path = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const last = history[history.length - 1];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={w} height={h} style={{ maxWidth: '100%' }}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--line)" strokeWidth={1} />
        <path d={path} fill="none" stroke={scoreColor(last.score)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill={scoreColor(pt.p.score)} />)}
      </svg>
      <div className="quiet" style={{ fontSize: 12 }}>
        {history.length} runs · {fmtDate(history[0].at)} → {fmtDate(last.at)}
      </div>
    </div>
  );
}

interface RecommendedDirectory { domain: string; reason?: string }
interface GapResponse { covered: string[]; present: RecommendedDirectory[]; missing: RecommendedDirectory[] }

function GapFinder({ id }: { id: string }) {
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<GapResponse | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !industry.trim()) return;
    setLoading(true);
    setError(null);
    setGaps(null);
    try {
      const res = await fetch(`/api/nap-audits/${id}/gaps`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: industry.trim(),
          region: region.trim(),
          competitors: competitors.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError((typeof data?.error === 'string' && data.error) || `Failed (HTTP ${res.status})`); return; }
      setGaps(data);
    } catch (err) {
      setError((err as Error).message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  const inputCss: React.CSSProperties = { width: '100%', margin: 0 };

  return (
    <Card title="Citation gaps" right={<span className="quiet" style={{ fontSize: 12 }}>vs competitors</span>}>
      <p className="quiet" style={{ fontSize: 13, margin: '0 0 14px' }}>
        Find important directories for this category that the client isn&apos;t listed on yet — a ready-made citation-building worklist.
      </p>
      <form onSubmit={find}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input className="brand-select" style={inputCss} required maxLength={120} placeholder="Industry, e.g. dentist" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          <input className="brand-select" style={inputCss} maxLength={120} placeholder="Region (optional), e.g. London" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <input className="brand-select" style={{ ...inputCss, marginBottom: 10 }} maxLength={400} placeholder="Competitors (optional, comma-separated)" value={competitors} onChange={(e) => setCompetitors(e.target.value)} />
        <button type="submit" disabled={loading || !industry.trim()} className="btn-p" style={{ opacity: loading || !industry.trim() ? 0.6 : 1 }}>
          {loading ? 'Finding gaps…' : 'Find citation gaps'}
        </button>
      </form>
      {error && <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {gaps && (
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
              MISSING ({gaps.missing.length}) — build these
            </div>
            {gaps.missing.length === 0 ? (
              <div className="quiet" style={{ fontSize: 13 }}>No gaps found — great coverage.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {gaps.missing.map((d) => (
                  <div key={d.domain} style={{ padding: '8px 12px', background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 8 }}>
                    <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer nofollow" style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{d.domain}</a>
                    {d.reason && <div className="quiet" style={{ fontSize: 11.5, marginTop: 2 }}>{d.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {gaps.present.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                ALREADY COVERED ({gaps.present.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gaps.present.map((d) => (
                  <span key={d.domain} className="mono" style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(16,185,129,.08)', color: 'var(--green)', borderRadius: 100 }}>{d.domain}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function NapAuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [audit, setAudit] = useState<NapAuditRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overrideBusy, setOverrideBusy] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function toggleOverride(url: string, ok: boolean) {
    setOverrideBusy(url);
    try {
      const res = await fetch(`/api/nap-audits/${id}/override`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ok }),
      });
      if (res.ok) {
        const data = await res.json();
        setAudit(data.audit);
        flash(ok ? 'Marked OK — score updated.' : 'Verification removed.');
      } else {
        flash('Could not update verification.');
      }
    } catch {
      flash('Could not update verification.');
    } finally {
      setOverrideBusy(null);
    }
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function downloadPdf() {
    try {
      const res = await fetch(`/api/nap-audits/${id}/pdf`, { credentials: 'include' });
      if (!res.ok) { flash('Could not generate the PDF.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(audit?.label || 'nap-audit').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { flash('Could not generate the PDF.'); }
  }

  async function saveEdit(values: NapAuditFormValues) {
    const res = await fetch(`/api/nap-audits/${id}`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || `Failed (HTTP ${res.status})`);
    if (data.audit) setAudit(data.audit);
    setEditOpen(false);
    flash('Saved — re-running…');
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nap-audits/${id}`, { credentials: 'include' });
      if (!res.ok) { setError(`Failed to load (HTTP ${res.status})`); return; }
      const data = await res.json();
      setAudit(data.audit);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Network error');
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id, load]);

  // Poll while the run is in progress so results appear when it finishes.
  useEffect(() => {
    const active = audit?.status === 'queued' || audit?.status === 'running';
    if (active && !pollRef.current) {
      pollRef.current = setInterval(load, 4000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [audit?.status, load]);

  async function changeSchedule(schedule: NapAuditSchedule) {
    try {
      const res = await fetch(`/api/nap-audits/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      });
      if (res.ok) { const data = await res.json(); setAudit(data.audit); flash('Schedule updated.'); }
    } catch { /* ignore */ }
  }

  async function rerun() {
    setBusy(true);
    try {
      const res = await fetch(`/api/nap-audits/${id}`, { method: 'POST', credentials: 'include' });
      if (res.ok) { const data = await res.json(); setAudit(data.audit); }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this saved audit? This cannot be undone.')) return;
    setBusy(true);
    try {
      await fetch(`/api/nap-audits/${id}`, { method: 'DELETE', credentials: 'include' });
      router.push('/dashboard/nap-audits');
    } finally {
      setBusy(false);
    }
  }

  const c = audit?.canonical;
  const napLine = c
    ? [c.name, c.street, c.suite, c.city, c.postcode, c.phone].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="lvx">
      <PageHead
        title={audit?.label || 'NAP Audit'}
        sub={napLine || 'Saved citation audit'}
        actions={
          <>
            <Link href="/dashboard/nap-audits" className="btn-g" style={{ marginRight: 6 }}>← Back</Link>
            {audit && (
              <select
                aria-label="Schedule"
                className="brand-select"
                value={audit.schedule}
                onChange={(e) => changeSchedule(e.target.value as NapAuditSchedule)}
                style={{ margin: 0, marginRight: 6, width: 'auto', display: 'inline-block' }}
              >
                <option value="off">Manual</option>
                <option value="weekly">Auto: weekly</option>
                <option value="monthly">Auto: monthly</option>
              </select>
            )}
            <button className="btn-g" onClick={() => setEditOpen(true)} style={{ marginRight: 6 }}>Edit</button>
            <button className="btn-g" onClick={downloadPdf} style={{ marginRight: 6 }}>↓ PDF</button>
            <button className="btn-g" disabled={busy || audit?.status === 'queued' || audit?.status === 'running'} onClick={rerun} style={{ marginRight: 6 }}>{busy ? 'Running…' : 'Re-run'}</button>
            <button className="btn-g" disabled={busy} onClick={remove} style={{ color: 'var(--red)' }}>Delete</button>
          </>
        }
      />

      <div className="page-body">
        {error ? (
          <Card title="Audit"><div className="quiet" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>{error}</div></Card>
        ) : !audit ? (
          <Card title="Audit"><div className="quiet" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>Loading…</div></Card>
        ) : (
          <>
            {(audit.status === 'queued' || audit.status === 'running') && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
                {audit.status === 'queued' ? 'Queued…' : 'Running the audit…'} results update automatically.
              </div>
            )}
            {audit.status === 'failed' && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 13 }}>
                Last run failed{audit.error ? `: ${audit.error}` : ''}. Try re-running.
              </div>
            )}
            <Card title="Consistency over time" right={<span className="quiet" style={{ fontSize: 12 }}>Last run {fmtDate(audit.lastRunAt)}</span>}>
              <ScoreHistory history={audit.history} />
            </Card>
            <div style={{ marginTop: 16 }}>
              <GapFinder id={audit.id} />
            </div>
            <div style={{ marginTop: 16 }}>
              <NapResults
                data={audit}
                label={audit.label}
                canonical={audit.canonical}
                overrides={audit.overrides}
                onToggleOverride={toggleOverride}
                busyUrl={overrideBusy}
              />
            </div>
          </>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--surface)', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 1100, boxShadow: 'var(--shadow-2)' }}>{toast}</div>
      )}

      {editOpen && audit && (
        <div role="dialog" aria-modal="true" aria-label="Edit NAP audit" onClick={() => setEditOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Edit NAP audit</h2>
              <button onClick={() => setEditOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
            </div>
            <NapAuditForm
              initial={{ label: audit.label, canonical: audit.canonical, urls: audit.urls }}
              submitLabel="Save & re-run"
              onSubmit={saveEdit}
              onCancel={() => setEditOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
