'use client';

import Script from 'next/script';
import { useState, useEffect } from 'react';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-M3E0LVFCEB';

export default function GoogleAnalytics() {
  const [consent, setConsent] = useState<string | null>(null);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem('cookie-consent'));
    } catch { /* noop */ }

    const onConsentChange = () => {
      try {
        setConsent(localStorage.getItem('cookie-consent'));
      } catch { /* noop */ }
    };

    window.addEventListener('cookie-consent-change', onConsentChange);
    return () => window.removeEventListener('cookie-consent-change', onConsentChange);
  }, []);

  if (consent !== 'accepted') return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        onError={() => { /* blocked by ad blocker or network — ignore */ }}
      />
      <Script id="google-analytics" strategy="afterInteractive">{`
        try {
          window.dataLayer = window.dataLayer || [];
          function gtag(){ try { dataLayer.push(arguments); } catch(e) {} }
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { transport_type: 'beacon' });
        } catch (e) { /* analytics blocked — ignore */ }
      `}</Script>
    </>
  );
}
