'use client';

import { useState, useEffect } from 'react';

interface Alert { id: string; name: string; condition_type: string; action_type: string; enabled: boolean; cooldown_hours: number; last_triggered_at: string | null; created_at: string; }
interface Brand { id: string; name: string; }

export default function AlertsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('visibility_drop');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/alerts`, { credentials: 'include' })
      .then(r => r.json()).then(d => setAlerts(d.alerts || [])).catch(() => setAlerts([]));
  }, [selectedBrand]);

  const handleCreate = async () => {
    if (!selectedBrand || !newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}/alerts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newName, condition_type: newType }),
      });
      const data = await res.json();
      if (data.alert) { setAlerts([data.alert, ...alerts]); setShowCreate(false); setNewName(''); }
    } catch {}
    setSaving(false);
  };

  const toggleAlert = async (alert: Alert) => {
    await fetch(`/api/alerts/${alert.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ enabled: !alert.enabled }),
    });
    setAlerts(alerts.map(a => a.id === alert.id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlert = async (id: string) => {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
    setAlerts(alerts.filter(a => a.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-[var(--text)]">Alerts</h1><p className="text-[var(--text-muted)] mt-1">Set up alert rules and notifications</p></div>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-2 rounded-lg text-sm font-medium transition">+ New Alert</button>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}

      {showCreate && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Create Alert</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1"><label className="block text-xs text-[var(--text-muted)] mb-1">Alert Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" placeholder="e.g. SOV Drop Alert" /></div>
            <div><label className="block text-xs text-[var(--text-muted)] mb-1">Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm">
                <option value="visibility_drop">Visibility Drop</option><option value="competitor_surge">Competitor Surge</option>
                <option value="hallucination">Hallucination Detected</option><option value="new_mention">New Mention</option>
              </select></div>
            <button onClick={handleCreate} disabled={saving} className="bg-[var(--primary)] text-[var(--text)] px-4 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? '...' : 'Create'}</button>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center"><p className="text-[var(--text-muted)]">No alerts configured. Create one to get notified about visibility changes.</p></div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
              <button onClick={() => toggleAlert(a)} className={`w-10 h-5 rounded-full relative transition ${a.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--bg4)]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${a.enabled ? 'left-5' : 'left-0.5'}`} />
              </button>
              <div className="flex-1"><p className="text-sm text-[var(--text)] font-medium">{a.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{a.condition_type.replace(/_/g, ' ')} &middot; {a.action_type} &middot; {a.cooldown_hours}h cooldown</p></div>
              <button onClick={() => deleteAlert(a.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] text-xs">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
