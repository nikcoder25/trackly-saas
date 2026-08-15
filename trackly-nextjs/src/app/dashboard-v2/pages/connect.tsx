'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-Serve Connect — the "Connect your website" screen.
//
// WordPress plugin only. The one-line snippet this page used to offer ran in
// the visitor's browser, which meant it could decorate a page after load but
// could never change the HTML a crawler is served, and never touch the actual
// page content. That is the whole point of the Fix Engine, so a method that
// cannot do it is not a method — it is a way to look connected while nothing
// ships. The plugin edits real content server-side (staged as a draft first,
// with an undo snapshot) and reports back.
//
// The snippet backend (c.js, site_connection, heartbeat) is left in place; it
// simply has no entry point here any more.

import * as React from 'react';
import { PageHead, Card } from '../ui';
import { useBrandData } from '@/hooks/useBrandData';
import { PLUGIN_VERSION, PLUGIN_DOWNLOAD_URL, CONNECTOR_ONLINE_MS } from '@/lib/connect/plugin';

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

type Conn = {
  id: string;
  provider: string;
  status: 'active' | 'revoked' | 'error';
  lastSeenAt: string | null;
};
type Pairing = { token: string; hmacSecret: string; pullUrl: string };

/** not_paired → paired (no poll yet) → online ⇄ offline */
type State = 'not_paired' | 'paired' | 'online' | 'offline';

