import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('scrunch-ai-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function ScrunchAiAlternativePage() {
  return <AlternativePage data={DATA} />;
}
