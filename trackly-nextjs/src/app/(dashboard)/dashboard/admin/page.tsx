'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/dashboard/Toast';

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
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const { toast } = useToast();
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

  // Check admin access - wait for auth to load before showing access denied
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
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
      if (d.error) { toast(d.error, 'error'); }
      else { setEditingUser(null); fetchUsers(); toast('User updated'); }
    } catch { toast('Failed to update user', 'error'); }
    setSaving(false);
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      const d = await res.json();
      if (d.error) { toast(d.error, 'error'); }
      else { fetchUsers(); toast('User deleted'); }
    } catch { toast('Failed to delete user', 'error'); }
  }

  return (
    <div>
      <h1 className="view-title">Admin Panel</h1>
      <p className="view-sub" style={{ marginBottom: 14 }}>User management and system overview.</p>

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted)', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search by email, name, or username..."
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            style={{ width: '100%', height: 42, paddingLeft: 38, paddingRight: 14, borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,.15)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
        <button onClick={fetchUsers} style={{ flexShrink: 0, height: 42, padding: '0 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'opacity .15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Refresh</button>
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
                  <td className="px-4 py-3 text-[var(--muted)] text-xs font-mono">{u.username ? `@${u.username}` : '-'}</td>
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
                  <td className="px-4 py-3 text-xs text-[var(--muted)]" style={{ whiteSpace: 'nowrap' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setEditingUser(u); setEditPlan(u.plan); }}
                        style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', background: 'rgba(99,102,241,.08)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,.2)', cursor: 'pointer', transition: 'background .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.16)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,.08)')}
                      >Edit</button>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => deleteUser(u.id, u.email)}
                          style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', background: 'rgba(239,68,68,.06)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.2)', cursor: 'pointer', transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.14)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,.06)')}
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
        <div onClick={() => setEditingUser(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 440, padding: '28px 28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', animation: 'modalIn .2s ease' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Edit User</h3>
              <button onClick={() => setEditingUser(null)} style={{ background: 'var(--bg3)', border: 'none', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', transition: 'background .15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg4)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3)')}>×</button>
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Email</label>
                <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>{editingUser.email}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Name</label>
                <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>{editingUser.name || '-'}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Plan</label>
                <select
                  value={editPlan}
                  onChange={e => setEditPlan(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,.15)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {['free', 'starter', 'pro', 'agency'].map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => updateUser(editingUser.id, { plan: editPlan })}
                disabled={saving || editPlan === editingUser.plan}
                style={{ flex: 1, padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: saving || editPlan === editingUser.plan ? 'not-allowed' : 'pointer', opacity: saving || editPlan === editingUser.plan ? 0.5 : 1, transition: 'opacity .15s' }}
              >{saving ? 'Saving...' : 'Save Changes'}</button>
              <button
                onClick={() => setEditingUser(null)}
                style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
