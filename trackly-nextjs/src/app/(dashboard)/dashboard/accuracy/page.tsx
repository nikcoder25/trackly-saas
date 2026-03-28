'use client';

import { useState, useEffect } from 'react';

interface Brand { id: string; name: string; }
interface Fact { key: string; value: string; category: string; }
interface Issue { platform: string; fact_key: string; expected: string; found: string; severity: string; date?: string; }

export default function AccuracyPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [accuracyRate, setAccuracyRate] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [factKey, setFactKey] = useState('');
  const [factValue, setFactValue] = useState('');
  const [factCategory, setFactCategory] = useState('general');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!brand) return;
    fetch(`/api/brands/${brand.id}/accuracy`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setFacts(d.facts || []);
        setIssues(d.issues || []);
        setAccuracyRate(d.accuracyRate ?? null);
      })
      .catch(() => { setFacts([]); setIssues([]); });
  }, [brand]);

  function addFact() {
    if (!factKey.trim() || !factValue.trim() || !brand) return;
    const updated = [...facts, { key: factKey.trim(), value: factValue.trim(), category: factCategory }];
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => { setFacts(updated); setFactKey(''); setFactValue(''); });
  }

  function removeFact(idx: number) {
    if (!brand) return;
    const updated = facts.filter((_, i) => i !== idx);
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: updated }),
    }).then(() => setFacts(updated));
  }

  function checkNow() {
    if (!brand || checking) return;
    setChecking(true);
    fetch(`/api/brands/${brand.id}/accuracy`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check' }),
    }).then(r => r.json()).then(d => {
      setIssues(d.issues || []);
      setAccuracyRate(d.accuracyRate ?? null);
    }).catch(() => {}).finally(() => setChecking(false));
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title">Accuracy Monitor</div>
          <div className="view-sub">Verify how accurately AI platforms represent your brand information.</div>
        </div>
        <button className="pbtn" onClick={checkNow} disabled={checking}
          style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700, opacity: checking ? 0.6 : 1 }}>
          {checking ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      {/* KPI Cards — 3 score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: accuracyRate != null ? (accuracyRate >= 80 ? 'var(--green)' : accuracyRate >= 50 ? 'var(--amber)' : 'var(--red)') : 'var(--muted)' }}>
            {accuracyRate != null ? `${accuracyRate}%` : '—'}
          </div>
          <div className="score-label">Accuracy Rate</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: issues.length > 0 ? 'var(--red)' : 'var(--green)' }}>{issues.length}</div>
          <div className="score-label">Inaccuracies Found</div>
        </div>
        <div className="score-card">
          <div className="score-val" style={{ fontSize: 24, color: 'var(--green)' }}>{facts.length}</div>
          <div className="score-label">Claims Verified</div>
        </div>
      </div>

      {/* Recent Accuracy Issues */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title">Recent Accuracy Issues</div>
        {issues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>
            Add canonical facts below and click &quot;Check Now&quot; to verify AI accuracy.
          </div>
        ) : (
          <div>
            {issues.map((issue, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < issues.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', padding: '3px 8px', borderRadius: 100, color: issue.severity === 'high' || issue.severity === 'critical' ? 'var(--red)' : issue.severity === 'medium' ? 'var(--amber)' : 'var(--blue)', background: issue.severity === 'high' || issue.severity === 'critical' ? 'rgba(239,68,68,.08)' : issue.severity === 'medium' ? 'rgba(245,158,11,.08)' : 'rgba(59,130,246,.08)', textTransform: 'uppercase', flexShrink: 0 }}>
                  {issue.severity}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{issue.fact_key}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Expected: <strong style={{ color: 'var(--green)' }}>{issue.expected}</strong> · Found: <strong style={{ color: 'var(--red)' }}>{issue.found}</strong>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4 }}>{issue.platform}{issue.date ? ` · ${new Date(issue.date).toLocaleDateString()}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canonical Facts */}
      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <div className="section-title">Canonical Facts</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
          Define what&apos;s true about your brand. We&apos;ll check if AI gets it right.
        </div>

        {facts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12 }}>
            No facts defined yet. Add your brand&apos;s canonical facts below (e.g. founded year, pricing, phone number) to check AI accuracy.
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{f.key}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{f.value}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 4 }}>{f.category}</span>
                <button onClick={() => removeFact(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add Fact Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
          <div>
            <label className="flbl">Fact Key</label>
            <input className="finp" placeholder="e.g. founded_year" value={factKey} onChange={e => setFactKey(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div>
            <label className="flbl">Fact Value</label>
            <input className="finp" placeholder="e.g. 2009" value={factValue} onChange={e => setFactValue(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div>
            <label className="flbl">Category</label>
            <select className="finp" value={factCategory} onChange={e => setFactCategory(e.target.value)} style={{ margin: 0 }}>
              <option value="general">General</option>
              <option value="pricing">Pricing</option>
              <option value="features">Features</option>
              <option value="company">Company</option>
            </select>
          </div>
          <button className="pbtn" onClick={addFact} style={{ fontWeight: 700 }}>Add</button>
        </div>
      </div>
    </div>
  );
}
