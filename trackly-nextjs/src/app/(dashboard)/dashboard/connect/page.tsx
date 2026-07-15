'use client';

// /dashboard/connect — "Connect your website" in the production dashboard.
//
// Reuses the shared PageConnect screen (snippet + WordPress flows). It reads
// brand state via useBrandData and calls the live connect API, so it drops
// straight into the classic shell; it only needs a `.lvx` ancestor for the
// design tokens (same pattern as /dashboard/fixes — see THEMED_ROUTES in
// LvxShell). Unlike dashboard-v2, this route is NOT staff-gated: any logged-in
// brand user can reach it.
import { PageConnect } from '@/app/dashboard-v2/pages/connect';

export default function ConnectDashboardPage() {
  return (
    <div className="lvx">
      <div style={{ padding: '18px 22px 0' }}>
        <PageConnect />
      </div>
    </div>
  );
}
