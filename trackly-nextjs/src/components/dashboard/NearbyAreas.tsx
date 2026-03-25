'use client';

import { useState } from 'react';

interface NearbyAreasProps {
  city: string;
  areas: string[];
  onChange: (areas: string[]) => void;
  /** If provided, auto-saves to brand via API */
  brandId?: string;
}

export default function NearbyAreas({ city, areas, onChange, brandId }: NearbyAreasProps) {
  const [fetching, setFetching] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [error, setError] = useState('');

  const fetchNearbyAreas = async () => {
    if (!city.trim()) { setError('Enter a city first'); return; }
    setFetching(true);
    setError('');
    try {
      const res = await fetch('/api/nearby-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ city: city.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');

      const existing = new Set(areas.map(a => a.toLowerCase()));
      const newAreas = (data.areas || []).filter((a: string) => !existing.has(a.toLowerCase()));

      if (!newAreas.length) {
        setError('No new areas found (all already added)');
        return;
      }

      const updated = [...areas, ...newAreas];
      onChange(updated);

      // Auto-save to brand if brandId provided
      if (brandId) {
        await fetch(`/api/brands/${brandId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ nearbyAreas: updated }),
        });
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setFetching(false);
  };

  const addArea = () => {
    const val = newArea.trim();
    if (!val) return;
    if (areas.some(a => a.toLowerCase() === val.toLowerCase())) {
      setError('Area already added');
      return;
    }
    const updated = [...areas, val];
    onChange(updated);
    setNewArea('');
    setError('');

    if (brandId) {
      fetch(`/api/brands/${brandId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nearbyAreas: updated }),
      }).catch(() => {});
    }
  };

  const removeArea = (index: number) => {
    const updated = areas.filter((_, i) => i !== index);
    onChange(updated);

    if (brandId) {
      fetch(`/api/brands/${brandId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nearbyAreas: updated }),
      }).catch(() => {});
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm text-[var(--text-muted)]">
          Nearby Areas {areas.length > 0 && <span className="text-xs">({areas.length})</span>}
        </label>
        <button
          type="button"
          onClick={fetchNearbyAreas}
          disabled={fetching || !city.trim()}
          className="text-xs bg-[var(--bg3)] hover:bg-[var(--bg4)] text-[var(--primary)] px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 border border-[var(--border)]"
        >
          {fetching ? (
            <>
              <span className="w-3 h-3 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Fetch Nearby Areas
            </>
          )}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {/* Area tags */}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {areas.map((area, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-[var(--bg3)] text-[var(--text-muted)] text-xs px-2.5 py-1 rounded-lg border border-[var(--border)]">
              {area}
              <button
                type="button"
                onClick={() => removeArea(i)}
                className="text-[var(--text-muted)] hover:text-red-400 ml-0.5 text-sm leading-none"
                aria-label={`Remove ${area}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Manual add */}
      <div className="flex gap-2">
        <input
          value={newArea}
          onChange={e => setNewArea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
          className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[var(--primary)]"
          placeholder="Add area manually..."
        />
        <button
          type="button"
          onClick={addArea}
          className="text-xs bg-[var(--bg3)] hover:bg-[var(--bg4)] text-white px-3 py-1.5 rounded-lg border border-[var(--border)] transition"
        >
          Add
        </button>
      </div>
    </div>
  );
}
