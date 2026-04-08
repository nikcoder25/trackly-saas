'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/dashboard/Toast';

interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  plan: string;
  role?: string;
  email_verified?: boolean;
  created_at?: string;
  subscription_id?: string;
  brand_count: number;
  total_queries: number;
}

interface UserDetail {
  user: User & {
    totp_enabled: boolean;
    has_google: boolean;
    brands: Array<{ id: string; name: string; created_at: string }> | null;
    total_cost: string;
  };
  recentActivity: Array<{ action: string; target_type: string; details: Record<string, unknown>; ip: string; created_at: string }>;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'var(--muted)', starter: '#3b82f6', pro: 'var(--primary)', agency: 'var(--purple)', enterprise: 'var(--amber)', owner: 'var(--red)',
};

const PLANS = ['free', 'starter', 'pro', 'agency', 'enterprise', 'owner'];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [editModal, setEditModal] = useState<User | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [editForm, setEditForm] = useState({ plan: '', name: '', email: '', email_verified: false, password: '' });
  const [createForm, setCreateForm] = useState({ email: '', password: '', name: '', plan: 'free' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const LIMIT = 50;

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (search) params.set('search', search);
    if (planFilter) params.set('plan', planFilter);
    fetch(`/api/admin-backend/users?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setUsers([]); setTotal(0); }
        else { setUsers(d.users || []); setTotal(d.total || 0); }
        setLoading(false);
      })
      .catch(() => { setUsers([]); setLoading(false); });
  }, [search, planFilter, offset]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function viewUser(id: string) {
    try {
      const res = await fetch(`/api/admin-backend/users/${id}`, { credentials: 'include' });
      const d = await res.json();
      if (!d.error) setSelectedUser(d);
    } catch { toast('Failed to load user details', 'error'); }
  }

  function openEdit(u: User) {
    setEditForm({ plan: u.plan, name: u.name || '', email: u.email, email_verified: u.email_verified || false, password: '' });
    setEditModal(u);
  }

  async function saveEdit() {
    if (!editModal) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { plan: editForm.plan, name: editForm.name, email: editForm.email, email_verified: editForm.email_verified };
      if (editForm.password) body.password = editForm.password;
      const res = await fetch(`/api/admin-backend/users/${editModal.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.error) toast(d.error, 'error');
      else { toast('User updated'); setEditModal(null); fetchUsers(); }
    } catch { toast('Failed to update', 'error'); }
    setSaving(false);
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This permanently removes all their data.`)) return;
    try {
      const res = await fetch(`/api/admin-backend/users/${id}`, { method: 'DELETE', credentials: 'include' });
      const d = await res.json();
      if (d.error) toast(d.error, 'error');
      else { toast('User deleted'); fetchUsers(); setSelectedUser(null); }
    } catch { toast('Failed to delete', 'error'); }
  }

  async function createUser() {
    if (!createForm.email || !createForm.password) { toast('Email and password required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin-backend/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(createForm),
      });
      const d = await res.json();
      if (d.error) toast(d.error, 'error');
      else { toast('User created'); setCreateModal(false); setCreateForm({ email: '', password: '', name: '', plan: 'free' }); fetchUsers(); }
    } catch { toast('Failed to create', 'error'); }
    setSaving(false);
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'system-ui', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700 as const, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 6 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>User Management</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Manage all registered users, their plans, and account details.</p>
        </div>
        <button onClick={() => setCreateModal(true)} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
          + Create User
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--muted)', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search by email, name, or username..." value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            style={{ ...inputStyle, paddingLeft: 36 }}
            aria-label="Search users"
          />
        </div>
        <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setOffset(0); }}
          style={{ ...inputStyle, width: 140, cursor: 'pointer' }} aria-label="Filter by plan">
          <option value="">All Plans</option>
          {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        <button onClick={fetchUsers} style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{total}</strong></span>
        {PLANS.map(p => {
          const count = users.filter(u => u.plan === p).length;
          return count > 0 ? (
            <span key={p} style={{ fontSize: 12, color: PLAN_COLORS[p] }}>{p}: <strong>{count}</strong></span>
          ) : null;
        })}
      </div>

      {/* Users Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          {search || planFilter ? 'No users match your filters.' : 'No users found.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['User', 'Plan', 'Role', 'Brands', 'Queries', 'Verified', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(30,30,46,.5)', cursor: 'pointer' }}
                  onClick={() => viewUser(u.id)}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: PLAN_COLORS[u.plan], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                        {(u.name || u.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        {u.name && <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{u.name}</p>}
                        <p style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: PLAN_COLORS[u.plan], background: `${PLAN_COLORS[u.plan]}15` }}>
                      {u.plan}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {u.role === 'admin' ? (
                      <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,.06)', color: 'var(--red)' }}>Admin</span>
                    ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>User</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{u.brand_count}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{u.total_queries}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {u.email_verified ? <span style={{ color: 'var(--green)', fontSize: 12 }}>Yes</span> : <span style={{ color: 'var(--amber)', fontSize: 12 }}>No</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: '2-digit', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(u)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,.08)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,.2)', cursor: 'pointer' }}>Edit</button>
                      {u.role !== 'admin' && (
                        <button onClick={() => deleteUser(u.id, u.email)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,.06)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.2)', cursor: 'pointer' }}>Delete</button>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOffset(o => Math.max(0, o - LIMIT))} disabled={offset === 0}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.4 : 1 }}>Prev</button>
            <button onClick={() => setOffset(o => o + LIMIT)} disabled={offset + LIMIT >= total}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', opacity: offset + LIMIT >= total ? 0.4 : 1 }}>Next</button>
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <div onClick={() => setSelectedUser(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '90vw', height: '100vh', overflowY: 'auto', background: 'var(--bg2)', borderLeft: '1px solid var(--border)', padding: 24, animation: 'slideIn .2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>User Details</h3>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'var(--bg3)', border: 'none', width: 28, height: 28, borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Email</label><p style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>{selectedUser.user.email}</p></div>
                <div><label style={labelStyle}>Name</label><p style={{ fontSize: 13, color: 'var(--text)' }}>{selectedUser.user.name || '—'}</p></div>
                <div><label style={labelStyle}>Plan</label><p style={{ fontSize: 13, color: PLAN_COLORS[selectedUser.user.plan], fontWeight: 600, textTransform: 'capitalize' }}>{selectedUser.user.plan}</p></div>
                <div><label style={labelStyle}>Role</label><p style={{ fontSize: 13, color: 'var(--text)' }}>{selectedUser.user.role || 'user'}</p></div>
                <div><label style={labelStyle}>Brands</label><p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>{selectedUser.user.brand_count}</p></div>
                <div><label style={labelStyle}>Total Queries</label><p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>{selectedUser.user.total_queries}</p></div>
                <div><label style={labelStyle}>Total Cost</label><p style={{ fontSize: 13, color: 'var(--amber)', fontFamily: 'monospace' }}>${Number(selectedUser.user.total_cost).toFixed(4)}</p></div>
                <div><label style={labelStyle}>Verified</label><p style={{ fontSize: 13, color: selectedUser.user.email_verified ? 'var(--green)' : 'var(--amber)' }}>{selectedUser.user.email_verified ? 'Yes' : 'No'}</p></div>
                <div><label style={labelStyle}>2FA</label><p style={{ fontSize: 13, color: selectedUser.user.totp_enabled ? 'var(--green)' : 'var(--muted)' }}>{selectedUser.user.totp_enabled ? 'Enabled' : 'Off'}</p></div>
                <div><label style={labelStyle}>Google</label><p style={{ fontSize: 13, color: selectedUser.user.has_google ? '#3b82f6' : 'var(--muted)' }}>{selectedUser.user.has_google ? 'Linked' : 'No'}</p></div>
              </div>

              {selectedUser.user.brands && selectedUser.user.brands.length > 0 && (
                <div>
                  <label style={labelStyle}>Brands</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedUser.user.brands.map(b => (
                      <div key={b.id} style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
                        {b.name || 'Unnamed'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedUser.recentActivity.length > 0 && (
                <div>
                  <label style={labelStyle}>Recent Activity</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                    {selectedUser.recentActivity.map((a, i) => (
                      <div key={i} style={{ padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>{a.action}</span>
                        <span>{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div onClick={() => setEditModal(null)} onKeyDown={e => { if (e.key === 'Escape') setEditModal(null); }} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
          <div role="dialog" aria-modal="true" aria-label="Edit user" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 28, animation: 'modalIn .2s ease' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Edit User</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Email</label><input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Name</label><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Plan</label>
                <select value={editForm.plan} onChange={e => setEditForm({ ...editForm, plan: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>New Password (leave blank to keep)</label><input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="••••••••" style={inputStyle} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="verified" checked={editForm.email_verified} onChange={e => setEditForm({ ...editForm, email_verified: e.target.checked })} />
                <label htmlFor="verified" style={{ fontSize: 12, color: 'var(--muted)' }}>Email Verified</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: 'var(--text)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditModal(null)} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createModal && (
        <div onClick={() => setCreateModal(false)} onKeyDown={e => { if (e.key === 'Escape') setCreateModal(false); }} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
          <div role="dialog" aria-modal="true" aria-label="Create new user" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 28, animation: 'modalIn .2s ease' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Create New User</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Email *</label><input value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} style={inputStyle} placeholder="user@example.com" /></div>
              <div><label style={labelStyle}>Password *</label><input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} style={inputStyle} placeholder="Strong password" /></div>
              <div><label style={labelStyle}>Name</label><input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} style={inputStyle} placeholder="Full name" /></div>
              <div><label style={labelStyle}>Plan</label>
                <select value={createForm.plan} onChange={e => setCreateForm({ ...createForm, plan: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={createUser} disabled={saving} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--green)', color: 'var(--text)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
              <button onClick={() => setCreateModal(false)} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes modalIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
