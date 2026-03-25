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

  useEffect(() => {
    fetch('/api/team', { credentials: 'include' })
      .then(r => r.json()).then(d => { setMembers(d.members || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    fetch('/api/team', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    }).then(r => r.json()).then(d => {
      if (d.member) setMembers(prev => [...prev, d.member]);
      setInviteEmail(''); setInviteRole('viewer'); setShowInvite(false); setInviting(false);
    }).catch(() => setInviting(false));
  };

  const handleRemove = (memberId: string) => {
    fetch(`/api/team/${memberId}`, { method: 'DELETE', credentials: 'include' })
      .then(() => setMembers(prev => prev.filter(m => m.id !== memberId)))
      .catch(() => {});
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const roleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 'bg-[var(--primary-light)] text-[var(--primary)]';
      case 'editor': return 'bg-amber-100 text-[var(--amber)]';
      default: return 'bg-[var(--bg3)] text-[var(--muted)]';
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Team Members</h1>
      <p className="text-[var(--muted)] mb-6">Manage who has access to your workspace.</p>

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Members</p>
          <button onClick={() => setShowInvite(!showInvite)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity">
            + Invite
          </button>
        </div>

        {/* Invite Form */}
        {showInvite && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4 pb-4 border-b border-[var(--border)]">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-3 py-2 outline-none focus:border-[var(--primary)]"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        )}

        {/* Members List */}
        {members.length === 0 ? (
          <p className="text-[var(--muted)] text-sm text-center py-6">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--bg3)] flex items-center justify-center text-sm font-bold text-[var(--text)]">
                    {(m.name || m.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{m.name || 'Invited User'}</p>
                    <p className="text-xs text-[var(--muted)] truncate">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${roleBadgeClass(m.role)}`}>{m.role}</span>
                  {m.role.toLowerCase() !== 'owner' && (
                    <button onClick={() => handleRemove(m.id)} className="text-[var(--muted)] hover:text-[var(--red)] text-sm transition-colors" title="Remove member">&times;</button>
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
