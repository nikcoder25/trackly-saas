'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('cookie-consent');
      if (!consent) {
        const t = setTimeout(() => setShow(true), 1000);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }, []);

  const handleChoice = (choice: 'accepted' | 'declined') => {
    try { localStorage.setItem('cookie-consent', choice); } catch { /* noop */ }
    window.dispatchEvent(new Event('cookie-consent-change'));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: '#0f172a',
        color: 'rgba(255,255,255,0.85)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 14,
        animation: 'cookieSlideUp 0.4s ease',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <style>{`
        @keyframes cookieSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <p style={{ margin: 0, maxWidth: 600, lineHeight: 1.5 }}>
        We use essential cookies to provide our service. You can manage your preferences below.{' '}
        <Link href="/cookies" style={{ color: '#6366f1', textDecoration: 'underline' }}>Cookie Policy</Link>.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleChoice('accepted')}
          aria-label="Accept cookies"
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '8px 20px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
        <button
          onClick={() => handleChoice('declined')}
          aria-label="Decline cookies"
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '8px 20px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

/** Small floating button to re-open cookie preferences after consent has been given. */
export function CookiePreferencesButton() {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    try { setHasConsent(!!localStorage.getItem('cookie-consent')); } catch { /* noop */ }
  }, []);

  if (!hasConsent) return null;

  return (
    <button
      onClick={() => {
        try { localStorage.removeItem('cookie-consent'); } catch { /* noop */ }
        window.dispatchEvent(new Event('cookie-consent-change'));
        window.location.reload();
      }}
      style={{
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: 0,
      }}
    >
      Cookie Preferences
    </button>
  );
}
