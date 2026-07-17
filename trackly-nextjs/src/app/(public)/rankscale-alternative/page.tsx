import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('rankscale-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function RankscaleAlternativePage() {
  return <AlternativePage data={DATA} />;
}
