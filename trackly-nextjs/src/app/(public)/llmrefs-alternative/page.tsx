import type { Metadata } from 'next';
import AlternativePage from '@/components/seo/AlternativePage';
import { getAlternative, buildAlternativeMetadata } from '@/data/alternatives';

const DATA = getAlternative('llmrefs-alternative')!;

export const metadata: Metadata = buildAlternativeMetadata(DATA);

export default function LlmrefsAlternativePage() {
  return <AlternativePage data={DATA} />;
}
