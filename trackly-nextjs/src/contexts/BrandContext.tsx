'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface Brand {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface BrandContextType {
  brands: Brand[];
  sharedBrands: Brand[];
  selectedBrand: Brand | null;
  setSelectedBrand: (brand: Brand) => void;
  loading: boolean;
  refreshBrands: () => Promise<void>;
}

const BrandContext = createContext<BrandContextType>({
  brands: [],
  sharedBrands: [],
  selectedBrand: null,
  setSelectedBrand: () => {},
  loading: true,
  refreshBrands: async () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sharedBrands, setSharedBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/brands', { credentials: 'include' });
      const data = await res.json();
      const b = data.brands || [];
      const sb = data.sharedBrands || [];
      setBrands(b);
      setSharedBrands(sb);
      if (b.length && !selectedBrand) setSelectedBrand(b[0]);
    } catch (e) {
      console.error('[BrandProvider]', e);
    }
    setLoading(false);
  }, [selectedBrand]);

  useEffect(() => { refreshBrands(); }, []);

  return (
    <BrandContext.Provider value={{ brands, sharedBrands, selectedBrand, setSelectedBrand, loading, refreshBrands }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrands() {
  return useContext(BrandContext);
}
