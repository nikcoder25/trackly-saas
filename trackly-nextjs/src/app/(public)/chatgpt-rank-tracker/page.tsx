import type { Metadata } from 'next';
import RankTrackerPage from '@/components/seo/RankTrackerPage';
import { getRankTracker, buildRankTrackerMetadata } from '@/data/rank-trackers';

const DATA = getRankTracker('chatgpt-rank-tracker')!;

export const metadata: Metadata = buildRankTrackerMetadata(DATA);

export default function ChatgptRankTrackerPage() {
  return <RankTrackerPage data={DATA} />;
}
