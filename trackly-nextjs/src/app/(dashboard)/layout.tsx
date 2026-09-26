import { cookies } from 'next/headers';
import DashboardLayoutClient from '@/components/dashboard/DashboardLayoutClient';
import { UI_FLAG_KEY, parseUiVersion } from '@/lib/ui-flag';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Design switch: classic unless the user opted into v3 (see lib/ui-flag).
  const store = await cookies();
  const initialUi = parseUiVersion(store.get(UI_FLAG_KEY)?.value) ?? 'classic';
  return <DashboardLayoutClient initialUi={initialUi}>{children}</DashboardLayoutClient>;
}
