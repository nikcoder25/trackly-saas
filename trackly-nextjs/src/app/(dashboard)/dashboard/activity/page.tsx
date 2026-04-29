'use client';

import { useState, useEffect } from 'react';
import { useBrands } from '@/contexts/BrandContext';

interface ActivityLog { id?: string; action: string; timestamp: string; created_at?: string; ip?: string; details?: string; }
interface ApiLog {
  id: string;
  timestamp: string;
  platform: string;
  model: string;
  status: 'ok';
  tokens: number;
  runId: string | null;
  query: string | null;
}
interface ApiLogsResponse {
  logs: ApiLog[];
  totals: { count: number; ok: number; errors: number; tokens: number };
  window: { from: string; to: string; platforms: string[] };
}
interface KeyStatus { platform: string; count: number; }

const ACTION_ICONS: Record<string, string> = { login: '🔑', register: '📝', create_brand: '🏷', run_queries: '▶', update_brand: '⚙', delete_brand: '🗑', change_password: '🔒' };

export default function ActivityPage() {
  const { selectedBrand } = useBrands();
  const brandId = selectedBrand?.id;
  const [tab, setTab] = useState<'activity' | 'api-logs' | 'key-status'>('activity');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [apiTotals, setApiTotals] = useState<ApiLogsResponse['totals']>({ count: 0, ok: 0, errors: 0, tokens: 0 });
  const [keyStatus, setKeyStatus] = useState<KeyStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-runs whenever the user picks a different brand from the Topbar so
  // the API Call Logs reflect the currently-selected brand. Account
  // Activity stays user-scoped (login / register / etc.) — those rows
  // aren't tied to a single brand.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const apiLogsUrl = brandId
      ? `/api/api-logs?brandId=${encodeURIComponent(brandId)}`
      : '/api/api-logs';
    Promise.all([
      fetch('/api/activity-logs', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); }).catch(() => ({ logs: [] })),
      fetch(apiLogsUrl, { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); }).catch(() => ({ logs: [], totals: { count: 0, ok: 0, errors: 0, tokens: 0 } })),
    ]).then(([actData, apiData]) => {
      if (cancelled) return;
      setActivityLogs((actData.logs || []).map((l: Record<string, unknown>) => ({ ...l, timestamp: l.timestamp || l.created_at || '' })));
      setApiLogs(apiData.logs || []);
      setApiTotals(apiData.totals || { count: 0, ok: 0, errors: 0, tokens: 0 });
      setKeyStatus(apiData.keyStatus || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [brandId]);

  const platforms = new Set(apiLogs.map(l => l.platform)).size;

  function formatDate(d: string) {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div className="view-title">Activity &amp; Logs</div>
      <div className="view-sub">Account activity, API call history, and system diagnostics - all in one view.</div>

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
          {/* Stats summary - dollar cost intentionally omitted (#459 scope 2). */}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, fontFamily: 'var(--mono)' }}>
            Window: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{apiTotals.ok} ok</span> · {apiTotals.errors} errors · {platforms} platforms · {apiTotals.tokens.toLocaleString()} tokens
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
                  <th className="th">Tokens</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {apiLogs.length === 0 ? (
                  <tr><td colSpan={6} className="td" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No API calls logged yet.</td></tr>
                ) : apiLogs.map((log) => (
                  <tr key={log.id} className="trow">
                    <td className="td"><span style={{ color: 'var(--primary)', fontFamily: 'var(--mono)', fontSize: 11 }}>▶ {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td className="td">{log.platform}</td>
                    <td className="td" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{log.model || '-'}</td>
                    <td className="td">{log.query || '-'}</td>
                    <td className="td" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{log.tokens.toLocaleString()}</td>
                    <td className="td"><span style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11 }}>{log.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', padding: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            Showing {apiLogs.length} of {apiTotals.count} API calls
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
