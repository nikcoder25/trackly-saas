'use client';

import { useState, useEffect } from 'react';

interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  ip: string;
}

interface ApiLog {
  id: string;
  timestamp: string;
  platform: string;
  model: string;
  status: string;
  tokens: number;
  cost: number;
}

interface ApiKeyStatus {
  platform: string;
  configured: boolean;
  last_used?: string;
}

type Tab = 'activity' | 'api-logs' | 'api-keys';

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>('activity');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/activity-logs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ logs: [] })),
      fetch('/api/api-logs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ logs: [], api_keys: [] })),
    ]).then(([actData, apiData]) => {
      setActivityLogs(actData.logs || []);
      setApiLogs(apiData.logs || []);
      setApiKeys(apiData.api_keys || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'activity', label: 'Account Activity' },
    { key: 'api-logs', label: 'API Call Logs' },
    { key: 'api-keys', label: 'API Key Status' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Activity & Logs</h1>
      <p className="text-[var(--muted)] mb-6">Account activity, API call history, and system diagnostics — all in one view.</p>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg3)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Account Activity */}
      {tab === 'activity' && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Account Activity</p>
          {activityLogs.length === 0 ? (
            <p className="text-[var(--muted)] text-sm text-center py-6">No account activity recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {activityLogs.map((log, i) => (
                <div key={log.id || i} className="flex items-center justify-between bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs text-[var(--muted)] shrink-0 w-36">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="text-sm text-[var(--text)] truncate" title={log.action}>{log.action}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)] shrink-0 ml-4 font-mono">{log.ip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: API Call Logs */}
      {tab === 'api-logs' && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] overflow-hidden">
          <div className="p-5 pb-3">
            <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">API Call Logs</p>
          </div>
          {apiLogs.length === 0 ? (
            <p className="text-[var(--muted)] text-sm text-center py-6">No API calls logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Platform</th>
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Model</th>
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Tokens</th>
                    <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {apiLogs.map((log, i) => (
                    <tr key={log.id || i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)]">
                      <td className="px-4 py-2.5 text-[var(--muted)] text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-[var(--text)] font-medium">{log.platform}</td>
                      <td className="px-4 py-2.5 text-[var(--muted)]">{log.model}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 rounded-full ${log.status === 'success' ? 'bg-green-100 text-[var(--green)]' : log.status === 'error' ? 'bg-red-100 text-[var(--red)]' : 'bg-amber-100 text-[var(--amber)]'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--muted)]">{log.tokens.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-[var(--text)] font-medium">${log.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: API Key Status */}
      {tab === 'api-keys' && (
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-4">API Key Status</p>
          {apiKeys.length === 0 ? (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
              <p className="text-[var(--muted)] text-sm text-center py-6">No API key information available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apiKeys.map((key, i) => (
                <div key={i} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[var(--text)]">{key.platform}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${key.configured ? 'bg-green-100 text-[var(--green)]' : 'bg-red-100 text-[var(--red)]'}`}>
                      {key.configured ? 'Configured' : 'Missing'}
                    </span>
                  </div>
                  {key.last_used && (
                    <p className="text-xs text-[var(--muted)]">Last used: {new Date(key.last_used).toLocaleDateString()}</p>
                  )}
                  {!key.configured && (
                    <p className="text-xs text-[var(--muted)] mt-1">Add your API key in Settings to enable this platform.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
