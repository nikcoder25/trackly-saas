'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useBrandData } from '@/hooks/useBrandData';
import { Card, KPIRail, Badge, Bar, Pill, Cit, PageHead } from '@/app/dashboard-v2/ui';

interface Brand { id: string; name: string; runs?: Array<{ allResults?: Array<{ citations?: string[] }> }>; }
interface CitationData { domains: Record<string, number>; totalCitations: number; ownDomain?: number; ownDomainName?: string; }

export default function CitationsPage() {
  const { brand: rawBrand, loading } = useBrandData();
  const brand = rawBrand as Brand | null;
  const [citData, setCitData] = useState<CitationData | null>(null);

  const loadCitations = useCallback((b: Brand) => {
    fetch(`/api/brands/${b.id}/citation-analysis`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then(d => setCitData({ domains: d?.domains ?? {}, totalCitations: d?.totalCitations ?? 0, ownDomain: d?.ownDomain, ownDomainName: d?.ownDomainName }))
      .catch(() => {
        // Compute from runs if API not available
        const domains: Record<string, number> = {};
        (b.runs || []).forEach(run => {
          (run.allResults || []).forEach(r => {
            (r.citations || []).forEach(url => {
              try { const dn = new URL(url).hostname.replace(/^www\./, ''); domains[dn] = (domains[dn] || 0) + 1; } catch {}
            });
          });
        });
        const total = Object.values(domains).reduce((s, n) => s + n, 0);
        setCitData({ domains, totalCitations: total });
      });
  }, []);

  useEffect(() => {
    if (!brand) return;
    loadCitations(brand);
  }, [brand?.id, loadCitations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch citations when a run completes - keeps the page in sync with
  // the live toast notifications without requiring a reload.
  useEffect(() => {
    if (!brand) return;
    const handler = () => loadCitations(brand);
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brand?.id, loadCitations]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) return (
    <div className="lvx">
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
        <span className="spinner" style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <PageHead title="Citation Analysis" sub="Which domains AI platforms cite when answering queries about your industry." />
      <div className="page-body">
        <KPIRail items={[
          { k: 'DOMAINS CITED', v: domainCount },
          { k: 'TOTAL CITATIONS', v: totalCitations },
          { k: 'YOUR DOMAIN CITED', v: ownDomainCount },
        ]} />

        <Card title="All cited sources" right={<Pill>{domainCount} unique</Pill>} padding={false}>
          {sortedDomains.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mute)', fontSize: 12 }}>
              No citations captured yet. Citations will appear after your next run.
            </div>
          ) : (
            <table className="tbl">
              <thead><tr>
                <th>DOMAIN</th><th>CITES</th><th>SHARE</th><th>SHARE BAR</th>
              </tr></thead>
              <tbody>
                {sortedDomains.map(([domain, count]) => {
                  const isOwn = !!ownDomainName && domain.includes(ownDomainName);
                  const share = totalCitations > 0 ? (count / totalCitations) * 100 : 0;
                  return (
                    <tr key={domain}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Cit url={domain} />
                          {isOwn && <Badge tone="acc">YOU</Badge>}
                        </span>
                      </td>
                      <td className="num"><b>{count}</b></td>
                      <td className="num">{share.toFixed(1)}%</td>
                      <td><Bar value={count} max={maxCount} color={isOwn ? 'var(--success)' : undefined} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
