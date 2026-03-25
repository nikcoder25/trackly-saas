'use client';

import { useState, useEffect, useCallback } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import NearbyAreas from '@/components/dashboard/NearbyAreas';

interface Brand {
  id: string;
  name: string;
  industry: string;
  website: string;
  city: string;
  goal: number;
  queries: string[];
  competitors: string[];
  nearbyAreas?: string[];
  runs?: unknown[];
  [key: string]: unknown;
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function SetupPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadBrands = useCallback(async () => {
    try {
      const data = await api('GET', '/api/brands');
      const all = data.brands || [];
      setBrands(all);
      if (all.length && !selectedBrand) setSelectedBrand(all[0]);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedBrand]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Brand Setup</h1>
          <p className="text-[var(--text-muted)] mt-1">Configure your brand tracking</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-2 rounded-lg text-sm font-medium transition">+ New Brand</button>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {brands.map(b => (
            <button key={b.id} onClick={() => { setSelectedBrand(b); setShowCreate(false); }}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm transition ${selectedBrand?.id === b.id && !showCreate ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] hover:bg-[var(--bg3)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {(showCreate || brands.length === 0) ? (
        <CreateBrandForm onCreated={brand => { setBrands([...brands, brand]); setSelectedBrand(brand); setShowCreate(false); }} />
      ) : selectedBrand ? (
        <EditBrandForm brand={selectedBrand}
          onUpdated={updated => { setBrands(brands.map(b => b.id === updated.id ? updated : b)); setSelectedBrand(updated); }}
          onDeleted={() => { const remaining = brands.filter(b => b.id !== selectedBrand.id); setBrands(remaining); setSelectedBrand(remaining[0] || null); }} />
      ) : null}
    </div>
  );
}

function CreateBrandForm({ onCreated }: { onCreated: (brand: Brand) => void }) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [nearbyAreas, setNearbyAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try { const data = await api('POST', '/api/brands', { name, industry, website, city, nearbyAreas }); onCreated(data.brand); }
    catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6">
      <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Create New Brand</h2>
      {error && <div className="bg-[var(--danger-light)] border border-[rgba(239,68,68,.2)] text-[var(--danger)] text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm text-[var(--text-muted)] mb-1">Brand Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" placeholder="e.g. Acme Corp" /></div>
          <div><label className="block text-sm text-[var(--text-muted)] mb-1">Industry</label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" placeholder="e.g. CRM Software" /></div>
          <div><label className="block text-sm text-[var(--text-muted)] mb-1">Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" placeholder="https://acme.com" /></div>
          <div><label className="block text-sm text-[var(--text-muted)] mb-1">City (optional)</label>
            <input value={city} onChange={e => setCity(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" placeholder="e.g. San Francisco" /></div>
        </div>

        {/* Nearby Areas - shows when city is entered */}
        {city.trim() && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
            <NearbyAreas city={city} areas={nearbyAreas} onChange={setNearbyAreas} />
          </div>
        )}

        <button type="submit" disabled={saving} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50">{saving ? 'Creating...' : 'Create Brand'}</button>
      </form>
    </div>
  );
}

function EditBrandForm({ brand, onUpdated, onDeleted }: { brand: Brand; onUpdated: (b: Brand) => void; onDeleted: () => void }) {
  const [name, setName] = useState(brand.name);
  const [industry, setIndustry] = useState(brand.industry || '');
  const [website, setWebsite] = useState(brand.website || '');
  const [city, setCity] = useState(brand.city || '');
  const [queries, setQueries] = useState((brand.queries || []).join('\n'));
  const [competitors, setCompetitors] = useState((brand.competitors || []).join('\n'));
  const [nearbyAreas, setNearbyAreas] = useState<string[]>(brand.nearbyAreas || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(brand.name); setIndustry(brand.industry || ''); setWebsite(brand.website || '');
    setCity(brand.city || ''); setQueries((brand.queries || []).join('\n'));
    setCompetitors((brand.competitors || []).join('\n'));
    setNearbyAreas(brand.nearbyAreas || []);
    setError(''); setMessage('');
  }, [brand]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const queryList = queries.split('\n').map(q => q.trim()).filter(Boolean);
      const compList = competitors.split('\n').map(c => c.trim()).filter(Boolean);
      const data = await api('PUT', `/api/brands/${brand.id}`, { name, industry, website, city, queries: queryList, competitors: compList });
      onUpdated(data.brand); setMessage('Brand updated!');
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this brand? This cannot be undone.')) return;
    try { await api('DELETE', `/api/brands/${brand.id}`); onDeleted(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Edit Brand</h2>
        {error && <div className="bg-[var(--danger-light)] border border-[rgba(239,68,68,.2)] text-[var(--danger)] text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
        {message && <div className="bg-[var(--success-light)] border border-[rgba(16,185,129,.2)] text-[var(--success)] text-sm px-4 py-3 rounded-lg mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm text-[var(--text-muted)] mb-1">Brand Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" /></div>
            <div><label className="block text-sm text-[var(--text-muted)] mb-1">Industry</label>
              <input value={industry} onChange={e => setIndustry(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" /></div>
            <div><label className="block text-sm text-[var(--text-muted)] mb-1">Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" /></div>
            <div><label className="block text-sm text-[var(--text-muted)] mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]" /></div>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">Tracking Queries (one per line)</label>
            <textarea value={queries} onChange={e => setQueries(e.target.value)} rows={6}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)] font-mono"
              placeholder={"What is the best CRM software?\nTop CRM tools for small business"} />
            <p className="text-xs text-[var(--text-muted)] mt-1">{queries.split('\n').filter(Boolean).length} queries</p>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">Competitors (one per line)</label>
            <textarea value={competitors} onChange={e => setCompetitors(e.target.value)} rows={3}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
              placeholder={"Competitor 1\nCompetitor 2"} />
          </div>

          {/* Nearby Areas */}
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
            <NearbyAreas city={city} areas={nearbyAreas} onChange={setNearbyAreas} brandId={brand.id} />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" onClick={handleDelete} className="bg-[var(--danger-light)] hover:bg-red-900/40 text-[var(--danger)] px-4 py-2.5 rounded-lg text-sm transition border border-[rgba(239,68,68,.2)]/50">Delete Brand</button>
          </div>
        </form>
      </div>
      {/* Run Queries */}
      <RunQueriesButton brandId={brand.id} brandName={brand.name} />

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Brand Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-[var(--text-muted)]">Queries</p><p className="text-[var(--text)] font-semibold">{brand.queries?.length || 0}</p></div>
          <div><p className="text-[var(--text-muted)]">Competitors</p><p className="text-[var(--text)] font-semibold">{brand.competitors?.length || 0}</p></div>
          <div><p className="text-[var(--text-muted)]">Runs</p><p className="text-[var(--text)] font-semibold">{Array.isArray(brand.runs) ? brand.runs.length : 0}</p></div>
          <div><p className="text-[var(--text-muted)]">Platforms</p><div className="flex gap-1 mt-1">{Object.entries(PLATFORM_COLORS).map(([n, c]) => <span key={n} className="w-3 h-3 rounded-full" style={{ background: c }} title={n} />)}</div></div>
        </div>
      </div>
    </div>
  );
}

function RunQueriesButton({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ sov?: number; totalQ?: number; totalM?: number } | null>(null);
  const [error, setError] = useState('');

  const handleRun = async () => {
    setRunning(true); setError(''); setResult(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/run`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Run failed');
      setResult({ sov: data.run?.sov, totalQ: data.run?.totalQ, totalM: data.run?.totalM });
    } catch (e) { setError((e as Error).message); }
    setRunning(false);
  };

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Run Queries</h3>
        <button onClick={handleRun} disabled={running}
          className="bg-[var(--green)] hover:bg-green-600 text-[var(--text)] px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2">
          {running && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {running ? `Running ${brandName}...` : 'Run Queries Now'}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)] mt-2">{error}</p>}
      {result && (
        <div className="flex gap-6 mt-3 text-sm">
          <span className="text-[var(--text-muted)]">SOV: <span className={`font-bold ${result.sov && result.sov >= 50 ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>{result.sov}%</span></span>
          <span className="text-[var(--text-muted)]">Queries: <span className="text-[var(--text)] font-medium">{result.totalQ}</span></span>
          <span className="text-[var(--text-muted)]">Mentions: <span className="text-[var(--text)] font-medium">{result.totalM}</span></span>
        </div>
      )}
    </div>
  );
}
