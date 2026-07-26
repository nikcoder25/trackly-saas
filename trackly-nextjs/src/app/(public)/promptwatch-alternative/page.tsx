import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('promptwatch-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function PromptwatchAlternativePage() {
  return <AlternativePage data={DATA} />;
}
