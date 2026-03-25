import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Livesov - AI Visibility Tracker',
  description: 'Track your brand visibility across ChatGPT, Claude, Gemini, Perplexity & Grok. Monitor AI mentions, analyze share of voice, and optimize your AI presence.',
  openGraph: {
    title: 'Livesov - AI Visibility Tracker',
    description: 'Track your brand visibility across AI platforms',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text)] antialiased" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
