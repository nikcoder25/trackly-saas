'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

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
  // Track the server-saved brand ID to avoid redundant saves
  const serverBrandIdRef = useRef<string | null>(null);

  // Persist selection to both localStorage (instant) and server (for team sync)
  const setSelectedBrand = useCallback((brand: Brand | null) => {
    _setSelectedBrand(brand);
    if (brand?.id) {
      try { localStorage.setItem('trackly_selected_brand', brand.id); } catch {}
      // Save to server if it changed
      if (brand.id !== serverBrandIdRef.current) {
        serverBrandIdRef.current = brand.id;
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ selectedBrandId: brand.id }),
        }).catch(() => {}); // fire-and-forget
      }
    }
  }, []);

  const refreshBrands = useCallback(async () => {
    try {
      // Fetch brands and user settings in parallel
      const [brandsRes, settingsRes] = await Promise.all([
        fetch('/api/brands', { credentials: 'include' }),
        fetch('/api/settings', { credentials: 'include' }),
      ]);
      const data = await brandsRes.json();
      const b = data.brands || [];
      const sb = data.sharedBrands || [];
      setBrands(b);
      setSharedBrands(sb);
      setPlan(data.plan || 'free');
      setBrandLimit(data.brandLimit || 1);
      setOverLimit(data.overLimit || false);

      // Get server-saved brand preference
      let serverBrandId: string | null = null;
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        serverBrandId = settingsData.settings?.selectedBrandId || null;
        if (serverBrandId) serverBrandIdRef.current = serverBrandId;
      }

      _setSelectedBrand((prev) => {
        if (prev) {
          // Update the selected brand with fresh data
          const updated = b.find((brand: Brand) => brand.id === prev.id);
          return updated || (b.length ? b[0] : null);
        }
        // 1. Try server-saved preference (works across devices/team members)
        if (serverBrandId) {
          const saved = b.find((brand: Brand) => brand.id === serverBrandId);
          if (saved) return saved;
        }
        // 2. Fallback to localStorage (instant, same browser)
        let localId: string | null = null;
        try { localId = localStorage.getItem('trackly_selected_brand'); } catch {}
        if (localId) {
          const local = b.find((brand: Brand) => brand.id === localId);
          if (local) return local;
        }
        // 3. Default to first brand
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
