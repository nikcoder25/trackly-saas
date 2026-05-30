'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { Card, Badge, PageHead, PlatformTile, PLATFORMS, type Platform } from '@/app/dashboard-v2/ui';

interface Brand { id: string; name?: string }
interface ReportItem { id: string; kind: 'mention' | 'query'; payload: Record<string, unknown>; position: number }
interface Draft { title: string; note: string; items: ReportItem[] }
interface HistoryEntry { id: string; kind: 'standard' | 'custom'; title: string; filename: string; sizeBytes: number; meta: Record<string, unknown>; createdAt: string }

function fmtBytes(n: number) { return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; }
function fmtWhen(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function historyMeta(h: HistoryEntry): string {
  if (h.kind === 'custom') {
    const m = Number(h.meta.mentions) || 0, q = Number(h.meta.queries) || 0;
    return `${m} mention${m !== 1 ? 's' : ''} · ${q} quer${q !== 1 ? 'ies' : 'y'}`;
  }
  return h.meta.sov != null ? `${h.meta.sov}% Share of Voice` : 'Full visibility report';
}

function platformFor(name: string): Platform {
  const lc = (name || '').toLowerCase();
  return PLATFORMS.find(p => p.id === lc || p.name.toLowerCase() === lc || lc.includes(p.id))
    || { id: lc || 'unknown', name: name || 'Unknown', short: (name || '?').slice(0, 3).toUpperCase(), sov: 0, delta: 0, ok: true, ms: 0 };
}
const tagTone = (t: string) => t === 'pos' ? 'pos' : t === 'neg' ? 'neg' : t === 'warn' ? 'warn' : 'neu';

export default function ReportsPage() {
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;
  const { toast } = useToast();

  const [draft, setDraft] = useState<Draft>({ title: '', note: '', items: [] });
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const load = useCallback((brandId: string) => {
    fetch(`/api/brands/${brandId}/report/items`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: Draft | null) => { if (d) { setDraft(d); setTitle(d.title || ''); setNote(d.note || ''); } })
      .catch(() => { /* non-fatal */ });
  }, []);

  const loadHistory = useCallback((brandId: string) => {
    fetch(`/api/brands/${brandId}/report/history`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { history?: HistoryEntry[] } | null) => { if (d) setHistory(d.history || []); })
      .catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => { if (brand?.id) { load(brand.id); loadHistory(brand.id); } }, [brand?.id, load, loadHistory]);

  async function reDownload(h: HistoryEntry) {
    if (!brand?.id) return;
    try {
      const res = await fetch(`/api/brands/${brand.id}/report/history/${h.id}`, { credentials: 'include' });
      if (!res.ok) { toast('That report is no longer available.', 'error'); loadHistory(brand.id); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = h.filename;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast('Could not download. Please try again.', 'error'); }
  }

  async function delHistory(h: HistoryEntry) {
    if (!brand?.id) return;
    await fetch(`/api/brands/${brand.id}/report/history?id=${h.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    setHistory(prev => prev.filter(x => x.id !== h.id));
  }

  const mentions = draft.items.filter(i => i.kind === 'mention');
  const queries = draft.items.filter(i => i.kind === 'query');

  function saveMeta() {
    if (!brand?.id) return;
    fetch(`/api/brands/${brand.id}/report/items`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, note }),
    }).catch(() => { /* non-fatal */ });
  }

  async function removeItem(itemId: string) {
    if (!brand?.id) return;
    setBusy(true);
    try {
      await fetch(`/api/brands/${brand.id}/report/items?itemId=${itemId}`, { method: 'DELETE', credentials: 'include' });
      setDraft(d => ({ ...d, items: d.items.filter(i => i.id !== itemId) }));
    } finally { setBusy(false); }
  }

  async function clearAll() {
    if (!brand?.id || !draft.items.length) return;
    if (!confirm('Remove all items from this report?')) return;
    setBusy(true);
    try {
      await fetch(`/api/brands/${brand.id}/report/items?clear=1`, { method: 'DELETE', credentials: 'include' });
      setDraft(d => ({ ...d, items: [] }));
      toast('Report cleared');
    } finally { setBusy(false); }
  }

  async function download() {
    if (!brand?.id) { toast('Select a brand first.', 'error'); return; }
    if (!draft.items.length) { toast('Add at least one mention or query first.', 'error'); return; }
    setDownloading(true);
    try {
      const res = await fetch(`/api/brands/${brand.id}/report/custom`, { credentials: 'include' });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        toast(j.error || 'PDF reports are available on the Pro plan and above.', 'error');
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.error || 'Could not generate the report. Please try again.', 'error');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = m ? m[1] : `${brand.name || 'brand'}_Custom_Report.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Report downloaded');
      loadHistory(brand.id);
    } catch {
      toast('Could not generate the report. Please try again.', 'error');
    } finally { setDownloading(false); }
  }

  if (loading) return (
    <div className="lvx"><div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
      <span style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
    </div></div>
  );

  const empty = draft.items.length === 0;

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="Reports"
        sub="Assemble a custom report from the mentions and queries you care about, then download it as a branded PDF."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {!empty && <button className="btn-g" onClick={clearAll} disabled={busy}>Clear</button>}
            <button className="btn-p" onClick={download} disabled={downloading || empty}>
              {downloading ? 'Preparing…' : '↓ Download report'}
            </button>
          </div>
        }
      />

      <div className="page-body">
        {/* Report details */}
        <Card title="Report details" lede="Give your report a title and an optional note. These appear on the cover.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Title</div>
              <input className="sel" style={{ width: '100%' }} placeholder={`${brand?.name || 'Brand'} — Custom Report`}
                value={title} onChange={e => setTitle(e.target.value)} onBlur={saveMeta} maxLength={80} />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Note (optional)</div>
              <input className="sel" style={{ width: '100%' }} placeholder="e.g. Highlights for the Q2 campaign review"
                value={note} onChange={e => setNote(e.target.value)} onBlur={saveMeta} maxLength={120} />
            </div>
          </div>
        </Card>

        {empty ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🗂️</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>Your report is empty</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 auto', maxWidth: 460, lineHeight: 1.6 }}>
                Add items from around the dashboard: open a recent mention on the <b>Overview</b> and click
                <b> “Add to report”</b>, or use <b>“+ Add to report”</b> on a tracked query. They’ll show up here,
                ready to download as a polished PDF.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Selected mentions */}
            <Card title="Selected mentions" right={<Badge tone="neu">{mentions.length}</Badge>}
              lede="The specific AI answers included, with the verbatim response." padding={false}>
              {mentions.length === 0 ? (
                <div className="quiet" style={{ padding: '20px 16px', fontSize: 13, textAlign: 'center' }}>No mentions added yet.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {mentions.map(it => {
                    const p = it.payload as Record<string, string>;
                    return (
                      <li key={it.id} style={{ display: 'flex', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                        <PlatformTile p={platformFor(p.platform)} size={26} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>&ldquo;{p.query}&rdquo;</span>
                            <Badge tone={tagTone(p.tag)}>{String(p.tag || 'neu').toUpperCase()}</Badge>
                            {p.meta && <span className="quiet" style={{ fontSize: 11 }}>{p.meta}</span>}
                          </div>
                          {p.answer && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.answer}</p>}
                        </div>
                        <button className="btn-d" style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11 }} onClick={() => removeItem(it.id)} disabled={busy}>Remove</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Selected queries */}
            <Card title="Selected queries" right={<Badge tone="neu">{queries.length}</Badge>}
              lede="Tracked prompts included in this report." padding={false}>
              {queries.length === 0 ? (
                <div className="quiet" style={{ padding: '20px 16px', fontSize: 13, textAlign: 'center' }}>No queries added yet.</div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>QUERY</th><th className="right">SOV</th><th className="right">ENGINES</th><th /></tr></thead>
                  <tbody>
                    {queries.map(it => {
                      const p = it.payload as Record<string, unknown>;
                      return (
                        <tr key={it.id}>
                          <td><b>{String(p.q || '')}</b></td>
                          <td className="right num">{Number(p.sov) || 0}%</td>
                          <td className="right num">{Number(p.engines) || 0}/5</td>
                          <td className="right"><button className="btn-d" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => removeItem(it.id)} disabled={busy}>Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        {/* Report history */}
        <Card title="Report history" right={history.length ? <Badge tone="neu">{history.length}</Badge> : undefined}
          lede="Reports you've generated for this brand — re-download anytime." padding={false}>
          {history.length === 0 ? (
            <div className="quiet" style={{ padding: '24px 16px', fontSize: 13, textAlign: 'center' }}>
              No reports generated yet. Download a report above or from the Overview to see it here.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {history.map(h => (
                <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--line)' }}>
                  <Badge tone={h.kind === 'custom' ? 'acc' : 'neu'}>{h.kind === 'custom' ? 'CUSTOM' : 'VISIBILITY'}</Badge>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || h.filename}</div>
                    <div className="quiet" style={{ fontSize: 11 }}>{fmtWhen(h.createdAt)} · {historyMeta(h)} · {fmtBytes(h.sizeBytes)}</div>
                  </div>
                  <button className="btn-g" style={{ flexShrink: 0, padding: '4px 10px', fontSize: 11 }} onClick={() => reDownload(h)}>↓ Download</button>
                  <button className="btn-d" style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11 }} onClick={() => delHistory(h)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
