'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Username updated!');
      refreshUser();
    } catch (e) {
      setMessage((e as Error).message);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Account</h1>
      <p className="text-[var(--text-muted)] mb-6">Manage your account settings</p>

      {/* Profile */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Email</span>
            <span className="text-white">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Name</span>
            <span className="text-white">{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Plan</span>
            <span className="text-white capitalize">{user?.plan}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">2FA</span>
            <span className={user?.totpEnabled ? 'text-green-400' : 'text-[var(--text-muted)]'}>
              {user?.totpEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Username */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Username</h2>
        <form onSubmit={handleSaveUsername} className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[var(--primary)]"
            placeholder="your-username"
          />
          <button type="submit" disabled={saving}
            className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
        {message && <p className="text-xs text-[var(--text-muted)] mt-2">{message}</p>}
      </div>
    </div>
  );
}
