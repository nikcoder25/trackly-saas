'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { PLAN_LIMITS } from '@/lib/constants';
import { Card, Badge, Bar, Pill, PageHead, KPIRail, Filter } from '@/app/dashboard-v2/ui';

interface BrandRun {
  date?: string;
  time?: string;
  allResults?: Array<{ query?: string }>;
}

interface BrandLite {
  id: string;
  name?: string;
  queries?: string[];
  runs?: BrandRun[];
  lockedByPlan?: boolean;
  shared?: boolean;
}

interface PromptRow {
  brandId: string;
  brandName: string;
  index: number;
  query: string;
  locked: boolean;
  // Whether this prompt has at least one recorded run result. Drives the
  // honest TRACKING / PENDING status badge so the page can't claim a prompt
  // is "tracking" when Query Tracker shows zero runs for it.
  hasData: boolean;
}

// Stable id for selection - index is appended so duplicate strings
// across brands stay independently selectable.
const rowKey = (r: PromptRow) => `${r.brandId}::${r.index}::${r.query}`;

export default function TrackedPromptsPage() {
  const { user } = useAuth();
  const { brands, refreshBrands, loading: brandsLoading } = useBrands();
  const { startRun, live } = useRun();
  const { toast } = useToast();

  const plan = user?.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const cap = limits.trackedPromptsPerAccount ?? limits.queries ?? 0;
  const isUnlimited = cap >= 9999;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  // Brand id currently being kicked off via "Start tracking" (button spinner).
  const [startingBrand, setStartingBrand] = useState<string | null>(null);

  // Owned brands only - shared/team brands belong to a different
  // owner whose quota the caller doesn't control. Trimming those here
  // would also fail server-side ownership checks.
  const ownedBrands: BrandLite[] = useMemo(
    () => (brands as BrandLite[]).filter((b) => !b.shared),
    [brands],
  );

  // Per-brand set of queries that have at least one recorded run result.
  // Used to tell whether a tracked prompt has actually been run yet.
  const ranQueriesByBrand = useMemo(() => {
    const map = new Map<string, { queries: Set<string>; hasRuns: boolean }>();
    for (const brand of ownedBrands) {
      const ran = new Set<string>();
      const runs = Array.isArray(brand.runs) ? brand.runs : [];
      for (const run of runs) {
        for (const r of run.allResults || []) {
          if (r?.query) ran.add(r.query.toLowerCase().trim());
        }
      }
      map.set(brand.id, { queries: ran, hasRuns: runs.length > 0 });
    }
    return map;
  }, [ownedBrands]);

  const rows: PromptRow[] = useMemo(() => {
    const out: PromptRow[] = [];
    for (const brand of ownedBrands) {
      const queries = Array.isArray(brand.queries) ? brand.queries : [];
      const info = ranQueriesByBrand.get(brand.id);
      // If the brand has runs but the per-query result detail was trimmed
      // from the list payload, fall back to "has data" so a tracked brand
      // doesn't read as PENDING after older runs age out.
      const trimmedRuns = !!info?.hasRuns && (info?.queries.size ?? 0) === 0;
      for (let i = 0; i < queries.length; i++) {
        const hasData = !!info && (info.queries.has(queries[i].toLowerCase().trim()) || trimmedRuns);
        out.push({
          brandId: brand.id,
          brandName: brand.name || 'Untitled brand',
          index: i,
          query: queries[i],
          locked: !!brand.lockedByPlan,
          hasData,
        });
      }
    }
    return out;
  }, [ownedBrands, ranQueriesByBrand]);

  const totalUsed = rows.length;
  const pendingCount = rows.filter((r) => !r.locked && !r.hasData).length;
  const overBy = isUnlimited ? 0 : Math.max(0, totalUsed - cap);
  const overLimit = overBy > 0;
  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.query.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q),
    );
  }, [filter, rows]);

  // Reset selection when the underlying prompt set changes (e.g. after
  // a successful delete or a brand refresh).
  useEffect(() => {
    setSelected((prev) => {
      const validKeys = new Set(rows.map(rowKey));
      const next = new Set<string>();
      for (const k of prev) if (validKeys.has(k)) next.add(k);
      return next;
    });
  }, [rows]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filteredRows) next.add(rowKey(r));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Pre-select the newest prompts so the user can one-click trim back
  // into their plan limit. Newest = last in each brand's queries array
  // (insertion order), so the highest indices across all brands win.
  const selectToFitLimit = () => {
    if (!overLimit) return;
    const sorted = [...rows].sort((a, b) => {
      // Highest brand-local index first; ties broken by brand id so
      // the choice is deterministic.
      if (b.index !== a.index) return b.index - a.index;
      return a.brandId.localeCompare(b.brandId);
    });
    const next = new Set<string>();
    for (let i = 0; i < overBy && i < sorted.length; i++) {
      next.add(rowKey(sorted[i]));
    }
    setSelected(next);
  };

  const handleDelete = async () => {
    if (!selected.size) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} tracked prompt${count === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    // Group selection by brand so each brand needs only one server-
    // side row update.
    const byBrand = new Map<string, string[]>();
    for (const r of rows) {
      if (!selected.has(rowKey(r))) continue;
      const list = byBrand.get(r.brandId) ?? [];
      list.push(r.query);
      byBrand.set(r.brandId, list);
    }
    const deletes = Array.from(byBrand.entries()).map(([brandId, queries]) => ({
      brandId,
      queries,
    }));

    setBusy(true);
    try {
      const res = await fetch('/api/tracked-prompts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deletes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data && (data as { error?: string }).error) || 'Failed to delete prompts');
      }
      toast(
        `Removed ${(data as { removed?: number }).removed ?? count} tracked prompt${count === 1 ? '' : 's'}.`,
        'success',
      );
      setSelected(new Set());
      await refreshBrands();
    } catch (e) {
      toast((e as Error).message || 'Failed to delete prompts', 'error');
    }
    setBusy(false);
  };

  // Kick off a real run for a brand so its tracked prompts actually start
  // producing data. Without this the prompts sit in a "tracking" state with
  // zero runs forever. Goes through the same RunContext path as the sidebar
  // Run button, so the global progress bar and live result toasts show up.
  const startTracking = async (brandId: string) => {
    if (live.running || startingBrand) return;
    setStartingBrand(brandId);
    try {
      await startRun(false, { auto: true, brandId });
      toast('Tracking started — results will appear in Query Tracker as they come in.', 'success');
    } catch (e) {
      toast((e as Error).message || 'Failed to start tracking', 'error');
    }
    setStartingBrand(null);
  };

  const usagePct = isUnlimited
    ? 0
    : Math.min(100, cap > 0 ? (totalUsed / cap) * 100 : 0);
  const usageTone: any = overLimit ? 'var(--danger)' : usagePct >= 80 ? 'var(--warn)' : 'var(--success)';
  const promptsLeft = isUnlimited ? '∞' : Math.max(0, cap - totalUsed).toLocaleString();

  return (
    <div className="lvx">
      <PageHead
        title="Tracked Prompts"
        sub="See and clean up every prompt you're tracking across all brands. Trim prompts back into your plan's account-wide limit."
      />
      <div className="page-body">
        <KPIRail
          items={[
            {
              k: 'TRACKED',
              v: totalUsed.toLocaleString(),
              info: isUnlimited ? '∞ limit' : `of ${cap.toLocaleString()}`,
            },
            { k: 'BRANDS', v: ownedBrands.length.toLocaleString() },
            { k: 'PENDING', v: pendingCount.toLocaleString(), danger: pendingCount > 0 },
            { k: 'PLAN', v: String(plan).toUpperCase() },
            { k: 'SELECTED', v: selected.size.toLocaleString() },
            ...(isUnlimited
              ? [{ k: 'USAGE', v: '∞' }]
              : [{ k: 'OVER BY', v: overBy.toLocaleString(), danger: overBy > 0 }]),
          ]}
        />

        {/* ── Usage summary card ─────────────────────────── */}
        <Card
          title="Account-wide usage"
          right={
            <Pill tone={overLimit ? 'neg' : usagePct >= 80 ? 'warn' : 'acc'}>
              {isUnlimited
                ? '∞ unlimited'
                : `${cap.toLocaleString()} plan limit · ${promptsLeft} left`}
            </Pill>
          }
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-2)' }}>
                Across {ownedBrands.length} brand{ownedBrands.length === 1 ? '' : 's'}
              </span>
              <span className="mono">
                <b>{totalUsed.toLocaleString()}</b>{' '}
                <span className="dim">/ {isUnlimited ? '∞' : cap.toLocaleString()}</span>
              </span>
            </div>
            <Bar value={usagePct} color={usageTone} />
          </div>

          {overLimit && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                background: 'var(--danger-50)',
                border: '1px solid var(--danger-100)',
                fontSize: 12.5,
                color: 'var(--danger)',
                lineHeight: 1.55,
              }}
            >
              <strong>
                Over by {overBy} prompt{overBy === 1 ? '' : 's'}.
              </strong>{' '}
              Auto-tracking is paused until you&apos;re back within your plan limit. Pick the prompts
              you no longer want to track, or{' '}
              <Link href="/dashboard/billing" style={{ fontWeight: 700, textDecoration: 'underline' }}>
                upgrade your plan
              </Link>
              .
            </div>
          )}
        </Card>

        {/* ── Filter / toolbar ───────────────────────────── */}
        <Filter>
          <div className="search-box">
            <span className="dim mono">⌕</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a prompt or brand…"
            />
          </div>
          <button type="button" onClick={selectAllVisible} className="btn-d">
            Select all visible
          </button>
          {overLimit && (
            <button type="button" onClick={selectToFitLimit} className="btn-g">
              Select to fit limit ({overBy})
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="btn-d"
            disabled={selected.size === 0}
          >
            Clear selection
          </button>
          <span style={{ flex: 1 }} />
          <Pill tone={overLimit ? 'neg' : usagePct >= 80 ? 'warn' : 'acc'}>
            {isUnlimited
              ? '∞ unlimited'
              : `${cap.toLocaleString()} plan limit · ${promptsLeft} left`}
          </Pill>
          <button
            type="button"
            onClick={handleDelete}
            disabled={selected.size === 0 || busy}
            className="btn-d btn-danger"
          >
            {busy ? 'Deleting…' : `Delete selected (${selected.size})`}
          </button>
        </Filter>

        {/* ── States ─────────────────────────────────────── */}
        {brandsLoading && (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 0',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '2px solid var(--primary)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'lvx-spin 1s linear infinite',
                }}
              />
            </div>
          </Card>
        )}

        {!brandsLoading && ownedBrands.length === 0 && (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ color: 'var(--text-3)', marginBottom: 12, fontSize: 13 }}>
                You haven&apos;t added any brands yet.
              </p>
              <Link href="/dashboard/setup" className="btn-p">
                Add your first brand →
              </Link>
            </div>
          </Card>
        )}

        {/* ── Per-brand prompt tables ────────────────────── */}
        {!brandsLoading &&
          ownedBrands.map((brand) => {
            const brandRows = filteredRows.filter((r) => r.brandId === brand.id);
            if (filter && brandRows.length === 0) return null;
            const totalForBrand = (brand.queries || []).length;
            const selectedForBrand = brandRows.filter((r) => selected.has(rowKey(r))).length;
            const brandHasRuns = !!ranQueriesByBrand.get(brand.id)?.hasRuns;
            const pendingForBrand = (brand.queries || []).filter((q) => {
              const info = ranQueriesByBrand.get(brand.id);
              const trimmedRuns = !!info?.hasRuns && (info?.queries.size ?? 0) === 0;
              return !(info && (info.queries.has(q.toLowerCase().trim()) || trimmedRuns));
            }).length;
            const canStart = !brand.lockedByPlan && totalForBrand > 0;
            const isStartingThis = startingBrand === brand.id || (live.running && live.brandId === brand.id);
            return (
              <Card
                key={brand.id}
                padding={false}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {brand.name || 'Untitled brand'}
                    {brand.lockedByPlan && <Badge tone="warn">LOCKED</Badge>}
                  </span>
                }
                lede={
                  <>
                    {totalForBrand} prompt{totalForBrand === 1 ? '' : 's'}
                    {pendingForBrand > 0 && ` · ${pendingForBrand} pending`}
                    {selectedForBrand > 0 && ` · ${selectedForBrand} selected`}
                  </>
                }
                right={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {canStart && (
                      <button
                        type="button"
                        className="btn-g"
                        onClick={() => startTracking(brand.id)}
                        disabled={live.running || startingBrand !== null}
                        title={brandHasRuns
                          ? 'Re-run all tracked prompts for this brand now'
                          : 'Run all tracked prompts now to start collecting data'}
                        style={{ opacity: (live.running || startingBrand !== null) ? 0.5 : 1 }}
                      >
                        {isStartingThis ? 'Running…' : brandHasRuns ? '↻ Run now' : '▶ Start tracking'}
                      </button>
                    )}
                    <Link href="/dashboard/setup" className="btn-d">
                      Edit brand →
                    </Link>
                  </span>
                }
              >
                {totalForBrand === 0 ? (
                  <div
                    className="mono dim"
                    style={{ fontSize: 12, padding: '16px 20px' }}
                  >
                    No prompts on this brand.
                  </div>
                ) : brandRows.length === 0 ? null : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            checked={
                              brandRows.length > 0 &&
                              brandRows.every((r) => selected.has(rowKey(r)))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  for (const r of brandRows) next.add(rowKey(r));
                                  return next;
                                });
                              } else {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  for (const r of brandRows) next.delete(rowKey(r));
                                  return next;
                                });
                              }
                            }}
                          />
                        </th>
                        <th>PROMPT</th>
                        <th>BRAND</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandRows.map((r) => {
                        const key = rowKey(r);
                        const isSelected = selected.has(key);
                        return (
                          <tr key={key}>
                            <td>
                              <input
                                id={`prompt-${key}`}
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggle(key)}
                              />
                            </td>
                            <td>
                              <label
                                htmlFor={`prompt-${key}`}
                                style={{ cursor: 'pointer', wordBreak: 'break-word' }}
                              >
                                <b>{r.query}</b>
                              </label>
                            </td>
                            <td className="mono dim" style={{ fontSize: 11 }}>
                              {r.brandName}
                            </td>
                            <td>
                              {r.locked ? (
                                <Badge tone="warn">LOCKED</Badge>
                              ) : r.hasData ? (
                                <Badge tone="pos">TRACKING</Badge>
                              ) : (
                                <Badge tone="neu">PENDING</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
