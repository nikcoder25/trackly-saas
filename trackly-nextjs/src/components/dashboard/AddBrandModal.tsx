'use client';

import { useState } from 'react';
import SectionField from '@/components/dashboard/SectionField';
import TagList from '@/components/dashboard/TagList';

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

export default function AddBrandModal({ onClose, onCreated }: { onClose: () => void; onCreated: (brand: Brand) => void }) {
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

  // Nearby areas
  const [newArea, setNewArea] = useState('');
  const [fetchingAreas, setFetchingAreas] = useState(false);
  const [areaError, setAreaError] = useState('');

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

  const fetchNearbyAreas = async () => {
    if (!city.trim()) { setAreaError('Enter a city first'); return; }
    setFetchingAreas(true); setAreaError('');
    try {
      const res = await fetch('/api/nearby-areas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ city: city.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      const existing = new Set(nearbyAreas.map(a => a.toLowerCase()));
      const newAreas = (data.areas || []).filter((a: string) => !existing.has(a.toLowerCase()));
      if (!newAreas.length) { setAreaError('No new areas found'); setFetchingAreas(false); return; }
      setNearbyAreas([...nearbyAreas, ...newAreas]);
    } catch (e) { setAreaError((e as Error).message); }
    setFetchingAreas(false);
  };

  const addArea = () => {
    const val = newArea.trim();
    if (!val) return;
    if (nearbyAreas.some(a => a.toLowerCase() === val.toLowerCase())) { setAreaError('Area already added'); return; }
    setNearbyAreas([...nearbyAreas, val]); setNewArea(''); setAreaError('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-brand-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="add-brand-title" style={{ marginBottom: 0 }}>Add New Brand</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

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
              <div style={{ marginBottom: 16 }}>
                <label className="flbl">Nearby Areas</label>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.6 }}>
                  Add state, nearby cities, and service areas.
                </div>
                {areaError && <p style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{areaError}</p>}
                <TagList items={nearbyAreas} onRemove={i => setNearbyAreas(nearbyAreas.filter((_, j) => j !== i))} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={newArea} onChange={e => setNewArea(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
                    className="finp" style={{ flex: 1, margin: 0 }}
                    placeholder="Add nearby area..." />
                  <button type="button" onClick={addArea} className="setup-add-btn">+ Add</button>
                  <button type="button" onClick={fetchNearbyAreas} disabled={fetchingAreas || !city.trim()} className="setup-mono-btn" style={{ opacity: (fetchingAreas || !city.trim()) ? 0.5 : 1 }}>
                    {fetchingAreas ? 'FETCHING...' : 'AUTO-FETCH'}
                  </button>
                </div>
              </div>
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
                {saving ? 'Creating...' : 'Create Brand & Run'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
