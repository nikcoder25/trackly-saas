import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/dashboard/Toast';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export default function AdminBackendRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
