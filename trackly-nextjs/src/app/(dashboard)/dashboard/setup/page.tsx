'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PLATFORM_COLORS, getPlanPlatforms } from '@/lib/constants';
import { getPlanCredits } from '@/lib/plan-config';
import { useAuth } from '@/contexts/AuthContext';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import SectionField from '@/components/dashboard/SectionField';
import TagList from '@/components/dashboard/TagList';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import AddBrandModal from '@/components/dashboard/AddBrandModal';
import { Card, Badge, PageHead } from '@/app/dashboard-v2/ui';

/* ── design-system field/tag helpers (presentation only) ───────────────── */
function Fld({ label, value, onChange, placeholder, type = 'text', mono = false }: any) {
  return (
    <div className="fld">
      <label className="eyebrow">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={'fld-in' + (mono ? ' mono' : '')}
        placeholder={placeholder}
      />
    </div>
  );
}

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
  platforms?: string[];
  runs?: unknown[];
  [key: string]: unknown;
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  // Transparently refresh the 15-minute access token on 401 and retry once.
  // Without this, SAVE CHANGES (and the other state-changing actions on this
  // page) surface "Authentication required" as soon as the token expires
  // while the user is sitting on the form. Mirrors BrandContext.refreshBrands.
  let res = await fetch(path, opts);
  if (res.status === 401) {
    const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) res = await fetch(path, opts);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const ALL_PLATFORMS = Object.keys(PLATFORM_COLORS);

