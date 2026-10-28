import { cookies } from 'next/headers';
import DashboardLayoutClient from '@/components/dashboard/DashboardLayoutClient';
import { DEFAULT_UI, UI_FLAG_KEY, parseUiVersion } from '@/lib/ui-flag';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Design switch: v3 unless the user fell back to classic (see lib/ui-flag).
  const store = await cookies();
  const initialUi = parseUiVersion(store.get(UI_FLAG_KEY)?.value) ?? DEFAULT_UI;
  return <DashboardLayoutClient initialUi={initialUi}>{children}</DashboardLayoutClient>;
}
