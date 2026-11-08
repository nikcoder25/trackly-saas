'use client';
/**
 * Rank Tracking: a classic keyword rank tracker. One row per site (change,
 * high, low, keywords, movement); open a site for its keyword table, open a
 * keyword for its position history.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHead } from '@/app/dashboard-v2/ui';
import type { RankSiteRow } from '@/lib/rank-tracking/types';
import { rtFetch, useBrandScope, RankTabs, btnPrimary, btnSecondary, cardStyle, srOnly } from '@/components/rank-tracking/RankUi';
import SitesTable from '@/components/rank-tracking/classic/SitesTable';
import AddKeywordsModal from '@/components/rank-tracking/classic/AddKeywordsModal';
import { C } from '@/components/rank-tracking/classic/theme';

const CSS = `
.rtc-row:hover{background:#f8f9fd}
.rtc-menu:hover{background:#f1f5f9}
.rtc button:focus-visible,.rtc a:focus-visible,.rtc input:focus-visible,.rtc svg:focus-visible{outline:2px solid #6366f1;outline-offset:2px;border-radius:6px}
`;

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function RankTrackingPage() {
  const brand = useBrandScope();
  const [sites, setSites] = useState<RankSiteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string; bad?: boolean } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await rtFetch<{ sites: RankSiteRow[] }>(`/api/rank/sites${brand.query ? `?${brand.query}` : ''}`);
      setSites(r.sites);
    } catch (e) {
      setError((e as Error).message || 'Failed to load rankings');
    }
  }, [brand.query]);

  useEffect(() => { setSites(null); setOpenId(undefined); }, [brand.query]);
  useEffect(() => { if (brand.ready) load(); }, [load, brand.ready]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (sites ?? []).filter((s) => !q || `${s.domain} ${s.location}`.toLowerCase().includes(q));
  }, [sites, filter]);
  // A single site opens by itself; otherwise every site starts collapsed.
  const open = openId === undefined ? (rows.length === 1 ? rows[0].id : null) : openId;
  const last = (sites ?? []).reduce<string | null>((m, s) => (s.checkedAt && (!m || s.checkedAt > m) ? s.checkedAt : m), null);

  async function share(s: RankSiteRow) {
    setBusyId(s.id);
    setNotice(null);
    try {
      const { url } = await rtFetch<{ url: string }>(`/api/rank-tracking/websites/${encodeURIComponent(s.id)}/share`, 'POST');
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked: show the link */ }
      setNotice({ text: copied ? `Share link for ${s.domain} copied:` : `Share link for ${s.domain}:`, url });
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not create the share link.', bad: true });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(s: RankSiteRow) {
    if (!window.confirm(`Stop tracking ${s.domain}? This deletes its keywords and rank history.`)) return;
    setBusyId(s.id);
    setNotice(null);
    try {
      await rtFetch(`/api/rank-tracking/websites/${encodeURIComponent(s.id)}`, 'DELETE');
      setNotice({ text: `${s.domain} deleted.` });
      await load();
    } catch (e) {
      setNotice({ text: (e as Error).message || 'Could not delete the site.', bad: true });
    } finally {
      setBusyId(null);
    }
  }

  const refreshAll = () => { load(); setReloadKey((k) => k + 1); };

  return (
    <div className="lvx rtc" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: C.ink }}>
      <style>{CSS}</style>
      <div className="page-body" style={{ paddingTop: 16, paddingBottom: 0 }}><RankTabs /></div>
      <PageHead
        title="Rank tracking"
        sub={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Google positions for every site and keyword.
            {last && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text, border: `1px solid ${C.line}`, borderRadius: 999, padding: '4px 10px', background: '#fff' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: C.up }} />Last check {fmtWhen(last)}
              </span>
            )}
          </span>
        }
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link href="/dashboard/rank-tracking/reports" style={{ ...btnSecondary, fontSize: 14 }}>Export</Link>
            <button type="button" onClick={() => setAdding(brand.domain || '')} style={btnPrimary}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add keywords
            </button>
          </div>
        }
      />

      <div className="page-body" style={{ gap: 16 }}>
        {error && (
          <div role="alert" style={{ ...cardStyle, padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: C.downText, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" style={btnSecondary} onClick={load}>Try again</button>
          </div>
        )}

        {!sites && !error && (
          <div aria-busy="true" style={{ ...cardStyle, height: 220, background: C.lineSoft }}><span style={srOnly}>Loading rankings</span></div>
        )}

        {sites && sites.length === 0 && (
          <section style={{ ...cardStyle, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{brand.name ? `No keywords tracked for ${brand.name} yet` : 'No sites tracked yet'}</h2>
            <p style={{ margin: 0, fontSize: 14, color: C.muted, maxWidth: 520 }}>
              {brand.name && !brand.domain ? `${brand.name} has no website set. Add it in Brand Setup first.` : 'Add a site and the keywords it should rank for. We check Google and show every position here.'}
            </p>
            {brand.name && !brand.domain
              ? <Link href="/dashboard/setup" style={btnPrimary}>Open Brand Setup</Link>
              : <button type="button" onClick={() => setAdding(brand.domain || '')} style={btnPrimary}>+ Add keywords</button>}
          </section>
        )}

        {sites && sites.length > 0 && (
          <section style={{ ...cardStyle, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Sites <span style={{ color: C.muted, fontWeight: 500 }}>{sites.length}</span></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', gap: 12, fontSize: 12, color: C.text }}>
                  {[['Improved', C.up], ['Dropped', C.down], ['Unchanged', C.greyBar]].map(([l, c]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>
                  ))}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.line}`, borderRadius: 8, padding: '0 10px', height: 34 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></svg>
                  <span style={srOnly}>Filter sites</span>
                  <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sites"
                    style={{ font: 'inherit', fontSize: 13, border: 0, outline: 'none', width: 150, height: 32, color: C.ink, background: 'transparent' }} />
                </label>
              </div>
            </div>

            {notice && (
              <div role="status" style={{ margin: '12px 18px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                background: notice.bad ? '#fef2f2' : C.indigoSoft, color: notice.bad ? C.downText : C.navy }}>
                <span>{notice.text}</span>
                {notice.url && <a href={notice.url} target="_blank" rel="noreferrer" style={{ color: '#3730a3', wordBreak: 'break-all', fontWeight: 600 }}>{notice.url}</a>}
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 18 }}>×</button>
              </div>
            )}

            {rows.length ? (
              <SitesTable sites={rows} openId={open} busyId={busyId} reloadKey={reloadKey}
                onToggle={(id) => setOpenId(open === id ? null : id)} onAdd={(s) => setAdding(s.domain)} onShare={share} onDelete={remove} onChanged={load} />
            ) : (
              <p style={{ margin: 0, padding: '26px 24px', fontSize: 14, color: C.muted }}>Nothing matches that filter.</p>
            )}
          </section>
        )}
      </div>

      {adding !== null && (
        <AddKeywordsModal initialUrl={adding} onClose={() => setAdding(null)}
          onAdded={(msg) => { setAdding(null); setNotice({ text: msg }); refreshAll(); }} />
      )}
    </div>
  );
}
