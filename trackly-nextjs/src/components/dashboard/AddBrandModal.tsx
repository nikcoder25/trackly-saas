'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import SectionField from '@/components/dashboard/SectionField';
import TagList from '@/components/dashboard/TagList';
import { api, getErrorMessage } from '@/lib/fetch-client';

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
  const [aiGenerating, setAiGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [queryMsg, setQueryMsg] = useState('');
  const autoGenTriggered = useRef(false);

  // Auto-generate queries once when entering Step 3 for the first time.
  // Only depends on `step`; autoGenTriggered ref prevents re-runs.
  useEffect(() => {
    if (step === 3 && queries.length === 0 && name && !autoGenTriggered.current) {
      autoGenTriggered.current = true;
      handleAiGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Nearby areas
  const [newArea, setNewArea] = useState('');
  const [fetchingAreas, setFetchingAreas] = useState(false);
  const [areaError, setAreaError] = useState('');

  const addComp = () => { if (compInput.trim() && !competitors.includes(compInput.trim())) { setCompetitors([...competitors, compInput.trim()]); setCompInput(''); } };
  const addQuery = () => { if (queryInput.trim() && !queries.includes(queryInput.trim())) { setQueries([...queries, queryInput.trim()]); setQueryInput(''); } };

  const handleSuggestQueries = async () => {
    if (!name) { setError('Set brand name first'); return; }
    setSuggesting(true); setQueryMsg(''); setError('');
    try {
      const data = await api<{ queries?: string[] }>('POST', '/api/ai-generate-queries', {
        brandName: name, industry: industry || 'services', city: city || '', existingQueries: queries, mode: 'suggest',
      });
      const suggestions = (data.queries || []).filter((s) => !queries.includes(s));
      if (suggestions.length) { setQueries([...queries, ...suggestions]); setQueryMsg(`Added ${suggestions.length} suggested queries`); }
      else { setQueryMsg('All suggestions already added'); }
    } catch {
      const ind = industry || 'services';
      const fallback = [`what is ${name}`, `${name} reviews`, `is ${name} good`, `${name} ${ind} quality`, `${name} pricing`, `${name} vs competitors`, `why choose ${name}`, `${name} testimonials`, `is ${name} worth it`, `${name} customer experience`].filter(s => !queries.includes(s));
      if (fallback.length) { setQueries([...queries, ...fallback]); setQueryMsg(`Added ${fallback.length} suggested queries`); }
      else { setQueryMsg('All suggestions already added'); }
    }
    setSuggesting(false);
  };

  const handleAiGenerate = async () => {
    if (!name) { setError('Set brand name first'); return; }
    setAiGenerating(true); setQueryMsg(''); setError('');
    try {
      const data = await api<{ queries?: string[] }>('POST', '/api/ai-generate-queries', {
        brandName: name, industry: industry || 'services', city: city || '', existingQueries: queries,
      });
      const generated = (data.queries || []).filter((s) => !queries.includes(s));
      if (generated.length) { setQueries([...queries, ...generated]); setQueryMsg(`Added ${generated.length} AI-generated queries`); }
      else { setQueryMsg('All AI suggestions already added'); }
    } catch {
      const fallback = [`what is ${name}`, `is ${name} good`, `${name} vs competitors`, `${name} pricing`, `alternatives to ${name}`, `${name} reputation`, `does ${name} offer good service`, `${name} customer experience`, `compare ${name} to others`, `is ${name} worth it`].filter(s => !queries.includes(s));
      if (fallback.length) { setQueries([...queries, ...fallback]); setQueryMsg(`Added ${fallback.length} AI-generated queries`); }
      else { setQueryMsg('All AI suggestions already added'); }
    }
    setAiGenerating(false);
  };

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const data = await api<{ brand: Brand }>('POST', '/api/brands', { name, industry, website, city, nearbyAreas, competitors, queries });
      onCreated(data.brand);
    } catch (e) { setError(getErrorMessage(e, 'Failed to create brand')); }
    setSaving(false);
  };

  const fetchNearbyAreas = async () => {
    if (!city.trim()) { setAreaError('Enter a city first'); return; }
    setFetchingAreas(true); setAreaError('');
    // Client-side timeout - server caps at ~45s; add headroom for network.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);
    try {
      const data = await api<{ areas?: string[] }>(
        'POST',
        '/api/nearby-areas',
        { city: city.trim(), industry: industry.trim(), website: website.trim() },
        { signal: controller.signal },
      );
      const existing = new Set(nearbyAreas.map(a => a.toLowerCase()));
      const newAreas = (data.areas || []).filter((a) => !existing.has(a.toLowerCase()));
      if (!newAreas.length) { setAreaError('No new areas found'); setFetchingAreas(false); clearTimeout(timeoutId); return; }
      setNearbyAreas([...nearbyAreas, ...newAreas]);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setAreaError(aborted ? 'Request timed out. Please try again.' : getErrorMessage(e, 'Failed to fetch'));
    }
    clearTimeout(timeoutId);
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

        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--danger)', fontSize: 11, fontFamily: 'var(--mono)', padding: '10px 12px', borderRadius: 'var(--radius-xs)', marginBottom: 12 }}>
            <div>{error}</div>
            {error.toLowerCase().includes('upgrade') && (
              <Link href="/dashboard/account" onClick={onClose} style={{ display: 'inline-block', marginTop: 8, padding: '6px 14px', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-xs)', textDecoration: 'none' }}>
                Upgrade Plan →
              </Link>
            )}
          </div>
        )}

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
            {queryMsg && <p style={{ fontSize: 11, color: 'var(--green)', marginBottom: 8, fontFamily: 'var(--mono)' }}>{queryMsg}</p>}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <button type="button" className="setup-mono-btn" style={{ background: 'var(--success-light)', color: 'var(--green)', border: '1px solid var(--green)', opacity: suggesting ? 0.5 : 1 }} disabled={suggesting} onClick={handleSuggestQueries}>
                {suggesting ? 'SUGGESTING...' : 'SUGGEST'}
              </button>
              <button type="button" className="setup-mono-btn" style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-border)', opacity: aiGenerating ? 0.5 : 1 }} disabled={aiGenerating} onClick={handleAiGenerate}>
                {aiGenerating ? 'GENERATING...' : 'AI GENERATE'}
              </button>
            </div>
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
