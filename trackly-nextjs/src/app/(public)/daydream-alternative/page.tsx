import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('daydream-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function DaydreamAlternativePage() {
  return <AlternativePage data={DATA} />;
}
