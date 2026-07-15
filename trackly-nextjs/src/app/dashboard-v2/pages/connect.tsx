'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-Serve Connect — the "Connect your website" screen (M1 snippet + M2
// WordPress). One paste, done: create a connection, show the one-liner + copy
// button, and flip to "Connected ✓" the moment the first heartbeat lands.
// WordPress uses the SAME one-line snippet (no plugin) — the WordPress choice
// just records the flow and shows a "where to paste it" guide.

import * as React from 'react';
import { PageHead, Card } from '../ui';
import { useBrandData } from '@/hooks/useBrandData';

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

type Method = 'snippet' | 'wordpress';
type Conn = { id: string; status: 'pending' | 'connected' | 'stale'; publicKey: string; lastSeenAt: string | null };

export function PageConnect() {
  const { brand, loading: brandLoading } = useBrandData({ fullData: true });
  const brandId = (brand as any)?.id as string | undefined;

  const [method, setMethod] = React.useState<Method>('snippet');
  const [conn, setConn] = React.useState<Conn | null>(null);
  const [snippet, setSnippet] = React.useState('');
  const [err, setErr] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  // Create (or fetch) the brand's connection for the chosen method. WordPress
  // and snippet are separate connections (each with its own key); both apply
  // the identical one-liner — `method` only records which flow was picked.
  const start = React.useCallback(async (id: string, m: Method) => {
    setErr('');
    try {
      const d = await api(`/api/brands/${id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: m }),
      });
      setConn(d.connection);
      setSnippet(d.snippet || '');
    } catch (e: any) {
      setErr(e?.message || 'Could not start connect');
    }
  }, []);

  React.useEffect(() => { if (brandId) start(brandId, method); }, [brandId, method, start]);

  // Poll status until the first heartbeat flips it to connected.
  const connId = conn?.id;
  const connected = conn?.status === 'connected';
  React.useEffect(() => {
    if (!connId || connected) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const d = await api(`/api/connections/${connId}/status`);
        if (alive) setConn((c) => (c ? { ...c, status: d.status, lastSeenAt: d.lastSeenAt } : c));
      } catch { /* keep polling */ }
    }, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [connId, connected]);

  const copy = () => {
    try {
      navigator.clipboard?.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the field is selectable */ }
  };

  const chip = connected
    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'var(--success-50)', color: 'var(--success)', border: '1px solid var(--success)' }}>● Connected ✓</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'var(--warn-50, #fef3c7)', color: 'var(--warn, #b45309)', border: '1px solid var(--warn, #f59e0b)' }}>○ Waiting for first load…</span>;

  const tab = (m: Method, label: string) => (
    <button
      onClick={() => setMethod(m)}
      aria-pressed={method === m}
      style={{
        padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: '1px solid ' + (method === m ? 'var(--primary, #5B5BD6)' : 'var(--line, #e5e7eb)'),
        background: method === m ? 'var(--primary, #5B5BD6)' : 'var(--surface, #fff)',
        color: method === m ? '#fff' : 'var(--text-2, #4b5563)',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHead title="Connect your website" sub="One paste, done — no DNS, no ownership challenge, no waiting. WordPress included." />
      <div className="page-body" style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Connect method">
          {tab('snippet', 'Any site (snippet)')}
          {tab('wordpress', 'WordPress')}
        </div>

        <Card
          title={method === 'wordpress' ? 'WordPress — paste the snippet' : 'Paste a snippet'}
          right={conn ? chip : undefined}
          lede={method === 'wordpress'
            ? 'No plugin needed — WordPress uses the same one-line snippet.'
            : 'The easy default — works on any custom-coded site. Client-side.'}
        >
          {brandLoading && !brandId && (
            <p className="quiet" style={{ margin: 0, fontSize: 13 }}>Loading your brand…</p>
          )}
          {err && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--danger, #e11d48)' }}>{err}</p>
          )}
          {snippet && (
            <>
              <p className="quiet" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6 }}>
                {method === 'wordpress'
                  ? <>Copy this one line, then add it to your theme&rsquo;s header (see the guide below). It applies your shipped SEO fixes to every page and reports back here.</>
                  : <>Paste this one line into your site&rsquo;s <code>&lt;head&gt;</code> (or just before <code>&lt;/body&gt;</code>). It applies your shipped SEO fixes to each page and reports back here — no other setup.</>}
              </p>
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-all',
                  background: 'var(--surface-2, #f6f7f9)', border: '1px solid var(--line, #e5e7eb)',
                  borderRadius: 8, padding: '12px 14px', color: 'var(--text-1, #111)',
                }}
              >
                {snippet}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button
                  onClick={copy}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid var(--primary, #5B5BD6)',
                    background: 'var(--primary, #5B5BD6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied ✓' : '⧉ Copy snippet'}
                </button>
                {!connected && (
                  <span className="quiet" style={{ fontSize: 12.5 }}>
                    Once it&rsquo;s live on your site, this flips to <strong>Connected&nbsp;✓</strong> automatically.
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        {method === 'wordpress' && (
          <Card title="Where to paste it in WordPress" lede="No plugin needed — pick whichever fits your setup.">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2, #374151)' }}>
              <li>
                <strong>Most themes:</strong> go to <em>Appearance → Customize → your theme&rsquo;s Header / Custom Code box</em>,
                paste the snippet, and hit <em>Publish</em>.
              </li>
              <li>
                <strong>Child theme:</strong> add it via <code>functions.php</code> on the <code>wp_head</code> hook
                (so it survives theme updates).
              </li>
              <li>
                <strong>Last resort:</strong> <em>Appearance → Theme File Editor → header.php</em>, and paste it
                just before <code>&lt;/head&gt;</code>.
              </li>
            </ul>
          </Card>
        )}

        <Card title="Edge Pro" lede="Maximum AI-crawler coverage — server-side at the CDN edge.">
          <p className="quiet" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            An optional edge mode publishes your fixes server-side (before any JavaScript runs), for the
            broadest AI-crawler coverage. <strong>Coming soon</strong> — the one-line snippet above is the
            easy default for now.
          </p>
          <div style={{ marginTop: 12 }}>
            <button
              disabled
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)',
                background: 'var(--surface-2, #f6f7f9)', color: 'var(--text-3, #9ca3af)', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
              }}
            >
              Edge Pro — coming soon
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
