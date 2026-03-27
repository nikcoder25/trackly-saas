'use client';

import { useState, useEffect } from 'react';

interface Member { id: string; name: string; email: string; role: string; }

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/team', { credentials: 'include' })
      .then(r => r.json()).then(d => { setMembers(d.members || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/team', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send invite');
      if (d.member) setMembers(prev => [...prev, d.member]);
      setInviteEmail(''); setInviteRole('viewer'); setShowInvite(false);
      setSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) {
      setError((e as Error).message);
    }
    setInviting(false);
  };

  const handleRemove = async (memberId: string, email: string) => {
    if (!confirm(`Remove ${email} from the team?`)) return;
    setError('');
    try {
      const res = await fetch(`/api/team/${memberId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to remove member');
      }
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setSuccess(`${email} removed from team`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const roleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 'bg-[var(--primary-light)] text-[var(--primary)]';
      case 'editor': return 'bg-[rgba(245,158,11,.08)] text-[var(--amber)]';
      default: return 'bg-[var(--bg3)] text-[var(--muted)]';
    }
  };

  return (
    <div>
      <h1 className="view-title">Team Members</h1>
      <p className="view-sub" style={{ marginBottom: 14 }}>Manage who has access to your workspace.</p>

      {error && (
        <div style={{ background: 'var(--danger-light)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--danger)', padding: '10px 14px', fontSize: 13, borderRadius: 'var(--radius-xs)', marginBottom: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--success-light)', border: '1px solid rgba(16,185,129,.2)', color: 'var(--success)', padding: '10px 14px', fontSize: 13, borderRadius: 'var(--radius-xs)', marginBottom: 14 }}>
          {success}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Members</div>
          <button onClick={() => setShowInvite(!showInvite)} className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }}>
            + Invite
          </button>
        </div>

        {showInvite && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="finp"
              style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-xs)', padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)', outline: 'none' }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviting}
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 16px', fontSize: 12, opacity: (!inviteEmail.trim() || inviting) ? 0.5 : 1 }}
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        )}

        {members.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No team members yet. Invite someone to get started.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                    {(m.name || m.email).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{m.name || 'Invited User'}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{m.email}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${roleBadgeClass(m.role)}`}>{m.role}</span>
                  {m.role.toLowerCase() !== 'owner' && (
                    <button onClick={() => handleRemove(m.id, m.email)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }} title="Remove member">&times;</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
