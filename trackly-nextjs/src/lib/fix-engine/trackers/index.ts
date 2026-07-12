/**
 * Fix Engine - tracker registry + dispatch.
 *
 * Resolves a provider key to its Tracker adapter and creates a native issue
 * for a brand if it has a connected tracker. notify.ts calls dispatchTracker
 * first and falls back to the generic webhook when no tracker is connected.
 */

import { getConnection } from '../connections';
import { linearTracker } from './linear';
import { jiraTracker } from './jira';
import { sheetTracker } from './sheet';
import type { Tracker, TrackerCreds, TrackerIssue } from './types';

const TRACKERS: Record<string, Tracker> = {
  linear: linearTracker,
  jira: jiraTracker,
  sheet: sheetTracker,
};

export type TrackerProvider = keyof typeof TRACKERS;

export function getTracker(provider: string): Tracker | undefined {
  return TRACKERS[provider];
}

export function listTrackerProviders(): string[] {
  return Object.keys(TRACKERS);
}

export type TrackerDispatch =
  | { ok: true; provider: string; url?: string; id?: string }
  | { ok: false; reason: 'no_tracker' | 'create_failed'; detail?: string };

/**
 * Create an issue in whichever tracker the brand has connected (Linear
 * preferred over Jira when both exist). Returns 'no_tracker' when none is
 * connected so the caller can fall back to the webhook.
 */
export async function dispatchTracker(brandId: string, issue: TrackerIssue): Promise<TrackerDispatch> {
  for (const provider of ['linear', 'jira', 'sheet'] as const) {
    const conn = await getConnection(brandId, provider);
    if (!conn || conn.status !== 'active' || !conn.creds) continue;
    const tracker = getTracker(provider)!;
    const res = await tracker.createIssue(conn.creds as TrackerCreds, issue);
    if (res.ok) return { ok: true, provider, url: res.url, id: res.id };
    return { ok: false, reason: 'create_failed', detail: `${provider}: ${res.detail ?? 'failed'}` };
  }
  return { ok: false, reason: 'no_tracker' };
}
