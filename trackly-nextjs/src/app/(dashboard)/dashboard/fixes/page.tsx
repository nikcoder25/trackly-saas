'use client';

// /dashboard/fixes — the Fix Engine in the production dashboard.
//
// PageFixes is self-styled (its `.mx` block) and reads brand state via
// useBrandData, so it drops straight into the classic shell; it only needs
// a `.lvx` ancestor for the design tokens (same pattern as the other
// themed routes — see THEMED_ROUTES in LvxShell).
import { PageFixes } from '@/app/dashboard-v2/pages/fixes';

export default function FixesDashboardPage() {
  return (
    <div className="lvx">
      <div style={{ padding: '18px 22px 0' }}>
        <PageFixes />
      </div>
    </div>
  );
}
