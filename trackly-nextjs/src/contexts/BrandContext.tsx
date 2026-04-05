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
  refreshBrands: async () => {},
  plan: 'free',
  brandLimit: 1,
  overLimit: false,
  selectedBrandLocked: false,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sharedBrands, setSharedBrands] = useState<Brand[]>([]);
  const [selectedBrand, _setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('free');
  const [brandLimit, setBrandLimit] = useState(1);
  const [overLimit, setOverLimit] = useState(false);

  // Wrap setSelectedBrand to persist selection to localStorage
  const setSelectedBrand = useCallback((brand: Brand | null) => {
    _setSelectedBrand(brand);
    if (brand?.id) {
      try { localStorage.setItem('trackly_selected_brand', brand.id); } catch {}
    }
  }, []);

  const refreshBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/brands', { credentials: 'include' });
      const data = await res.json();
      const b = data.brands || [];
      const sb = data.sharedBrands || [];
      setBrands(b);
      setSharedBrands(sb);
      setPlan(data.plan || 'free');
      setBrandLimit(data.brandLimit || 1);
      setOverLimit(data.overLimit || false);
      _setSelectedBrand((prev) => {
        // Try to restore from localStorage if no previous selection
        let savedId: string | null = null;
        try { savedId = localStorage.getItem('trackly_selected_brand'); } catch {}

        if (prev) {
          // Update the selected brand with fresh data
          const updated = b.find((brand: Brand) => brand.id === prev.id);
          return updated || (b.length ? b[0] : null);
        }
        // Restore persisted selection
        if (savedId) {
          const saved = b.find((brand: Brand) => brand.id === savedId);
          if (saved) return saved;
        }
        return b.length ? b[0] : null;
      });
    } catch (e) {
      console.error('[BrandProvider]', e);
    }
    setLoading(false);
  }, []);

  const selectBrandById = useCallback((id: string) => {
    const found = brands.find(b => b.id === id);
    if (found) setSelectedBrand(found);
  }, [brands, setSelectedBrand]);

  useEffect(() => { refreshBrands(); }, [refreshBrands]);

  const selectedBrandLocked = selectedBrand?.lockedByPlan === true;

  return (
    <BrandContext.Provider value={{
      brands, sharedBrands, selectedBrand, setSelectedBrand, selectBrandById,
      loading, refreshBrands,
      plan, brandLimit, overLimit, selectedBrandLocked,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrands() {
  return useContext(BrandContext);
}
