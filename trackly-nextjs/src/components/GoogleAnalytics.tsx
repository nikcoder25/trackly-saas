'use client';

import Script from 'next/script';
import { useState, useEffect } from 'react';
import { GOOGLE_ADS_ID } from '@/lib/googleAds';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-M3E0LVFCEB';

export default function GoogleAnalytics({ nonce }: { nonce?: string }) {
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
        nonce={nonce}
        onError={() => { /* blocked by ad blocker or network - ignore */ }}
      />
      <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>{`
        try {
          window.dataLayer = window.dataLayer || [];
          function gtag(){ try { dataLayer.push(arguments); } catch(e) {} }
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { transport_type: 'beacon' });
          // Google Ads: same shared tag also reports conversions to this account.
          gtag('config', '${GOOGLE_ADS_ID}');
        } catch (e) { /* analytics blocked - ignore */ }
      `}</Script>
    </>
  );
}
