'use client';

import Link from 'next/link';
import { useBrands } from '@/contexts/BrandContext';

/**
 * Shows a banner when the currently selected brand is locked due to plan limits.
 * Drop this into any dashboard page — it reads from BrandContext automatically.
 */
export default function LockedBrandBanner() {
  const { selectedBrand, selectedBrandLocked, plan, brandLimit } = useBrands();

  if (!selectedBrandLocked || !selectedBrand) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', marginBottom: 16,
      background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.18)',
      borderRadius: 'var(--radius-xs)',
    }}>
      <span style={{ fontSize: 22 }}>🔒</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>
          This brand is locked
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Your <strong>{plan}</strong> plan allows {brandLimit} brand{brandLimit !== 1 ? 's' : ''}.
          {' '}<strong>{selectedBrand.name}</strong> is read-only — you can view data but cannot run queries or make edits.
        </div>
      </div>
      <Link href="/dashboard/account" style={{
        padding: '8px 16px', background: 'var(--primary)', color: '#fff',
        fontSize: 12, fontWeight: 700, borderRadius: 'var(--radius-xs)',
        textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Upgrade Plan
      </Link>
    </div>
  );
}
