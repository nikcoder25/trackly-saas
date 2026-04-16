import { KpiCardsSkeleton, CardsSkeleton, SkeletonStyles } from '@/components/dashboard/Skeleton';

export default function DashboardLoading() {
  return (
    <div>
      <SkeletonStyles />
      <div style={{ height: 24, width: 180, borderRadius: 6, background: 'var(--bg3)', marginBottom: 8 }} />
      <div style={{ height: 14, width: 280, borderRadius: 4, background: 'var(--bg3)', marginBottom: 24 }} />
      <KpiCardsSkeleton count={4} />
      <CardsSkeleton count={3} />
    </div>
  );
}
