import AuthLayoutClient from '@/components/auth/AuthLayoutClient';

export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayoutClient>{children}</AuthLayoutClient>;
}
