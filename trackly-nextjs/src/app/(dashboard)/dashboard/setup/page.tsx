'use client';

import { useState, useEffect, useCallback } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import SectionField from '@/components/dashboard/SectionField';
import TagList from '@/components/dashboard/TagList';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import AddBrandModal from '@/components/dashboard/AddBrandModal';

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
  const { user } = useAuth();
  const planLimit = (user?.limits as Record<string, number>)?.queries || 50;
  const { brands: ctxBrands, selectedBrand: ctxSelectedBrand, setSelectedBrand: setCtxSelectedBrand, loading: ctxLoading, refreshBrands } = useBrands();
  const { startRun } = useRun();
  const isAdmin = user?.plan === 'owner' || user?.role === 'admin';
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Sync from BrandContext
  useEffect(() => {
    if (ctxLoading) return;
    setBrands(ctxBrands as Brand[]);
    if (!selectedBrand && ctxSelectedBrand) setSelectedBrand(ctxSelectedBrand as Brand);
    setLoading(false);
  }, [ctxLoading, ctxBrands, ctxSelectedBrand]);

  const loadBrands = useCallback(async () => {
    await refreshBrands();
  }, [refreshBrands]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <LockedBrandBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <div className="view-title">Brand Setup</div>
          <div className="view-sub">Configure your brand details.</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: 'var(--primary)', color: '#fff', border: 'none',
          padding: '9px 18px', borderRadius: 'var(--radius-xs)', fontSize: 13,
          fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(99,102,241,.2)', transition: 'all .15s',
        }}>+ New Brand</button>
      </div>

      {showCreate && (
        <AddBrandModal
          onClose={() => setShowCreate(false)}
          onCreated={(brand) => {
            setShowCreate(false);
            setBrands([...brands, brand]);
            setSelectedBrand(brand);
            setCtxSelectedBrand(brand);
            refreshBrands().then(() => { if (isAdmin) setTimeout(() => startRun(false), 500); });
          }}
        />
      )}

      {selectedBrand ? (
        <EditBrandForm brand={selectedBrand} planLimit={planLimit}
          onUpdated={updated => { setBrands(brands.map(b => b.id === updated.id ? updated : b)); setSelectedBrand(updated); setCtxSelectedBrand(updated); refreshBrands(); }}
          onDeleted={() => { const remaining = brands.filter(b => b.id !== selectedBrand.id); setBrands(remaining); setSelectedBrand(remaining[0] || null); refreshBrands(); }} />
      ) : null}
    </div>
  );
}

