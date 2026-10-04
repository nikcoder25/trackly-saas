'use client';

import { useState } from 'react';

export default function ConsentForm({ params }: { params: Record<string, string | undefined> }) {
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'allow' | 'deny') => {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, decision }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.redirect) throw new Error(d.error || 'Something went wrong. Try again.');
      window.location.assign(d.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="oc-actions">
      {error && <p className="oc-err" role="alert">{error}</p>}
      <button type="button" className="oc-btn" onClick={() => decide('allow')} disabled={!!busy}>
        {busy === 'allow' ? 'Connecting…' : 'Allow'}
      </button>
      <button type="button" className="oc-btn oc-btn-2" onClick={() => decide('deny')} disabled={!!busy}>
        {busy === 'deny' ? 'Cancelling…' : 'Cancel'}
      </button>
    </div>
  );
}
