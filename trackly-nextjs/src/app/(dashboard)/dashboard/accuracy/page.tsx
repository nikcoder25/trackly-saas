'use client';

import { useState, useEffect } from 'react';

interface Brand { id: string; name: string; }
interface AccuracyData { accuracy_score: number; issues_found: number; facts_verified: number; recent_issues: { id: string; issue: string; platform: string; severity: string; detected_at: string; }[]; }
interface Fact { id: string; key: string; value: string; category: string; }

export default function AccuracyPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [data, setData] = useState<AccuracyData | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [newFact, setNewFact] = useState({ key: '', value: '', category: 'general' });

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchData = (brandId: string) => {
    Promise.all([
      fetch(`/api/brands/${brandId}/accuracy`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`/api/brands/${brandId}/facts`, { credentials: 'include' }).then(r => r.json()).catch(() => ({ facts: [] })),
    ]).then(([acc, f]) => {
      setData(acc); setFacts(f?.facts || []); setLoading(false);
    });
  };

  useEffect(() => {
    if (!selectedBrand) return;
    setLoading(true);
    fetchData(selectedBrand.id);
  }, [selectedBrand]);

  const handleCheckNow = () => {
    if (!selectedBrand) return;
    setChecking(true);
    fetch(`/api/brands/${selectedBrand.id}/accuracy`, { method: 'POST', credentials: 'include' })
      .then(r => r.json()).then(d => { setData(d); setChecking(false); })
      .catch(() => setChecking(false));
  };

  const handleAddFact = () => {
    if (!selectedBrand || !newFact.key || !newFact.value) return;
    fetch(`/api/brands/${selectedBrand.id}/facts`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFact),
    }).then(r => r.json()).then(f => {
      if (f.fact) setFacts(prev => [...prev, f.fact]);
      else if (f.id) setFacts(prev => [...prev, f]);
      setNewFact({ key: '', value: '', category: 'general' });
    }).catch(() => {});
  };

  const handleDeleteFact = (factId: string) => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/facts/${factId}`, { method: 'DELETE', credentials: 'include' })
      .then(() => setFacts(prev => prev.filter(f => f.id !== factId)))
      .catch(() => {});
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const kpis = [
    { label: 'Accuracy Score', value: data?.accuracy_score != null ? `${data.accuracy_score}%` : '—', color: (data?.accuracy_score ?? 0) >= 80 ? 'var(--green)' : (data?.accuracy_score ?? 0) >= 50 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Issues Found', value: data?.issues_found ?? 0, color: (data?.issues_found ?? 0) === 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Facts Verified', value: data?.facts_verified ?? 0, color: 'var(--primary)' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--text)]">Accuracy Monitor</h1>
        <button onClick={handleCheckNow} disabled={checking} className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
          {checking ? 'Checking...' : 'Check Now'}
        </button>
      </div>
      <p className="text-[var(--muted)] mb-6">Verify how accurately AI platforms represent your brand information.</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
            <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">{k.label}</p>
            <p className="text-3xl font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Issues */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Recent Accuracy Issues</p>
          {(!data?.recent_issues || data.recent_issues.length === 0) ? (
            <p className="text-[var(--muted)] text-sm text-center py-6">No accuracy issues detected.</p>
          ) : (
            <div className="space-y-3">
              {data.recent_issues.map((issue, i) => (
                <div key={issue.id || i} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm text-[var(--text)] font-medium">{issue.issue}</p>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${issue.severity === 'high' ? 'bg-red-100 text-[var(--red)]' : issue.severity === 'medium' ? 'bg-amber-100 text-[var(--amber)]' : 'bg-green-100 text-[var(--green)]'}`}>{issue.severity}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span>{issue.platform}</span>
                    <span>{new Date(issue.detected_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Canonical Facts */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Canonical Facts</p>

          {/* Add Fact Form */}
          <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-[var(--border)]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input type="text" placeholder="Key (e.g. Founded)" value={newFact.key} onChange={e => setNewFact(p => ({ ...p, key: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-3 py-2 outline-none focus:border-[var(--primary)]" />
              <input type="text" placeholder="Value (e.g. 2020)" value={newFact.value} onChange={e => setNewFact(p => ({ ...p, value: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-3 py-2 outline-none focus:border-[var(--primary)]" />
              <select value={newFact.category} onChange={e => setNewFact(p => ({ ...p, category: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-3 py-2 outline-none focus:border-[var(--primary)]">
                <option value="general">General</option>
                <option value="product">Product</option>
                <option value="company">Company</option>
                <option value="pricing">Pricing</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <button onClick={handleAddFact} disabled={!newFact.key || !newFact.value} className="self-end px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">Add Fact</button>
          </div>

          {/* Facts List */}
          {facts.length === 0 ? (
            <p className="text-[var(--muted)] text-sm text-center py-4">No canonical facts added yet. Add facts above to track accuracy.</p>
          ) : (
            <div className="space-y-2">
              {facts.map(f => (
                <div key={f.id} className="flex items-center justify-between bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text)]">{f.key}:</span>
                      <span className="text-sm text-[var(--text)] truncate">{f.value}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-[var(--muted)]">{f.category}</span>
                  </div>
                  <button onClick={() => handleDeleteFact(f.id)} className="ml-2 text-[var(--muted)] hover:text-[var(--red)] text-sm shrink-0" title="Remove fact">&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
