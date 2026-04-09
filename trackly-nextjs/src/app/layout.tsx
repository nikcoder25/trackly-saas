import type { Metadata } from 'next';
import Script from 'next/script';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ProgressBar from '@/components/ProgressBar';
import CookieConsent from '@/components/CookieConsent';

export const metadata: Metadata = {
  title: 'Livesov — AI Visibility Tracker | Track Your Brand on ChatGPT, Perplexity, Gemini & More',
  description: 'Track how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. GEO & AEO optimization tool — get real proof, measure share of voice, and monitor AI visibility with Livesov.',
  authors: [{ name: 'Livesov' }],
  robots: 'index, follow, max-image-preview:large, max-snippet:-1',
  metadataBase: new URL('https://livesov.com'),
  alternates: {
    canonical: '/',
    languages: {
      'en': '/',
      'es': '/',
      'fr': '/',
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Livesov — Track Your Brand Visibility Across AI Platforms',
    description: 'See how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Get real AI responses as proof, measure share of voice, and outrank competitors.',
    type: 'website',
    siteName: 'Livesov',
    url: 'https://livesov.com/',
    locale: 'en_US',
    images: [{
      url: 'https://livesov.com/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Livesov — AI Visibility Tracker for brands across ChatGPT, Perplexity, Claude, Gemini and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov — AI Visibility Tracker',
    description: 'Track your brand mentions across ChatGPT, Perplexity, Claude, Gemini & Grok. Real proof. Real data.',
    images: ['https://livesov.com/og-image.png'],
  },
};

// JSON-LD: Only Organization + WebSite in root layout.
// SoftwareApplication + FAQPage schemas live in (public)/home/layout.tsx to avoid duplication.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-M3E0LVFCEB';

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Livesov',
    url: 'https://livesov.com',
    logo: 'https://livesov.com/og-image.png',
    description: 'AI Visibility Tracker — Monitor how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
    contactPoint: { '@type': 'ContactPoint', email: 'hello@livesov.com', contactType: 'customer support' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Livesov',
    url: 'https://livesov.com',
    description: 'AI Visibility Tracker — Track your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        {jsonLd.map((schema, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        ))}
      </head>
      <body style={{ fontFamily: "var(--font)" }} suppressHydrationWarning>
        {/* Skip-to-content link for keyboard / screen reader users */}
        <a
          href="#main-content"
          className="skip-to-content"
        >
          Skip to main content
        </a>
        <ProgressBar />
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
        <CookieConsent />
        {/* Load Google Fonts asynchronously to avoid render-blocking (audit #27).
            Uses afterInteractive strategy + font-display:swap for non-blocking load. */}
        <Script id="load-fonts" strategy="afterInteractive">{`
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@400;700&display=swap';
          document.head.appendChild(link);
        `}</Script>
        <noscript>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
        </noscript>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
      </body>
    </html>
  );
}
