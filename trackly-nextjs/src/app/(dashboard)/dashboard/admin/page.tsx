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

/* ─── Design constants ─────────────────────────────────────────── */

interface PlanCfg { color: string; bg: string; border: string; label: string; icon: string }

const PLAN_CFG: Record<string, PlanCfg> = {
  free:    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  border: 'rgba(107,114,128,0.25)', label: 'Free',    icon: '○' },
  trial:   { color: '#d97706', bg: 'rgba(217,119,6,0.1)',    border: 'rgba(217,119,6,0.3)',    label: 'Trial',   icon: '◑' },
  starter: { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',    border: 'rgba(37,99,235,0.3)',    label: 'Starter', icon: '◆' },
  pro:     { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',   border: 'rgba(124,58,237,0.3)',   label: 'Pro',     icon: '★' },
  agency:  { color: '#ea580c', bg: 'rgba(234,88,12,0.1)',    border: 'rgba(234,88,12,0.3)',    label: 'Agency',  icon: '▲' },
  owner:   { color: '#e11d48', bg: 'rgba(225,29,72,0.1)',    border: 'rgba(225,29,72,0.3)',    label: 'Owner',   icon: '♦' },
};
const DEFAULT_CFG: PlanCfg = PLAN_CFG.free;

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#3b82f6,#06b6d4)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#14b8a6,#3b82f6)',
  'linear-gradient(135deg,#f97316,#eab308)',
  'linear-gradient(135deg,#6366f1,#ec4899)',
];

function avatarGrad(str: string): string {
  return AVATAR_GRADIENTS[(str || '?').charCodeAt(0) % AVATAR_GRADIENTS.length];
}

/* ─── Reusable badge components ────────────────────────────────── */

function PlanBadge({ plan }: { plan: string }) {
  const cfg = PLAN_CFG[plan?.toLowerCase()] ?? DEFAULT_CFG;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ fontSize: 9 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function VerifiedBadge({ verified }: { verified?: boolean }) {
  return verified ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      color: '#059669', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.22)',
    }}>✓ Verified</span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      color: '#dc2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
    }}>✗ Pending</span>
  );
}

function RoleBadge({ role }: { role?: string }) {
  return role === 'admin' ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: '#e11d48', background: 'rgba(225,29,72,0.1)', border: '1px solid rgba(225,29,72,0.25)',
    }}>⚡ Admin</span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
      color: 'var(--muted)', background: 'var(--bg3)', border: '1px solid var(--border)',
    }}>User</span>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */

