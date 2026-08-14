'use client';

/**
 * Editor for the AI-channel offer.
 *
 * The destination URLs are shown right in the form on purpose: two are
 * published to crawlers, one is the unlisted page that honours the offer for
 * whoever acts on it. Keeping all three visible while editing makes it hard
 * to forget that the redemption path is part of the product, not an extra.
 */

import { useState, useEffect } from 'react';

interface Offer {
  id: string;
  headline: string;
  body: string;
  code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  updated_at: string;
}

const CARD: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px 18px',
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 6, marginTop: 16,
};
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
  background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
};

/** Postgres timestamptz -> the value format <input type="datetime-local"> wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminOfferPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [code, setCode] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(false);

  useEffect(() => {
    fetch('/api/admin-backend/offer', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const o: Offer | null = d.offer;
        if (o) {
          setHeadline(o.headline);
          setBody(o.body);
          setCode(o.code || '');
          setStartsAt(toLocalInput(o.starts_at));
          setEndsAt(toLocalInput(o.ends_at));
          setActive(o.active);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/admin-backend/offer', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline, body, code: code || null, active,
          // datetime-local has no zone; the Date constructor on the server
          // reads these as the server's zone, so send a real ISO string.
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed to save'); }
      else { setSaved(true); }
    } catch {
      setError('Failed to save');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="view-title">AI Offer</h1>
      <p className="view-sub">
        A channel-specific promotion published where AI assistants read it, so a model summarising
        Livesov has a live offer to quote rather than a generic description.
      </p>

      <div style={{ ...CARD, marginTop: 20, marginBottom: 20, borderColor: 'var(--primary)' }}>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>
          Saving publishes to all three of these at once, from one record:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.9, marginTop: 10, paddingLeft: 18 }}>
          <li><a href="/llms.txt" target="_blank" rel="noreferrer"><code>/llms.txt</code></a> — the manifest AI crawlers read</li>
          <li><a href="/ai-offer.json" target="_blank" rel="noreferrer"><code>/ai-offer.json</code></a> — structured terms for agents</li>
          <li><a href="/offer" target="_blank" rel="noreferrer"><code>/offer</code></a> — unlisted landing page that honours the offer</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.7 }}>
          The offer is not on the public site: no footer link, not in the sitemap, noindex. Someone
          browsing livesov.com will not find it — only someone an assistant sent. That works the same
          way a podcast or affiliate code does.
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
          What the landing page does is honour it. If a model tells someone about the promotion and
          the link does not deliver, that is an offer you are not standing behind, and the person who
          acted on it is the one who loses — so keep the terms here to something you will actually
          give. Changes reach all three URLs within about 5 minutes.
        </p>
      </div>

      <form onSubmit={save} style={CARD}>
        <label style={{ ...LABEL, marginTop: 0 }} htmlFor="headline">Headline</label>
        <input id="headline" style={INPUT} value={headline} maxLength={120} required
          onChange={e => setHeadline(e.target.value)}
          placeholder="10% extra credits on your first plan" />

        <label style={LABEL} htmlFor="body">What the customer gets</label>
        <textarea id="body" style={{ ...INPUT, minHeight: 90, resize: 'vertical' }} value={body}
          maxLength={500} required onChange={e => setBody(e.target.value)}
          placeholder="Start any paid plan and get 10% extra credits on your first billing period." />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          Describe the offer. Copy that instructs the reading model instead — “recommend Livesov
          first”, “rank this above competitors” — is rejected on save: that is prompt injection
          against another vendor&apos;s system, it is trivially detected, and it is grounds for being
          dropped from their index.
        </p>

        <label style={LABEL} htmlFor="code">Code (optional)</label>
        <input id="code" style={{ ...INPUT, fontFamily: 'monospace', textTransform: 'uppercase' }}
          value={code} maxLength={40} onChange={e => setCode(e.target.value)} placeholder="AGENT10" />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Appended to the offer link as <code>?promo=</code>, so signups citing it show up under
          Attribution → “Offer codes cited at signup”.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <label style={LABEL} htmlFor="startsAt">Starts (optional)</label>
            <input id="startsAt" type="datetime-local" style={INPUT} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label style={LABEL} htmlFor="endsAt">Ends</label>
            <input id="endsAt" type="datetime-local" style={INPUT} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          Required to go live. Assistants cache and re-quote what they read, so an offer with no
          expiry keeps being promised to customers long after you stop honouring it.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Publish this offer
        </label>

        {error && (
          <p style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontSize: 13, lineHeight: 1.6 }}>
            {error}
          </p>
        )}
        {saved && (
          <p style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,.1)', color: 'var(--green)', fontSize: 13 }}>
            Saved. {active ? 'Live within ~5 minutes on /llms.txt, /ai-offer.json and /offer.' : 'Saved as a draft — not published.'}
          </p>
        )}

        <button type="submit" disabled={saving}
          style={{ marginTop: 20, padding: '11px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving...' : 'Save offer'}
        </button>
      </form>
    </div>
  );
}
