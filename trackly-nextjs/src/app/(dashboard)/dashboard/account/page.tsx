'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface BillingEntry { date: string; plan: string; amount: string; status: string; }

const PLANS = [
  { name: 'Starter', price: '$9', sub: 'Perfect for getting started', features: ['30 prompts/month', '1 brand', '2 AI platforms', 'Weekly tracking'] },
  { name: 'Pro', price: '$29', sub: 'For growing businesses', featured: true, features: ['250 prompts/month', '5 brands', '5 platforms', 'Competitors', 'Sentiment analysis'] },
  { name: 'Agency', price: '$89', sub: 'Scale with confidence', features: ['1,000 prompts/month', '20 brands', '5 platforms', '20 competitors', 'Sentiment analysis'] },
  { name: 'Enterprise', price: '$499', sub: 'Full power', enterprise: true, features: ['10,000 prompts/month', '100 brands', '5 platforms', '100 competitors', 'API access', 'Priority support'] },
];

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [billingHistory, setBillingHistory] = useState<BillingEntry[]>([]);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [twoFAStatus, setTwoFAStatus] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePw, setDisablePw] = useState('');
  const [usernameEdit, setUsernameEdit] = useState(false);
  const [usernameVal, setUsernameVal] = useState(user?.username || '');

  useEffect(() => {
    fetch('/api/payments/history', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setBillingHistory(d.history || []))
      .catch(() => {});
    fetch('/api/auth/2fa/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setTwoFAEnabled(d.enabled); setTwoFAStatus(d.enabled ? 'Enabled' : 'Not enabled'); })
      .catch(() => setTwoFAStatus('Not enabled'));
  }, []);

  async function changePassword() {
    if (pwNew.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    if (pwNew !== pwConfirm) { setPwMsg('Passwords do not match'); return; }
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }) });
      const d = await res.json();
      setPwMsg(res.ok ? 'Password updated!' : d.error || 'Failed');
      if (res.ok) { setPwCurrent(''); setPwNew(''); setPwConfirm(''); }
    } catch { setPwMsg('Failed'); }
  }

  async function saveUsername() {
    try {
      await fetch('/api/auth/username', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameVal }) });
      refreshUser();
      setUsernameEdit(false);
    } catch {}
  }

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    if (!confirm('This will permanently delete ALL your data. Are you absolutely sure?')) return;
    try { await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' }); window.location.href = '/'; } catch {}
  }

  async function cancelSubscription() {
    if (!confirm('Cancel your subscription? You will lose access to paid features at the end of your billing period.')) return;
    try { await fetch('/api/payments/cancel', { method: 'POST', credentials: 'include' }); refreshUser(); } catch {}
  }

  const plan = user?.plan || 'free';
  const emailVerified = user?.emailVerified;

  return (
    <div>
      <div className="view-title">Account &amp; Plan</div>
      <div className="view-sub">Manage your account and subscription.</div>

      {/* Account Info */}
      <div className="card">
        <div className="section-title">Account Info</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 2.2 }}>
          <div>Email: <strong>{user?.email}</strong> {emailVerified ? <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,.08)', color: 'var(--green)', border: '1px solid rgba(16,185,129,.2)' }}>VERIFIED</span> : <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(239,68,68,.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.2)' }}>UNVERIFIED</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Username: <strong style={{ color: 'var(--primary)' }}>@{usernameEdit ? '' : (user?.username || '—')}</strong>
            {usernameEdit ? (
              <><input className="finp" value={usernameVal} onChange={e => setUsernameVal(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} style={{ margin: 0, padding: '2px 8px', width: 180, fontSize: 12 }} onKeyDown={e => e.key === 'Enter' && saveUsername()} /><button className="pbtn" onClick={saveUsername} style={{ fontSize: 9, padding: '3px 8px' }}>SAVE</button></>
            ) : (
              <button className="pbtn" onClick={() => setUsernameEdit(true)} style={{ fontSize: 9, padding: '3px 8px' }}>EDIT</button>
            )}
          </div>
          <div>Plan: <strong style={{ textTransform: 'uppercase' }}>{plan}</strong> <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,.08)', color: 'var(--green)' }}>ACTIVE</span></div>
          <div>Member since: <span style={{ color: 'var(--muted)' }}>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          {plan !== 'free' && <div style={{ marginTop: 8 }}><button onClick={cancelSubscription} style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 'var(--radius-xs)', letterSpacing: '.5px' }}>CANCEL SUBSCRIPTION</button></div>}
        </div>
      </div>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="section-title" style={{ margin: 0 }}>Billing History</div>
            <a href="https://customer.dodopayments.com/" target="_blank" rel="noopener" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--primary)', textDecoration: 'none', letterSpacing: '.5px' }}>MANAGE BILLING →</a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th className="th">Date</th><th className="th">Plan</th><th className="th">Amount</th><th className="th">Status</th></tr></thead>
            <tbody>
              {billingHistory.map((b, i) => (
                <tr key={i} className="trow">
                  <td className="td">{new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="td" style={{ textTransform: 'uppercase', fontWeight: 600 }}>{b.plan}</td>
                  <td className="td">{b.amount}</td>
                  <td className="td"><span style={{ color: b.status === 'succeeded' ? 'var(--green)' : 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Two-Factor Authentication */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Two-Factor Authentication</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          {twoFAEnabled ? 'Enabled — your account is protected with 2FA.' : 'Not enabled. Add an extra layer of security to your account with an authenticator app.'}
        </div>
        {twoFAMsg && <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: twoFAMsg.includes('success') || twoFAMsg.includes('enabled') || twoFAMsg.includes('disabled') ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>{twoFAMsg}</div>}

        {/* Enable 2FA Flow */}
        {!twoFAEnabled && !twoFASetup && (
          <button className="pbtn" onClick={async () => {
            try {
              const res = await fetch('/api/auth/2fa/setup', { method: 'POST', credentials: 'include' });
              const data = await res.json();
              if (!res.ok) { setTwoFAMsg(data.error || 'Failed to setup 2FA'); return; }
              setTwoFASetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
              setTwoFAMsg('');
            } catch { setTwoFAMsg('Failed to connect'); }
          }} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700, fontSize: 11 }}>
            ENABLE 2FA
          </button>
        )}

        {/* QR Code + Verify Step */}
        {twoFASetup && (
          <div style={{ marginTop: 12 }}>
            {/* QR Code rendered as SVG */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>1. Scan this QR code with your authenticator app</div>
              <div style={{ display: 'inline-block', padding: 16, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFASetup.otpauthUrl)}`} alt="2FA QR Code" width={200} height={200} style={{ display: 'block' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                Can&apos;t scan? Enter this key manually:
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-xs)', display: 'inline-block', letterSpacing: 2, userSelect: 'all' as const }}>
                {twoFASetup.secret}
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>2. Enter the 6-digit code from your app</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
              <input className="finp" value={twoFACode} onChange={e => setTwoFACode(e.target.value)} type="text" placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" style={{ margin: 0, flex: 1, textAlign: 'center', letterSpacing: 4, fontSize: 18 }} />
              <button className="pbtn" onClick={async () => {
                try {
                  const res = await fetch('/api/auth/2fa/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: twoFACode }) });
                  const data = await res.json();
                  if (!res.ok) { setTwoFAMsg(data.error || 'Invalid code'); return; }
                  setTwoFAEnabled(true);
                  setTwoFASetup(null);
                  setTwoFACode('');
                  setTwoFAStatus('Enabled');
                  setTwoFAMsg('2FA enabled successfully!');
                  if (data.backupCodes) setBackupCodes(data.backupCodes);
                } catch { setTwoFAMsg('Failed to verify'); }
              }} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', whiteSpace: 'nowrap', fontWeight: 700 }}>VERIFY</button>
            </div>
          </div>
        )}

        {/* Backup Codes Display */}
        {backupCodes.length > 0 && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg3)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Backup Codes — Save these somewhere safe!</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {backupCodes.map((code, i) => (
                <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)', padding: '6px 10px', background: 'var(--bg2)', borderRadius: 4, textAlign: 'center' }}>{code}</div>
              ))}
            </div>
            <button className="pbtn" onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); setTwoFAMsg('Backup codes copied!'); }} style={{ marginTop: 10, fontSize: 10 }}>COPY ALL CODES</button>
          </div>
        )}

        {/* Disable 2FA */}
        {twoFAEnabled && !twoFASetup && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
              <input className="finp" type="password" placeholder="Enter password to confirm" value={disablePw} onChange={e => setDisablePw(e.target.value)} style={{ margin: 0, flex: 1 }} />
              <button className="pbtn" onClick={async () => {
                try {
                  const res = await fetch('/api/auth/2fa/disable', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: disablePw }) });
                  const data = await res.json();
                  if (!res.ok) { setTwoFAMsg(data.error || 'Failed'); return; }
                  setTwoFAEnabled(false);
                  setDisablePw('');
                  setTwoFAStatus('Not enabled');
                  setTwoFAMsg('2FA disabled successfully');
                  setBackupCodes([]);
                } catch { setTwoFAMsg('Failed'); }
              }} style={{ borderColor: 'var(--red)', color: 'var(--red)', whiteSpace: 'nowrap' }}>DISABLE 2FA</button>
            </div>
          </div>
        )}
      </div>

      {/* Export Data */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Export Data</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="pbtn">EXPORT BRAND (JSON)</button>
          <button className="pbtn">EXPORT BRAND (CSV)</button>
          <button className="pbtn">EXPORT ALL (JSON)</button>
          <button className="pbtn" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>IMPORT BRAND</button>
        </div>
      </div>

      {/* Change Password */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Change Password</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
          <input className="finp" type="password" placeholder="Current password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} />
          <input className="finp" type="password" placeholder="New password (min 8 characters)" value={pwNew} onChange={e => setPwNew(e.target.value)} />
          <input className="finp" type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} />
          {pwMsg && <div style={{ fontSize: 11, color: pwMsg.includes('updated') ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>{pwMsg}</div>}
          <button className="pbtn" onClick={changePassword} style={{ width: 'fit-content' }}>UPDATE PASSWORD</button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card" style={{ marginTop: 14, borderColor: 'var(--red)' }}>
        <div className="section-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Permanently delete your account. This cannot be undone.</div>
        <button onClick={deleteAccount} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>DELETE MY ACCOUNT</button>
      </div>

      {/* Choose Your Plan */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Choose Your Plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {PLANS.map(p => (
            <div key={p.name} className="land-price-card" style={p.featured ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 1px var(--primary), var(--card-shadow-lg)' } : p.enterprise ? { borderColor: 'var(--purple)' } : {}}>
              {p.featured && <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '4px 16px', letterSpacing: '.5px', borderRadius: 100 }}>MOST POPULAR</span>}
              <h3 style={p.enterprise ? { color: 'var(--purple)' } : {}}>{p.name}</h3>
              <div className="price">{p.price}<span>/mo</span></div>
              <div className="price-sub">{p.sub}</div>
              <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
              {plan === p.name.toLowerCase() ? (
                <button className="land-btn land-btn-primary" style={{ width: '100%', opacity: 0.7, cursor: 'default' }}>CURRENT PLAN</button>
              ) : (
                <button className="land-btn land-btn-primary" style={{ width: '100%' }}>SWITCH TO {p.name.toUpperCase()}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
