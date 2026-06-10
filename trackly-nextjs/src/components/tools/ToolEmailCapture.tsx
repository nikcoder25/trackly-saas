'use client';

import { useState } from 'react';

/**
 * Post-result email capture card for the free tools. Subscribes via
 * /api/newsletter with a per-tool `source` tag (tool:<slug>) so signups are
 * attributable in newsletter_subscribers. Copy is deliberately a newsletter
 * opt-in — the backend does not email tool results, so don't promise that.
 */
export default function ToolEmailCapture({ source }: { source: string }) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website: honeypot, source: `tool:${source}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save your email.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          marginTop: 16,
          padding: '16px 20px',
          borderRadius: 12,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          fontSize: 14,
          color: '#166534',
        }}
      >
        <strong>You&apos;re in.</strong> Watch your inbox for monthly AI visibility benchmarks and GEO
        tactics. Want continuous tracking instead of one-off checks?{' '}
        <a href="/signup" style={{ color: '#166534', fontWeight: 700 }}>
          Start a free trial
        </a>
        .
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: '20px 24px',
        borderRadius: 12,
        background: '#fafaf9',
        border: '1px solid #e8e5e1',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>
        This check is a snapshot - AI answers change weekly.
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
        Get monthly AI visibility benchmarks and the GEO tactics that are working, free. Unsubscribe
        anytime.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Honeypot field - hidden from humans, bots fill it */}
        <input
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={{
            flex: '1 1 220px',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #e0e0e0',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--brand)',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? 'Saving…' : 'Get the benchmarks'}
        </button>
      </form>
      {error && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#b91c1c' }}>{error}</p>
      )}
    </div>
  );
}
