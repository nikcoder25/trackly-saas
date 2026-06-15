'use client';

import { useRun } from '@/contexts/RunContext';
import { useBrands } from '@/contexts/BrandContext';

/**
 * Global run progress bar - shown across all dashboard pages
 * (including the redesigned Overview) when a query run is active or just completed.
 *
 * The bar is labelled with the brand the run belongs to (`live.brandId`) so the
 * user always knows which brand's queries are progressing — runs are
 * single-brand and the active brand can differ from the one being viewed.
 */
export default function GlobalRunProgress() {
  const { live, elapsed, pct } = useRun();
  const { brands, selectedBrand } = useBrands();

  // Only show when running or just completed
  if (!live.running && live.status !== 'done') return null;

  // Resolve the running brand's display name from its id (fall back to the
  // selected brand, then a generic label).
  const runningBrand =
    brands.find(b => b.id === live.brandId) ||
    (selectedBrand && selectedBrand.id === live.brandId ? selectedBrand : null);
  const runningBrandName = (runningBrand?.name as string) || (selectedBrand?.name as string) || '';

  return (
    <div style={{
      marginBottom: 14, padding: '10px 16px',
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700 }}>
            {live.running && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            )}
            {live.running ? 'RUNNING QUERIES' : 'RUN COMPLETE'}
          </span>
          {runningBrandName && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 700 }}>
              {runningBrandName}
            </span>
          )}
          {live.running && live.received > 0 && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
              {live.received}/{live.totalExpected}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
          {live.foundCount > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>{live.foundCount} found</span>}
          {live.errorCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{live.errorCount} error{live.errorCount > 1 ? 's' : ''}</span>}
          {live.running && elapsed && <span style={{ color: 'var(--muted)' }}>{elapsed}</span>}
        </div>
      </div>
      <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{
          width: live.status === 'done' ? '100%' : `${pct}%`,
          height: '100%',
          background: live.status === 'done' ? 'var(--green)' : 'var(--primary)',
          borderRadius: 4, transition: 'width 0.4s ease',
        }} />
      </div>
      {live.statusText && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4 }}>
          {live.statusText}
        </div>
      )}
      {live.slowWarning && (
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--amber)', marginTop: 2 }}>
          {live.slowWarning}
        </div>
      )}
    </div>
  );
}
