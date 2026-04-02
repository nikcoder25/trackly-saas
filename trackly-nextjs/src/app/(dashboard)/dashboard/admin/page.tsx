'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AdminUser {
  id: string;
  email: string;
  username?: string;
  name?: string;
  plan: string;
  role?: string;
  email_verified?: boolean;
  created_at?: string;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'var(--muted)',
  starter: 'var(--primary)',
  pro: 'var(--primary)',
  agency: 'var(--purple)',
};

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const [adminMsg, setAdminMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const LIMIT = 50;

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (search) params.set('search', search);
    fetch(`/api/admin/users?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setUsers([]); setTotal(0); }
        else { setUsers(d.users || []); setTotal(d.total || 0); }
        setLoading(false);
      })
      .catch(() => { setUsers([]); setLoading(false); });
  }, [search, offset]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Check admin access
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center max-w-md">
          <p className="text-lg font-semibold text-[var(--red)] mb-2">Access Denied</p>
          <p className="text-sm text-[var(--muted)]">Admin panel is only accessible to administrators.</p>
        </div>
      </div>
    );
  }

  // Plan stats
  const planCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.plan] = (acc[u.plan] || 0) + 1;
    return acc;
  }, {});

  async function updateUser(userId: string, data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (d.error) { setAdminMsg({ type: 'error', text: d.error }); }
      else { setEditingUser(null); fetchUsers(); setAdminMsg({ type: 'success', text: 'User updated' }); }
    } catch { setAdminMsg({ type: 'error', text: 'Failed to update user' }); }
    setSaving(false);
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      const d = await res.json();
      if (d.error) { setAdminMsg({ type: 'error', text: d.error }); }
      else { fetchUsers(); setAdminMsg({ type: 'success', text: 'User deleted' }); }
    } catch { setAdminMsg({ type: 'error', text: 'Failed to delete user' }); }
  }

  return (
    <div>
      <h1 className="view-title">Admin Panel</h1>
      <p className="view-sub" style={{ marginBottom: 14 }}>User management and system overview.</p>

      {adminMsg && (
        <div style={{
          background: adminMsg.type === 'error' ? 'var(--danger-light)' : 'var(--success-light)',
          border: `1px solid ${adminMsg.type === 'error' ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.2)'}`,
          color: adminMsg.type === 'error' ? 'var(--danger)' : 'var(--success)',
          padding: '10px 14px', fontSize: 13, borderRadius: 'var(--radius-xs)', marginBottom: 14,
        }}>
          {adminMsg.text}
          <button onClick={() => setAdminMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>&times;</button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Total Users</p>
          <p className="text-2xl font-extrabold font-mono text-[var(--text)]">{total}</p>
        </div>
        {['free', 'starter', 'pro', 'agency', 'owner'].map(plan => (
          <div key={plan} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">{plan}</p>
            <p className="text-2xl font-extrabold font-mono" style={{ color: PLAN_COLORS[plan] }}>{planCounts[plan] || 0}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search by email, name, or username..."
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            className="w-full h-11 pl-9 pr-3 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition"
            style={{ fontFamily: 'var(--font)' }}
          />
        </div>
        <button onClick={fetchUsers} className="shrink-0 h-11 px-5 rounded-lg text-sm font-semibold bg-[var(--primary)] text-white border-none cursor-pointer whitespace-nowrap hover:opacity-90 transition" style={{ fontFamily: 'var(--font)' }}>Refresh</button>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">{search ? 'No users match your search.' : 'No users found.'}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--app-shadow)' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Name / Email</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Username</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Plan</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Role</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Verified</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Joined</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(u.name || u.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        {u.name && <p className="text-[var(--text)] font-medium text-xs">{u.name}</p>}
                        <p className="text-[var(--muted)] text-xs">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs font-mono">{u.username ? `@${u.username}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ color: PLAN_COLORS[u.plan] || 'var(--muted)', background: `color-mix(in srgb, ${PLAN_COLORS[u.plan] || 'gray'} 10%, transparent)` }}>
                      {u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[rgba(239,68,68,0.1)] text-[var(--red)]">Admin</span>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">User</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.email_verified ? (
                      <span className="text-[var(--green)] text-xs">✓ Verified</span>
                    ) : (
                      <span className="text-[var(--amber)] text-xs">✗ Unverified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]" style={{ whiteSpace: 'nowrap' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingUser(u); setEditPlan(u.plan); }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] transition"
                      >Edit</button>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => deleteUser(u.id, u.email)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap bg-[rgba(239,68,68,0.08)] text-[var(--red)] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.15)] transition"
                        >Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-[var(--muted)]">Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)] disabled:opacity-40 transition"
            >Previous</button>
            <button
              onClick={() => setOffset(o => o + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)] disabled:opacity-40 transition"
            >Next</button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingUser(null)}>
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--text)]">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-[var(--muted)] hover:text-[var(--text)] text-lg">&times;</button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Email</label>
                <p className="text-sm text-[var(--text)]">{editingUser.email}</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Name</label>
                <p className="text-sm text-[var(--text)]">{editingUser.name || '—'}</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block mb-1">Plan</label>
                <select
                  value={editPlan}
                  onChange={e => setEditPlan(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] outline-none"
                >
                  {['free', 'starter', 'pro', 'agency'].map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => updateUser(editingUser.id, { plan: editPlan })}
                disabled={saving || editPlan === editingUser.plan}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition disabled:opacity-50"
              >{saving ? 'Saving...' : 'Save Changes'}</button>
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--text)] transition"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
