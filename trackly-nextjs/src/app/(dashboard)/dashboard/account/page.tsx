'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, refreshUser, logout } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [editingUsername, setEditingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [twoFAStatus, setTwoFAStatus] = useState<{ enabled: boolean } | null>(null);
  const [twoFASetup, setTwoFASetup] = useState<{ qr?: string; secret?: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFADisablePw, setTwoFADisablePw] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [billingHistory, setBillingHistory] = useState<Array<{ date: string; amount: string; plan: string; status: string }>>([]);
  const [subDetails, setSubDetails] = useState<{ status?: string; next_billing?: string; plan?: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/2fa/status', { credentials: 'include' }).then(r => r.json()).then(d => setTwoFAStatus(d)).catch(() => {});
    fetch('/api/payments/subscription', { credentials: 'include' }).then(r => r.json()).then(d => setSubDetails(d)).catch(() => {});
    fetch('/api/payments/history', { credentials: 'include' }).then(r => r.json()).then(d => setBillingHistory(d.history || [])).catch(() => {});
  }, []);

  const saveUsername = async () => {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/auth/username', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Username updated!'); setEditingUsername(false); refreshUser();
    } catch (e) { setMessage((e as Error).message); }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwMsg('');
    if (pwNew !== pwConfirm) { setPwMsg('Passwords do not match'); return; }
    if (pwNew.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwMsg('Password updated!'); setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (e) { setPwMsg((e as Error).message); }
  };

  const setup2FA = async () => {
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFASetup({ qr: data.qrCode, secret: data.secret });
    } catch (e) { alert((e as Error).message); }
  };

  const verify2FA = async () => {
    try {
      const res = await fetch('/api/auth/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token: twoFACode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes || []);
      setTwoFAStatus({ enabled: true }); setTwoFASetup(null); setTwoFACode(''); refreshUser();
    } catch (e) { alert((e as Error).message); }
  };

  const disable2FA = async () => {
    try {
      const res = await fetch('/api/auth/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ password: twoFADisablePw }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFAStatus({ enabled: false }); setTwoFADisablePw(''); refreshUser();
    } catch (e) { alert((e as Error).message); }
  };

  const cancelSubscription = async () => {
    if (!confirm('Cancel your subscription? You will lose access to paid features at the end of the billing period.')) return;
    try {
      const res = await fetch('/api/payments/cancel', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Subscription cancelled'); refreshUser();
    } catch (e) { alert((e as Error).message); }
  };

  const deleteAccount = async () => {
    if (!confirm('PERMANENTLY delete your account? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? All data will be lost.')) return;
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      logout();
    } catch (e) { alert((e as Error).message); }
  };

  const exportData = async (format: string) => {
    try {
      const brandsRes = await fetch('/api/brands', { credentials: 'include' });
      const brandsData = await brandsRes.json();
      const brand = brandsData.brands?.[0];
      if (!brand) { alert('No brands to export'); return; }
      const res = await fetch(`/api/export/brand/${brand.id}`, { credentials: 'include' });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `brand-export.${format}`; a.click();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">Account & Plan</h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">Manage your account and subscription.</p>

      {/* Account Info */}
      <Card title="Account Info">
        <div className="font-mono text-xs leading-[2.2]">
          <div>Email: <strong>{user?.email}</strong> {user?.emailVerified ? <span className="text-[var(--green)] text-[10px]">VERIFIED</span> : <span className="text-[var(--amber)] text-[10px]">UNVERIFIED</span>}</div>
          <div className="flex items-center gap-2">
            Username: {editingUsername ? (
              <><input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && saveUsername()} className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-2 py-0.5 text-xs rounded w-[180px]" />
                <button onClick={saveUsername} className="text-[9px] font-bold text-[var(--primary)]">{saving ? '...' : 'SAVE'}</button>
                <button onClick={() => setEditingUsername(false)} className="text-[9px] text-[var(--muted)]">CANCEL</button></>
            ) : (
              <><strong className="text-[var(--primary)]">{user?.username || '\u2014'}</strong>
                <button onClick={() => setEditingUsername(true)} className="px-2 py-0.5 border border-[var(--border)] text-[var(--muted)] text-[9px] rounded-md">EDIT</button></>
            )}
          </div>
          {message && <div className="text-[var(--green)] text-[10px]">{message}</div>}
          <div>Plan: <strong className="uppercase">{user?.plan || 'free'}</strong> {subDetails?.status && <span className="text-[10px] text-[var(--muted)]">({subDetails.status})</span>}</div>
          <div>Member since: <span className="text-[var(--muted)]">{user?.createdAt ? new Date(user.createdAt as string).toLocaleDateString() : '\u2014'}</span></div>
        </div>
        {user?.plan && user.plan !== 'free' && (
          <div className="mt-3"><button onClick={cancelSubscription} className="px-3.5 py-1.5 border border-[var(--red)] text-[var(--red)] text-[10px] font-mono font-bold rounded-md">CANCEL SUBSCRIPTION</button></div>
        )}
        {subDetails?.next_billing && (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] text-[11px] font-mono text-[var(--muted)]">Next billing: {subDetails.next_billing}</div>
        )}
      </Card>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <Card title="Billing History" extra={<a href="https://customer.dodopayments.com/" target="_blank" rel="noopener" className="text-[10px] font-mono text-[var(--primary)]">MANAGE BILLING &rarr;</a>}>
          <div className="space-y-1.5 text-[11px] font-mono text-[var(--muted)]">
            {billingHistory.map((h, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-[var(--border)] last:border-0">
                <span>{h.date}</span><span>{h.plan}</span><span>{h.amount}</span><span className={h.status === 'paid' ? 'text-[var(--green)]' : 'text-[var(--amber)]'}>{h.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Two-Factor Authentication */}
      <Card title="Two-Factor Authentication">
        <div className="text-xs font-mono text-[var(--muted)] mb-3">
          Status: {twoFAStatus?.enabled ? <span className="text-[var(--green)] font-bold">ENABLED</span> : <span className="text-[var(--muted)]">DISABLED</span>}
        </div>
        {!twoFAStatus?.enabled && !twoFASetup && (
          <button onClick={setup2FA} className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md">ENABLE 2FA</button>
        )}
        {twoFASetup && (
          <div className="space-y-3">
            {twoFASetup.qr && <div dangerouslySetInnerHTML={{ __html: twoFASetup.qr }} />}
            {twoFASetup.secret && <div className="text-[10px] font-mono text-[var(--muted)]">Secret: {twoFASetup.secret}</div>}
            <div className="flex gap-2 max-w-[400px]">
              <input value={twoFACode} onChange={e => setTwoFACode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-3 py-2 text-sm rounded-md" />
              <button onClick={verify2FA} className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-md">VERIFY</button>
            </div>
          </div>
        )}
        {twoFAStatus?.enabled && (
          <div className="flex gap-2 max-w-[400px]">
            <input value={twoFADisablePw} onChange={e => setTwoFADisablePw(e.target.value)} type="password" placeholder="Enter password to confirm"
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-3 py-2 text-sm rounded-md" />
            <button onClick={disable2FA} className="px-4 py-2 border border-[var(--red)] text-[var(--red)] text-xs font-bold rounded-md">DISABLE 2FA</button>
          </div>
        )}
        {backupCodes.length > 0 && (
          <div className="mt-3 p-3 bg-[var(--bg)] border border-[var(--border)] rounded-md">
            <p className="text-[10px] font-bold text-[var(--amber)] mb-2">SAVE THESE BACKUP CODES:</p>
            <div className="font-mono text-xs space-y-0.5">{backupCodes.map((c, i) => <div key={i}>{c}</div>)}</div>
          </div>
        )}
      </Card>

      {/* Export Data */}
      <Card title="Export Data">
        <div className="flex gap-2.5 flex-wrap">
          <button onClick={() => exportData('json')} className="px-3 py-1.5 bg-[var(--bg3)] border border-[var(--border)] text-[var(--muted)] text-[11px] font-mono rounded-md hover:text-[var(--text)]">EXPORT BRAND (JSON)</button>
          <button onClick={() => exportData('csv')} className="px-3 py-1.5 bg-[var(--bg3)] border border-[var(--border)] text-[var(--muted)] text-[11px] font-mono rounded-md hover:text-[var(--text)]">EXPORT BRAND (CSV)</button>
        </div>
      </Card>

      {/* Change Password */}
      <Card title="Change Password">
        <div className="flex flex-col gap-2.5 max-w-[400px]">
          <input value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} type="password" placeholder="Current password"
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-3 py-2 text-sm rounded-md" />
          <input value={pwNew} onChange={e => setPwNew(e.target.value)} type="password" placeholder="New password (min 8 characters)"
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-3 py-2 text-sm rounded-md" />
          <input value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} type="password" placeholder="Confirm new password"
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] px-3 py-2 text-sm rounded-md" />
          <button onClick={changePassword} className="w-fit px-4 py-2 bg-[var(--bg3)] border border-[var(--border)] text-[var(--muted)] text-[11px] font-mono rounded-md hover:text-[var(--text)]">UPDATE PASSWORD</button>
          {pwMsg && <p className="text-xs font-mono text-[var(--muted)]">{pwMsg}</p>}
        </div>
      </Card>

      {/* Danger Zone */}
      <div className="bg-[var(--bg2)] border border-[var(--red)] rounded-xl p-5 shadow-[var(--app-shadow)] mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--red)] mb-2">Danger Zone</h3>
        <p className="text-[11px] font-mono text-[var(--muted)] mb-3">Permanently delete your account. This cannot be undone.</p>
        <button onClick={deleteAccount} className="px-4 py-2 border border-[var(--red)] text-[var(--red)] text-[11px] font-bold rounded-md hover:bg-[var(--danger-light)]">DELETE MY ACCOUNT</button>
      </div>
    </div>
  );
}

function Card({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mt-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}
