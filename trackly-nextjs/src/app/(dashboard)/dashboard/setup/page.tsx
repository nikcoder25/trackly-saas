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
  aliases?: string[];
  nearbyAreas?: string[];
  selected_platforms?: string[];
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

const ALL_PLATFORMS = Object.keys(PLATFORM_COLORS);

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
      if (all.length) setSelectedBrand(prev => prev || all[0]);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <div className="view-title">Brand Setup</div>
          <div className="view-sub">Configure your brand details.</div>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-[0_1px_2px_rgba(255,97,84,.2)]">+ New Brand</button>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {brands.map(b => (
            <button key={b.id} onClick={() => { setSelectedBrand(b); setShowCreate(false); }}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm transition ${selectedBrand?.id === b.id && !showCreate ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] hover:bg-[var(--bg3)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {(showCreate || brands.length === 0) ? (
        <CreateBrandWizard onCreated={brand => { setBrands([...brands, brand]); setSelectedBrand(brand); setShowCreate(false); }} />
      ) : selectedBrand ? (
        <EditBrandForm brand={selectedBrand}
          onUpdated={updated => { setBrands(brands.map(b => b.id === updated.id ? updated : b)); setSelectedBrand(updated); }}
          onDeleted={() => { const remaining = brands.filter(b => b.id !== selectedBrand.id); setBrands(remaining); setSelectedBrand(remaining[0] || null); }} />
      ) : null}
    </div>
  );
}

