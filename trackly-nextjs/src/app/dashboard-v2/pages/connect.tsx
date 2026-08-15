'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-Serve Connect — the "Connect your website" screen (M1 snippet + M2
// WordPress). One paste, done: create a connection, show the one-liner + copy
// button, and flip to "Connected ✓" the moment the first heartbeat lands.
//
// Both methods issue the SAME one-line snippet — `method` only records which
// flow was picked. But the snippet is deliberately limited: it runs in the
// visitor's browser and only touches the <head> plus appended blocks. It cannot
// rewrite copy a page builder owns, and crawlers that don't execute JS never
// see it. So each tab also points at the stronger, server-side route for that
// stack — the Connector plugin on WordPress, the endpoint/Worker adapters
// elsewhere — instead of implying the snippet is the whole story.

import * as React from 'react';
import { PageHead, Card } from '../ui';
import { useBrandData } from '@/hooks/useBrandData';

// Keep in sync with PLUGIN_VERSION in app/(public)/integrations/wordpress/page.tsx
// and the plugin header in connector-plugin/livesov-connector.php.
const PLUGIN_VERSION = '1.3.0';
const PLUGIN_DOWNLOAD_URL = '/wordpress-plugin/livesov-connector.zip';
const PLUGIN_GUIDE_URL = '/integrations/wordpress';

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

  // Poll status until the first heartbeat flips it to connected. Pauses while
  // the tab is hidden (no point polling a backgrounded tab) and caps the total
  // number of attempts so an abandoned tab doesn't poll forever.
  const connId = conn?.id;
  const connected = conn?.status === 'connected';
  React.useEffect(() => {
    if (!connId || connected) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 200; // ~10 min at 3s — enough for a paste-and-refresh

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'hidden') { schedule(); return; }
      if (attempts >= MAX_ATTEMPTS) return;
      attempts += 1;
      try {
        const d = await api(`/api/connections/${connId}/status`);
        if (alive) setConn((c) => (c ? { ...c, status: d.status, lastSeenAt: d.lastSeenAt } : c));
      } catch { /* keep polling */ }
      if (alive) schedule();
    };
    function schedule() {
      if (!alive) return;
      timer = setTimeout(tick, 3000);
    }

    // Resume promptly when the tab becomes visible again.
    const onVisible = () => { if (alive && document.visibilityState === 'visible' && attempts < MAX_ATTEMPTS) { if (timer) clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    schedule();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10,
            background: 'var(--success-50, #ecfdf5)', border: '1px solid var(--success, #10b981)',
            color: 'var(--text-1, #065f46)', fontSize: 13, lineHeight: 1.6,
          }}
        >
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1.4 }}>✓</span>
          <span>
            <strong>No DNS, no CNAME, no ownership challenge</strong> — nothing in your domain settings.
            Just paste one line. On WordPress you can add the free plugin too, for fixes the snippet
            can&rsquo;t make.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Connect method">
          {tab('snippet', 'Any site (snippet)')}
          {tab('wordpress', 'WordPress')}
        </div>

        <Card
          title={method === 'wordpress' ? 'Step 1 — paste the snippet' : 'Paste a snippet'}
          right={conn ? chip : undefined}
          lede={method === 'wordpress'
            ? 'The fastest way in — same one-line snippet, no plugin. Add the plugin below for page-builder and root-file fixes.'
            : 'The easy default — works on any custom-coded site. Client-side, head-level only.'}
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
          <Card title="Where to paste it in WordPress" lede="No plugin needed for this step — pick whichever fits your setup.">
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

        {/* The snippet is browser-side and head-only. On WordPress the Connector
            plugin is what actually edits page content — including whatever a
            builder owns — and writes root files, so it gets a first-class slot
            here rather than living only on the public marketing page. */}
        {method === 'wordpress' && (
          <Card
            title="Step 2 — add the Connector plugin"
            lede="Recommended, free. This is what edits your actual pages — Elementor, Divi, Beaver Builder, Bricks, Oxygen and the rest included."
          >
            <p className="quiet" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
              The snippet runs in the visitor&rsquo;s browser, so it can only set your title, meta description,
              canonical and schema, and append blocks at the end of a page. It can&rsquo;t rewrite copy inside a
              page builder&rsquo;s layout, it can&rsquo;t write files to your site root, and AI crawlers that
              don&rsquo;t run JavaScript never see it. The plugin applies the same fixes on the server, where
              every crawler does.
            </p>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2, #374151)' }}>
              <li>Edits real page content in whichever builder owns it — it detects the builder and writes where that builder actually renders from.</li>
              <li>Writes <code>llms.txt</code>, AI-crawler <code>robots.txt</code> rules and <code>/.well-known/</code> files to your site root.</li>
              <li>Ships page edits as a <strong>draft with a preview link</strong> first, and keeps an undo snapshot of the builder data.</li>
              <li>Outbound-only — it polls Livesov every 5 minutes. Nothing needs inbound access to your server.</li>
              <li>Writes into Yoast / Rank Math fields, so your SEO plugin stays the source of truth.</li>
            </ul>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a
                href={PLUGIN_DOWNLOAD_URL}
                download
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--primary, #5B5BD6)',
                  background: 'var(--primary, #5B5BD6)', color: '#fff', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                ⇩ Download plugin (v{PLUGIN_VERSION})
              </a>
              <a
                href={PLUGIN_GUIDE_URL}
                target="_blank"
                rel="noopener"
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line, #e5e7eb)',
                  background: 'var(--surface, #fff)', color: 'var(--text-2, #4b5563)', fontSize: 13,
                  fontWeight: 600, textDecoration: 'none', display: 'inline-block',
                }}
              >
                Install &amp; connect guide →
              </a>
            </div>
            <p className="quiet" style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
              Install it via <em>Plugins → Add New → Upload Plugin</em>, activate, then
              <em> Settings → Livesov Connector → Connect with Livesov</em> — one click, credentials fill in
              automatically. Pairing and revoking live in <strong>Fix Engine → Connections</strong>.
            </p>
          </Card>
        )}

        {/* Custom-coded sites aren't limited to the snippet either — the endpoint
            and Cloudflare Worker adapters both ship fixes server-side. Point at
            them here so this screen doesn't read as "snippet or nothing". */}
        {method === 'snippet' && (
          <Card
            title="Need edits inside your page content?"
            lede="The snippet is head-level and client-side. For server-side fixes on a custom-coded site, pick one of these."
          >
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2, #374151)' }}>
              <li>
                <strong>Your own fix endpoint</strong> — your developer adds one small signed HTTPS endpoint
                (~40 lines; Node, Next.js and PHP templates provided). Every approved fix becomes one signed
                request, so titles, metas, canonicals, schema and body edits all apply in your own stack.
                Ops you haven&rsquo;t implemented report back as &ldquo;needs manual&rdquo; rather than failing.
              </li>
              <li>
                <strong>Cloudflare Worker</strong> — applies your head-level fixes as pages are served, so
                crawlers see them in the HTML without touching your codebase.
              </li>
            </ul>
            <p className="quiet" style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
              Both are set up in <strong>Fix Engine → Connections</strong>.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
