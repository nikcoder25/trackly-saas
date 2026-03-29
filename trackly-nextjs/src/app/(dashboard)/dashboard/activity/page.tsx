'use client';

import { useState, useEffect } from 'react';

interface ActivityLog { id?: string; action: string; timestamp: string; created_at?: string; ip?: string; details?: string; }
interface ApiLog { id?: string; timestamp: string; platform: string; model?: string; query?: string; status: string; tokens?: number; cost?: number; duration?: number; run_id?: string; calls?: number; platforms_used?: string; }
interface KeyStatus { platform: string; count: number; }

const ACTION_ICONS: Record<string, string> = { login: '🔑', register: '📝', create_brand: '🏷', run_queries: '▶', update_brand: '⚙', delete_brand: '🗑', change_password: '🔒' };

export default function ActivityPage() {
  const [tab, setTab] = useState<'activity' | 'api-logs' | 'key-status'>('activity');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [keyStatus, setKeyStatus] = useState<KeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/activity-logs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ logs: [] })),
      fetch('/api/api-logs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ logs: [], errors: 0 })),
    ]).then(([actData, apiData]) => {
      setActivityLogs((actData.logs || []).map((l: Record<string, unknown>) => ({ ...l, timestamp: l.timestamp || l.created_at || '' })));
      setApiLogs(apiData.logs || []);
      setKeyStatus(apiData.keyStatus || []);
      if (apiData.recentErrors > 0) setErrorBanner(`${apiData.recentErrors} recent run failures — check console for details`);
      setLoading(false);
    });
  }, []);

  // API log stats
  const okCount = apiLogs.filter(l => l.status === 'ok' || l.status === 'success').length;
  const errCount = apiLogs.filter(l => l.status === 'error').length;
  const totalCost = apiLogs.reduce((s, l) => s + (l.cost || 0), 0);
  const totalTokens = apiLogs.reduce((s, l) => s + (l.tokens || 0), 0);
  const avgMs = apiLogs.length > 0 ? Math.round(apiLogs.reduce((s, l) => s + (l.duration || 0), 0) / apiLogs.length) : 0;
  const platforms = new Set(apiLogs.map(l => l.platform)).size;

  function formatDate(d: string) {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div className="view-title">Activity &amp; Logs</div>
      <div className="view-sub">Account activity, API call history, and system diagnostics — all in one view.</div>

      {/* Tab Buttons */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'activity', label: 'Account Activity' },
          { key: 'api-logs', label: 'API Call Logs' },
          { key: 'key-status', label: 'API Key Status' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className="tab-btn" style={{
              padding: '10px 20px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--muted)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: -2,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Account Activity */}
      {tab === 'activity' && (
        <div className="card" style={{ padding: '20px 24px' }}>
          {activityLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>No account activity recorded yet.</div>
          ) : (
            <div>
              {activityLogs.map((log, i) => (
                <div key={log.id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < activityLogs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 20 }}>{ACTION_ICONS[log.action] || '📋'}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{log.action.charAt(0).toUpperCase() + log.action.slice(1).replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 12 }}>{formatDate(log.timestamp)}</span>
                  </div>
                  {log.ip && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>IP: {log.ip}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: API Call Logs */}
      {tab === 'api-logs' && (
        <div>
          {/* Error banner */}
          {errorBanner && (
            <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 'var(--radius-xs)', padding: '12px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--amber)' }}><strong style={{ color: 'var(--red)' }}>{errorBanner.split(' ')[0]}</strong> {errorBanner.split(' ').slice(1).join(' ')}</span>
              <button onClick={() => setErrorBanner('')} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, padding: '4px 12px', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>DISMISS</button>
            </div>
          )}

          {/* Stats summary */}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, fontFamily: 'var(--mono)' }}>
            Last 24h: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{okCount} ok</span> · {errCount} errors · {platforms} platforms · avg {avgMs}ms · <span style={{ color: 'var(--amber)' }}>${totalCost.toFixed(4)}</span> cost · {totalTokens} tokens
          </div>

          {/* API logs table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  <th className="th">Time</th>
                  <th className="th">Platform</th>
                  <th className="th">Model</th>
                  <th className="th">Query</th>
                  <th className="th">Status</th>
                  <th className="th">Time</th>
                  <th className="th">Cost</th>
                </tr>
              </thead>
              <tbody>
                {apiLogs.length === 0 ? (
                  <tr><td colSpan={7} className="td" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No API calls logged yet.</td></tr>
                ) : apiLogs.map((log, i) => {
                  const isRun = log.calls && log.calls > 1;
                  return (
                    <tr key={log.id || i} className="trow" style={isRun ? { background: 'rgba(59,130,246,.03)' } : {}}>
                      <td className="td"><span style={{ color: 'var(--primary)', fontFamily: 'var(--mono)', fontSize: 11 }}>▶ {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></td>
                      <td className="td" style={{ fontWeight: isRun ? 700 : 400 }}>{isRun ? `${log.calls} calls · ${log.platforms_used || platforms} platforms` : log.platform}</td>
                      <td className="td" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{isRun ? (log.platforms_used || '') : (log.model || '—')}</td>
                      <td className="td">{log.query || (isRun ? `${log.calls} ok` : '—')}</td>
                      <td className="td"><span style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11 }}>{typeof log.status === 'number' ? log.status : (log.status === 'ok' || log.status === 'success' ? okCount : log.status)}</span></td>
                      <td className="td" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{log.duration ? (log.duration >= 60000 ? `${Math.floor(log.duration / 60000)}m ${Math.round((log.duration % 60000) / 1000)}s` : `${Math.round(log.duration / 1000)}s`) : '—'}</td>
                      <td className="td" style={{ color: 'var(--amber)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11 }}>{log.cost ? `$${log.cost.toFixed(3)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', padding: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            Showing {apiLogs.length} of {apiLogs.length} API calls
          </div>
        </div>
      )}

      {/* Tab: API Key Status */}
      {tab === 'key-status' && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-title">API Key Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(keyStatus.length > 0 ? keyStatus : [
              { platform: 'openai', count: 0 }, { platform: 'perplexity', count: 0 },
              { platform: 'gemini', count: 0 }, { platform: 'claude', count: 0 }, { platform: 'grok', count: 0 }
            ]).map(k => (
              <div key={k.platform} style={{ padding: '16px 24px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', minWidth: 120 }}>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: k.count > 0 ? 'var(--green)' : 'var(--muted)' }}>{k.count}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{k.platform} keys</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
