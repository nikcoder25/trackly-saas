import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - Livesov',
  description: 'Log in to your Livesov account to track your brand visibility across ChatGPT, Perplexity, Claude, Gemini, and Grok.',
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
