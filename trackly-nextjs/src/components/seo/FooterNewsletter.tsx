'use client';

import { useState } from 'react';

/**
 * Footer newsletter opt-in. Subscribes via /api/newsletter with a JSON body
 * (the route parses request.json()), mirroring ToolEmailCapture. The previous
 * markup was a dead form (onSubmit just preventDefault'd and its method="post"
 * form-encoding never matched the JSON API), so no footer signup ever landed.
 */
export default function FooterNewsletter() {
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
        body: JSON.stringify({ email: email.trim(), website: honeypot, source: 'footer' }),
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
      <p className="land-footer-newsletter-success" role="status">
        You&apos;re in. Watch your inbox for the GEO playbook.
      </p>
    );
  }

  return (
    <form className="land-footer-newsletter-form" onSubmit={handleSubmit}>
      <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
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
        id="footer-newsletter-email"
        type="email"
        name="email"
        placeholder="you@company.com"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" className="land-btn land-btn-primary" disabled={loading}>
        {loading ? 'Subscribing…' : 'Subscribe'}
      </button>
      {error && (
        <p className="land-footer-newsletter-error" role="alert" style={{ flexBasis: '100%', margin: '6px 0 0', fontSize: 12, color: '#fca5a5' }}>
          {error}
        </p>
      )}
    </form>
  );
}
