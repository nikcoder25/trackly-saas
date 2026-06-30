'use client';

/**
 * One-click Connector consent screen.
 *
 * The Connector plugin sends the user here with ?site=&callback=&state=.
 * We confirm who's signed in, let them pick which brand to connect, and on
 * Approve hand off to /api/connect/connector/approve, which returns the
 * callback redirect (carrying a one-time code) back to the plugin.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Brand { id: string; name?: string; website?: string }

function ConnectConsent() {
  const params = useSearchParams();
  const site = params.get('site') || '';
  const callback = params.get('callback') || '';
  const state = params.get('state') || '';

  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [selected, setSelected] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const siteHost = (() => { try { return new URL(site.startsWith('http') ? site : `https://${site}`).hostname; } catch { return site; } })();
  const returnUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/connect/connector';

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/brands', { credentials: 'include', cache: 'no-store' });
        if (res.status === 401) { setNeedsLogin(true); return; }
        const data = await res.json();
        const list: Brand[] = (data.brands || data || []).map((b: any) => ({ id: b.id, name: b.data?.name || b.name, website: b.data?.website || b.website }));
        setBrands(list);
        if (list.length) setSelected(list[0].id);
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  const approve = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/connect/connector/approve', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selected, site, callback, state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect');
      window.location.href = data.redirect; // back to the site, with the one-time code
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const card: React.CSSProperties = { maxWidth: 460, margin: '8vh auto', padding: 28, border: '2.5px solid #111', boxShadow: '6px 6px 0 #111', background: '#fff', fontFamily: 'Inter, system-ui, sans-serif' };
  const btn: React.CSSProperties = { padding: '11px 18px', border: '2.5px solid #111', background: '#111', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '3px 3px 0 #6c5ce7' };

  if (!site || !callback) {
    return <div style={card}><h2 style={{ marginTop: 0 }}>Invalid connect link</h2><p>This page should be opened from the Livesov Connector plugin. Missing site/callback.</p></div>;
  }
  if (needsLogin) {
    return (
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Connect your site to Livesov</h2>
        <p style={{ color: '#555' }}>Log in to Livesov to connect <b>{siteHost}</b>.</p>
        <Link href={`/login?return=${encodeURIComponent(returnUrl)}`} style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>Log in to continue</Link>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#6c5ce7', textTransform: 'uppercase' }}>Connect a site</div>
      <h2 style={{ margin: '6px 0 4px' }}>Authorize the Connector</h2>
      <p style={{ color: '#555', fontSize: 14, lineHeight: 1.5 }}>
        <b>{siteHost}</b> wants to apply approved Fix Engine changes (llms.txt, robots.txt, head schema, and staged drafts) to itself.
        Choose which brand it should be linked to.
      </p>

      {brands === null && <p style={{ color: '#888' }}>Loading your brands…</p>}
      {brands && brands.length === 0 && <p style={{ color: '#c0392b' }}>You have no brands yet. Create one in the dashboard first.</p>}
      {brands && brands.length > 0 && (
        <>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', margin: '14px 0 6px' }}>BRAND</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ width: '100%', padding: 10, border: '2px solid #111', fontSize: 14 }}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name || b.website || b.id}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={approve} disabled={busy || !selected} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Connecting…' : `Approve & connect ${siteHost}`}</button>
            <Link href="/dashboard" style={{ padding: '11px 18px', border: '2.5px solid #111', background: '#fff', color: '#111', fontWeight: 700, textDecoration: 'none' }}>Cancel</Link>
          </div>
        </>
      )}
      {error && <p style={{ color: '#c0392b', marginTop: 14, fontSize: 13 }}>{error}</p>}
      <p style={{ color: '#999', fontSize: 11, marginTop: 18, lineHeight: 1.5 }}>Only approve a site you own. The Connector pulls your approved changes; it gets no other access to your account.</p>
    </div>
  );
}

export default function ConnectConnectorPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>}>
      <ConnectConsent />
    </Suspense>
  );
}
