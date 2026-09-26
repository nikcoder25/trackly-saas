'use client';

import * as React from 'react';
import { PLAN_LIMITS } from '@/lib/constants';
import type { RecommendationRow } from '@/app/(dashboard)/dashboard/recommendations/load-recs';

/** Fired by pages that change a recommendation's status, so the sidebar
 *  badge and the Overview's "Do these next" list refresh. */
export const RECS_UPDATED_EVENT = 'livesov:recs-updated';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Open recommendations for a brand, most severe first. Returns
 * `available: false` when the plan does not include recommendations (the
 * API answers 403) so callers can hide the badge instead of showing 0.
 */
function useOpenRecommendationsFetch(brandId: string | undefined) {
  const [recs, setRecs] = React.useState<RecommendationRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [available, setAvailable] = React.useState(true);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    if (!brandId) { setRecs([]); setLoaded(true); return; }
    try {
      const res = await fetch(`/api/brands/${brandId}/recommendations?status=open`, { credentials: 'include', cache: 'no-store', signal });
      if (signal?.aborted) return;
      if (res.status === 403) { setAvailable(false); setRecs([]); setLoaded(true); return; }
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json();
      const list: RecommendationRow[] = Array.isArray(data?.recommendations) ? data.recommendations : [];
      list.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
      setAvailable(true);
      setRecs(list.filter(r => r.status === 'open'));
      setLoaded(true);
    } catch { /* aborted or offline; keep the last list */ }
  }, [brandId]);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoaded(false);
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  React.useEffect(() => {
    const h = () => load();
    window.addEventListener('livesov:run-complete', h);
    window.addEventListener(RECS_UPDATED_EVENT, h);
    return () => {
      window.removeEventListener('livesov:run-complete', h);
      window.removeEventListener(RECS_UPDATED_EVENT, h);
    };
  }, [load]);

  return { recs, count: recs.length, loaded, available, reload: load };
}

type OpenRecs = ReturnType<typeof useOpenRecommendationsFetch>;
const OpenRecsContext = React.createContext<OpenRecs | null>(null);

/** One fetch per brand for the whole v3 shell (sidebar badge, drawer,
 *  bottom bar and Overview all read the same list). */
export function OpenRecsProvider({ brandId, children }: { brandId: string | undefined; children: React.ReactNode }) {
  const value = useOpenRecommendationsFetch(brandId);
  return <OpenRecsContext.Provider value={value}>{children}</OpenRecsContext.Provider>;
}

export function useOpenRecommendations(): OpenRecs {
  const ctx = React.useContext(OpenRecsContext);
  return ctx || { recs: [], count: 0, loaded: false, available: false, reload: async () => {} };
}

type RunLike = { time?: string; date?: string; created_at?: string; watchdogReap?: boolean; emergencySave?: boolean };

/** Newest real run timestamp (ms) on a brand, skipping reaper stamps. */
export function lastRunMs(brand: Record<string, unknown> | null | undefined): number | null {
  const runs = (brand?.runs as RunLike[] | undefined) || [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (!r || r.watchdogReap || r.emergencySave) continue;
    const t = new Date(r.time || r.date || r.created_at || 0).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return null;
}

/** "3m ago", "5h ago", "2d ago". */
export function agoLabel(ms: number | null, now = Date.now()): string {
  if (ms == null) return 'never';
  const diff = Math.max(0, now - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * When the scheduler will next pick this brand up: the later of its own
 * schedule and the plan's minimum gap after the last run. Null when the
 * plan has no scheduled runs.
 */
export function nextScanMs(brand: Record<string, unknown> | null | undefined, plan: string): number | null {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (!limits?.scheduledRuns) return null;
  const raw = brand?.schedule;
  const hours = Math.max(raw != null ? (parseInt(String(raw), 10) || 24) : 24, limits.minScheduleHours || 24);
  const last = lastRunMs(brand);
  if (last == null) return Date.now();
  return last + hours * 3600_000;
}

export function untilLabel(ms: number | null, now = Date.now()): string {
  if (ms == null) return 'Manual scans on your plan';
  const diff = ms - now;
  if (diff <= 60 * 60_000) return 'Due now';
  const h = Math.round(diff / 3600_000);
  if (h < 24) return `In about ${h}h`;
  const d = Math.round(h / 24);
  return `In about ${d} day${d === 1 ? '' : 's'}`;
}

export function initials(name: string | undefined | null): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'BR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