export function PageConnect() {
  const { brand, loading: brandLoading } = useBrandData({ fullData: true });
  const brandId = (brand as any)?.id as string | undefined;

  const [conns, setConns] = React.useState<Conn[] | null>(null);
  const [pairing, setPairing] = React.useState<Pairing | null>(null);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState('');

  const load = React.useCallback(async (id: string) => {
    try {
      const d = await api(`/api/brands/${id}/connections`);
      setConns((d.connections || []) as Conn[]);
    } catch (e: any) {
      setErr(e?.message || 'Could not load connection status');
    }
  }, []);

  React.useEffect(() => { if (brandId) load(brandId); }, [brandId, load]);

  const connector = conns?.find((c) => c.provider === 'connector' && c.status === 'active') || null;
  const lastSeen = connector?.lastSeenAt || null;

  const state: State = !connector
    ? 'not_paired'
    : !lastSeen
      ? 'paired'
      : Date.now() - Date.parse(lastSeen) <= CONNECTOR_ONLINE_MS
        ? 'online'
        : 'offline';

  // Poll while we are waiting for the plugin's first (or next) poll. Pauses on
  // a hidden tab and caps attempts, so an abandoned tab stops on its own. The
  // plugin's wp-cron runs every 5 min, so 10s is plenty and 120 attempts is
  // ~20 min of waiting — long enough to install the plugin in another tab.
  const waiting = state === 'not_paired' || state === 'paired' || state === 'offline';
  React.useEffect(() => {
    if (!brandId || !waiting) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 120;

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'hidden') { schedule(); return; }
      if (attempts >= MAX_ATTEMPTS) return;
      attempts += 1;
      await load(brandId);
      if (alive) schedule();
    };
    function schedule() {
      if (!alive) return;
      timer = setTimeout(tick, 10_000);
    }

    const onVisible = () => {
      if (alive && document.visibilityState === 'visible' && attempts < MAX_ATTEMPTS) {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    schedule();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [brandId, waiting, load]);

  const pair = async () => {
    if (!brandId) return;
    setErr('');
    setBusy(true);
    try {
      const d = await api(`/api/brands/${brandId}/connections/connector/pair`, { method: 'POST' });
      setPairing({ token: d.token, hmacSecret: d.hmacSecret, pullUrl: d.pullUrl });
      await load(brandId);
    } catch (e: any) {
      setErr(e?.message || 'Could not create pairing credentials');
    } finally {
      setBusy(false);
    }
  };

  const copy = (label: string, value: string) => {
    try {
      navigator.clipboard?.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard blocked — the value is selectable */ }
  };

  const chipStyle = (bg: string, fg: string, bd: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
    fontSize: 12, fontWeight: 700, background: bg, color: fg, border: '1px solid ' + bd,
  });
  const chip = {
    online: <span style={chipStyle('var(--success-50, #ecfdf5)', 'var(--success, #10b981)', 'var(--success, #10b981)')}>● Connected ✓</span>,
    offline: <span style={chipStyle('var(--warn-50, #fef3c7)', 'var(--warn, #b45309)', 'var(--warn, #f59e0b)')}>○ Offline — no poll in a while</span>,
    paired: <span style={chipStyle('var(--warn-50, #fef3c7)', 'var(--warn, #b45309)', 'var(--warn, #f59e0b)')}>○ Paired — waiting for first poll…</span>,
    not_paired: <span style={chipStyle('var(--surface-2, #f6f7f9)', 'var(--text-2, #4b5563)', 'var(--line, #e5e7eb)')}>○ Not connected</span>,
  }[state];

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-all',
    background: 'var(--surface-2, #f6f7f9)', border: '1px solid var(--line, #e5e7eb)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-1, #111)',
  };

  return (
    <>
      <PageHead
        title="Connect your website"
        sub="Install the WordPress plugin and your fixes ship to the real pages — content included, staged as a draft first."
      />
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
            <strong>No Cloudflare, no DNS, no CNAME</strong> — nothing in your domain settings, and no
            inbound access to your site. The plugin polls us.
          </span>
        </div>

        {err && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger, #e11d48)' }}>{err}</p>
        )}
        {brandLoading && !brandId && (
          <p className="quiet" style={{ margin: 0, fontSize: 13 }}>Loading your brand…</p>
        )}

        <Card
          title="1 · Install the plugin"
          right={conns ? chip : undefined}
          lede="WordPress. Plain PHP — no build step, no Composer, no dependencies."
        >
          <a
            href={PLUGIN_DOWNLOAD_URL}
            download
            style={{
              display: 'inline-block', padding: '10px 18px', borderRadius: 8, textDecoration: 'none',
              border: '1px solid var(--primary, #5B5BD6)', background: 'var(--primary, #5B5BD6)',
              color: '#fff', fontSize: 13.5, fontWeight: 600,
            }}
          >
            ⇩ Download the plugin (v{PLUGIN_VERSION})
          </a>
          <ol style={{ margin: '16px 0 0', paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2, #374151)' }}>
            <li>
              In WordPress: <em>Plugins → Add New → Upload Plugin</em>, choose{' '}
              <code>livesov-connector.zip</code>, install it.
            </li>
            <li>Activate <strong>Livesov Connector</strong>.</li>
            <li>
              Go to <em>Settings → Livesov Connector</em> and click{' '}
              <strong>Connect with Livesov</strong>. You approve this brand here, get bounced
              back, and the credentials fill in on their own — nothing to copy. The first sync
              runs immediately.
            </li>
          </ol>
          {state === 'online' && (
            <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--success, #10b981)' }}>
              Connected. Fixes you ship from the Fix Engine will be applied by this site, and page
              edits land as a draft with a preview link before anything goes live.
            </p>
          )}
          {state === 'paired' && (
            <p className="quiet" style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
              Paired. The plugin polls every 5 minutes, so this flips to{' '}
              <strong>Connected&nbsp;✓</strong> on its own — or hit <em>Poll now</em> in the
              plugin&rsquo;s settings if you would rather not wait.
            </p>
          )}
          {state === 'offline' && lastSeen && (
            <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--warn, #b45309)' }}>
              Paired, but the plugin has not polled since{' '}
              {new Date(lastSeen).toLocaleString()}. Check the plugin is still active and that
              wp-cron is running on the site.
            </p>
          )}
        </Card>

        <Card
          title="2 · Pair manually"
          lede="Only if the one-click handshake above will not go through."
        >
          <p className="quiet" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
            Mint the credentials here, then paste all three into{' '}
            <em>Settings → Livesov Connector → Connect manually</em> in WordPress. The token is
            shown <strong>once</strong>; pairing again replaces it.
          </p>
          <button
            onClick={pair}
            disabled={busy || !brandId}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: busy || !brandId ? 'not-allowed' : 'pointer', opacity: busy || !brandId ? 0.6 : 1,
              border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)',
              color: 'var(--text-2, #4b5563)',
            }}
          >
            {busy ? 'Pairing…' : connector ? 'Re-pair (replaces the old token)' : 'Create pairing credentials'}
          </button>
          {pairing && (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {[
                { k: 'Pull URL', v: pairing.pullUrl },
                { k: 'Token', v: pairing.token },
                { k: 'Signing secret', v: pairing.hmacSecret },
              ].map((r) => (
                <div key={r.k}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2, #4b5563)' }}>{r.k}</span>
                    <button
                      onClick={() => copy(r.k, r.v)}
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)',
                        color: 'var(--text-2, #4b5563)',
                      }}
                    >
                      {copied === r.k ? 'Copied ✓' : '⧉ Copy'}
                    </button>
                  </div>
                  <div style={mono}>{r.v}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Not on WordPress?" lede="Worth being straight about what we can and cannot do.">
          <p className="quiet" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Content fixes need something running on your site that can rewrite the page before it
            is served, and on a custom-coded site that has to be your deploy, not a script we hand
            you. A browser snippet can only decorate a page after it loads — it cannot change the
            HTML a crawler is given, so it would report &ldquo;connected&rdquo; while your fixes
            went nowhere. We would rather not offer that.
          </p>
          <p className="quiet" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6 }}>
            For a custom site, ship the fixes yourself: the Fix Engine gives you every change as a
            reviewable diff. Tell us what you are built on and we will say whether a real
            integration is coming.
          </p>
        </Card>
      </div>
    </>
  );
}
