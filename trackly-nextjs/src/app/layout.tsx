import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ProgressBar from '@/components/ProgressBar';
import CookieConsent from '@/components/CookieConsent';
import GoogleAnalytics from '@/components/GoogleAnalytics';

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
      alt: 'Livesov \u2014 AI Visibility Tracker for brands across ChatGPT, Perplexity, Claude, Gemini, and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov \u2014 AI Visibility Tracker',
    description: 'Track your brand mentions across ChatGPT, Perplexity, Claude, Gemini & Grok. Real proof. Real data.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
      </head>
      <body style={{ fontFamily: "var(--font)" }} suppressHydrationWarning>
        <ProgressBar />
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
        <CookieConsent />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
