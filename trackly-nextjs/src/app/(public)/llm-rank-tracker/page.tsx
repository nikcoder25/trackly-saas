import type { Metadata } from 'next';
import RankTrackerPage from '@/components/seo/RankTrackerPage';
import { getRankTracker, buildRankTrackerMetadata } from '@/data/rank-trackers';

const DATA = getRankTracker('llm-rank-tracker')!;

export const metadata: Metadata = buildRankTrackerMetadata(DATA);

export default function LlmRankTrackerPage() {
  return <RankTrackerPage data={DATA} />;
}
