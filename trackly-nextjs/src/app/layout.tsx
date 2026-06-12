import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import ProgressBar from '@/components/ProgressBar';
import CookieConsent from '@/components/CookieConsent';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import { NonceProvider } from '@/components/NonceProvider';
import CsrfFetchInterceptor from '@/components/CsrfFetchInterceptor';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Livesov \u2014 AI Visibility Tracker | Track Your Brand on ChatGPT, Perplexity, Gemini & More',
  description: 'Track how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. GEO & AEO optimization tool \u2014 get real proof, measure share of voice, and monitor AI visibility with Livesov.',
  keywords: 'AI visibility tracker, AI brand monitoring, ChatGPT brand tracking, Perplexity tracking, GEO optimization, generative engine optimization, AEO optimization, answer engine optimization, AI mention tracker, share of voice AI, AI rank tracker, AI SEO tool, brand monitoring AI, AI search tracking, LLM brand monitoring, AI citation tracker, AI brand visibility',
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
      alt: 'Is your brand in the AI answer? Livesov \u2014 free 90-second AI visibility audit across ChatGPT, Perplexity, Claude, Gemini, and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov \u2014 AI Visibility Tracker',
    description: 'Track your brand mentions across ChatGPT, Perplexity, Claude, Gemini & Grok. Real proof. Real data.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
      </head>
      <body style={{ fontFamily: "var(--font)" }} suppressHydrationWarning>
        <NonceProvider nonce={nonce}>
          <CsrfFetchInterceptor />
          <ProgressBar />
          <AuthProvider>
            {children}
          </AuthProvider>
          <CookieConsent />
          <GoogleAnalytics nonce={nonce} />
        </NonceProvider>
      </body>
    </html>
  );
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
