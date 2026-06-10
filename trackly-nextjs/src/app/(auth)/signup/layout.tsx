import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up - Livesov',
  description: 'Create a free Livesov account and start tracking how AI assistants mention your brand.',
  alternates: { canonical: '/signup' },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
