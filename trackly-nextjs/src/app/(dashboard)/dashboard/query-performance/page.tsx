'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy route. Nothing in the app links here any more and the Query Tracker
// page renders the same per-prompt mention rates with history, so old
// bookmarks land there instead of on an orphaned, simpler copy.
export default function QueryPerformancePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/query-tracker'); }, [router]);
  return null;
}
