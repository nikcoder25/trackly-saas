'use client';

import { useState } from 'react';

/**
 * Email signup for the report-template page. /api/newsletter only parses
 * JSON, so a plain HTML form post always came back as a 400 raw-JSON page.
 */
export default function TemplateSignupForm({ source }: { source: string }) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website: honeypot, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not save your email.'); setStatus('idle'); return; }
      setStatus('done');
    } catch {
      setError('Network error. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <p style={{ fontSize: 15, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', margin: 0 }}>
        <strong>You&apos;re in.</strong> Check your inbox for the template.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      <input
        type="email"
        name="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        style={{
          fontSize: 15,
          padding: '14px 16px',
          border: '1px solid var(--card-border, #e8e5e1)',
          borderRadius: 10,
          outline: 'none',
          width: '100%',
        }}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="land-btn land-btn-primary"
        style={{ padding: '14px 24px', fontSize: 15, opacity: status === 'loading' ? 0.6 : 1 }}
      >
        {status === 'loading' ? 'Sending…' : 'Send the template'}
      </button>
      {error && <p role="alert" style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>{error}</p>}
    </form>
  );
}
