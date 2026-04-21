'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

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

  // Persist selected brand to localStorage
  const setSelectedBrand = useCallback((brand: Brand | null) => {
    setSelectedBrandState(brand);
    if (brand?.id) {
      try { localStorage.setItem('livesov_brand', brand.id); } catch {}
    }
  }, []);

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
        // Try to restore from localStorage if no previous selection
        const savedId = prev?.id || (() => { try { return localStorage.getItem('livesov_brand'); } catch { return null; } })();
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
