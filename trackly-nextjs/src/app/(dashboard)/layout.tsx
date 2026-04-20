import type { Metadata } from 'next';
import DashboardLayoutClient from '@/components/dashboard/DashboardLayoutClient';

export const dynamic = 'force-dynamic';

// Private workspace — keep logged-in pages out of search indexes and
// content archives. Applies to every route under /dashboard.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
