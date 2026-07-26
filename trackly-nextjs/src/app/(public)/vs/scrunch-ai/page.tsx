import type { Metadata } from 'next';
import VsPage from '@/components/seo/VsPage';
import { getVsComparison, buildVsMetadata } from '@/data/vs-comparisons';

const DATA = getVsComparison('scrunch-ai')!;

export const metadata: Metadata = buildVsMetadata(DATA);

export default function VsScrunchAiPage() {
  return <VsPage data={DATA} />;
}
