'use client';

import Script from 'next/script';
import { useState, useEffect } from 'react';

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'x7f4esftdl';

export default function MicrosoftClarity({ nonce }: { nonce?: string }) {
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
    <Script id="microsoft-clarity" strategy="afterInteractive" nonce={nonce}>{`
      try {
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_ID}");
      } catch (e) { /* analytics blocked - ignore */ }
    `}</Script>
  );
}