/* ── 3-STEP CREATION WIZARD ───────────────────── */
function CreateBrandWizard({ onCreated }: { onCreated: (brand: Brand) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [nearbyAreas, setNearbyAreas] = useState<string[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [compInput, setCompInput] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addComp = () => { if (compInput.trim() && !competitors.includes(compInput.trim())) { setCompetitors([...competitors, compInput.trim()]); setCompInput(''); } };
  const addQuery = () => { if (queryInput.trim() && !queries.includes(queryInput.trim())) { setQueries([...queries, queryInput.trim()]); setQueryInput(''); } };

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const data = await api('POST', '/api/brands', { name, industry, website, city, nearbyAreas, competitors, queries });
      onCreated(data.brand);
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 shadow-[var(--app-shadow)]">
      <h2 className="text-lg font-bold text-[var(--text)] mb-4">Add New Brand</h2>

      {/* Wizard Steps */}
      <div className="flex gap-1 mb-5">
        {[{ n: 1, l: 'Brand Info' }, { n: 2, l: 'Competitors' }, { n: 3, l: 'Queries' }].map(s => (
          <div key={s.n} className={`flex-1 text-center py-2 text-[11px] font-semibold border rounded-md transition ${
            step === s.n ? 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary-border)]'
              : step > s.n ? 'bg-[var(--success-light)] text-[var(--green)] border-[var(--green)]'
                : 'bg-[var(--bg2)] text-[var(--muted)] border-[var(--border)]'
          }`}>
            <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] mr-1 ${
              step === s.n ? 'bg-[var(--primary)] text-white' : step > s.n ? 'bg-[var(--green)] text-white' : 'bg-[var(--bg3)] text-[var(--muted)]'
            }`}>{s.n}</span>
            {s.l}
          </div>
        ))}
      </div>

      {error && <div className="bg-[var(--danger-light)] border border-[rgba(239,68,68,.2)] text-[var(--danger)] text-[11px] font-mono px-3 py-2 rounded-md mb-3">{error}</div>}

      {/* Step 1: Brand Info */}
      {step === 1 && (
        <div className="space-y-4">
          <Field label="Brand Name *" value={name} onChange={setName} placeholder="Your Brand Name" />
          <Field label="Industry *" value={industry} onChange={setIndustry} placeholder="e.g. HVAC, Plumbing, SaaS" />
          <Field label="Website" value={website} onChange={setWebsite} placeholder="yourbrand.com" />
          <Field label="City / Location" value={city} onChange={setCity} placeholder="e.g. Austin TX (optional for non-local)" />
          {city.trim() && (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
              <NearbyAreas city={city} areas={nearbyAreas} onChange={setNearbyAreas} />
            </div>
          )}
          <button onClick={() => setStep(2)} className="w-full py-3 bg-[var(--primary)] text-white font-bold text-sm rounded-lg hover:bg-[var(--primary-hover)] transition">Next: Add Competitors</button>
          <button onClick={handleCreate} className="w-full py-2.5 bg-[var(--bg3)] text-[var(--muted)] text-xs font-semibold border border-[var(--border)] rounded-lg hover:text-[var(--text)] transition">Skip wizard &amp; create now</button>
        </div>
      )}

      {/* Step 2: Competitors */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--muted)]">Add 3-5 competitors you want to track alongside your brand. You can always change these later.</p>
          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            {competitors.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-[var(--bg3)] text-[var(--text)] text-xs px-3 py-1.5 rounded-full border border-[var(--border)]">
                {c} <button onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))} className="text-[var(--muted)] hover:text-[var(--red)]">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={compInput} onChange={e => setCompInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComp()}
              placeholder="Competitor name..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-3 py-2 rounded-md focus:border-[var(--primary)] focus:outline-none" />
            <button onClick={addComp} className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md">+ Add</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-[var(--bg3)] text-[var(--muted)] text-sm font-semibold border border-[var(--border)] rounded-lg">Back</button>
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 bg-[var(--primary)] text-white text-sm font-bold rounded-lg">Next: Set Queries</button>
          </div>
        </div>
      )}

      {/* Step 3: Queries */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--muted)]">These queries will be sent to AI platforms to check if your brand is mentioned.</p>
          <div className="max-h-[40vh] overflow-y-auto space-y-1">
            {queries.map((q, i) => (
              <div key={i} className="flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)]">
                <span className="flex-1">{q}</span>
                <button onClick={() => setQueries(queries.filter((_, j) => j !== i))} className="text-[var(--muted)] hover:text-[var(--red)] text-xs">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={queryInput} onChange={e => setQueryInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuery()}
              placeholder="Add custom query..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-3 py-2 rounded-md focus:border-[var(--primary)] focus:outline-none" />
            <button onClick={addQuery} className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md">+ Add</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-[var(--bg3)] text-[var(--muted)] text-sm font-semibold border border-[var(--border)] rounded-lg">Back</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 bg-[var(--primary)] text-white text-sm font-bold rounded-lg disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Brand & Run'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── EDIT BRAND FORM (full feature parity) ───────────────────── */
function EditBrandForm({ brand, onUpdated, onDeleted }: { brand: Brand; onUpdated: (b: Brand) => void; onDeleted: () => void }) {
  const [name, setName] = useState(brand.name);
  const [industry, setIndustry] = useState(brand.industry || '');
  const [website, setWebsite] = useState(brand.website || '');
  const [city, setCity] = useState(brand.city || '');
  const [goal, setGoal] = useState(brand.goal || 70);
  const [aliases, setAliases] = useState<string[]>(brand.aliases || []);
  const [aliasInput, setAliasInput] = useState('');
  const [queries, setQueries] = useState<string[]>(brand.queries || []);
  const [queryInput, setQueryInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [competitors, setCompetitors] = useState<string[]>(brand.competitors || []);
  const [compInput, setCompInput] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(brand.selected_platforms || ALL_PLATFORMS);
  const [nearbyAreas, setNearbyAreas] = useState<string[]>(brand.nearbyAreas || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(brand.name); setIndustry(brand.industry || ''); setWebsite(brand.website || '');
    setCity(brand.city || ''); setGoal(brand.goal || 70);
    setAliases(brand.aliases || []); setQueries(brand.queries || []);
    setCompetitors(brand.competitors || []);
    setSelectedPlatforms(brand.selected_platforms || ALL_PLATFORMS);
    setNearbyAreas(brand.nearbyAreas || []);
    setError(''); setMessage('');
  }, [brand]);

  const addAlias = () => { if (aliasInput.trim() && !aliases.includes(aliasInput.trim())) { setAliases([...aliases, aliasInput.trim()]); setAliasInput(''); } };
  const autoGenerateAliases = () => {
    const auto: string[] = [];
    if (name) { auto.push(name.toLowerCase()); auto.push(name.replace(/\s+/g, '')); }
    if (website) { const domain = website.replace(/https?:\/\//, '').replace(/\/$/, ''); auto.push(domain); }
    setAliases([...new Set([...aliases, ...auto])]);
  };
  const addQuery = () => { if (queryInput.trim() && !queries.includes(queryInput.trim())) { setQueries([...queries, queryInput.trim()]); setQueryInput(''); } };
  const addComp = () => { if (compInput.trim() && !competitors.includes(compInput.trim())) { setCompetitors([...competitors, compInput.trim()]); setCompInput(''); } };
  const bulkAddQueries = () => {
    const newQ = bulkText.split('\n').map(q => q.trim()).filter(q => q && !queries.includes(q));
    setQueries([...queries, ...newQ]); setBulkText(''); setShowBulk(false);
  };
  const deleteSelected = () => { setQueries(queries.filter((_, i) => !selected.has(i))); setSelected(new Set()); setSelectMode(false); };
  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const data = await api('PUT', `/api/brands/${brand.id}`, { name, industry, website, city, queries, competitors, aliases, goal, platforms: selectedPlatforms });
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
    <div>
      <div className="card">
        {error && <div className="auth-err" style={{ display: 'block', marginBottom: 12 }}>{error}</div>}
        {message && <div className="auth-err" style={{ display: 'block', marginBottom: 12, background: 'var(--success-light)', borderColor: 'rgba(16,185,129,.2)', color: 'var(--success)' }}>{message}</div>}
        <form onSubmit={handleSave}>
          <Field label="Brand Name" value={name} onChange={setName} placeholder="Your Brand Name" />
          <Field label="Industry" value={industry} onChange={setIndustry} placeholder="e.g. HVAC, Plumbing, Landscaping" />
          <Field label="Website" value={website} onChange={setWebsite} placeholder="yourbrand.com" />

          {/* Aliases */}
          <div style={{ marginBottom: 16 }}>
            <label className="flbl">Alternate Names / Aliases</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.6 }}>AI platforms may refer to your brand differently. Add all variations so no mention is missed.<br/>Auto-generated from brand name &amp; website — add more if needed.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {aliases.map((a, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, padding: '6px 12px', borderRadius: 100, border: '1px solid var(--border)' }}>
                  {a} <button type="button" onClick={() => setAliases(aliases.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAlias())}
                placeholder="Add alternate name..." className="finp" style={{ flex: 1, margin: 0 }} />
              <button type="button" onClick={addAlias} className="pbtn" style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', whiteSpace: 'nowrap' }}>+ Add</button>
              <button type="button" onClick={autoGenerateAliases} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)', whiteSpace: 'nowrap' }}>AUTO-GENERATE</button>
            </div>
          </div>

          <Field label="City / Location" value={city} onChange={setCity} placeholder="e.g. Austin TX" />

          {/* Nearby Areas */}
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
            <NearbyAreas city={city} areas={nearbyAreas} onChange={setNearbyAreas} brandId={brand.id} />
          </div>

          {/* Manage Queries */}
          <div style={{ marginBottom: 16 }}>
            <label className="flbl">Manage Queries</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.6 }}>Add, remove, or bulk-manage the queries tracked for this brand. <span style={{ fontWeight: 700 }}>{queries.length} / 250 prompts</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {queries.map((q, i) => (
                <span key={i} onClick={() => { if (selectMode) { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); } }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 12px', borderRadius: 100, cursor: selectMode ? 'pointer' : 'default', background: selectMode && selected.has(i) ? 'var(--primary-light)' : 'var(--bg3)', border: `1px solid ${selectMode && selected.has(i) ? 'var(--primary-border)' : 'var(--border)'}`, color: selectMode && selected.has(i) ? 'var(--primary)' : 'var(--text)' }}>
                  {selectMode && <span style={{ fontSize: 10 }}>{selected.has(i) ? '☑' : '☐'}</span>}
                  {q}
                  {!selectMode && <button type="button" onClick={() => setQueries(queries.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>&times;</button>}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>{selectMode ? 'CANCEL' : '☐ SELECT'}</button>
              {selectMode && <>
                <button type="button" onClick={() => setSelected(new Set(queries.map((_, i) => i)))} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>Select All</button>
                <button type="button" onClick={() => setSelected(new Set())} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>Deselect All</button>
                <button type="button" onClick={deleteSelected} disabled={selected.size === 0} style={{ background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)', opacity: selected.size === 0 ? 0.4 : 1 }}>DELETE SELECTED ({selected.size})</button>
              </>}
              <button type="button" onClick={() => setShowBulk(!showBulk)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>BULK ADD</button>
              <button type="button" onClick={() => { if (confirm('Clear all queries?')) setQueries([]); }} style={{ background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>CLEAR ALL</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input value={queryInput} onChange={e => setQueryInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addQuery())}
                placeholder="Add a query..." className="finp" style={{ flex: 1, margin: 0 }} />
              <button type="button" onClick={addQuery} className="pbtn" style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>

            {showBulk && (
              <div style={{ marginTop: 8 }}>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5}
                  placeholder="Paste queries, one per line..." className="finp" style={{ width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 11 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{bulkText.split('\n').filter(Boolean).length} queries detected</span>
                  <button type="button" onClick={bulkAddQueries} style={{ background: 'var(--green)', border: 'none', color: '#fff', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 16px', cursor: 'pointer', borderRadius: 'var(--radius-xs)', fontWeight: 700 }}>ADD ALL</button>
                </div>
              </div>
            )}
          </div>

          {/* Competitors */}
          <div style={{ marginBottom: 16 }}>
            <label className="flbl">Competitors</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {competitors.map((c, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, padding: '6px 12px', borderRadius: 100, border: '1px solid var(--border)' }}>
                  {c} <button type="button" onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>&times;</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={compInput} onChange={e => setCompInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComp())}
                placeholder="Add competitor name..." className="finp" style={{ flex: 1, margin: 0 }} />
              <button type="button" onClick={addComp} className="pbtn" style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
          </div>

          {/* SOV Goal */}
          <Field label="SOV Goal (%)" value={String(goal)} onChange={v => setGoal(Number(v))} placeholder="70" type="number" />

          {/* AI Platforms to Track */}
          <div style={{ marginBottom: 16 }}>
            <label className="flbl">AI Platforms to Track</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Select which AI models to query when running keyword tracking.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_PLATFORMS.map(p => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, border: `1px solid ${selectedPlatforms.includes(p) ? 'var(--text-secondary)' : 'var(--border)'}`, background: selectedPlatforms.includes(p) ? 'var(--bg3)' : 'var(--bg2)', color: selectedPlatforms.includes(p) ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', transition: 'all .15s' }}>
                  <input type="checkbox" checked={selectedPlatforms.includes(p)} readOnly style={{ accentColor: 'var(--green)', cursor: 'pointer' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[p] }} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary" style={{ opacity: saving ? 0.5 : 1 }}>
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
          <button type="button" onClick={handleDelete} style={{ width: '100%', padding: 10, background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 10, borderRadius: 'var(--radius-xs)' }}>
            DELETE BRAND
          </button>
        </form>
      </div>

      <RunQueriesButton brandId={brand.id} brandName={brand.name} />

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Brand Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-[var(--muted)] text-[11px]">Queries</p><p className="text-[var(--text)] font-bold font-mono">{queries.length}</p></div>
          <div><p className="text-[var(--muted)] text-[11px]">Competitors</p><p className="text-[var(--text)] font-bold font-mono">{competitors.length}</p></div>
          <div><p className="text-[var(--muted)] text-[11px]">Runs</p><p className="text-[var(--text)] font-bold font-mono">{Array.isArray(brand.runs) ? brand.runs.length : 0}</p></div>
          <div><p className="text-[var(--muted)] text-[11px]">Platforms</p><div className="flex gap-1 mt-1">{selectedPlatforms.map(p => <span key={p} className="w-3 h-3 rounded-full" style={{ background: PLATFORM_COLORS[p] }} title={p} />)}</div></div>
        </div>
      </div>
    </div>
  );
}

/* ── SHARED COMPONENTS ───────────────────── */
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div className="form-group">
      <label className="flbl">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="finp" placeholder={placeholder} />
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
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Run Queries</h3>
        <button onClick={handleRun} disabled={running}
          className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-5 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center gap-2 shadow-[0_1px_2px_rgba(255,97,84,.2)]">
          {running && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {running ? `Running ${brandName}...` : '\u25B6 Run Queries Now'}
        </button>
      </div>
      {error && <p className="text-[11px] text-[var(--danger)] font-mono mt-2">{error}</p>}
      {result && (
        <div className="flex gap-6 mt-3 text-sm font-mono">
          <span className="text-[var(--muted)]">SOV: <span className={`font-bold ${result.sov && result.sov >= 50 ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>{result.sov}%</span></span>
          <span className="text-[var(--muted)]">Queries: <span className="text-[var(--text)] font-medium">{result.totalQ}</span></span>
          <span className="text-[var(--muted)]">Mentions: <span className="text-[var(--text)] font-medium">{result.totalM}</span></span>
        </div>
      )}
    </div>
  );
}
