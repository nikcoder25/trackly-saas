import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ProgressBar from '@/components/ProgressBar';
import CookieConsent from '@/components/CookieConsent';

export const metadata: Metadata = {
  title: 'Livesov \u2014 AI Visibility Tracker | Track Your Brand on ChatGPT, Perplexity, Gemini & More',
  description: 'Track how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. GEO & AEO optimization tool \u2014 get real proof, measure share of voice, and monitor AI visibility with Livesov.',
  keywords: 'AI visibility tracker, AI brand monitoring, ChatGPT brand tracking, Perplexity tracking, GEO optimization, generative engine optimization, AEO optimization, answer engine optimization, AI mention tracker, share of voice AI, AI rank tracker, AI SEO tool, brand monitoring AI, AI search tracking, AI overview tracking, LLM brand monitoring, AI citation tracker, AI brand visibility',
  authors: [{ name: 'Livesov' }],
  robots: 'index, follow, max-image-preview:large, max-snippet:-1',
  metadataBase: new URL('https://livesov.com'),
  alternates: { canonical: '/' },
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
    title: 'Livesov \u2014 Track Your Brand Visibility Across AI Platforms',
    description: 'See how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Get real AI responses as proof, measure share of voice, and outrank competitors.',
    type: 'website',
    siteName: 'Livesov',
    url: 'https://livesov.com/',
    locale: 'en_US',
    images: [{
      url: 'https://livesov.com/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Livesov \u2014 AI Visibility Tracker for brands across ChatGPT, Perplexity, Claude, Gemini and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov \u2014 AI Visibility Tracker',
    description: 'Track your brand mentions across ChatGPT, Perplexity, Claude, Gemini & Grok. Real proof. Real data.',
    images: ['https://livesov.com/og-image.png'],
  },
};

// JSON-LD structured data
const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Livesov',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'AI Visibility Tracker \u2014 Monitor how ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overview mention your brand.',
    url: 'https://livesov.com',
    offers: [
      { '@type': 'Offer', name: 'Starter', price: '9', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Agency', price: '89', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Enterprise', price: '499', priceCurrency: 'USD' },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is AI visibility tracking?', acceptedAnswer: { '@type': 'Answer', text: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overview mention your brand when users ask questions.' } },
      { '@type': 'Question', name: 'How does Livesov track brand mentions in AI?', acceptedAnswer: { '@type': 'Answer', text: 'Livesov sends your custom queries to real AI platforms via their official APIs and captures the complete, unmodified responses.' } },
      { '@type': 'Question', name: 'Which AI platforms does Livesov support?', acceptedAnswer: { '@type': 'Answer', text: 'Livesov tracks your brand across 5 AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, and Grok (xAI).' } },
      { '@type': 'Question', name: 'What is Share of Voice in AI?', acceptedAnswer: { '@type': 'Answer', text: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked.' } },
      { '@type': 'Question', name: 'What is Generative Engine Optimization (GEO)?', acceptedAnswer: { '@type': 'Answer', text: 'Generative Engine Optimization (GEO) is the practice of optimizing your brand\'s online presence to appear more frequently and positively in AI-generated answers.' } },
      { '@type': 'Question', name: 'How much does Livesov cost?', acceptedAnswer: { '@type': 'Answer', text: 'Livesov starts at $9/mo (Starter plan) with 1 brand, 2 AI platforms, and 30 prompts/month. Pro ($29/mo) and Agency ($89/mo) plans unlock more brands, platforms, and features.' } },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Livesov',
    url: 'https://livesov.com',
    logo: 'https://livesov.com/og-image.png',
    description: 'AI Visibility Tracker \u2014 Monitor how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
    contactPoint: { '@type': 'ContactPoint', email: 'hello@livesov.com', contactType: 'customer support' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Livesov',
    url: 'https://livesov.com',
    description: 'AI Visibility Tracker \u2014 Track your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#FF6154" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
        {jsonLd.map((schema, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        ))}
      </head>
      <body style={{ fontFamily: "var(--font)" }} suppressHydrationWarning>
        <ProgressBar />
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
