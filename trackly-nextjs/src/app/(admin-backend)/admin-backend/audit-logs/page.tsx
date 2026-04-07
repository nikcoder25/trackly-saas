'use client';

import { useState, useEffect, useCallback } from 'react';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  ip: string;
  created_at: string;
  user_email: string;
  user_name: string;
}

const ACTION_COLORS: Record<string, string> = {
  login: '#22c55e', login_failed: '#ef4444', login_locked: '#ef4444', logout: '#71717a',
  register: '#3b82f6', admin_create_user: '#6366f1', admin_update_user: '#f59e0b',
  admin_delete_user: '#ef4444', plan_change: '#8b5cf6', plan_downgrade: '#f59e0b',
  password_change: '#d97706', password_reset: '#d97706',
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const LIMIT = 50;

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (actionFilter) params.set('action', actionFilter);
    fetch(`/api/admin-backend/audit-logs?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setLogs(d.logs || []);
          setTotal(d.total || 0);
          if (d.actionTypes) setActionTypes(d.actionTypes);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [offset, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', marginBottom: 4 }}>Audit Logs</h1>
        <p style={{ fontSize: 13, color: '#52525b' }}>Complete trail of all security-relevant events across the platform.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setOffset(0); }}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', cursor: 'pointer', minWidth: 200 }}>
          <option value="">All Actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={fetchLogs} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', cursor: 'pointer' }}>
          Refresh
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#52525b', alignSelf: 'center' }}>{total.toLocaleString()} total events</span>
      </div>

      {/* Logs */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#52525b', background: '#0f0f17', borderRadius: 12, border: '1px solid #1e1e2e' }}>
          No audit logs found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {logs.map(log => (
            <div key={log.id}>
              <div
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
              >
                {/* Action badge */}
                <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', color: ACTION_COLORS[log.action] || '#a1a1aa', background: `${ACTION_COLORS[log.action] || '#52525b'}15` }}>
                  {log.action}
                </span>

                {/* User */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: '#fafafa', fontWeight: 500 }}>{log.user_email || log.user_id}</span>
                  {log.target_type && (
                    <span style={{ fontSize: 11, color: '#3f3f46', marginLeft: 8 }}>
                      {log.target_type}{log.target_id ? `:${log.target_id.slice(0, 8)}` : ''}
                    </span>
                  )}
                </div>

                {/* IP */}
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#3f3f46', whiteSpace: 'nowrap' }}>{log.ip || '—'}</span>

                {/* Time */}
                <span style={{ fontSize: 11, color: '#3f3f46', whiteSpace: 'nowrap' }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>

                {/* Expand icon */}
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="#3f3f46" strokeWidth={2}
                  style={{ transform: expandedLog === log.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded details */}
              {expandedLog === log.id && log.details && Object.keys(log.details).length > 0 && (
                <div style={{ margin: '2px 0 4px 24px', padding: '10px 14px', background: '#18181b', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', color: '#71717a', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                  {JSON.stringify(log.details, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: '#52525b' }}>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOffset(o => Math.max(0, o - LIMIT))} disabled={offset === 0}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.4 : 1 }}>Prev</button>
            <button onClick={() => setOffset(o => o + LIMIT)} disabled={offset + LIMIT >= total}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', opacity: offset + LIMIT >= total ? 0.4 : 1 }}>Next</button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
