'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/dashboard/Toast';

interface ModelOption {
  id: string;
  label: string;
  search?: boolean;
  default?: boolean;
}

interface PlatformConfig {
  platform: string;
  models: ModelOption[];
  selected: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
  Perplexity: '#20b8cd',
};

export default function AdminModelsPage() {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const fetchModels = useCallback(() => {
    setLoading(true);
    fetch('/api/admin-backend/models', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setPlatforms(d.platforms || []);
          const sel: Record<string, string> = {};
          for (const p of d.platforms || []) sel[p.platform] = p.selected;
          setSelections(sel);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  async function saveModel(platform: string) {
    setSaving(platform);
    try {
      const res = await fetch('/api/admin-backend/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ models: { [platform]: selections[platform] } }),
      });
      const d = await res.json();
      if (d.error) toast(d.error, 'error');
      else toast(`${platform} model updated`);
    } catch { toast('Failed to save', 'error'); }
    setSaving(null);
  }

  async function saveAll() {
    setSavingAll(true);
    try {
      const res = await fetch('/api/admin-backend/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ models: selections }),
      });
      const d = await res.json();
      if (d.error) toast(d.error, 'error');
      else toast('All models updated');
    } catch { toast('Failed to save', 'error'); }
    setSavingAll(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="view-title">AI Models</h1>
          <p className="view-sub">Select which AI model to use for each platform. Changes apply to all users globally.</p>
        </div>
        <button onClick={saveAll} disabled={savingAll}
          style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: savingAll ? 'not-allowed' : 'pointer', opacity: savingAll ? 0.6 : 1 }}>
          {savingAll ? 'Saving...' : 'Save All'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {platforms.map(p => {
          const color = PLATFORM_ICONS[p.platform] || 'var(--primary)';
          const currentModel = p.models.find(m => m.id === selections[p.platform]);
          const defaultModel = p.models.find(m => m.default);
          const isDefault = selections[p.platform] === defaultModel?.id;
          const hasChanged = selections[p.platform] !== p.selected;

          return (
            <div key={p.platform} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, boxShadow: 'var(--app-shadow)' }}>
              {/* Platform Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color }}>
                    {p.platform[0]}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{p.platform}</h3>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
                      Currently using: <strong style={{ color }}>{currentModel?.label || selections[p.platform]}</strong>
                      {isDefault && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>(default)</span>}
                    </p>
                  </div>
                </div>
                {hasChanged && (
                  <button onClick={() => saveModel(p.platform)} disabled={saving === p.platform}
                    style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: color, color: '#fff', border: 'none', cursor: saving === p.platform ? 'not-allowed' : 'pointer', opacity: saving === p.platform ? 0.6 : 1 }}>
                    {saving === p.platform ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>

              {/* Model Options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {p.models.map(m => {
                  const isSelected = selections[p.platform] === m.id;
                  return (
                    <label key={m.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
                        background: isSelected ? `${color}10` : 'var(--bg3)',
                        border: `2px solid ${isSelected ? color : 'transparent'}`,
                      }}>
                      <input type="radio" name={`model-${p.platform}`} value={m.id}
                        checked={isSelected}
                        onChange={() => setSelections({ ...selections, [p.platform]: m.id })}
                        style={{ display: 'none' }}
                      />
                      {/* Radio indicator */}
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? color : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--text)' : 'var(--muted)' }}>{m.label}</span>
                          {m.default && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--bg2)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Default</span>
                          )}
                          {m.search && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${color}15`, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>Search</span>
                          )}
                        </div>
                        <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)', marginTop: 2 }}>{m.id}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Model selection applies globally to all users. When a user runs queries, the platform will use the model you select here.
          Changes take effect within 1 minute.
        </p>
      </div>
    </div>
  );
}
