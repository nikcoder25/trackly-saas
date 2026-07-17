import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('waikay-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function WaikayAlternativePage() {
  return <AlternativePage data={DATA} />;
}
