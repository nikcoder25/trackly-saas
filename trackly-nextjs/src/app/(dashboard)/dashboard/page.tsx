'use client';

// Dashboard Overview - redesigned per the Dashboard.html design bundle.
// The presentational page + real-data wiring live in the shared design module;
// here we just mount it inside a scoped `.lvx` root. Post-checkout payment
// reconciliation and the locked-brand / live-run banners are rendered by the
// dashboard shell (see DashboardLayoutClient), so this page stays presentational.

import { PageOverview } from '@/app/dashboard-v2/pages/overview';
import OverviewV3 from '@/components/dashboard/v3/OverviewV3';
import { useUiFlag } from '@/contexts/UiFlagContext';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const { isV3 } = useUiFlag();
  if (isV3) return <OverviewV3 />;
  return (
    <div className="lvx">
      <PageOverview />
    </div>
  );
}
