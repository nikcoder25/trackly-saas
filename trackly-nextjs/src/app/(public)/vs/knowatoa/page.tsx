import type { Metadata } from 'next';
import VsPage from '@/components/seo/VsPage';
import { getVsComparison, buildVsMetadata } from '@/data/vs-comparisons';

const DATA = getVsComparison('knowatoa')!;

export const metadata: Metadata = buildVsMetadata(DATA);

export default function VsKnowatoaPage() {
  return <VsPage data={DATA} />;
}