const STAT_PLANS = ['free', 'trial', 'starter', 'pro', 'agency', 'owner'] as const;

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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 40px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#e11d48', marginBottom: 8 }}>Access Denied</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Admin panel is only accessible to administrators.</p>
        </div>
      </div>
    );
  }

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

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(99,102,241,0.14),rgba(124,58,237,0.14))',
            border: '1px solid rgba(99,102,241,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>🛡️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.03em' }}>Admin Panel</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 56 }}>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>User management &amp; system overview</p>
          <span style={{
            padding: '2px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
          }}>{total} users</span>
        </div>
      </div>

      {/* ── Total Users featured card ── */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(124,58,237,0.08))',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 10,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(99,102,241,0.08)',
      }}>
        <div style={{ position: 'absolute', top: -36, right: -36, width: 130, height: 130, borderRadius: '50%', background: 'rgba(99,102,241,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -24, right: 80, width: 90, height: 90, borderRadius: '50%', background: 'rgba(124,58,237,0.05)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}>👥</div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.75)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Total Users</p>
            <p style={{ fontSize: 42, fontWeight: 900, color: '#6366f1', fontFamily: 'var(--mono)', margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>{total}</p>
          </div>
        </div>
      </div>

      {/* ── Plan stat cards: 2-col → 3-col → 6-col ── */}
      <div className="ap-plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 28 }}>
        {STAT_PLANS.map(plan => {
          const cfg = PLAN_CFG[plan] ?? DEFAULT_CFG;
          return (
            <div key={plan} style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${cfg.color}`,
              borderRadius: 12, padding: '14px 16px',
              position: 'relative', overflow: 'hidden',
              transition: 'transform .15s, box-shadow .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ position: 'absolute', top: -18, right: -18, width: 56, height: 56, borderRadius: '50%', background: cfg.bg, pointerEvents: 'none' }} />
              <p style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                <span>{cfg.icon}</span>{cfg.label}
              </p>
              <p style={{ fontSize: 30, fontWeight: 900, color: cfg.color, fontFamily: 'var(--mono)', margin: 0, lineHeight: 1, position: 'relative' }}>
                {planCounts[plan] ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Search & Refresh ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted)', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by email, name, or username…"
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            style={{
              width: '100%', height: 48, paddingLeft: 42, paddingRight: 14,
              borderRadius: 10, fontSize: 14, fontFamily: 'var(--font)',
              background: 'var(--bg2)', color: 'var(--text)',
              border: '1px solid var(--border)', outline: 'none',
              boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
        <button
          onClick={fetchUsers}
          style={{
            flexShrink: 0, height: 48, padding: '0 20px', borderRadius: 10,
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)',
            background: 'var(--primary)', color: '#fff', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            whiteSpace: 'nowrap', transition: 'opacity .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Users section ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 14 }}>
          <div style={{ width: 28, height: 28, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.65s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading users…</span>
        </div>
      ) : users.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.45 }}>{search ? '🔍' : '👤'}</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>{search ? 'No users found' : 'No users yet'}</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{search ? `No results match "${search}"` : 'Users will appear here once they sign up.'}</p>
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="ap-table-wrap" style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 16, overflowX: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            {/* Gradient accent bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)', borderRadius: '16px 16px 0 0' }} />
            <table style={{ width: '100%', minWidth: 720, fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.025)', borderBottom: '1px solid var(--border)' }}>
                  {(['User', 'Username', 'Plan', 'Role', 'Verified', 'Joined', 'Actions'] as const).map((h, i) => (
                    <th key={h} style={{ padding: '11px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: i === 6 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const rowBg = idx % 2 === 1 ? 'rgba(0,0,0,0.013)' : 'transparent';
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: '1px solid var(--border)', background: rowBg, transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* User */}
                      <td style={{ padding: '13px 16px', maxWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: avatarGrad(u.name || u.email || '?'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 14, fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          }}>
                            {(u.name || u.email)?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            {u.name && <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>}
                            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Username */}
                      <td style={{ padding: '13px 16px', maxWidth: 160 }}>
                        <span style={{ display: 'block', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.username ? `@${u.username}` : <span style={{ opacity: 0.3 }}>—</span>}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}><PlanBadge plan={u.plan} /></td>
                      <td style={{ padding: '13px 16px' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '13px 16px' }}><VerifiedBadge verified={u.email_verified} /></td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: '2-digit', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setEditingUser(u); setEditPlan(u.plan); }}
                            style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', background: 'transparent', color: 'var(--primary)', border: '1px solid rgba(99,102,241,.3)', cursor: 'pointer', transition: 'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.1)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; }}
                          >Edit</button>
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => deleteUser(u.id, u.email)}
                              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all .15s' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,.35)'; e.currentTarget.style.background = 'rgba(220,38,38,.06)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                            >Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile user cards (< 768px) ── */}
          <div className="ap-mobile-cards">
            {users.map(u => {
              const planColor = PLAN_CFG[u.plan?.toLowerCase()]?.color ?? DEFAULT_CFG.color;
              return (
                <div key={u.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                  <div style={{ height: 3, background: `linear-gradient(90deg,${planColor},transparent)` }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: avatarGrad(u.name || u.email || '?'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, fontWeight: 700, boxShadow: '0 3px 10px rgba(0,0,0,0.15)' }}>
                        {(u.name || u.email)?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {u.name && <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>}
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                      </div>
                      <PlanBadge plan={u.plan} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      <RoleBadge role={u.role} />
                      <VerifiedBadge verified={u.email_verified} />
                      {u.created_at && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setEditingUser(u); setEditPlan(u.plan); }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', background: 'rgba(99,102,241,.08)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,.25)', cursor: 'pointer' }}
                      >Edit</button>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => deleteUser(u.id, u.email)}
                          style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,.3)'; e.currentTarget.style.background = 'rgba(220,38,38,.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                        >Delete</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Pagination ── */}
      {total > LIMIT && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Showing <b style={{ color: 'var(--text)' }}>{offset + 1}–{Math.min(offset + LIMIT, total)}</b> of <b style={{ color: 'var(--text)' }}>{total}</b> users
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
              disabled={offset === 0}
              style={{ padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.45 : 1, transition: 'all .15s' }}
            >← Prev</button>
            <button
              onClick={() => setOffset(o => o + LIMIT)}
              disabled={offset + LIMIT >= total}
              style={{ padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', opacity: offset + LIMIT >= total ? 0.45 : 1, transition: 'all .15s' }}
            >Next →</button>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingUser && (
        <div
          onClick={() => setEditingUser(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.25)', animation: 'apModalIn .2s ease' }}
          >
            <div style={{ height: 3, background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }} />
            <div style={{ padding: '26px 28px 28px' }}>

              {/* User identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, flexShrink: 0, background: avatarGrad(editingUser.name || editingUser.email || '?'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                  {(editingUser.name || editingUser.email)?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {editingUser.name || editingUser.email}
                  </h3>
                  {editingUser.name && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingUser.email}</p>}
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg4)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--muted)'; }}
                >×</button>
              </div>

              {/* Current plan info row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg)', borderRadius: 11, border: '1px solid var(--border)', marginBottom: 20 }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>Current Plan</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {PLAN_CFG[editingUser.plan?.toLowerCase()]?.label ?? editingUser.plan}
                  </p>
                </div>
                <PlanBadge plan={editingUser.plan} />
              </div>

              {/* Visual plan picker */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)' }}>Change Plan</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {(['free', 'starter', 'pro', 'agency'] as const).map(p => {
                    const cfg = PLAN_CFG[p] ?? DEFAULT_CFG;
                    const sel = editPlan === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setEditPlan(p)}
                        style={{
                          padding: '12px 6px', borderRadius: 11, fontFamily: 'var(--font)', cursor: 'pointer', transition: 'all .15s',
                          background: sel ? cfg.bg : 'var(--bg)',
                          color: sel ? cfg.color : 'var(--muted)',
                          border: `1.5px solid ${sel ? cfg.border : 'var(--border)'}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          transform: sel ? 'scale(1.04)' : 'scale(1)',
                          boxShadow: sel ? `0 2px 12px ${cfg.bg}` : 'none',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => updateUser(editingUser.id, { plan: editPlan })}
                  disabled={saving || editPlan === editingUser.plan}
                  style={{
                    flex: 1, padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
                    background: saving || editPlan === editingUser.plan ? 'var(--bg3)' : 'var(--primary)',
                    color: saving || editPlan === editingUser.plan ? 'var(--muted)' : '#fff',
                    border: 'none', cursor: saving || editPlan === editingUser.plan ? 'not-allowed' : 'pointer', transition: 'all .15s',
                  }}
                >{saving ? 'Saving…' : 'Save Changes'}</button>
                <button
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                >Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes apModalIn { from { opacity:0; transform:scale(.95) translateY(12px); } to { opacity:1; transform:none; } }

        /* Plans grid: 2-col → 3-col → 6-col */
        @media (min-width: 640px)  { .ap-plans-grid { grid-template-columns: repeat(3,1fr) !important; } }
        @media (min-width: 1024px) { .ap-plans-grid { grid-template-columns: repeat(6,1fr) !important; } }

        /* Mobile cards: hidden by default, shown < 768px */
        .ap-mobile-cards { display: none; flex-direction: column; gap: 10; }
        @media (max-width: 767px) {
          .ap-table-wrap   { display: none !important; }
          .ap-mobile-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
