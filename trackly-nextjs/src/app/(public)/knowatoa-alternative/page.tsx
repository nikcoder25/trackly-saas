import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('knowatoa-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function KnowatoaAlternativePage() {
  return <AlternativePage data={DATA} />;
}
