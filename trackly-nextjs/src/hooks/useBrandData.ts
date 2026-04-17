'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBrands } from '@/contexts/BrandContext';
import { useRun, type LiveResult } from '@/contexts/RunContext';

/**
 * Hook that syncs with BrandContext's selected brand.
 * - Returns the trimmed brand data from the list by default.
 * - If `fullData: true`, fetches full (unstripped) brand data via /api/brands/${id}.
 * - Re-fetches when the selected brand changes in the Topbar.
 * - Auto-reloads when a run completes (`livesov:run-complete` event) so every
 *   dashboard page (Mentions, Proof, Platforms, Competitors, SOV Trends,
 *   Accuracy, Citations, Query Tracker, Recommendations) reflects the latest
 *   run without manual refresh.
 * - While a run is active, merges the live results from RunContext into the
 *   returned brand as a synthetic in-progress run so pages display results in
 *   real time — the same data that drives the bottom-right toasts.
 */
export function useBrandData({ fullData = false }: { fullData?: boolean } = {}) {
  const { selectedBrand, brands, loading: contextLoading, refreshBrands } = useBrands();
  const { live } = useRun();
  const [fullBrand, setFullBrand] = useState<Record<string, unknown> | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandId = selectedBrand?.id;

  const fetchFullBrand = useCallback(async (id: string) => {
    const res = await fetch(`/api/brands/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load brand data');
    const d = await res.json();
    return d.brand || null;
  }, []);

  // Fetch full brand data when selected brand changes
  useEffect(() => {
    if (!fullData || !brandId) {
      setFullBrand(null);
      return;
    }
    let cancelled = false;
    setFullLoading(true);
    setError(null);
    fetchFullBrand(brandId)
      .then(b => { if (!cancelled) setFullBrand(b); })
      .catch(err => {
        if (!cancelled) { setFullBrand(null); setError((err as Error)?.message || 'Failed to load brand data'); }
      })
      .finally(() => { if (!cancelled) setFullLoading(false); });
    return () => { cancelled = true; };
  }, [fullData, brandId, fetchFullBrand]);

  const baseBrand = fullData ? (fullBrand as typeof selectedBrand) : selectedBrand;
  const loading = contextLoading || (fullData && fullLoading);

  const reload = useCallback(async () => {
    await refreshBrands();
    // If full data mode, re-fetch the full brand too
    if (fullData && brandId) {
      try {
        const b = await fetchFullBrand(brandId);
        setFullBrand(b);
      } catch (err) { setError((err as Error)?.message || 'Failed to reload brand data'); }
    }
  }, [fullData, brandId, refreshBrands, fetchFullBrand]);

  // Keep a ref so the window event listener always sees the latest reload fn
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  // Auto-reload whenever a run completes. RunContext dispatches this event
  // after writing the finished run to brands.data.runs, so every page picks up
  // the new results automatically — no manual refresh / remount required.
  useEffect(() => {
    const handler = () => { reloadRef.current(); };
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, []);

  // Build a synthetic in-progress run from live.results so pages show results
  // in real time while the query worker is still running. Only applied to the
  // brand that is actively being run and only when there are results.
  const brand = useMemo(() => {
    if (!baseBrand) return baseBrand;
    if (!live.running || !live.results.length) return baseBrand;
    if (!live.brandId || live.brandId !== (baseBrand as { id?: string }).id) return baseBrand;

    const b = baseBrand as Record<string, unknown>;
    const existingRuns = Array.isArray(b.runs) ? (b.runs as Array<Record<string, unknown>>) : [];
    const liveRun = buildLiveRun(live.runId, live.results, live.liveSov);
    return { ...(b as object), runs: [...existingRuns, liveRun] } as unknown as typeof baseBrand;
  }, [baseBrand, live.running, live.brandId, live.runId, live.results, live.liveSov]);

  return { brand, brands, loading, error, reload, refreshBrands };
}

/**
 * Shape a synthetic run from live polling results so the same pages that
 * render completed runs can render an in-progress run without special-casing.
 * Mirrors the structure the API persists on run completion.
 */
function buildLiveRun(
  runId: string | null,
  results: LiveResult[],
  liveSov: number | null,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const ok = results.filter(r => !r.error);
  const found = ok.filter(r => r.mentioned);
  const sov = liveSov != null
    ? liveSov
    : ok.length ? Math.round((found.length / ok.length) * 100) : 0;

  // Aggregate per-platform stats (mirrors the shape used by PlatformsPage + TrendsPage).
  const platforms: Record<string, { sov: number; total: number; mentions: number; errors: number; queries: number }> = {};
  for (const r of results) {
    const key = r.platform || 'Unknown';
    if (!platforms[key]) platforms[key] = { sov: 0, total: 0, mentions: 0, errors: 0, queries: 0 };
    const p = platforms[key];
    p.total += 1;
    p.queries += 1;
    if (r.error) p.errors += 1;
    if (r.mentioned) p.mentions += 1;
  }
  for (const key of Object.keys(platforms)) {
    const p = platforms[key];
    const okCount = p.total - p.errors;
    p.sov = okCount > 0 ? Math.round((p.mentions / okCount) * 100) : 0;
  }

  // Map live results to the Mention shape the pages consume.
  const allResults = results.map(r => ({
    query: r.query,
    platform: r.platform,
    model: r.model,
    mentioned: r.mentioned,
    recommended: r.recommended,
    sentiment: r.sentiment,
    position: r.listPosition ?? null,
    listPosition: r.listPosition ?? null,
    response: r.context,
    raw: r.context,
    context: r.context,
    citations: r.citations || [],
    error: r.error ? (r.errorMessage || 'error') : undefined,
    errorMessage: r.errorMessage,
  }));

  const uniqueQueries = Array.from(new Set(results.map(r => r.query).filter(Boolean)));

  return {
    id: runId ? `live-${runId}` : `live-${Date.now()}`,
    live: true,
    date: nowIso,
    time: nowIso,
    created_at: nowIso,
    sov,
    platforms,
    queries: uniqueQueries,
    allResults,
    results: allResults,
  };
}
