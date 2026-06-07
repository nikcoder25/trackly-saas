'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageHead } from '@/app/dashboard-v2/ui';
import NapResults, { type NapResultsData, scoreColor } from '@/components/tools/NapResults';

interface CanonicalNap {
  name: string; phone?: string; street?: string; suite?: string; city?: string; postcode?: string;
}
interface HistoryPoint { at: string; score: number }
interface NapAuditRecord extends NapResultsData {
  id: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
  history: HistoryPoint[];
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

export default function NapAuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [audit, setAudit] = useState<NapAuditRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => { if (id) load(); }, [id, load]);

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
            <button className="btn-g" disabled={busy} onClick={rerun} style={{ marginRight: 6 }}>{busy ? 'Running…' : 'Re-run'}</button>
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
            <Card title="Consistency over time" right={<span className="quiet" style={{ fontSize: 12 }}>Last run {fmtDate(audit.lastRunAt)}</span>}>
              <ScoreHistory history={audit.history} />
            </Card>
            <div style={{ marginTop: 16 }}>
              <NapResults data={audit} label={audit.label} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
