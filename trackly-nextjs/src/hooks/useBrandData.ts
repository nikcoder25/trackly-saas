'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrands } from '@/contexts/BrandContext';

/**
 * Hook that syncs with BrandContext's selected brand.
 * - Returns the trimmed brand data from the list by default.
 * - If `fullData: true`, fetches full (unstripped) brand data via /api/brands/${id}.
 * - Re-fetches when the selected brand changes in the Topbar.
 */
export function useBrandData({ fullData = false }: { fullData?: boolean } = {}) {
  const { selectedBrand, brands, loading: contextLoading, refreshBrands } = useBrands();
  const [fullBrand, setFullBrand] = useState<Record<string, unknown> | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch full brand data when selected brand changes
  useEffect(() => {
    if (!fullData || !selectedBrand?.id) {
      setFullBrand(null);
      return;
    }
    let cancelled = false;
    setFullLoading(true);
    setError(null);
    fetch(`/api/brands/${selectedBrand.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setFullBrand(d.brand || null);
      })
      .catch(err => {
        if (!cancelled) { setFullBrand(null); setError(err?.message || 'Failed to load brand data'); }
      })
      .finally(() => {
        if (!cancelled) setFullLoading(false);
      });
    return () => { cancelled = true; };
  }, [fullData, selectedBrand?.id]);

  const brand = fullData ? (fullBrand as typeof selectedBrand) : selectedBrand;
  const loading = contextLoading || (fullData && fullLoading);

  const reload = useCallback(async () => {
    await refreshBrands();
    // If full data mode, re-fetch the full brand too
    if (fullData && selectedBrand?.id) {
      try {
        const res = await fetch(`/api/brands/${selectedBrand.id}`, { credentials: 'include' });
        const d = await res.json();
        setFullBrand(d.brand || null);
      } catch (err) { setError((err as Error)?.message || 'Failed to reload brand data'); }
    }
  }, [fullData, selectedBrand?.id, refreshBrands]);

  return { brand, brands, loading, error, reload, refreshBrands };
}
