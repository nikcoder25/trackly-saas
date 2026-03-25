import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';

export const metadata: Metadata = {
  title: 'Livesov \u2014 AI Visibility Tracker | Track Your Brand on ChatGPT, Perplexity, Gemini & More',
  description: 'Track how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. GEO & AEO optimization tool \u2014 get real proof, measure share of voice, and monitor AI visibility with Livesov.',
  keywords: 'AI visibility tracker, AI brand monitoring, ChatGPT brand tracking, Perplexity tracking, GEO optimization, generative engine optimization, AEO optimization, answer engine optimization, AI mention tracker, share of voice AI',
  authors: [{ name: 'Livesov' }],
  openGraph: {
    title: 'Livesov \u2014 Track Your Brand Visibility Across AI Platforms',
    description: 'See how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Get real AI responses as proof, measure share of voice, and outrank competitors.',
    type: 'website',
    siteName: 'Livesov',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov \u2014 AI Visibility Tracker',
    description: 'Track your brand mentions across ChatGPT, Perplexity, Claude, Gemini & Grok. Real proof. Real data.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#FF6154" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "var(--font)" }}>
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
