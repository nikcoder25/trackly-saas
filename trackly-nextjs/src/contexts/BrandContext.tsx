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
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('free');
  const [brandLimit, setBrandLimit] = useState(1);
  const [overLimit, setOverLimit] = useState(false);

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
      setSelectedBrand((prev) => {
        if (prev) {
          // Update the selected brand with fresh data
          const updated = b.find((brand: Brand) => brand.id === prev.id);
          return updated || (b.length ? b[0] : null);
        }
        // On first load (no prev), restore from localStorage
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('livesov_selected_brand') : null;
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
    if (found) {
      setSelectedBrand(found);
      try { localStorage.setItem('livesov_selected_brand', id); } catch {}
    }
  }, [brands]);

  // Persist selected brand to localStorage whenever it changes
  useEffect(() => {
    if (selectedBrand?.id) {
      try { localStorage.setItem('livesov_selected_brand', selectedBrand.id); } catch {}
    }
  }, [selectedBrand]);

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
