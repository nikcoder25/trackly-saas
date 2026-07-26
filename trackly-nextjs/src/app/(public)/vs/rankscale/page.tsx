import type { Metadata } from 'next';
import VsPage from '@/components/seo/VsPage';
import { getVsComparison, buildVsMetadata } from '@/data/vs-comparisons';

const DATA = getVsComparison('rankscale')!;

export const metadata: Metadata = buildVsMetadata(DATA);

export default function VsRankscalePage() {
  return <VsPage data={DATA} />;
}
