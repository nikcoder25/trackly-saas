'use client';

import { useState, useEffect, useCallback } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface CompetitorRow {
  competitor_name: string;
  platform: string;
  total_appearances: string;
  avg_position: string;
  last_seen: string;
}

interface Brand {
  id: string;
  name: string;
  competitors?: string[];
  runs?: {
    recommended?: number;
    competitors?: Record<string, number>;
  }[];
}

export default function CompetitorsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compInput, setCompInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) setSelectedBrand(b[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchCompetitorData = useCallback(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/competitor-analysis`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCompetitors(d.competitors || []))
      .catch(() => setCompetitors([]));
  }, [selectedBrand]);

  useEffect(() => {
    fetchCompetitorData();
  }, [fetchCompetitorData]);

  const brandCompetitors = selectedBrand?.competitors || [];

  const addCompetitor = async () => {
    const name = compInput.trim();
    if (!name || !selectedBrand) return;
    if (brandCompetitors.includes(name)) return;
    const updated = [...brandCompetitors, name];
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ competitors: updated }),
      });
      const d = await res.json();
      if (res.ok) {
        const updatedBrand = d.brand;
        setBrands((prev) => prev.map((b) => (b.id === updatedBrand.id ? updatedBrand : b)));
        setSelectedBrand(updatedBrand);
        setCompInput('');
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const removeCompetitor = async (name: string) => {
    if (!selectedBrand) return;
    const updated = brandCompetitors.filter((c) => c !== name);
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ competitors: updated }),
      });
      const d = await res.json();
      if (res.ok) {
        const updatedBrand = d.brand;
        setBrands((prev) => prev.map((b) => (b.id === updatedBrand.id ? updatedBrand : b)));
        setSelectedBrand(updatedBrand);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  // Group co-occurrence data by competitor name
  const grouped: Record<string, CompetitorRow[]> = {};
  competitors.forEach((c) => {
    (grouped[c.competitor_name] ??= []).push(c);
  });

  // Total appearances per competitor (across all platforms)
  const competitorTotals: Record<string, number> = {};
  competitors.forEach((c) => {
    competitorTotals[c.competitor_name] = (competitorTotals[c.competitor_name] || 0) + parseInt(c.total_appearances);
  });
  const sortedCompetitors = Object.entries(competitorTotals).sort((a, b) => b[1] - a[1]);
  const maxAppearances = sortedCompetitors.length > 0 ? sortedCompetitors[0][1] : 1;

  // Per-platform breakdown: { platform: { competitor: count } }
  const platformBreakdown: Record<string, Record<string, number>> = {};
  const allPlatforms = new Set<string>();
  competitors.forEach((c) => {
    allPlatforms.add(c.platform);
    if (!platformBreakdown[c.platform]) platformBreakdown[c.platform] = {};
    platformBreakdown[c.platform][c.competitor_name] = parseInt(c.total_appearances);
  });

  // Brand comparison: get last run data
  const lastRun = selectedBrand?.runs?.length ? selectedBrand.runs[selectedBrand.runs.length - 1] : null;
  const brandRecommended = lastRun?.recommended ?? 0;
  const runCompetitors = lastRun?.competitors || {};

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Competitors</h1>
      <p className="text-[var(--text-muted)] mb-6">
        Monitor competitor mentions and co-occurrence across AI platforms
      </p>

      {/* Brand selector */}
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${
                selectedBrand?.id === b.id
                  ? 'bg-[var(--primary)] text-[var(--text)]'
                  : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* 1. Competitor Brands Card */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">
          Competitor Brands
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {brandCompetitors.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm">No competitors added yet.</p>
          )}
          {brandCompetitors.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 rounded-full text-sm text-[var(--text)]"
            >
              {c}
              <button
                onClick={() => removeCompetitor(c)}
                disabled={saving}
                className="text-[var(--muted)] hover:text-[var(--red)] ml-1 text-base leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={compInput}
            onChange={(e) => setCompInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCompetitor()}
            placeholder="Add competitor..."
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={addCompetitor}
            disabled={saving || !compInput.trim()}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--text)] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            + Add
          </button>
        </div>
      </div>

      {/* 2. Competitor Comparison - Brand vs Competitors side by side */}
      {(brandRecommended > 0 || Object.keys(runCompetitors).length > 0) && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-4">
            Competitor Comparison
          </div>
          <div className="space-y-3">
            {/* Your brand */}
            <div className="flex items-center gap-3">
              <span className="w-32 text-sm text-[var(--text)] font-semibold truncate">
                {selectedBrand?.name} (You)
              </span>
              <div className="flex-1 bg-[var(--bg)] rounded-full h-6 overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max(
                      5,
                      (brandRecommended / Math.max(brandRecommended, ...Object.values(runCompetitors), 1)) * 100
                    )}%`,
                  }}
                >
                  <span className="text-xs font-mono text-[var(--text)]">{brandRecommended}</span>
                </div>
              </div>
            </div>
            {/* Competitors */}
            {Object.entries(runCompetitors)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => {
                const maxVal = Math.max(brandRecommended, ...Object.values(runCompetitors), 1);
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-[var(--text-muted)] truncate">{name}</span>
                    <div className="flex-1 bg-[var(--bg)] rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-[var(--text-muted)] rounded-full flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(5, (count / maxVal) * 100)}%`,
                          opacity: 0.6,
                        }}
                      >
                        <span className="text-xs font-mono text-[var(--text)]">{count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          {Object.keys(runCompetitors).length === 0 && brandRecommended > 0 && (
            <p className="text-[var(--text-muted)] text-sm mt-2">
              No competitor mentions in the latest run yet.
            </p>
          )}
        </div>
      )}

      {/* 3. Competitor Co-occurrence Card (30 days) */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
          Competitor Co-occurrence
        </div>
        <p className="text-[var(--text-muted)] text-xs mb-4">
          How often competitors appear in AI responses across all prompts and platforms (30 days)
        </p>
        {sortedCompetitors.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm">
            No competitor co-occurrence data yet. Add competitors and run queries to see analysis.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedCompetitors.map(([name, total]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-32 text-sm text-[var(--text)] truncate">{name}</span>
                <div className="flex-1 bg-[var(--bg)] rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] rounded-full transition-all"
                    style={{
                      width: `${Math.max(5, (total / maxAppearances) * 100)}%`,
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-[var(--text-muted)] w-16 text-right">
                  {total}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Per-Platform Breakdown Card */}
      {Array.from(allPlatforms).length > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Per-Platform Breakdown
          </div>
          <p className="text-[var(--text-muted)] text-xs mb-4">
            Competitor appearances per platform
          </p>
          <div className="space-y-5">
            {Array.from(allPlatforms)
              .sort()
              .map((platform) => {
                const entries = Object.entries(platformBreakdown[platform] || {}).sort(
                  (a, b) => b[1] - a[1]
                );
                const platformMax = entries.length > 0 ? entries[0][1] : 1;
                return (
                  <div key={platform}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: PLATFORM_COLORS[platform] || '#666' }}
                      />
                      <span className="text-sm font-semibold text-[var(--text)]">{platform}</span>
                    </div>
                    <div className="space-y-1.5 pl-5">
                      {entries.map(([name, count]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="w-28 text-xs text-[var(--text-muted)] truncate">
                            {name}
                          </span>
                          <div className="flex-1 bg-[var(--bg)] rounded-full h-4 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(8, (count / platformMax) * 100)}%`,
                                background: PLATFORM_COLORS[platform] || '#666',
                                opacity: 0.7,
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-right">
                            {count}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
