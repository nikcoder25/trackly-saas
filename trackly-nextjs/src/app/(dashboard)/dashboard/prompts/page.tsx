'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useToast } from '@/components/dashboard/Toast';
import { PLAN_LIMITS } from '@/lib/constants';

interface BrandLite {
  id: string;
  name?: string;
  queries?: string[];
  lockedByPlan?: boolean;
  shared?: boolean;
}

interface PromptRow {
  brandId: string;
  brandName: string;
  index: number;
  query: string;
  locked: boolean;
}

// Stable id for selection — index is appended so duplicate strings
// across brands stay independently selectable.
const rowKey = (r: PromptRow) => `${r.brandId}::${r.index}::${r.query}`;

export default function TrackedPromptsPage() {
  const { user } = useAuth();
  const { brands, refreshBrands, loading: brandsLoading } = useBrands();
  const { toast } = useToast();

  const plan = user?.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const cap = limits.trackedPromptsPerAccount ?? limits.queries ?? 0;
  const isUnlimited = cap >= 9999;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  // Owned brands only — shared/team brands belong to a different
  // owner whose quota the caller doesn't control. Trimming those here
  // would also fail server-side ownership checks.
  const ownedBrands: BrandLite[] = useMemo(
    () => (brands as BrandLite[]).filter((b) => !b.shared),
    [brands],
  );

  const rows: PromptRow[] = useMemo(() => {
    const out: PromptRow[] = [];
    for (const brand of ownedBrands) {
      const queries = Array.isArray(brand.queries) ? brand.queries : [];
      for (let i = 0; i < queries.length; i++) {
        out.push({
          brandId: brand.id,
          brandName: brand.name || 'Untitled brand',
          index: i,
          query: queries[i],
          locked: !!brand.lockedByPlan,
        });
      }
    }
    return out;
  }, [ownedBrands]);

  const totalUsed = rows.length;
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

  const usagePct = isUnlimited
    ? 0
    : Math.min(100, cap > 0 ? (totalUsed / cap) * 100 : 0);
  const ringColor = overLimit ? '#ef4444' : usagePct >= 80 ? '#f59e0b' : '#10b981';

  return (
    <div>
      <div className="view-title">Tracked Prompts</div>
      <div className="view-sub">
        See and clean up every prompt you&apos;re tracking across all brands. Use this page to trim
        prompts back into your plan&apos;s account-wide limit.
      </div>

      {/* ── Usage summary card ─────────────────────────── */}
      <div
        className="card"
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          borderColor: overLimit ? 'rgba(239,68,68,.35)' : undefined,
          background: overLimit ? 'rgba(239,68,68,.04)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `conic-gradient(${ringColor} ${usagePct * 3.6}deg, var(--bg3) 0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'var(--bg2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                color: ringColor,
              }}
            >
              {isUnlimited ? '∞' : `${Math.round(usagePct)}%`}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 4,
              }}
            >
              Account-wide tracked prompts
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800 }}>
              {totalUsed.toLocaleString()}
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 16 }}>
                {' '}/ {isUnlimited ? '∞' : cap.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Across {ownedBrands.length} brand{ownedBrands.length === 1 ? '' : 's'}
              {' · '}
              <span style={{ textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>{plan}</span> plan
            </div>
          </div>
        </div>

        {overLimit && (
          <div
            style={{
              flex: 1,
              minWidth: 240,
              padding: '12px 16px',
              borderRadius: 'var(--radius-xs)',
              background: 'rgba(239,68,68,.08)',
              border: '1px solid rgba(239,68,68,.25)',
              fontSize: 12,
              color: '#b91c1c',
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: '#991b1b' }}>
              Over by {overBy} prompt{overBy === 1 ? '' : 's'}.
            </strong>{' '}
            Auto-tracking is paused until you&apos;re back within your plan limit. Pick the prompts
            you no longer want to track, or{' '}
            <Link href="/dashboard/billing" style={{ color: '#b91c1c', fontWeight: 700 }}>
              upgrade your plan
            </Link>
            .
          </div>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────── */}
      <div
        className="card"
        style={{
          marginTop: 12,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search prompts or brand…"
          className="finp"
          style={{ flex: '1 1 220px', minWidth: 200, margin: 0 }}
        />
        <button type="button" onClick={selectAllVisible} className="setup-mono-btn">
          Select all visible
        </button>
        {overLimit && (
          <button
            type="button"
            onClick={selectToFitLimit}
            className="setup-mono-btn"
            style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
            title="Selects the newest prompts that put you over the cap."
          >
            Select to fit limit ({overBy})
          </button>
        )}
        <button
          type="button"
          onClick={clearSelection}
          className="setup-mono-btn"
          disabled={selected.size === 0}
          style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          Clear selection
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selected.size === 0 || busy}
          style={{
            background: selected.size > 0 ? '#ef4444' : 'var(--bg3)',
            color: selected.size > 0 ? '#fff' : 'var(--muted)',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 'var(--radius-xs)',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--mono)',
            letterSpacing: 0.5,
            cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            marginLeft: 'auto',
          }}
        >
          {busy ? 'DELETING…' : `DELETE SELECTED (${selected.size})`}
        </button>
      </div>

      {/* ── Per-brand prompt lists ─────────────────────── */}
      <div style={{ marginTop: 12 }}>
        {brandsLoading && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
            Loading brands…
          </div>
        )}

        {!brandsLoading && ownedBrands.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
              You haven&apos;t added any brands yet.
            </p>
            <Link
              href="/dashboard/setup"
              style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
            >
              Add your first brand →
            </Link>
          </div>
        )}

        {!brandsLoading &&
          ownedBrands.map((brand) => {
            const brandRows = filteredRows.filter((r) => r.brandId === brand.id);
            if (filter && brandRows.length === 0) return null;
            const totalForBrand = (brand.queries || []).length;
            const selectedForBrand = brandRows.filter((r) => selected.has(rowKey(r))).length;
            return (
              <div className="card" key={brand.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {brand.name || 'Untitled brand'}
                      {brand.lockedByPlan && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontFamily: 'var(--mono)',
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 100,
                            background: 'rgba(245,158,11,.1)',
                            color: 'var(--amber)',
                            border: '1px solid rgba(245,158,11,.25)',
                          }}
                        >
                          LOCKED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {totalForBrand} prompt{totalForBrand === 1 ? '' : 's'}
                      {selectedForBrand > 0 && ` · ${selectedForBrand} selected`}
                    </div>
                  </div>
                  <Link
                    href="/dashboard/setup"
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--mono)',
                      color: 'var(--primary)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Edit brand →
                  </Link>
                </div>

                {totalForBrand === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      fontFamily: 'var(--mono)',
                      padding: '8px 0',
                    }}
                  >
                    No prompts on this brand.
                  </div>
                ) : brandRows.length === 0 ? null : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {brandRows.map((r) => {
                      const key = rowKey(r);
                      const isSelected = selected.has(key);
                      return (
                        <label
                          key={key}
                          htmlFor={`prompt-${key}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-xs)',
                            background: isSelected
                              ? 'rgba(239,68,68,.06)'
                              : 'var(--bg2)',
                            border: `1px solid ${isSelected ? 'rgba(239,68,68,.35)' : 'var(--border)'}`,
                            fontSize: 13,
                            color: 'var(--text)',
                            cursor: 'pointer',
                            transition: 'background .12s, border-color .12s',
                          }}
                        >
                          <input
                            id={`prompt-${key}`}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(key)}
                            style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                          />
                          <span style={{ flex: 1, wordBreak: 'break-word' }}>{r.query}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