/* ── 3-STEP CREATION WIZARD ───────────────────── */
function CreateBrandWizard({ onCreated }: { onCreated: (brand: Brand) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.plan === 'owner' || user?.role === 'admin';
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
    <div className="card">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Add New Brand</h2>

      {/* Wizard Steps */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ n: 1, l: 'Brand Info' }, { n: 2, l: 'Competitors' }, { n: 3, l: 'Queries' }].map(s => (
          <div key={s.n} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 600,
            borderRadius: 'var(--radius-xs)', border: '1px solid',
            background: step === s.n ? 'var(--primary-light)' : step > s.n ? 'var(--success-light)' : 'var(--bg2)',
            color: step === s.n ? 'var(--primary)' : step > s.n ? 'var(--green)' : 'var(--muted)',
            borderColor: step === s.n ? 'var(--primary-border)' : step > s.n ? 'var(--green)' : 'var(--border)',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: '50%', fontSize: 10, marginRight: 4,
              background: step === s.n ? 'var(--primary)' : step > s.n ? 'var(--green)' : 'var(--bg3)',
              color: step === s.n || step > s.n ? '#fff' : 'var(--muted)',
            }}>{s.n}</span>
            {s.l}
          </div>
        ))}
      </div>

      {error && <div style={{ background: 'var(--danger-light)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--danger)', fontSize: 11, fontFamily: 'var(--mono)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', marginBottom: 12 }}>{error}</div>}

      {/* Step 1: Brand Info */}
      {step === 1 && (
        <div>
          <SectionField label="Brand Name *" value={name} onChange={setName} placeholder="Your Brand Name" />
          <SectionField label="Industry *" value={industry} onChange={setIndustry} placeholder="e.g. HVAC, Plumbing, SaaS" />
          <SectionField label="Website" value={website} onChange={setWebsite} placeholder="yourbrand.com" />
          <SectionField label="City / Location" value={city} onChange={setCity} placeholder="e.g. Austin TX (optional for non-local)" />
          {city.trim() && (
            <NearbyAreasSection city={city} areas={nearbyAreas} onChange={setNearbyAreas} />
          )}
          <button onClick={() => setStep(2)} style={{ width: '100%', padding: 12, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', marginTop: 8 }}>Next: Add Competitors</button>
          <button onClick={handleCreate} style={{ width: '100%', padding: 10, background: 'var(--bg3)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', marginTop: 8 }}>Skip wizard &amp; create now</button>
        </div>
      )}

      {/* Step 2: Competitors */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Add 3-5 competitors you want to track alongside your brand. You can always change these later.</p>
          <TagList items={competitors} onRemove={i => setCompetitors(competitors.filter((_, j) => j !== i))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={compInput} onChange={e => setCompInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComp()}
              placeholder="Competitor name..." className="finp" style={{ flex: 1, margin: 0 }} />
            <button type="button" onClick={addComp} className="setup-add-btn">+ Add</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: 10, background: 'var(--bg3)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>Back</button>
            <button onClick={() => setStep(3)} style={{ flex: 1, padding: 10, background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>Next: Set Queries</button>
          </div>
        </div>
      )}

      {/* Step 3: Queries */}
      {step === 3 && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>These queries will be sent to AI platforms to check if your brand is mentioned.</p>
          <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {queries.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '8px 12px', fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                <span style={{ flex: 1 }}>{q}</span>
                <button onClick={() => setQueries(queries.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>&times;</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={queryInput} onChange={e => setQueryInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuery()}
              placeholder="Add custom query..." className="finp" style={{ flex: 1, margin: 0 }} />
            <button type="button" onClick={addQuery} className="setup-add-btn">+ Add</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setStep(2)} style={{ flex: 1, padding: 10, background: 'var(--bg3)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>Back</button>
            <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Creating...' : isAdmin ? 'Create Brand & Run' : 'Create Brand'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── EDIT BRAND FORM (full feature parity with LiveSOV) ───────────────────── */
function EditBrandForm({ brand, onUpdated, onDeleted, planLimit = 250 }: { brand: Brand; onUpdated: (b: Brand) => void; onDeleted: () => void; planLimit?: number }) {
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
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    setName(brand.name); setIndustry(brand.industry || ''); setWebsite(brand.website || '');
    setCity(brand.city || ''); setGoal(brand.goal || 70);
    setAliases(brand.aliases || []); setQueries(brand.queries || []);
    setCompetitors(brand.competitors || []);
    setSelectedPlatforms(brand.selected_platforms || ALL_PLATFORMS);
    setNearbyAreas(brand.nearbyAreas || []);
    setError(''); setMessage('');
  }, [brand]);

  // Auto-generate aliases on first load if none exist
  useEffect(() => {
    if (brand.name && (!brand.aliases || brand.aliases.length === 0)) {
      autoGenerateAliases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id]);

  const addAlias = () => { if (aliasInput.trim() && !aliases.includes(aliasInput.trim())) { setAliases([...aliases, aliasInput.trim()]); setAliasInput(''); } };

  const autoGenerateAliases = () => {
    const auto = new Set<string>();
    const n = name.trim();
    if (!n) return;
    const lower = n.toLowerCase();
    const words = n.split(/\s+/);
    const lowerWords = lower.split(/\s+/);

    auto.add(lower);
    if (words.length > 1) {
      auto.add(words.join(''));
      auto.add(lowerWords.join(''));
      auto.add(lowerWords.join('-'));
    }
    // Possessive
    if (words.length >= 1) {
      const main = words.length >= 2 ? words.slice(0, -1).join(' ') : n;
      if (!main.endsWith("'s") && !main.endsWith("s'")) {
        auto.add(main + "'s");
        if (main.endsWith('s')) auto.add(main + "'");
      }
    }
    // Website domain
    if (website) {
      const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (domain) {
        auto.add(domain);
        auto.add(domain.split('.')[0]);
        auto.add('www.' + domain);
      }
    }
    const existing = new Set(aliases.map(a => a.toLowerCase()));
    const newAliases = [...auto].filter(a => a.length >= 2 && !existing.has(a.toLowerCase()));
    setAliases([...aliases, ...newAliases]);
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

  const handleAiGenerate = async () => {
    if (!name) { setError('Set brand name first'); return; }
    if (!industry) { setError('Set industry first'); return; }
    setAiGenerating(true); setError('');
    try {
      const data = await api('POST', '/api/ai-generate-queries', {
        brandName: name, industry, city, existingQueries: queries,
      });
      const suggestions: string[] = data.queries || [];
      if (!suggestions.length) { setError('AI could not generate queries. Try again.'); setAiGenerating(false); return; }
      const existing = new Set(queries.map(q => q.toLowerCase()));
      const newQs = suggestions.filter(q => !existing.has(q.toLowerCase()));
      if (!newQs.length) { setMessage('All generated queries already exist!'); setAiGenerating(false); return; }
      if (confirm('Add ' + newQs.length + ' AI-generated queries?\n\n' + newQs.join('\n'))) {
        setQueries([...queries, ...newQs]);
        setMessage(newQs.length + ' AI-generated queries added');
      }
    } catch (e) { setError((e as Error).message); }
    setAiGenerating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const data = await api('PUT', `/api/brands/${brand.id}`, { name, industry, website, city, queries, competitors, aliases, goal, platforms: selectedPlatforms, nearbyAreas });
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
        {error && <div style={{ background: 'var(--danger-light)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--danger)', fontSize: 11, fontFamily: 'var(--mono)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', marginBottom: 12 }}>{error}</div>}
        {message && <div style={{ background: 'var(--success-light)', border: '1px solid rgba(16,185,129,.2)', color: 'var(--success)', fontSize: 11, fontFamily: 'var(--mono)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', marginBottom: 12 }}>{message}</div>}
        <form onSubmit={handleSave}>

          {/* Brand Name */}
          <SectionField label="Brand Name" value={name} onChange={setName} placeholder="Your Brand Name" />

          {/* Industry */}
          <SectionField label="Industry" value={industry} onChange={setIndustry} placeholder="e.g. HVAC, Plumbing, Landscaping" />

          {/* Website */}
          <SectionField label="Website" value={website} onChange={setWebsite} placeholder="yourbrand.com" />

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* Alternate Names / Aliases */}
          <div style={{ marginBottom: 20 }}>
            <label className="flbl">Alternate Names / Aliases</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.6 }}>
              AI platforms may refer to your brand differently. Add all variations so no mention is missed.<br />
              Auto-generated from brand name &amp; website — add more if needed.
            </div>
            <TagList items={aliases} onRemove={i => setAliases(aliases.filter((_, j) => j !== i))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                placeholder="Add alternate name..." className="finp" style={{ flex: 1, margin: 0 }} />
              <button type="button" onClick={addAlias} className="setup-add-btn">+ Add</button>
              <button type="button" onClick={autoGenerateAliases} className="setup-mono-btn">AUTO-GENERATE</button>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* City / Location */}
          <SectionField label="City / Location" value={city} onChange={setCity} placeholder="e.g. Austin TX" />

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* Nearby Areas */}
          <NearbyAreasSection city={city} areas={nearbyAreas} onChange={setNearbyAreas} brandId={brand.id} />

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* Manage Queries */}
          <div style={{ marginBottom: 20 }}>
            <label className="flbl">Manage Queries</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.6 }}>
              Add, remove, or bulk-manage the queries tracked for this brand. <span style={{ fontWeight: 700 }}>{queries.length} / {planLimit > 1000 ? '∞' : planLimit} prompts</span>
            </div>

            {/* Query tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {queries.map((q, i) => (
                <span key={i}
                  onClick={() => { if (selectMode) { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); } }}
                  className={`query-tag ${selectMode ? 'query-tag-selectable' : ''} ${selectMode && selected.has(i) ? 'query-tag-selected' : ''}`}
                >
                  {selectMode && <input type="checkbox" checked={selected.has(i)} readOnly className="query-select-cb" />}
                  {q}
                  {!selectMode && (
                    <button type="button" onClick={() => setQueries(queries.filter((_, j) => j !== i))}>&times;</button>
                  )}
                </span>
              ))}
            </div>

            {/* Action buttons row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} className="setup-mono-btn">
                {selectMode ? 'CANCEL' : '\u2610 SELECT'}
              </button>
              {selectMode && (
                <>
                  <button type="button" onClick={() => setSelected(new Set(queries.map((_, i) => i)))} className="setup-mono-btn">Select All</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="setup-mono-btn">Deselect All</button>
                  <button type="button" onClick={deleteSelected} disabled={selected.size === 0}
                    style={{ background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)', opacity: selected.size === 0 ? 0.4 : 1 }}>
                    DELETE SELECTED ({selected.size})
                  </button>
                </>
              )}
              {!selectMode && (
                <button type="button" onClick={() => { if (confirm('Clear all queries?')) setQueries([]); }}
                  style={{ background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>
                  CLEAR ALL
                </button>
              )}
            </div>

            {/* Add query input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={queryInput} onChange={e => setQueryInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuery(); } }}
                placeholder="Add a query..." className="finp" style={{ flex: 1, margin: 0 }} />
              <button type="button" onClick={addQuery} className="setup-add-btn">+ Add</button>
            </div>

            {/* Bulk add & AI Generate buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => setShowBulk(!showBulk)} className="setup-mono-btn">BULK ADD</button>
              <button type="button" onClick={handleAiGenerate} disabled={aiGenerating} className="setup-mono-btn" style={{ opacity: aiGenerating ? 0.5 : 1 }}>
                {aiGenerating ? 'GENERATING...' : 'AI GENERATE'}
              </button>
            </div>

            {/* Bulk textarea */}
            {showBulk && (
              <div style={{ marginTop: 8 }}>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5}
                  placeholder="Paste queries, one per line..." className="finp"
                  style={{ width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 11 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{bulkText.split('\n').filter(Boolean).length} queries detected</span>
                  <button type="button" onClick={bulkAddQueries} style={{ background: 'var(--green)', border: 'none', color: '#fff', fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 16px', cursor: 'pointer', borderRadius: 'var(--radius-xs)', fontWeight: 700 }}>ADD ALL</button>
                </div>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* SOV Goal */}
          <SectionField label="SOV Goal (%)" value={String(goal)} onChange={v => setGoal(Number(v))} placeholder="70" type="number" />

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* AI Platforms to Track */}
          <div style={{ marginBottom: 20 }}>
            <label className="flbl">AI Platforms to Track</label>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Select which AI models to query when running keyword tracking.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_PLATFORMS.map(p => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                    borderRadius: 100, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${selectedPlatforms.includes(p) ? 'var(--text-secondary)' : 'var(--border)'}`,
                    background: selectedPlatforms.includes(p) ? 'var(--bg3)' : 'var(--bg2)',
                    color: selectedPlatforms.includes(p) ? 'var(--text)' : 'var(--muted)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}>
                  <input type="checkbox" checked={selectedPlatforms.includes(p)} readOnly style={{ accentColor: 'var(--green)', cursor: 'pointer' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[p] }} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          {/* Save Changes */}
          <button type="submit" disabled={saving} className="btn-primary" style={{ opacity: saving ? 0.5 : 1 }}>
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>

          {/* Delete Brand */}
          <button type="button" onClick={handleDelete} style={{
            width: '100%', padding: 10, background: 'none',
            border: '1px solid var(--red)', color: 'var(--red)',
            fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', marginTop: 10, borderRadius: 'var(--radius-xs)',
          }}>
            DELETE BRAND
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── NEARBY AREAS SECTION ───────────────────── */
function NearbyAreasSection({ city, areas, onChange, brandId }: { city: string; areas: string[]; onChange: (a: string[]) => void; brandId?: string }) {
  const [fetching, setFetching] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [error, setError] = useState('');

  const fetchNearbyAreas = async () => {
    if (!city.trim()) { setError('Enter a city first'); return; }
    setFetching(true); setError('');
    try {
      const res = await fetch('/api/nearby-areas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ city: city.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      const existing = new Set(areas.map(a => a.toLowerCase()));
      const newAreas = (data.areas || []).filter((a: string) => !existing.has(a.toLowerCase()));
      if (!newAreas.length) { setError('No new areas found (all already added)'); setFetching(false); return; }
      const updated = [...areas, ...newAreas];
      onChange(updated);
      if (brandId) {
        fetch(`/api/brands/${brandId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ nearbyAreas: updated }) }).catch(() => {});
      }
    } catch (e) { setError((e as Error).message); }
    setFetching(false);
  };

  const addArea = () => {
    const val = newArea.trim();
    if (!val) return;
    if (areas.some(a => a.toLowerCase() === val.toLowerCase())) { setError('Area already added'); return; }
    const updated = [...areas, val];
    onChange(updated); setNewArea(''); setError('');
    if (brandId) {
      fetch(`/api/brands/${brandId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ nearbyAreas: updated }) }).catch(() => {});
    }
  };

  const removeArea = (index: number) => {
    const updated = areas.filter((_, i) => i !== index);
    onChange(updated);
    if (brandId) {
      fetch(`/api/brands/${brandId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ nearbyAreas: updated }) }).catch(() => {});
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label className="flbl">Nearby Areas</label>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.6 }}>
        Add state, nearby cities, and service areas. When a query has no location, these areas will also be checked in AI responses.
      </div>
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{error}</p>}

      {/* Area tags */}
      <TagList items={areas} onRemove={removeArea} />

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={newArea} onChange={e => setNewArea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
          className="finp" style={{ flex: 1, margin: 0 }}
          placeholder="Add nearby area (e.g. Round Rock, Texas)..." />
        <button type="button" onClick={addArea} className="setup-add-btn">+ Add</button>
        <button type="button" onClick={fetchNearbyAreas} disabled={fetching || !city.trim()} className="setup-mono-btn" style={{ opacity: (fetching || !city.trim()) ? 0.5 : 1 }}>
          {fetching ? 'FETCHING...' : 'AUTO-FETCH'}
        </button>
      </div>
    </div>
  );
}

