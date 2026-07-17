import type { Metadata } from 'next';
import RankTrackerPage from '@/components/seo/RankTrackerPage';
import { getRankTracker, buildRankTrackerMetadata } from '@/data/rank-trackers';

const DATA = getRankTracker('perplexity-rank-tracker')!;

export const metadata: Metadata = buildRankTrackerMetadata(DATA);

export default function PerplexityRankTrackerPage() {
  return <RankTrackerPage data={DATA} />;
}
