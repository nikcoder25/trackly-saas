'use client';

import { useState, useEffect, useCallback } from 'react';

interface SystemInfo {
  database: { name: string; version: string; sizeMb: number; activeConnections: number; idleConnections: number };
  tables: Array<{ table_name: string; row_count: number }>;
  cache: { total_entries: number; expired_entries: number };
  apiKeys: Record<string, boolean>;
  recentErrors: Array<{ platform: string; model: string; error: string; created_at: string }>;
  environment: { nodeEnv: string; appUrl: string; hasEncryptionKey: boolean };
}

function StatusDot({ ok }: { ok: boolean }) {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />;
}

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/admin-backend/system', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load system info</div>;

  const formatBytes = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>System Health</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Database, API keys, environment, and system configuration.</p>
        </div>
        <button onClick={fetchData} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Database Size</p>
          <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>{formatBytes(data.database.sizeMb)}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Active Connections</p>
          <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: 'var(--green)' }}>{data.database.activeConnections}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{data.database.idleConnections} idle</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Cache Entries</p>
          <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: 'var(--amber)' }}>{data.cache.total_entries}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{data.cache.expired_entries} expired</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Environment</p>
          <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: data.environment.nodeEnv === 'production' ? 'var(--green)' : 'var(--amber)' }}>
            {data.environment.nodeEnv}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* API Keys Status */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>API Keys Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(data.apiKeys).map(([key, configured]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                <StatusDot ok={configured} />
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: configured ? 'var(--muted)' : 'var(--muted)', flex: 1 }}>{key}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: configured ? 'var(--green)' : 'var(--red)' }}>
                  {configured ? 'Configured' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Environment */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Environment Info</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Node Environment</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>{data.environment.nodeEnv}</span>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>App URL</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>{data.environment.appUrl}</span>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Encryption Key</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot ok={data.environment.hasEncryptionKey} />
                <span style={{ fontSize: 12, color: data.environment.hasEncryptionKey ? 'var(--green)' : 'var(--red)' }}>
                  {data.environment.hasEncryptionKey ? 'Set' : 'Missing'}
                </span>
              </div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Database</span>
              <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', marginTop: 4, wordBreak: 'break-all' }}>{data.database.name}</p>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>PostgreSQL Version</span>
              <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', marginTop: 4 }}>{data.database.version?.split(',')[0]}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Table Sizes */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Table Row Counts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
            {data.tables.map(t => {
              const maxRows = Math.max(...data.tables.map(x => x.row_count), 1);
              const pct = (t.row_count / maxRows) * 100;
              return (
                <div key={t.table_name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.table_name}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: 'var(--primary)', minWidth: t.row_count > 0 ? 2 : 0 }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', width: 60, textAlign: 'right' }}>{t.row_count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Errors */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent API Errors</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {data.recentErrors.map((e, i) => (
              <div key={i} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{e.platform}</span>
                  <span style={{ color: 'var(--muted)' }}>{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.model && <p style={{ color: 'var(--muted)', fontSize: 10 }}>Model: {e.model}</p>}
                {e.error && (
                  <p style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2, wordBreak: 'break-all' }}>{e.error.slice(0, 200)}</p>
                )}
              </div>
            ))}
            {data.recentErrors.length === 0 && <p style={{ fontSize: 12, color: 'var(--green)', textAlign: 'center' }}>No recent errors</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
