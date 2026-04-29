/**
 * Credit Ledger - per-call audit view of `tenant_cost_events` for the
 * signed-in tenant. Replaces the "Coming soon" placeholder with the
 * surface #455 calls for: timestamp, run id, prompts, platform, credits,
 * status, and a link back to the run.
 *
 * Sums of `credits` across the visible window match the
 * `monthlyUsed` tile on the Billing & Usage page (see #453 / #454 for
 * the data-layer fix this UI makes auditable).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PLATFORM_COLORS } from '@/lib/constants';

interface LedgerRow {
  id: string;
  status: 'completed' | 'refunded' | 'failed';
  createdAt: string;
  runId: string | null;
  platform: string;
  model: string;
  prompts: string[];
  brandId: string | null;
  brandName: string | null;
  tokensIn: number;
  tokensOut: number;
  usdCost: number;
  credits: number;
}

interface LedgerResponse {
  rows: LedgerRow[];
  totals: { credits: number; usdCost: number; count: number };
  window: { from: string; to: string; platform: string | null };
  nextCursor: string | null;
}

const PLATFORMS = Object.keys(PLATFORM_COLORS);

/** Default 'from' date: start of the current UTC month — same window
 *  the billing-page "credits used this period" tile uses. */
function currentMonthStartUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromDateInput(s: string, endOfDay = false): Date {
  // Treat the picker as UTC so the window aligns with the
  // tenant_cost_events created_at bucketing (which is UTC).
  const [y, m, day] = s.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !day) return new Date(NaN);
  return new Date(Date.UTC(y, m - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
}

function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Render in UTC since the underlying ledger buckets on UTC midnight.
  // Local time is exposed via the title tooltip on the cell.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}Z`;
}

function statusBadge(status: LedgerRow['status']): {
  label: string;
  bg: string;
  fg: string;
} {
  if (status === 'refunded') {
    return { label: 'Refunded', bg: 'rgba(245,158,11,.08)', fg: '#f59e0b' };
  }
  if (status === 'failed') {
    return { label: 'Failed', bg: 'rgba(239,68,68,.08)', fg: '#ef4444' };
  }
  return { label: 'Completed', bg: 'rgba(16,185,129,.08)', fg: '#10b981' };
}

