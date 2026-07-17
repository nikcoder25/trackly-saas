import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('athenahq-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function AthenahqAlternativePage() {
  return <AlternativePage data={DATA} />;
}
