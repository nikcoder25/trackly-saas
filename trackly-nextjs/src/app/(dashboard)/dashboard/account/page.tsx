'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { PRICING_PLANS, BILLING_PORTAL_URL } from '@/lib/constants';
import { useToast } from '@/components/dashboard/Toast';
import { Card, Badge, PageHead, Pill } from '@/app/dashboard-v2/ui';

interface BillingEntry {
  date: string;
  /** Pre-rendered "Plan changed" / "Pro → Agency" / "Cancelled" copy. */
  event: string;
  amount: string;
  status: string;
}

const EVENT_LABEL: Record<string, string> = {
  plan_upgraded: 'Plan upgraded',
  plan_downgraded: 'Plan downgraded',
  plan_cancelled: 'Subscription cancelled',
  plan_renewed: 'Subscription renewed',
  subscription_on_hold: 'Subscription on hold',
  subscription_paused: 'Subscription paused',
  superseded_sub_cancelled: 'Old subscription cancelled',
  payment_succeeded: 'Payment received',
};

function titleCase(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Render a billing-events row as a user-readable line. For plan moves
// we surface the transition (e.g. "Plan upgraded · Pro → Agency") so
// the user can audit the lifecycle without cross-referencing receipts.
function describeBillingRow(h: Record<string, unknown>): string {
  const eventType = typeof h.event_type === 'string' ? h.event_type : '';
  const label = EVENT_LABEL[eventType] || (eventType ? eventType.replace(/_/g, ' ') : 'Activity');
  const fromPlan = typeof h.from_plan === 'string' ? h.from_plan : '';
  const toPlan = typeof h.to_plan === 'string' ? h.to_plan : '';
  if (fromPlan && toPlan && fromPlan !== toPlan) {
    return `${label} · ${titleCase(fromPlan)} → ${titleCase(toPlan)}`;
  }
  if (toPlan) return `${label} · ${titleCase(toPlan)}`;
  if (fromPlan) return `${label} · ${titleCase(fromPlan)}`;
  return label;
}

const PLANS = PRICING_PLANS;

export default function AccountPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const { selectedBrand, brands } = useBrands();
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
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then(d => {
        const history: BillingEntry[] = (d.history || []).map((h: Record<string, unknown>) => ({
          date: (h.date as string) || (h.processed_at as string) || (h.created_at as string) || '',
          event: describeBillingRow(h),
          amount: (h.amount as string) || '',
          status: (h.status as string) || (h.event_type ? 'processed' : ''),
        }));
        setBillingHistory(history);
      })
      .catch(() => {});
    fetch('/api/auth/2fa/status', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
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
      if (res.ok) { setPwCurrent(''); setPwNew(''); setPwConfirm(''); toast('Password updated successfully'); }
      else { toast(d.error || 'Failed to update password', 'error'); }
    } catch { setPwMsg('Failed'); toast('Failed to update password', 'error'); }
  }

  async function exportBrand(format: 'json' | 'csv') {
    if (!selectedBrand) { toast('No brand selected', 'error'); return; }
    try {
      const res = await fetch(`/api/export/brand/${selectedBrand.id}`, { credentials: 'include' });
      if (!res.ok) { toast('Export failed', 'error'); return; }
      const data = await res.json();
      let blob: Blob;
      let filename: string;
      if (format === 'csv') {
        const brand = data.brand;
        const rows = [['Field', 'Value'], ['Name', brand.name || ''], ['Industry', brand.industry || ''], ['City', brand.city || '']];
        const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        blob = new Blob([csvContent], { type: 'text/csv' });
        filename = `brand-${selectedBrand.id}.csv`;
      } else {
        blob = new Blob([JSON.stringify(data.brand, null, 2)], { type: 'application/json' });
        filename = `brand-${selectedBrand.id}.json`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast(`Brand exported as ${format.toUpperCase()}`);
    } catch { toast('Export failed', 'error'); }
  }

  async function exportAll() {
    try {
      const results = await Promise.allSettled(
        brands.map(b => fetch(`/api/export/brand/${b.id}`, { credentials: 'include' }).then(r => r.json()))
      );
      const allBrands = results
        .filter((r): r is PromiseFulfilledResult<{ brand: unknown }> => r.status === 'fulfilled' && r.value?.brand)
        .map(r => r.value.brand);
      if (allBrands.length === 0) { toast('No brands could be exported', 'error'); return; }
      const blob = new Blob([JSON.stringify(allBrands, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'all-brands.json'; a.click();
      URL.revokeObjectURL(url);
      const failed = results.filter(r => r.status === 'rejected').length;
      toast(failed > 0 ? `Exported ${allBrands.length} brands (${failed} failed)` : 'All brands exported');
    } catch { toast('Export failed', 'error'); }
  }

  async function saveUsername() {
    try {
      await fetch('/api/auth/username', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameVal }) });
      refreshUser();
      setUsernameEdit(false);
      toast('Username updated');
    } catch { toast('Failed to update username', 'error'); }
  }

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    if (!confirm('This will permanently delete ALL your data. Are you absolutely sure?')) return;
    try { await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' }); toast('Account deleted'); router.push('/'); } catch { toast('Failed to delete account', 'error'); }
  }

  async function cancelSubscription() {
    if (!confirm('Cancel your subscription? You will lose access to paid features at the end of your billing period.')) return;
    try { await fetch('/api/payments/cancel', { method: 'POST', credentials: 'include' }); refreshUser(); toast('Subscription cancelled'); } catch { toast('Failed to cancel subscription', 'error'); }
  }

  const rawPlan = user?.plan || 'free';
  const plan = rawPlan;
  const emailVerified = user?.emailVerified;

  const PLAN_TIERS: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4 };

  async function switchPlan(targetPlan: string) {
    const target = targetPlan.toLowerCase();

    if (target === 'free') {
      await cancelSubscription();
      return;
    }

    const currentTier = PLAN_TIERS[plan] ?? 0;
    const targetTier = PLAN_TIERS[target] ?? 0;

    if (targetTier <= currentTier) {
      toast('To downgrade, please cancel your current subscription first or manage billing via the customer portal.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: target.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Failed to start checkout', 'error');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast('No checkout URL returned. Please try again.', 'error');
      }
    } catch {
      toast('Failed to start checkout. Please try again.', 'error');
    }
  }

  const currentPlanDef = PLANS.find(p => p.name.toLowerCase() === plan);

  return (
    <div className="lvx">
      <PageHead
        title="Account & Plan"
        sub="Manage your account, security and subscription."
        actions={<a href={BILLING_PORTAL_URL} target="_blank" rel="noopener" className="btn-p" style={{ textDecoration: 'none' }}>Manage billing</a>}
      />
      <div className="page-body">
        <div className="g3">
          {/* Current plan */}
          <Card title="Current plan" right={<Badge tone="acc">{plan.toUpperCase()}</Badge>}>
            <div className="kpi-v mono" style={{ fontSize: 32 }}>{currentPlanDef?.price ?? '$0'}<i>/mo</i></div>
            <div className="quiet" style={{ fontSize: 13, margin: '6px 0 14px' }}>{currentPlanDef?.headline ?? currentPlanDef?.sub ?? 'Free plan'}</div>
            {currentPlanDef && (
              <ul className="plan-feat">
                {currentPlanDef.features.map(f => <li key={f}>{f}</li>)}
              </ul>
            )}
            {plan !== 'free' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn-d btn-danger" onClick={cancelSubscription}>Cancel subscription</button>
              </div>
            )}
          </Card>

          {/* Account info */}
          <Card title="Account info" right={<Badge tone={emailVerified ? 'pos' : 'neg'}>{emailVerified ? 'VERIFIED' : 'UNVERIFIED'}</Badge>}>
            <div className="fld">
              <div className="eyebrow">EMAIL</div>
              <div style={{ fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text)' }}>{user?.email}</span>
                {!emailVerified && <button className="btn-d" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { try { let res = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include' }); if (res.status === 401) { try { const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }); if (r.ok) res = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include' }); } catch { /* refresh failed */ } } let d; try { d = await res.json(); } catch { alert('Server error - please try again later.'); return; } alert(res.ok ? 'Verification email sent!' : d.error || 'Failed to send verification email'); } catch { alert('Failed to send verification email. Please try again later.'); } }}>Resend verification</button>}
              </div>
            </div>
            <div className="fld">
              <div className="eyebrow">USERNAME</div>
              <div style={{ fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                {usernameEdit ? (
                  <><input className="fld-in mono" value={usernameVal} onChange={e => setUsernameVal(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} style={{ width: 180 }} onKeyDown={e => e.key === 'Enter' && saveUsername()} /><button className="btn-d" style={{ padding: '3px 8px', fontSize: 11 }} onClick={saveUsername}>Save</button></>
                ) : (
                  <><span className="mono" style={{ color: 'var(--text)' }}>@{user?.username || '-'}</span><button className="btn-d" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setUsernameEdit(true)}>Edit</button></>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div>
                <div className="eyebrow">PLAN</div>
                <div style={{ fontSize: 13, marginTop: 4 }}><span style={{ textTransform: 'uppercase' }}>{plan}</span> · <span className="pos">active</span></div>
              </div>
              <div>
                <div className="eyebrow">MEMBER SINCE</div>
                <div style={{ fontSize: 13, marginTop: 4 }} className="mono">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-'}</div>
              </div>
            </div>
          </Card>

          {/* Export data */}
          <Card title="Export data">
            <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>Download your brand data for backup or migration.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-d" onClick={() => exportBrand('json')}>Export brand (JSON)</button>
              <button className="btn-d" onClick={() => exportBrand('csv')}>Export brand (CSV)</button>
              <button className="btn-d" onClick={exportAll}>Export all (JSON)</button>
              <button className="btn-g" onClick={() => toast('Import coming soon', 'error')}>Import brand</button>
            </div>
          </Card>
        </div>

        {/* Billing history */}
        {billingHistory.length > 0 && (
          <Card title="Billing history" padding={false}
            right={<a href={BILLING_PORTAL_URL} target="_blank" rel="noopener" className="mono dim" style={{ fontSize: 11, textDecoration: 'none' }}>MANAGE BILLING →</a>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>DATE</th><th>EVENT</th><th className="right">AMOUNT</th><th>STATUS</th></tr></thead>
                <tbody>
                  {billingHistory.map((b, i) => (
                    <tr key={i}>
                      <td className="num">{b.date && !isNaN(new Date(b.date).getTime()) ? new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</td>
                      <td><b>{b.event}</b></td>
                      <td className="right num">{b.amount || '-'}</td>
                      <td><Badge tone={b.status === 'succeeded' || b.status === 'paid' || b.status === 'upgraded' || b.status === 'renewed' ? 'pos' : 'neu'}>{(b.status || '').toUpperCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="g2">
          {/* Two-factor authentication */}
          <Card title="Two-factor authentication" right={<Badge tone={twoFAEnabled ? 'pos' : 'neu'}>{twoFAEnabled ? 'ENABLED' : 'OFF'}</Badge>}>
            <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
              {twoFAEnabled ? 'Your account is protected with 2FA.' : 'Add an extra layer of security to your account with an authenticator app.'}
            </p>
            {twoFAMsg && <div style={{ fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 12 }} className={twoFAMsg.includes('success') || twoFAMsg.includes('enabled') || twoFAMsg.includes('disabled') ? 'pos' : 'neg'}>{twoFAMsg}</div>}

            {/* Enable 2FA Flow */}
            {!twoFAEnabled && !twoFASetup && (
              <button className="btn-p" onClick={async () => {
                try {
                  const res = await fetch('/api/auth/2fa/setup', { method: 'POST', credentials: 'include' });
                  const data = await res.json();
                  if (!res.ok) { setTwoFAMsg(data.error || 'Failed to setup 2FA'); toast('Failed to setup 2FA', 'error'); return; }
                  setTwoFASetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
                  setTwoFAMsg('');
                } catch { setTwoFAMsg('Failed to connect'); toast('Failed to connect', 'error'); }
              }}>
                Enable 2FA
              </button>
            )}

            {/* QR Code + Verify Step */}
            {twoFASetup && (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 16 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>1 · SCAN THIS QR CODE WITH YOUR AUTHENTICATOR APP</div>
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: '#ffffff', borderRadius: 8, maxWidth: 240, marginTop: 8 }}>
                    <QRCodeSVG value={twoFASetup.otpauthUrl} size={180} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin />
                  </div>
                  <div className="quiet" style={{ marginTop: 12, fontSize: 12 }}>Or enter this key manually:</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6, display: 'inline-block', letterSpacing: 2, userSelect: 'all' as const }}>
                    {twoFASetup.secret}
                  </div>
                </div>

                <div className="eyebrow" style={{ marginBottom: 8 }}>2 · ENTER THE 6-DIGIT CODE FROM YOUR APP</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
                  <input className="fld-in mono" value={twoFACode} onChange={e => setTwoFACode(e.target.value)} type="text" placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" style={{ flex: 1, textAlign: 'center', letterSpacing: 4, fontSize: 18 }} />
                  <button className="btn-p" onClick={async () => {
                    try {
                      const res = await fetch('/api/auth/2fa/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: twoFACode }) });
                      const data = await res.json();
                      if (!res.ok) { setTwoFAMsg(data.error || 'Invalid code'); toast('Invalid 2FA code', 'error'); return; }
                      setTwoFAEnabled(true);
                      setTwoFASetup(null);
                      setTwoFACode('');
                      setTwoFAStatus('Enabled');
                      setTwoFAMsg('2FA enabled successfully!');
                      toast('2FA enabled successfully');
                      if (data.backupCodes) setBackupCodes(data.backupCodes);
                    } catch { setTwoFAMsg('Failed to verify'); toast('Failed to verify 2FA code', 'error'); }
                  }} style={{ whiteSpace: 'nowrap' }}>Verify</button>
                </div>
              </div>
            )}

            {/* Backup Codes Display */}
            {backupCodes.length > 0 && (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Backup codes - save these somewhere safe!</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {backupCodes.map((code, i) => (
                    <div key={i} className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', padding: '6px 10px', background: 'var(--surface)', borderRadius: 4, textAlign: 'center' }}>{code}</div>
                  ))}
                </div>
                <button className="btn-d" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); setTwoFAMsg('Backup codes copied!'); }}>Copy all codes</button>
              </div>
            )}

            {/* Disable 2FA */}
            {twoFAEnabled && !twoFASetup && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
                  <input className="fld-in" type="password" placeholder="Enter password to confirm" value={disablePw} onChange={e => setDisablePw(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn-d btn-danger" style={{ whiteSpace: 'nowrap' }} onClick={async () => {
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
                  }}>Disable 2FA</button>
                </div>
              </div>
            )}
          </Card>

          {/* Change password */}
          <Card title="Change password">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
              <input className="fld-in" type="password" placeholder="Current password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} />
              <input className="fld-in" type="password" placeholder="New password (min 8 characters)" value={pwNew} onChange={e => setPwNew(e.target.value)} />
              <input className="fld-in" type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} />
              {pwMsg && <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }} className={pwMsg.includes('updated') ? 'pos' : 'neg'}>{pwMsg}</div>}
              <button className="btn-p" style={{ width: 'fit-content' }} onClick={changePassword}>Update password</button>
            </div>
          </Card>
        </div>

        {/* Choose your plan */}
        <Card title="Choose your plan" right={<Pill tone="acc">Current · {plan.toUpperCase()}</Pill>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* Free is an internal-only tier (where cancelled accounts land) and
                is not a plan users pick - matching the public pricing page, the
                selectable grid lists paid tiers only. This also removes the
                contradictory "Upgrade/Downgrade to Free" CTA; a free user's
                current tier is still shown by the "Current plan" card and the
                "Current · FREE" pill above. */}
            {PLANS.filter(p => p.name.toLowerCase() !== 'free').map(p => {
              const isCurrent = plan === p.name.toLowerCase();
              return (
                <Card key={p.name} title={p.name} right={p.featured ? <Badge tone="acc">POPULAR</Badge> : isCurrent ? <Badge tone="pos">CURRENT</Badge> : undefined}>
                  <div className="kpi-v mono" style={{ fontSize: 28 }}>{p.price}<i>/mo</i></div>
                  <div className="quiet" style={{ fontSize: 13, margin: '6px 0 14px' }}>{p.sub}</div>
                  <ul className="plan-feat">{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                  <div style={{ marginTop: 14 }}>
                    {isCurrent ? (
                      <button className="btn-d" style={{ width: '100%', opacity: 0.7, cursor: 'default' }} disabled>Current plan</button>
                    ) : p.name.toLowerCase() === 'enterprise' ? (
                      <a href="/contact" className="btn-p" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Contact us</a>
                    ) : (
                      <button className="btn-p" style={{ width: '100%' }} onClick={() => switchPlan(p.name)}>
                        {(PLAN_TIERS[p.name.toLowerCase()] ?? 0) < (PLAN_TIERS[plan] ?? 0) ? `Downgrade to ${p.name}` : `Upgrade to ${p.name}`}
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>

        {/* Danger zone */}
        <Card title="Danger zone">
          <p className="quiet" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>Permanently delete your account. This cannot be undone.</p>
          <button className="btn-d btn-danger" onClick={deleteAccount}>Delete my account</button>
        </Card>
      </div>
    </div>
  );
}
