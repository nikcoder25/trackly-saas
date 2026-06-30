'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Fix Engine - the dashboard tab that drives the detect → generate →
// preview → approve → ship → recheck loop against /api/brands/[id]/fixes.
//
// Wired to the signed-in user's selected brand via useBrandData (the same
// hook the Overview/Mentions pages use). All network calls go through the
// Fix Engine API built in src/app/api/brands/[id]/fixes/*.

import * as React from 'react';
import { PageHead, Card, KPIRail, Badge, Pill } from '../ui';
import { useBrandData } from '@/hooks/useBrandData';

// ── types mirrored from the API (kept loose; server is the source of truth) ──
interface CatalogItem {
  key: string; title: string; description: string;
  channel: 'A' | 'B'; trigger: string; minPlan: string; phase: number;
  available: boolean;
}
interface FixRow {
  id: string; moduleKey: string; channel: 'A' | 'B'; targetUrl: string | null;
  status: string; severity: string; summary: string;
  generated: any; scoreAfter: number | null; error: string | null;
  createdAt: string;
}
interface PreviewBlock {
  kind: string; label: string; before?: string; after?: string; language?: string;
}
interface Connection {
  id: string; provider: string; cmsType: string | null; siteUrl: string | null; status: string;
}

const STATUS_TONE: Record<string, string> = {
  detected: 'neu', generating: 'info', generated: 'info', preview_ready: 'info',
  approved: 'acc', shipping: 'info', shipped: 'acc', verified: 'pos',
  failed: 'neg', reverted: 'warn',
};
const SEV_TONE: Record<string, string> = { critical: 'neg', high: 'warn', medium: 'info', low: 'neu' };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export function PageFixes() {
  const { brand, loading: brandLoading } = useBrandData({ fullData: true });
  const brandId = (brand as any)?.id as string | undefined;

  const [fixes, setFixes] = React.useState<FixRow[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  const [plan, setPlan] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [previews, setPreviews] = React.useState<Record<string, PreviewBlock | null>>({});
  const [scanning, setScanning] = React.useState(false);
  const [scanMsg, setScanMsg] = React.useState<string | null>(null);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [supportedCms, setSupportedCms] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async (id: string) => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/api/brands/${id}/fixes`);
      setFixes(d.fixes || []);
      setCatalog(d.catalog || []);
      setEnabled(!!d.enabled);
      setPlan(d.plan || '');
      // Default-select every available module for the next scan.
      setSelected(new Set((d.catalog || []).filter((c: CatalogItem) => c.available).map((c: CatalogItem) => c.key)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    try {
      const c = await api(`/api/brands/${id}/connections`);
      setConnections(c.connections || []);
      setSupportedCms(c.supportedCms || []);
    } catch { /* connections are non-fatal for the list view */ }
  }, []);

  React.useEffect(() => {
    if (!brandId) { setFixes([]); setCatalog([]); return; }
    load(brandId);
  }, [brandId, load]);

  // Surface the GSC OAuth round-trip result (?gsc=connected|denied|error).
  React.useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('gsc');
    if (!g) return;
    const msg: Record<string, string> = {
      connected: 'Google Search Console connected.',
      denied: 'Google Search Console connection was denied.',
      invalid: 'The connection link was invalid or expired — please retry.',
      error: 'Connecting Google Search Console failed — please retry.',
    };
    setNotice(msg[g] || null);
    // Clean the query param without reloading.
    const u = new URL(window.location.href);
    u.searchParams.delete('gsc');
    window.history.replaceState({}, '', u.toString());
  }, []);

  const gscConn = connections.find((c) => c.provider === 'gsc' && c.status === 'active');
  const cmsConn = connections.find((c) => c.provider === 'cms' && c.status === 'active');
  const connectorConn = connections.find((c) => c.provider === 'connector' && c.status === 'active');
  const hasGscModule = catalog.some((c) => c.trigger === 'gsc');
  const hasChannelB = catalog.some((c) => c.channel === 'B');
  const [pairing, setPairing] = React.useState<{ token: string; hmacSecret: string; pullUrl: string } | null>(null);

  const pairConnector = async () => {
    if (!brandId) return;
    try {
      const d = await api(`/api/brands/${brandId}/connections/connector/pair`, { method: 'POST' });
      setPairing({ token: d.token, hmacSecret: d.hmacSecret, pullUrl: d.pullUrl });
      await load(brandId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const connectGsc = async () => {
    if (!brandId) return;
    try {
      const d = await api(`/api/brands/${brandId}/connections/gsc/start`);
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const connectCms = async (form: { cmsType: string; siteUrl: string; username: string; appPassword: string }) => {
    if (!brandId) return;
    setError(null);
    try {
      await api(`/api/brands/${brandId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cms', cmsType: form.cmsType, siteUrl: form.siteUrl,
          creds: { username: form.username, appPassword: form.appPassword },
        }),
      });
      setNotice('CMS connected and verified.');
      await load(brandId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleModule = (k: string) => setSelected((s) => {
    const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const pollBatch = React.useCallback(async (id: string, batchId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const d = await api(`/api/brands/${id}/fixes/batches/${batchId}`);
        const b = d.batch;
        setScanMsg(`Scanning… found ${b.received} issue${b.received === 1 ? '' : 's'} (${b.status})`);
        if (b.status === 'done' || b.status === 'failed') {
          setScanMsg(b.status === 'failed' ? `Scan failed: ${b.error || 'unknown'}` : `Scan complete — ${b.received} issue${b.received === 1 ? '' : 's'} found.`);
          return;
        }
      } catch { /* keep polling */ }
    }
  }, []);

  const runScan = async () => {
    if (!brandId) return;
    setScanning(true); setScanMsg('Starting scan…');
    try {
      const d = await api(`/api/brands/${brandId}/fixes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: Array.from(selected) }),
      });
      await pollBatch(brandId, d.batchId);
      await load(brandId);
    } catch (e) {
      setScanMsg(null);
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const act = async (fixId: string, action: 'generate' | 'approve' | 'ship' | 'recheck') => {
    if (!brandId) return;
    setBusy((b) => ({ ...b, [fixId]: true }));
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}/${action}`, { method: 'POST' });
      // Patch the row in place from the returned fix.
      if (d.fix) setFixes((rows) => rows.map((r) => (r.id === fixId ? { ...r, ...d.fix } : r)));
      // After generate, fetch the preview so it's ready to review.
      if (action === 'generate') await loadPreview(fixId);
      if (action === 'ship' && d.ok === false) setError(d.error || 'Ship failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [fixId]: false }));
    }
  };

  const loadPreview = async (fixId: string) => {
    if (!brandId) return;
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}`);
      setPreviews((p) => ({ ...p, [fixId]: d.preview || null }));
    } catch { /* preview is best-effort */ }
  };

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of fixes) c[f.status] = (c[f.status] || 0) + 1;
    return c;
  }, [fixes]);

  const shown = filter === 'all' ? fixes : fixes.filter((f) => f.status === filter);
  const moduleTitle = (k: string) => catalog.find((c) => c.key === k)?.title || k;

  // ── render ──
  if (brandLoading) {
    return (<><PageHead title="Fix Engine" sub="Loading…" /><div className="page-body"><Card title="Loading">…</Card></div></>);
  }
  if (!brandId) {
    return (<><PageHead title="Fix Engine" sub="Detect, generate, preview and ship SEO/GEO fixes." />
      <div className="page-body"><Card title="No brand selected"><p className="quiet" style={{ margin: 0 }}>Pick or add a brand in the top bar to start fixing.</p></Card></div></>);
  }

  return (
    <>
      <PageHead
        title="Fix Engine"
        sub="Detect, generate, preview and ship SEO/GEO fixes — then re-check they're live."
        actions={
          <>
            <button className="btn-d" onClick={() => load(brandId)} disabled={loading}>↻ Refresh</button>
            <button className="btn-g" onClick={runScan} disabled={scanning || !enabled || selected.size === 0}>
              {scanning ? 'Scanning…' : `Run scan (${selected.size})`}
            </button>
          </>
        }
      />
      <div className="page-body">
        {!enabled && (
          <Card title="Upgrade required">
            <p className="quiet" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              The Fix Engine is available on Starter plans and above{plan ? ` (your plan: ${plan})` : ''}. Upgrade to detect and ship fixes.
            </p>
          </Card>
        )}

        {error && (
          <Card title="Something went wrong">
            <p style={{ margin: 0, color: 'var(--neg, #E11D48)', fontSize: 13 }}>{error}</p>
          </Card>
        )}

        {notice && (
          <Card title="Connections">
            <p style={{ margin: 0, color: 'var(--pos, #059669)', fontSize: 13 }}>{notice}</p>
          </Card>
        )}

        <ConnectionsCard
          gsc={!!gscConn} gscSite={gscConn?.siteUrl ?? null} hasGscModule={hasGscModule}
          cms={!!cmsConn} cmsType={cmsConn?.cmsType ?? null} cmsSite={cmsConn?.siteUrl ?? null}
          connector={!!connectorConn} hasChannelB={hasChannelB} pairing={pairing}
          supportedCms={supportedCms} defaultSite={(brand as any)?.website || ''}
          disabled={!enabled} onConnectGsc={connectGsc} onConnectCms={connectCms} onPairConnector={pairConnector}
        />

        <KPIRail items={[
          { k: 'DETECTED', v: String(counts.detected || 0) },
          { k: 'GENERATED', v: String((counts.generated || 0) + (counts.approved || 0)) },
          { k: 'SHIPPED', v: String(counts.shipped || 0) },
          { k: 'VERIFIED', v: String(counts.verified || 0) },
          { k: 'FAILED', v: String(counts.failed || 0), danger: (counts.failed || 0) > 0 },
        ]} />

        {/* Module catalog / scan selector */}
        <Card title="Modules" lede="Pick what to scan for. Each module runs the same detect → generate → ship loop.">
          <div style={{ display: 'grid', gap: 8 }}>
            {catalog.map((m) => {
              const on = selected.has(m.key);
              return (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: m.available ? 1 : 0.5, cursor: m.available ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={on} disabled={!m.available} onChange={() => m.available && toggleModule(m.key)} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</span>
                  <Badge tone={m.channel === 'A' ? 'info' : 'acc'}>Channel {m.channel}</Badge>
                  <Pill tone="neg">{m.trigger}</Pill>
                  {!m.available && <Badge tone="warn">needs {m.minPlan}</Badge>}
                  <span className="quiet" style={{ fontSize: 12, marginLeft: 'auto' }}>{m.description}</span>
                </label>
              );
            })}
            {catalog.length === 0 && !loading && <p className="quiet" style={{ margin: 0, fontSize: 13 }}>No modules available.</p>}
          </div>
          {scanMsg && <p className="quiet mono" style={{ marginTop: 10, fontSize: 12 }}>{scanMsg}</p>}
        </Card>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0' }}>
          {['all', 'detected', 'generated', 'approved', 'shipped', 'verified', 'failed'].map((s) => (
            <button key={s} className={filter === s ? 'btn-p' : 'btn-d'} style={{ fontSize: 11 }} onClick={() => setFilter(s)}>
              {s.toUpperCase()}{s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>

        {/* Fix list */}
        <div style={{ display: 'grid', gap: 12 }}>
          {loading && fixes.length === 0 && <Card title="Loading fixes">…</Card>}
          {!loading && shown.length === 0 && (
            <Card title="No fixes yet">
              <p className="quiet" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                Run a scan to detect fixes for <strong>{(brand as any)?.name || 'this brand'}</strong>.
              </p>
            </Card>
          )}
          {shown.map((f) => (
            <FixCard
              key={f.id}
              fix={f}
              moduleTitle={moduleTitle(f.moduleKey)}
              preview={previews[f.id]}
              busy={!!busy[f.id]}
              onGenerate={() => act(f.id, 'generate')}
              onApprove={() => act(f.id, 'approve')}
              onShip={() => act(f.id, 'ship')}
              onRecheck={() => act(f.id, 'recheck')}
              onViewPreview={() => loadPreview(f.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ConnectionsCard({ gsc, gscSite, hasGscModule, cms, cmsType, cmsSite, connector, hasChannelB, pairing, supportedCms, defaultSite, disabled, onConnectGsc, onConnectCms, onPairConnector }: {
  gsc: boolean; gscSite: string | null; hasGscModule: boolean;
  cms: boolean; cmsType: string | null; cmsSite: string | null;
  connector: boolean; hasChannelB: boolean; pairing: { token: string; hmacSecret: string; pullUrl: string } | null;
  supportedCms: string[]; defaultSite: string; disabled: boolean;
  onConnectGsc: () => void;
  onConnectCms: (f: { cmsType: string; siteUrl: string; username: string; appPassword: string }) => void;
  onPairConnector: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [cmsTypeSel, setCmsTypeSel] = React.useState(supportedCms[0] || 'wordpress');
  const [siteUrl, setSiteUrl] = React.useState(defaultSite);
  const [username, setUsername] = React.useState('');
  const [appPassword, setAppPassword] = React.useState('');
  React.useEffect(() => { if (defaultSite && !siteUrl) setSiteUrl(defaultSite); }, [defaultSite, siteUrl]);

  return (
    <Card title="Connections" lede="Connect a CMS to ship Channel-A fixes, and Google Search Console to power striking-distance & CTR rescue.">
      <div style={{ display: 'grid', gap: 12 }}>
        {/* CMS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, minWidth: 130 }}>CMS (ship target)</strong>
          {cms
            ? <><Badge tone="pos">connected</Badge><span className="quiet mono" style={{ fontSize: 12 }}>{cmsType} · {cmsSite}</span></>
            : <Badge tone="warn">not connected</Badge>}
          <button className="btn-d" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => setOpen((o) => !o)} disabled={disabled}>
            {cms ? 'Reconnect' : 'Connect CMS'}
          </button>
        </div>
        {open && (
          <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
            <select className="sel" value={cmsTypeSel} onChange={(e) => setCmsTypeSel(e.target.value)}>
              {(supportedCms.length ? supportedCms : ['wordpress']).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="fld-in" placeholder="Site URL (https://example.com)" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            <input className="fld-in" placeholder="WordPress username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className="fld-in" type="password" placeholder="Application password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-p" style={{ fontSize: 12 }}
                onClick={() => onConnectCms({ cmsType: cmsTypeSel, siteUrl, username, appPassword })}
                disabled={!siteUrl || !username || !appPassword}>Verify & save</button>
              <span className="quiet" style={{ fontSize: 11, alignSelf: 'center' }}>Credentials are verified against your site, then encrypted at rest.</span>
            </div>
          </div>
        )}

        {/* GSC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, minWidth: 130 }}>Google Search Console</strong>
          {gsc
            ? <><Badge tone="pos">connected</Badge>{gscSite && <span className="quiet mono" style={{ fontSize: 12 }}>{gscSite}</span>}</>
            : <Badge tone={hasGscModule ? 'warn' : 'neu'}>not connected</Badge>}
          <button className="btn-d" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={onConnectGsc} disabled={disabled}>
            {gsc ? 'Reconnect' : 'Connect Search Console'}
          </button>
        </div>

        {/* Connector (Channel B) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, minWidth: 130 }}>Connector plugin</strong>
          {connector
            ? <Badge tone="pos">paired</Badge>
            : <Badge tone={hasChannelB ? 'warn' : 'neu'}>not paired</Badge>}
          <span className="quiet" style={{ fontSize: 12 }}>Needed to ship robots.txt, llms.txt & head changes.</span>
          <button className="btn-d" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={onPairConnector} disabled={disabled}>
            {connector ? 'Re-pair' : 'Pair Connector'}
          </button>
        </div>
        {pairing && (
          <div style={{ display: 'grid', gap: 6, padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
            <p className="quiet" style={{ margin: 0, fontSize: 12, color: 'var(--warn, #EA580C)' }}>
              Copy these now — the token is shown only once. Paste them into the Livesov Connector plugin.
            </p>
            <label className="mono" style={{ fontSize: 11 }}>Pull URL<input className="fld-in mono" readOnly value={pairing.pullUrl} onFocus={(e) => e.currentTarget.select()} /></label>
            <label className="mono" style={{ fontSize: 11 }}>Token<input className="fld-in mono" readOnly value={pairing.token} onFocus={(e) => e.currentTarget.select()} /></label>
            <label className="mono" style={{ fontSize: 11 }}>Signing secret<input className="fld-in mono" readOnly value={pairing.hmacSecret} onFocus={(e) => e.currentTarget.select()} /></label>
          </div>
        )}
      </div>
    </Card>
  );
}

function FixCard({ fix, moduleTitle, preview, busy, onGenerate, onApprove, onShip, onRecheck, onViewPreview }: {
  fix: FixRow; moduleTitle: string; preview: PreviewBlock | null | undefined; busy: boolean;
  onGenerate: () => void; onApprove: () => void; onShip: () => void; onRecheck: () => void; onViewPreview: () => void;
}) {
  const s = fix.status;
  return (
    <article className="rec-card" style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 className="rec-t" style={{ margin: 0 }}>{moduleTitle}</h3>
        <Badge tone={STATUS_TONE[s] || 'neu'}>{s.replace('_', ' ')}</Badge>
        <Badge tone={SEV_TONE[fix.severity] || 'neu'}>{fix.severity}</Badge>
        <Badge tone={fix.channel === 'A' ? 'info' : 'acc'}>Ch {fix.channel}</Badge>
        {fix.scoreAfter != null && <Pill tone="pos">score {fix.scoreAfter}</Pill>}
      </div>
      <p className="rec-d" style={{ margin: '0 0 4px' }}>{fix.summary}</p>
      {fix.targetUrl && (
        <a href={fix.targetUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: 'var(--primary, #5B5BD6)' }}>
          {fix.targetUrl}
        </a>
      )}
      {fix.error && <p style={{ margin: '6px 0 0', color: 'var(--neg, #E11D48)', fontSize: 12 }}>⚠ {fix.error}</p>}

      {preview && (
        <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <div className="mono" style={{ fontSize: 11, padding: '6px 10px', background: 'var(--surface-2, #F6F6F8)', color: 'var(--text-2)' }}>{preview.label}</div>
          {preview.before != null && (
            <div style={{ padding: '6px 10px', fontSize: 12, textDecoration: 'line-through', opacity: 0.6 }}>{preview.before || '(empty)'}</div>
          )}
          {preview.after != null && (
            <pre style={{ padding: '8px 10px', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflow: 'auto' }}>{preview.after}</pre>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {(s === 'detected' || s === 'failed') && (
          <button className="btn-p" style={{ fontSize: 12 }} onClick={onGenerate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
        )}
        {s === 'generated' && (
          <>
            {!preview && <button className="btn-d" style={{ fontSize: 12 }} onClick={onViewPreview}>View preview</button>}
            <button className="btn-d" style={{ fontSize: 12 }} onClick={onGenerate} disabled={busy}>Regenerate</button>
            <button className="btn-p" style={{ fontSize: 12 }} onClick={onApprove} disabled={busy}>Approve</button>
          </>
        )}
        {s === 'approved' && (
          <>
            {!preview && <button className="btn-d" style={{ fontSize: 12 }} onClick={onViewPreview}>View preview</button>}
            <button className="btn-g" style={{ fontSize: 12 }} onClick={onShip} disabled={busy}>{busy ? 'Shipping…' : 'Ship to site'}</button>
          </>
        )}
        {(s === 'shipped' || s === 'verified') && (
          <button className="btn-d" style={{ fontSize: 12 }} onClick={onRecheck} disabled={busy}>{busy ? 'Re-checking…' : 'Re-check'}</button>
        )}
      </div>
    </article>
  );
}
