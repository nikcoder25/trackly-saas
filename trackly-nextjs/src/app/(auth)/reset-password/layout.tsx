import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password - Livesov',
  description: 'Reset the password for your Livesov account.',
  alternates: { canonical: '/reset-password' },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
