import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/dashboard/Toast';

export const dynamic = 'force-dynamic';

export default function AdminBackendRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
