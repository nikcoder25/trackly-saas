'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Which brand a tab shows, in priority order:
 *   1. `?brand=<id>` in the URL - shareable, bookmarkable, survives refresh.
 *   2. sessionStorage - this tab's own choice (a link without the param).
 *   3. localStorage - the last brand picked in any tab (new tabs).
 * Before this, only localStorage was used, so every tab snapped to the same
 * brand on refresh and two brands could not be open side by side.
 */
const BRAND_PARAM = 'brand';
const BRAND_KEY = 'livesov_brand';
const ID_RE = /^[a-z0-9_-]{1,64}$/i;

function readPreferredBrandId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(BRAND_PARAM);
    if (fromUrl && ID_RE.test(fromUrl)) return fromUrl;
  } catch { /* ignore */ }
  try { const v = sessionStorage.getItem(BRAND_KEY); if (v) return v; } catch { /* ignore */ }
  try { return localStorage.getItem(BRAND_KEY); } catch { return null; }
}

/** Keep `?brand=<id>` on the current URL without adding a history entry. */
function writeBrandToUrl(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(BRAND_PARAM) === id) return;
    url.searchParams.set(BRAND_PARAM, id);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}

interface Brand {
  id: string;
  name: string;
  lockedByPlan?: boolean;
  [key: string]: unknown;
}

interface BrandContextType {
  brands: Brand[];
  sharedBrands: Brand[];
  selectedBrand: Brand | null;
  setSelectedBrand: (brand: Brand | null) => void;
  selectBrandById: (id: string) => void;
  loading: boolean;
  error: string | null;
  refreshBrands: () => Promise<void>;
  // Plan limit info
  plan: string;
  brandLimit: number;
  overLimit: boolean;
  selectedBrandLocked: boolean;
}

const BrandContext = createContext<BrandContextType>({
  brands: [],
  sharedBrands: [],
  selectedBrand: null,
  setSelectedBrand: () => {},
  selectBrandById: () => {},
  loading: true,
  error: null,
  refreshBrands: async () => {},
  plan: 'free',
  brandLimit: 1,
  overLimit: false,
  selectedBrandLocked: false,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sharedBrands, setSharedBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState('free');
  const [brandLimit, setBrandLimit] = useState(1);
  const [overLimit, setOverLimit] = useState(false);

  const pathname = usePathname();

  // Persist the choice for this tab (sessionStorage + URL) and as the default
  // for new tabs (localStorage).
  const setSelectedBrand = useCallback((brand: Brand | null) => {
    setSelectedBrandState(brand);
    if (brand?.id) {
      try { sessionStorage.setItem(BRAND_KEY, brand.id); } catch {}
      try { localStorage.setItem(BRAND_KEY, brand.id); } catch {}
      writeBrandToUrl(brand.id);
    }
  }, []);

  // In-app links don't carry the param, so re-add it after each navigation.
  // Also pins this tab to its brand in sessionStorage on first load.
  const selectedId = selectedBrand?.id;
  useEffect(() => {
    if (!selectedId) return;
    try { sessionStorage.setItem(BRAND_KEY, selectedId); } catch {}
    writeBrandToUrl(selectedId);
  }, [selectedId, pathname]);

  const refreshBrands = useCallback(async () => {
    // Fetch brands, transparently refreshing the access token on 401.
    // A bare fetch can return 401 when a session is rotated on another
    // device or after a cold start; without this retry, the selector would
    // render blank and look like the user's brands vanished.
    const fetchBrands = () => fetch('/api/brands', { credentials: 'include' });
    try {
      let res = await fetchBrands();
      if (res.status === 401) {
        const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) {
          res = await fetchBrands();
        }
      }
      if (!res.ok) {
        setError(res.status === 401 ? 'Your session expired. Please log in again.' : 'Unable to load brands. Please retry.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      const b = data.brands || [];
      const sb = data.sharedBrands || [];
      setBrands(b);
      setSharedBrands(sb);
      setPlan(data.plan || 'free');
      setBrandLimit(data.brandLimit || 1);
      setOverLimit(data.overLimit || false);
      setError(null);
      setSelectedBrandState((prev) => {
        // Keep the current selection; on first load restore from the URL,
        // then this tab's choice, then the last brand used in any tab.
        const savedId = prev?.id || readPreferredBrandId();
        if (savedId) {
          const found = b.find((brand: Brand) => brand.id === savedId);
          if (found) return found;
        }
        // Default to first brand only if nothing else works
        return b.length ? b[0] : null;
      });
    } catch (e) {
      console.error('[BrandProvider]', (e as Error).message);
      setError('Network error loading brands.');
    }
    setLoading(false);
  }, []);

  const selectBrandById = useCallback((id: string) => {
    const found = brands.find(b => b.id === id);
    if (found) {
      setSelectedBrand(found);
    }
  }, [brands, setSelectedBrand]);

  useEffect(() => { refreshBrands(); }, [refreshBrands]);

  const selectedBrandLocked = selectedBrand?.lockedByPlan === true;

  return (
    <BrandContext.Provider value={{
      brands, sharedBrands, selectedBrand, setSelectedBrand, selectBrandById,
      loading, error, refreshBrands,
      plan, brandLimit, overLimit, selectedBrandLocked,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrands() {
  return useContext(BrandContext);
}