export default function SetupPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  // Livesov v3: tracked-prompt cap is account-wide (sum across all
  // brands), not per-brand. The form clamps client-side and the
  // server re-validates the account total in /api/brands/[id] PUT.
  const v3 = getPlanCredits(user?.plan || 'free');
  const accountPromptCap = v3.trackedPromptsPerAccount
    || v3.maxPromptsPerBrand
    || (user?.limits as Record<string, number>)?.queries
    || 50;
  const { brands: ctxBrands, selectedBrand: ctxSelectedBrand, setSelectedBrand: setCtxSelectedBrand, loading: ctxLoading, refreshBrands } = useBrands();
  const { startRun } = useRun();
  const startRunRef = useRef(startRun);
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Sync from BrandContext. Adopt the context's selection whenever it points
  // at a different brand id (e.g. user switched in the Topbar dropdown). When
  // the id matches, keep the local copy so optimistic edits from
  // onUpdated/onDeleted aren't clobbered by a stale context value.
  useEffect(() => {
    if (ctxLoading) return;
    setBrands(ctxBrands as Brand[]);
    setSelectedBrand((prev) => {
      if (!ctxSelectedBrand) return null;
      if (!prev || prev.id !== ctxSelectedBrand.id) return ctxSelectedBrand as Brand;
      return prev;
    });
    setLoading(false);
  }, [ctxLoading, ctxBrands, ctxSelectedBrand]);

  const loadBrands = useCallback(async () => {
    await refreshBrands();
  }, [refreshBrands]);

  if (loading) return (
    <div className="lvx">
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="Brand Setup"
        sub="Configure your brand details."
        actions={<button className="btn-p" onClick={() => setShowCreate(true)}>+ New Brand</button>}
      />

      {showCreate && (
        <AddBrandModal
          onClose={() => setShowCreate(false)}
          onCreated={(brand) => {
            setShowCreate(false);
            setBrands([...brands, brand]);
            setSelectedBrand(brand);
            setCtxSelectedBrand(brand);
            refreshBrands().then(() => { setTimeout(() => startRunRef.current(false, { auto: true }), 600); });
          }}
        />
      )}

      <div className="page-body">
        {selectedBrand ? (
          <EditBrandForm brand={selectedBrand} accountPromptCap={accountPromptCap} allBrands={brands}
            onUpdated={updated => { setBrands(brands.map(b => b.id === updated.id ? updated : b)); setSelectedBrand(updated); setCtxSelectedBrand(updated); refreshBrands(); }}
            onDeleted={() => { const remaining = brands.filter(b => b.id !== selectedBrand.id); setBrands(remaining); setSelectedBrand(remaining[0] || null); refreshBrands(); }} />
        ) : null}
      </div>
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
              {saving ? 'Creating...' : 'Create Brand & Run'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── EDIT BRAND FORM (full feature parity with LiveSOV) ───────────────────── */
function EditBrandForm({ brand, onUpdated, onDeleted, accountPromptCap = 250, allBrands = [] }: { brand: Brand; onUpdated: (b: Brand) => void; onDeleted: () => void; accountPromptCap?: number; allBrands?: Brand[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { startRun } = useRun();
  const startRunRef = useRef(startRun);
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);
  const [originalQueries, setOriginalQueries] = useState<string[]>(brand.queries || []);
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
  // Livesov v2 plan caps. The setup page enforces these client-side
  // (greying disabled platforms, trimming overflow on save) and the
  // server re-validates in /api/brands/[id] PUT - defence in depth.
  const v2 = getPlanCredits(user?.plan || 'free');
  const platformLimit = v2.maxPlatforms
    || (user?.limits as Record<string, number>)?.platforms
    || ALL_PLATFORMS.length;
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    Array.isArray(brand.platforms) && brand.platforms.length
      ? brand.platforms
      : planPlatforms
  );
  const [nearbyAreas, setNearbyAreas] = useState<string[]>(brand.nearbyAreas || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const copyAllQueries = async () => {
    if (!queries.length) return;
    try {
      await navigator.clipboard.writeText(queries.join('\n'));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch { /* fallback */ }
  };

  useEffect(() => {
    setName(brand.name); setIndustry(brand.industry || ''); setWebsite(brand.website || '');
    setCity(brand.city || ''); setGoal(brand.goal || 70);
    setAliases(brand.aliases || []); setQueries(brand.queries || []);
    setCompetitors(brand.competitors || []);
    setSelectedPlatforms(
      Array.isArray(brand.platforms) && brand.platforms.length
        ? brand.platforms
        : planPlatforms
    );
    setNearbyAreas(brand.nearbyAreas || []);
    setOriginalQueries(brand.queries || []);
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

  const [duplicateFlashIdx, setDuplicateFlashIdx] = useState<number | null>(null);
  const flashDuplicate = (idx: number) => {
    setDuplicateFlashIdx(idx);
    setTimeout(() => setDuplicateFlashIdx(null), 1600);
  };

  // Account-wide tracked-prompt accounting (v3 spec). The cap is
  // shared across every brand the account owns, so the math below
  // uses `accountSlotsRemaining = cap - other-brands - this-brand`
  // instead of a static per-brand limit.
  const otherBrandsPromptCount = allBrands.reduce((sum, b) => {
    if (b.id === brand.id) return sum;
    return sum + (Array.isArray(b.queries) ? b.queries.length : 0);
  }, 0);
  const isPromptCapUnlimited = accountPromptCap >= 9999;
  const accountSlotsRemaining = isPromptCapUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, accountPromptCap - otherBrandsPromptCount - queries.length);

  const addQuery = () => {
    const q = queryInput.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    const dupIdx = queries.findIndex(x => x.toLowerCase() === lower);
    if (dupIdx !== -1) {
      setError(`"${q}" is already tracked`);
      flashDuplicate(dupIdx);
      return;
    }
    if (!isPromptCapUnlimited && accountSlotsRemaining <= 0) {
      setError(`Plan allows ${accountPromptCap} tracked prompts across all brands. ${otherBrandsPromptCount} are used by other brands. Upgrade for more.`);
      return;
    }
    setError('');
    setQueries([...queries, q]);
    setQueryInput('');
  };
  const addComp = () => { if (compInput.trim() && !competitors.includes(compInput.trim())) { setCompetitors([...competitors, compInput.trim()]); setCompInput(''); } };

  const bulkAddQueries = () => {
    const rawLines = bulkText.split('\n').map(q => q.trim()).filter(Boolean);
    if (!rawLines.length) { setError('No queries entered'); return; }
    const seenInBatch = new Set<string>();
    const inBatchDedup = rawLines.filter(q => {
      const k = q.toLowerCase();
      if (seenInBatch.has(k)) return false;
      seenInBatch.add(k); return true;
    });
    const existingLower = new Set(queries.map(q => q.toLowerCase()));
    const newQ = inBatchDedup.filter(q => !existingLower.has(q.toLowerCase()));
    const skipped = rawLines.length - newQ.length;
    if (!newQ.length) {
      setError(`${skipped} duplicate quer${skipped === 1 ? 'y' : 'ies'} skipped - nothing new to add`);
      return;
    }
    // Cap to the account-wide tracked-prompt cap, accounting for
    // queries already configured on OTHER brands. Server-side PUT
    // re-validates the same total; clipping here gives the user a
    // clear local message instead of a 403 after Save.
    let trimmed = newQ;
    let trimmedNote = '';
    if (!isPromptCapUnlimited && newQ.length > accountSlotsRemaining) {
      trimmed = newQ.slice(0, Math.max(0, accountSlotsRemaining));
      trimmedNote = ` - ${newQ.length - trimmed.length} clipped at account cap of ${accountPromptCap}`;
    }
    if (!trimmed.length) {
      setError(`Plan allows ${accountPromptCap} tracked prompts across all brands and you're at the limit. Upgrade for more.`);
      return;
    }
    setError('');
    setQueries([...queries, ...trimmed]);
    setBulkText(''); setShowBulk(false);
    setMessage(`${trimmed.length} quer${trimmed.length === 1 ? 'y' : 'ies'} added${skipped ? ` - ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}${trimmedNote}`);
  };

  const deleteSelected = () => {
    const count = selected.size;
    if (!count) return;
    if (!confirm(`Delete ${count} selected quer${count === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    setQueries(queries.filter((_, i) => !selected.has(i)));
    setSelected(new Set()); setSelectMode(false);
  };

  const copySelectedQueries = async () => {
    if (!selected.size) return;
    const picks = queries.filter((_, i) => selected.has(i));
    try {
      await navigator.clipboard.writeText(picks.join('\n'));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      setMessage(`${picks.length} selected quer${picks.length === 1 ? 'y' : 'ies'} copied`);
    } catch { setError('Copy failed - clipboard access blocked'); }
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSuggestQueries = async () => {
    if (!name) { setError('Set brand name first'); return; }
    if (!industry) { setError('Set industry first'); return; }
    setSuggesting(true); setError('');
    try {
      let newQs: string[] = [];
      for (let attempt = 0; attempt < 2 && !newQs.length; attempt++) {
        const data = await api('POST', '/api/ai-generate-queries', {
          brandName: name, industry, city, existingQueries: queries, mode: 'suggest',
        });
        const suggestions: string[] = data.queries || [];
        const existing = new Set(queries.map(q => q.toLowerCase()));
        const needle = name.toLowerCase();
        newQs = suggestions
          .filter(q => q.toLowerCase().includes(needle))
          .filter(q => !existing.has(q.toLowerCase()));
      }
      if (!newQs.length) {
        setMessage('No new brand-focused queries this round - click Suggest again for more variety.');
        setSuggesting(false);
        return;
      }
      if (!isPromptCapUnlimited && accountSlotsRemaining <= 0) {
        setError('Account-wide prompt limit reached. Upgrade your plan.');
        setSuggesting(false);
        return;
      }
      if (!isPromptCapUnlimited && newQs.length > accountSlotsRemaining) {
        newQs = newQs.slice(0, accountSlotsRemaining);
      }
      setQueries([...queries, ...newQs]);
      setMessage(`+ ${newQs.length} brand-focused quer${newQs.length === 1 ? 'y' : 'ies'} added - click again for more.`);
    } catch (e) { setError((e as Error).message); }
    setSuggesting(false);
  };

  const handleAiGenerate = async () => {
    if (!name) { setError('Set brand name first'); return; }
    if (!industry) { setError('Set industry first'); return; }
    setAiGenerating(true); setError('');
    try {
      // Two-round retry so repeated clicks keep yielding fresh prompts -
      // the server rotates angles / variation seed between calls.
      let newQs: string[] = [];
      for (let attempt = 0; attempt < 2 && !newQs.length; attempt++) {
        const data = await api('POST', '/api/ai-generate-queries', {
          brandName: name, industry, city, existingQueries: queries,
        });
        const suggestions: string[] = data.queries || [];
        const existing = new Set(queries.map(q => q.toLowerCase()));
        newQs = suggestions.filter(q => !existing.has(q.toLowerCase()));
      }
      if (!newQs.length) {
        setMessage('No new queries this round - click AI Generate again for more variety.');
        setAiGenerating(false);
        return;
      }
      if (!isPromptCapUnlimited && accountSlotsRemaining <= 0) {
        setError('Account-wide prompt limit reached. Upgrade your plan.');
        setAiGenerating(false);
        return;
      }
      if (!isPromptCapUnlimited && newQs.length > accountSlotsRemaining) {
        newQs = newQs.slice(0, accountSlotsRemaining);
      }
      setQueries([...queries, ...newQs]);
      setMessage(`+ ${newQs.length} AI-generated quer${newQs.length === 1 ? 'y' : 'ies'} added - click again for more.`);
    } catch (e) { setError((e as Error).message); }
    setAiGenerating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const data = await api('PUT', `/api/brands/${brand.id}`, { name, industry, website, city, queries, competitors, aliases, goal, platforms: selectedPlatforms, nearbyAreas });
      // Detect newly added queries BEFORE calling onUpdated (which triggers re-renders)
      const newQueries = queries.filter(q => !originalQueries.includes(q));
      onUpdated(data.brand);
      if (newQueries.length > 0) {
        const msg = `Brand updated! Running ${newQueries.length} new quer${newQueries.length === 1 ? 'y' : 'ies'}...`;
        setMessage(msg);
        toast(msg, 'success');
        setOriginalQueries(queries);
        // Use ref to always get the latest startRun; small delay lets BrandContext settle
        setTimeout(() => startRunRef.current(false, { auto: true, queries: newQueries }), 600);
      } else {
        setMessage('Brand updated!');
        toast('Brand updated successfully', 'success');
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg || 'Failed to save brand', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this brand? This cannot be undone.')) return;
    try {
      await api('DELETE', `/api/brands/${brand.id}`);
      toast('Brand deleted', 'success');
      onDeleted();
    }
    catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg || 'Failed to delete brand', 'error');
    }
  };

  return (
    <form onSubmit={handleSave} style={{ display: 'grid', gap: 16 }}>
      {error && <Badge tone="neg" style={{ display: 'block', padding: '8px 12px', fontSize: 11 }}>{error}</Badge>}
      {message && <Badge tone="pos" style={{ display: 'block', padding: '8px 12px', fontSize: 11 }}>{message}</Badge>}

      <Card title="Identity">
        <Fld label="BRAND NAME" value={name} onChange={setName} placeholder="Your Brand Name" />

        <Fld label="INDUSTRY" value={industry} onChange={setIndustry} placeholder="e.g. HVAC, Plumbing, Landscaping" />
        <Fld label="WEBSITE" value={website} onChange={setWebsite} placeholder="yourbrand.com" mono />
        <Fld label="CITY / LOCATION" value={city} onChange={setCity} placeholder="e.g. Austin TX" />
        <Fld label="SOV GOAL (%)" value={String(goal)} onChange={(v: string) => setGoal(Number(v))} placeholder="70" type="number" mono />
      </Card>

      <Card title="Alternate names & aliases" right={<button type="button" onClick={autoGenerateAliases} className="btn-d">Auto-generate</button>}>
        <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          AI platforms may refer to your brand differently. Add all variations so no mention is missed. Auto-generated from brand name &amp; website - add more if needed.
        </p>
        <div className="tag-grid">
          {aliases.map((a, i) => (
            <span key={`${a}-${i}`} className="ttag mono">{a} <span className="x" onClick={() => setAliases(aliases.filter((_, j) => j !== i))}>×</span></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
            placeholder="Add alternate name..." className="fld-in" style={{ flex: 1 }} />
          <button type="button" onClick={addAlias} className="btn-g">+ Add</button>
        </div>
      </Card>

      <Card title="Nearby areas">
        <NearbyAreasSection city={city} areas={nearbyAreas} onChange={setNearbyAreas} brandId={brand.id} />
      </Card>

      <Card title="Manage queries"
        lede={isPromptCapUnlimited
          ? `${queries.length} prompts on this brand · ∞ account-wide`
          : `${queries.length + otherBrandsPromptCount} / ${accountPromptCap} prompts account-wide · ${queries.length} on this brand${otherBrandsPromptCount > 0 ? ` · ${otherBrandsPromptCount} on other brands` : ''}`}
      >
        <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          Add, remove, or bulk-manage the queries tracked for this brand.
        </p>

        {/* Query tags */}
        <div className="tag-grid" style={{ marginBottom: 12, minHeight: 28 }}>
          {queries.map((q, i) => (
            <span key={i}
              onClick={() => { if (selectMode) { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); } }}
              className={`ttag mono ${selectMode ? 'query-tag-selectable' : ''} ${selectMode && selected.has(i) ? 'query-tag-selected' : ''} ${duplicateFlashIdx === i ? 'query-tag-duplicate-flash' : ''}`}
              style={selectMode ? { cursor: 'pointer' } : undefined}
            >
              {selectMode && <input type="checkbox" checked={selected.has(i)} readOnly className="query-select-cb" />}
              {q}
              {!selectMode && (
                <span className="x" onClick={() => setQueries(queries.filter((_, j) => j !== i))}>×</span>
              )}
            </span>
          ))}
          {!queries.length && (
            <span className="quiet mono" style={{ fontSize: 11 }}>No queries yet. Add queries below.</span>
          )}
        </div>

        {/* Action buttons row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <button type="button" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} className="btn-d">
            {selectMode ? 'Cancel' : '☐ Select'}
          </button>
          {selectMode && (
            <>
              <button type="button" onClick={() => setSelected(new Set(queries.map((_, i) => i)))} className="btn-d">Select all</button>
              <button type="button" onClick={() => setSelected(new Set())} className="btn-d">Deselect all</button>
              <button type="button" onClick={copySelectedQueries} disabled={selected.size === 0} className="btn-d" style={{ opacity: selected.size === 0 ? 0.4 : 1 }}>
                Copy selected ({selected.size})
              </button>
              <button type="button" onClick={deleteSelected} disabled={selected.size === 0} className="btn-d btn-danger" style={{ opacity: selected.size === 0 ? 0.4 : 1 }}>
                Delete selected ({selected.size})
              </button>
            </>
          )}
          {!selectMode && (
            <>
              <button type="button" onClick={copyAllQueries} disabled={!queries.length} className="btn-d" style={{ opacity: queries.length ? 1 : 0.4 }}>
                {copySuccess ? '✓ Copied' : '⧉ Copy all'}
              </button>
              <button type="button" onClick={() => { if (confirm('Clear all queries?')) setQueries([]); }} className="btn-d btn-danger">
                Clear all
              </button>
            </>
          )}
        </div>

        {/* Add query input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={queryInput} onChange={e => setQueryInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuery(); } }}
            placeholder="Add a query..." className="fld-in" style={{ flex: 1 }} />
          <button type="button" onClick={addQuery} className="btn-g">+ Add</button>
        </div>

        {/* Bulk add & AI Generate buttons */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={() => setShowBulk(!showBulk)} className="btn-d">Bulk add</button>
          <button type="button" onClick={handleSuggestQueries} disabled={suggesting} className="btn-d" style={{ opacity: suggesting ? 0.5 : 1 }}>
            {suggesting ? 'Suggesting...' : 'Suggest'}
          </button>
          <button type="button" onClick={handleAiGenerate} disabled={aiGenerating} className="btn-d" style={{ opacity: aiGenerating ? 0.5 : 1 }}>
            {aiGenerating ? 'Generating...' : 'AI generate'}
          </button>
        </div>

        {/* Bulk textarea */}
        {showBulk && (
          <div style={{ marginTop: 8 }}>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5}
              placeholder="Paste queries, one per line..." className="fld-in mono"
              style={{ width: '100%', minHeight: 120, resize: 'vertical', fontSize: 11 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span className="quiet mono" style={{ fontSize: 11 }}>{bulkText.split('\n').filter(Boolean).length} queries detected</span>
              <button type="button" onClick={bulkAddQueries} className="btn-p">Add all</button>
            </div>
          </div>
        )}
      </Card>

      <Card title="AI platforms to track"
        right={<Badge tone={selectedPlatforms.length > platformLimit ? 'warn' : 'neu'}>{selectedPlatforms.length} / {ALL_PLATFORMS.length}</Badge>}>
        <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          Select which AI platforms to query when running keyword tracking. Only the platforms you pick will be scanned.
        </p>
        <div className="tag-grid">
          {ALL_PLATFORMS.map(p => {
            const checked = selectedPlatforms.includes(p);
            return (
              <button key={p} type="button" onClick={() => togglePlatform(p)}
                className="ttag mono"
                style={{
                  cursor: 'pointer',
                  borderColor: checked ? 'var(--primary)' : 'var(--line-2)',
                  background: checked ? 'var(--primary-50)' : 'var(--surface-2)',
                  color: checked ? 'var(--primary)' : 'var(--text-2)',
                }}>
                <input type="checkbox" checked={checked} readOnly style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[p] }} />
                {p}
              </button>
            );
          })}
        </div>
        <div className="quiet mono" style={{ fontSize: 11, color: selectedPlatforms.length > platformLimit ? 'var(--warn)' : undefined, marginTop: 8 }}>
          {selectedPlatforms.length > platformLimit
            ? `Plan allows ${platformLimit} platforms - only the first ${platformLimit} you selected will be tracked.`
            : `${selectedPlatforms.length} of ${ALL_PLATFORMS.length} selected (plan limit: ${platformLimit})`}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} className="btn-p" style={{ opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button type="button" onClick={handleDelete} className="btn-d btn-danger">
          Delete brand
        </button>
      </div>
    </form>
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
    <div>
      <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Add state, nearby cities, and service areas. When a query has no location, these areas will also be checked in AI responses.
      </p>
      {error && <Badge tone="neg" style={{ display: 'block', padding: '8px 12px', fontSize: 11, marginBottom: 8 }}>{error}</Badge>}

      {/* Area tags */}
      <div className="tag-grid">
        {areas.map((a, i) => (
          <span key={`${a}-${i}`} className="ttag mono">{a} <span className="x" onClick={() => removeArea(i)}>×</span></span>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={newArea} onChange={e => setNewArea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
          className="fld-in" style={{ flex: 1 }}
          placeholder="Add nearby area (e.g. Round Rock, Texas)..." />
        <button type="button" onClick={addArea} className="btn-g">+ Add</button>
        <button type="button" onClick={fetchNearbyAreas} disabled={fetching || !city.trim()} className="btn-d" style={{ opacity: (fetching || !city.trim()) ? 0.5 : 1 }}>
          {fetching ? 'Fetching...' : 'Auto-fetch'}
        </button>
      </div>
    </div>
  );
}