export default function CreditLedgerPage() {
  const monthStart = useMemo(() => currentMonthStartUtc(), []);
  const [from, setFrom] = useState<string>(toDateInput(monthStart));
  const [to, setTo] = useState<string>(toDateInput(new Date()));
  // Multi-select platform filter. Empty set = "all platforms" — same as
  // omitting the param. Initial value comes from /api/credits/usage's
  // `activePlatforms` once it loads, so the picker only offers platforms
  // the tenant has actually enabled.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>(PLATFORMS);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [totals, setTotals] = useState<LedgerResponse['totals']>({ credits: 0, usdCost: 0, count: 0 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams();
    const fromDate = fromDateInput(from, false);
    const toDate = fromDateInput(to, true);
    if (!Number.isNaN(fromDate.getTime())) params.set('from', fromDate.toISOString());
    if (!Number.isNaN(toDate.getTime())) params.set('to', toDate.toISOString());
    for (const p of selectedPlatforms) params.append('platform', p);
    params.set('limit', '50');
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/credits/ledger?${params.toString()}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Ledger request failed (${res.status})`);
    return (await res.json()) as LedgerResponse;
  }, [from, to, selectedPlatforms]);

  // Hydrate the platform picker with the tenant's actually-enabled
  // platforms. Falls back to the canonical 5 if the call fails — better
  // to over-offer than to lock the picker to nothing.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { activePlatforms?: string[] } | null) => {
        if (cancelled) return;
        const list = Array.isArray(d?.activePlatforms) ? d!.activePlatforms : [];
        if (list.length) setEnabledPlatforms(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Filter changes reset paging and refetch from the top.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setTotals(data.totals);
        setNextCursor(data.nextCursor);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(nextCursor);
      setRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function resetToCurrentPeriod() {
    setFrom(toDateInput(monthStart));
    setTo(toDateInput(new Date()));
    setSelectedPlatforms(new Set());
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  return (
    <div>
      <div className="view-title">Credit Ledger</div>
      <div className="view-sub">
        Per-call breakdown of credits used. Summed credits in the visible window
        match the &ldquo;credits used this period&rdquo; tile on{' '}
        <Link href="/dashboard/billing" style={{ color: 'var(--primary)' }}>Billing &amp; Usage</Link>.
      </div>

      {/* Filters */}
      <div
        style={{
          marginTop: 16,
          padding: '14px 16px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          From (UTC)
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          To (UTC)
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)',
            }}
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Platforms
          <div role="group" aria-label="Filter by platform" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {enabledPlatforms.map((p) => {
              const active = selectedPlatforms.has(p);
              const dot = PLATFORM_COLORS[p] || 'var(--muted)';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 100,
                    border: '1px solid var(--border)',
                    background: active ? 'var(--primary)' : 'var(--bg)',
                    color: active ? '#fff' : 'var(--text)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    textTransform: 'none', letterSpacing: 0,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : dot }} />
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={resetToCurrentPeriod}
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Current billing period
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Credits in window
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
            {totals.credits.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="card"
        style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}
      >
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div
              style={{
                width: 28, height: 28, margin: '0 auto',
                border: '2px solid var(--primary)', borderTopColor: 'transparent',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>◑</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              No credit events in this window
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
              Try widening the date range or removing the platform filter.
              Credits are charged when an LLM call is dispatched for a tracked
              prompt — runs that haven&apos;t triggered yet won&apos;t appear here.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="th" style={{ whiteSpace: 'nowrap' }}>Timestamp (UTC)</th>
                  <th className="th">Run</th>
                  <th className="th">Prompt</th>
                  <th className="th">Platform</th>
                  <th className="th" style={{ textAlign: 'right' }}>Credits</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.status);
                  const platformColor = PLATFORM_COLORS[r.platform] || 'var(--muted)';
                  const localTooltip = (() => {
                    const d = new Date(r.createdAt);
                    if (Number.isNaN(d.getTime())) return r.createdAt;
                    return `Local: ${d.toLocaleString()}`;
                  })();
                  const promptLabel = r.prompts.length === 0
                    ? '—'
                    : r.prompts.length === 1
                      ? r.prompts[0]
                      : `${r.prompts[0]} +${r.prompts.length - 1}`;
                  return (
                    <tr key={r.id} className="trow">
                      <td className="td" title={localTooltip} style={{ fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatUtcTimestamp(r.createdAt)}
                      </td>
                      <td className="td" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {r.runId
                          ? (r.brandId
                            ? (
                              <Link
                                href={`/dashboard/activity?run=${encodeURIComponent(r.runId)}`}
                                style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                title={r.runId}
                              >
                                {r.runId.slice(0, 8)}
                              </Link>
                            )
                            : <span title={r.runId}>{r.runId.slice(0, 8)}</span>
                          )
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                        {r.brandName && (
                          <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--muted)' }}>
                            {r.brandName}
                          </div>
                        )}
                      </td>
                      <td className="td" style={{ fontSize: 12, maxWidth: 320 }}>
                        <div
                          title={r.prompts.join('\n')}
                          style={{
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', maxWidth: 320,
                          }}
                        >
                          {promptLabel}
                        </div>
                      </td>
                      <td className="td">
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                            background: 'var(--bg3)', color: 'var(--text)',
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: platformColor }} />
                          {r.platform}
                        </span>
                      </td>
                      <td className="td" style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {r.credits}
                      </td>
                      <td className="td">
                        <span
                          style={{
                            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                            padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase',
                            background: badge.bg, color: badge.fg,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {nextCursor && (
              <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                <button
                  disabled={loadingMore}
                  onClick={loadMore}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
