'use client';

import { useState, useEffect, useMemo } from 'react';
import { useBrandData } from '@/hooks/useBrandData';

interface Brand { id: string; name: string; runs?: Array<{ allResults?: Array<{ citations?: string[] }> }>; }
interface CitationData { domains: Record<string, number>; totalCitations: number; ownDomain?: number; ownDomainName?: string; }

export default function CitationsPage() {
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;
  const [citData, setCitData] = useState<CitationData | null>(null);

  useEffect(() => {
    if (!brand) return;
    fetch(`/api/brands/${brand.id}/citation-analysis`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCitData({ domains: d?.domains ?? {}, totalCitations: d?.totalCitations ?? 0, ownDomain: d?.ownDomain, ownDomainName: d?.ownDomainName }))
      .catch(() => {
        // Compute from runs if API not available
        const domains: Record<string, number> = {};
        (brand.runs || []).forEach(run => {
          (run.allResults || []).forEach(r => {
            (r.citations || []).forEach(url => {
              try { const d = new URL(url).hostname.replace(/^www\./, ''); domains[d] = (domains[d] || 0) + 1; } catch {}
            });
          });
        });
        const total = Object.values(domains).reduce((s, n) => s + n, 0);
        setCitData({ domains, totalCitations: total });
      });
  }, [brand]);

  const sortedDomains = useMemo(() => {
    if (!citData?.domains) return [];
    return Object.entries(citData.domains ?? {}).sort((a, b) => b[1] - a[1]);
  }, [citData]);

  const domainCount = sortedDomains.length;
  const totalCitations = citData?.totalCitations || sortedDomains.reduce((s, [, n]) => s + n, 0);
  const ownDomainCount = citData?.ownDomain || 0;
  const maxCount = sortedDomains.length > 0 ? sortedDomains[0][1] : 1;

  // Detect own domain (brand website)
  const ownDomainName = citData?.ownDomainName || '';

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title">Citation Analysis</div>
          <div className="view-sub">Which domains AI platforms cite when answering queries about your industry.</div>
        </div>
      </div>

      {/* KPI Cards — 3 score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: 'var(--blue)' }}>{domainCount}</div>
          <div className="score-label">Domains Cited</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24 }}>{totalCitations}</div>
          <div className="score-label">Total Citations</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: 'var(--primary)' }}>{ownDomainCount}</div>
          <div className="score-label">Your Domain Cited</div>
        </div>
      </div>

      {/* Top Cited Domains — horizontal bar chart */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title">Top Cited Domains</div>
        {sortedDomains.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 12 }}>
            No citation data yet. Run queries on platforms that provide source links (Perplexity, Gemini).
          </div>
        ) : (
          <div>
            {sortedDomains.map(([domain, count], i) => {
              const isOwn = ownDomainName && domain.includes(ownDomainName);
              const barWidth = Math.max((count / maxCount) * 100, 4);
              return (
                <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < sortedDomains.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {isOwn && <span style={{ color: 'var(--primary)', fontSize: 14 }}>★</span>}
                  <div style={{ minWidth: 180, maxWidth: 220, fontSize: 13, fontWeight: isOwn ? 700 : 500, color: isOwn ? 'var(--primary)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isOwn && '★ '}{domain}
                  </div>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${barWidth}%`, background: isOwn ? 'var(--green)' : 'var(--blue)', transition: 'width .3s' }} />
                  </div>
                  <div style={{ minWidth: 28, textAlign: 'right', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{count}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
