'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, BILLING_PORTAL_URL, PRICING_PLANS } from '@/lib/constants';
import { PLAN_CREDITS } from '@/lib/plan-config';
import { useCredits } from '@/contexts/CreditsContext';
import { useBrands } from '@/contexts/BrandContext';
import UsageSection from '@/components/dashboard/billing/UsageSection';
import type { ActivityEntry } from '@/components/dashboard/billing/RecentActivityCard';
import ComparePlansGrid from '@/components/dashboard/billing/ComparePlansGrid';
import { Card, Badge, Bar, Pill, Donut, PageHead } from '@/app/dashboard-v2/ui';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';

interface PeriodInfo {
  daysIntoMonth: number;
  daysRemainingInMonth: number;
}

function parsePriceUsd(price: string | undefined): number {
  if (!price) return 0;
  const m = price.match(/\$\s*([\d.]+)/);
  return m ? Number(m[1]) : 0;
}

function noChargeReasonFor(plan: string): 'free' | 'owner' | 'custom' | null {
  if (plan === 'free') return 'free';
  if (plan === 'owner') return 'owner';
  if (plan === 'enterprise') return 'custom';
  return null;
}

const HISTORY_EVENT_LABEL: Record<string, string> = {
  plan_upgraded: 'Plan upgraded',
  plan_downgraded: 'Plan downgraded',
  plan_cancelled: 'Subscription cancelled',
  plan_renewed: 'Subscription renewed',
  subscription_on_hold: 'Subscription on hold',
  subscription_paused: 'Subscription paused',
  superseded_sub_cancelled: 'Old subscription cancelled',
  payment_succeeded: 'Payment received',
};

function titleCasePlan(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function mapHistoryRow(h: Record<string, unknown>): ActivityEntry {
  const eventType = typeof h.event_type === 'string' ? h.event_type : '';
  const fromPlan = typeof h.from_plan === 'string' ? h.from_plan : '';
  const toPlan = typeof h.to_plan === 'string' ? h.to_plan : '';
  const baseLabel = HISTORY_EVENT_LABEL[eventType]
    || (eventType ? eventType.replace(/_/g, ' ') : 'Activity');
  let event = baseLabel;
  if (fromPlan && toPlan && fromPlan !== toPlan) {
    event = `${baseLabel} · ${titleCasePlan(fromPlan)} → ${titleCasePlan(toPlan)}`;
  } else if (toPlan) {
    event = `${baseLabel} · ${titleCasePlan(toPlan)}`;
  } else if (fromPlan) {
    event = `${baseLabel} · ${titleCasePlan(fromPlan)}`;
  }
  return {
    date: (h.date as string) || (h.processed_at as string) || (h.created_at as string) || '',
    event,
    amount: (h.amount as string) || '',
    status: (h.status as string) || (eventType ? 'processed' : ''),
  };
}

function fmtBillDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function UsageMeter({ label, used, limit, unit = '', sub, unlimited }: any) {
  const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const tone = unlimited ? 'ok' : pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'ok';
  const limitLabel = unlimited ? '∞' : (limit as number).toLocaleString();
  return (
    <div className="umeter">
      <div className="um-top">
        <span className="um-label">{label}</span>
        <span className="um-val mono"><b>{(used as number).toLocaleString()}</b><span className="dim"> / {limitLabel}{unit}</span></span>
      </div>
      <div className={'um-track um-' + tone}><i style={{ width: (unlimited ? 40 : pct) + '%' }} /></div>
      <div className="um-sub">{sub || (unlimited ? 'No limit' : `${pct}% used`)}{!unlimited && pct >= 90 && <span className="um-warn-tx"> · approaching limit</span>}</div>
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuth();
  const { brands } = useBrands();
  const { status: creditStatus } = useCredits();

  const currentPlan = user?.plan || 'free';
  const creditCfg = PLAN_CREDITS[currentPlan] || PLAN_CREDITS.free;
  const currentPlanPricing = PRICING_PLANS.find(
    (p) => p.name.toLowerCase() === currentPlan,
  );

  const [periodInfo, setPeriodInfo] = useState<PeriodInfo>({
    daysIntoMonth: 0,
    daysRemainingInMonth: 0,
  });
  const [billingHistory, setBillingHistory] = useState<ActivityEntry[]>([]);
  const [apiCosts, setApiCosts] = useState<Record<string, number>>({});

  // Page-level fetch only pulls the small period summary we need for the
  // top card's day-of-period progress bar. The full UsageBreakdown is
  // also fetched inside <UsageSection /> — both calls share the
  // same HTTP cache window (max-age=15) so the dedupe is transparent.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setPeriodInfo({
          daysIntoMonth: Number(d.daysIntoMonth) || 0,
          daysRemainingInMonth: Number(d.daysRemainingInMonth) || 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/payments/history', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const rows: ActivityEntry[] = (d.history || []).map((h: Record<string, unknown>) =>
          mapHistoryRow(h),
        );
        setBillingHistory(rows);
      })
      .catch(() => {});
  }, []);

  // Owner-only API cost breakdown stays — admin operator view.
  useEffect(() => {
    if (currentPlan !== 'owner') return;
    fetch('/api/api-logs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const costs: Record<string, number> = {};
        for (const log of d.logs || []) {
          if (log.cost && log.platform) {
            costs[log.platform] = (costs[log.platform] || 0) + Number(log.cost);
          }
        }
        setApiCosts(costs);
      })
      .catch(() => {});
  }, [currentPlan]);

  // Plan change state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planSwitching, setPlanSwitching] = useState('');
  const [annualBilling, setAnnualBilling] = useState(false);

  async function switchPlan(targetPlan: string) {
    const target = targetPlan.toLowerCase();
    const PLAN_TIERS: Record<string, number> = {
      free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4,
    };
    const currentTier = PLAN_TIERS[currentPlan] ?? 0;
    const targetTier = PLAN_TIERS[target] ?? 0;

    if (target === currentPlan) return;

    if (target === 'free') {
      if (!confirm('Cancel your subscription? You will lose access to paid features at the end of your billing period.')) return;
      setPlanSwitching(target);
      try {
        const res = await fetch('/api/payments/cancel', { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Failed to cancel subscription. Please try again or contact support.');
          setPlanSwitching('');
          return;
        }
        window.location.reload();
      } catch {
        alert('Failed to cancel subscription. Please try again.');
        setPlanSwitching('');
      }
      return;
    }

    if (targetTier <= currentTier && currentPlan !== 'free') {
      alert('To downgrade, please cancel your current subscription first or manage billing via the customer portal.');
      return;
    }

    setPlanSwitching(target);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start checkout');
        setPlanSwitching('');
        return;
      }
      if (data.url) window.location.href = data.url;
      else { alert('No checkout URL returned.'); setPlanSwitching(''); }
    } catch {
      setPlanSwitching('');
    }
  }

  // Derived values for sub-components ------------------------------------
  const planLabel = creditStatus?.label ?? (currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1));
  const monthlyPriceLabel = currentPlanPricing
    ? currentPlanPricing.price === 'Custom'
      ? 'Custom'
      : `${currentPlanPricing.price}/mo`
    : '—';
  const cycleSuffix = currentPlan === 'free'
    ? 'free tier'
    : currentPlan === 'owner'
      ? 'owner account'
      : currentPlanPricing?.price === 'Custom'
        ? 'invoiced'
        : 'billed monthly';

  const noChargeReason = noChargeReasonFor(currentPlan);
  const monthlyPriceUsd = parsePriceUsd(currentPlanPricing?.price);

  const handleManagePlan = () => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById('plan-comparison');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else setShowPlanModal(true);
  };

  // Hide the Usage section + invoice/alerts row entirely for owner —
  // the credit caps are unlimited and the invoice is N/A. Owner still
  // sees their plan card and the API cost breakdown.
  const isOwner = currentPlan === 'owner';

  // ── Presentation-only derived values (no new fetches/handlers) ──
  const monthlyCap = creditStatus?.monthlyCap ?? creditCfg.monthlyCredits;
  const monthlyUsed = creditStatus?.monthlyUsed ?? 0;
  const isUnlimitedCredits = isOwner || monthlyCap >= 99999;
  const creditPct = isUnlimitedCredits || !monthlyCap
    ? 0
    : Math.min(100, Math.round((monthlyUsed / monthlyCap) * 100));
  const planFeatures = currentPlanPricing?.features ?? [];
  const renewLabel = fmtBillDate(creditStatus?.nextResetAt ?? null);
  const daysRemaining = periodInfo.daysRemainingInMonth;
  const planActive = currentPlan !== 'free';

  // Owner-only engine cost breakdown → "Queries by engine" card data.
  const engineCosts = Object.entries(apiCosts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxEngineCost = engineCosts.length ? Math.max(...engineCosts.map(([, c]) => c)) : 0;

  return (
    <div className="lvx">
      <PageHead
        title="Billing & Usage"
        sub="Your plan, what you've used this cycle, and your billing activity — all in one place."
        actions={(
          <>
            <button className="btn-d" onClick={handleManagePlan}>Manage plan</button>
            {planActive && (
              <a className="btn-g" href={BILLING_PORTAL_URL} target="_blank" rel="noopener">⇣ Customer portal</a>
            )}
          </>
        )}
      />

      <div className="page-body">

        {/* Plan + spend header */}
        <section className="bill-head">
          <div className="bh-plan">
            <div className="eyebrow">CURRENT PLAN</div>
            <div className="bh-name">
              {planLabel}{' '}
              <Badge tone={planActive ? 'pos' : 'neu'}>{planActive ? 'ACTIVE' : 'FREE'}</Badge>
            </div>
            <div className="bh-price">
              {currentPlanPricing?.price === 'Custom'
                ? <span className="mono">Custom</span>
                : <><span className="mono">{currentPlanPricing?.price ?? monthlyPriceLabel}</span><i>/ month</i></>}
            </div>
            <div className="bh-renew">
              {cycleSuffix} · renews <b>{renewLabel}</b>
            </div>
            <div className="bh-actions">
              <button className="btn-p" onClick={handleManagePlan}>Change plan</button>
              {planActive && (
                <button
                  className="btn-g"
                  onClick={() => switchPlan('free')}
                  disabled={planSwitching === 'free'}
                >
                  {planSwitching === 'free' ? 'Cancelling…' : 'Cancel plan'}
                </button>
              )}
            </div>
            {planFeatures.length > 0 && (
              <ul className="bh-feats">
                {planFeatures.map((f: any, i: number) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bh-spend">
            <div className="eyebrow" style={{ padding: '2px 0 2px' }}>SPEND</div>
            <div className="bhs-row">
              <span className="bhs-label">{noChargeReason ? 'This billing period' : 'Next invoice'}</span>
              <span className="bhs-v mono">{noChargeReason ? 'No charge' : `$${monthlyPriceUsd.toFixed(2)}`}</span>
            </div>
            <div className="bhs-meta mono">
              {noChargeReason === 'free'
                ? 'free tier'
                : noChargeReason === 'owner'
                  ? 'owner account'
                  : noChargeReason === 'custom'
                    ? 'invoiced'
                    : `due ${renewLabel}`}
            </div>
            <div className="bhs-row">
              <span className="bhs-label">Member since</span>
              <span className="bhs-v mono">{fmtBillDate(user?.createdAt ?? null)}</span>
            </div>
            <div className="bhs-meta mono">{daysRemaining} days left in period</div>
          </div>
        </section>

        {/* Usage this period */}
        {!isOwner && (
          <Card
            title="Usage this period"
            lede="How much of your plan you've used since the cycle began. Everything resets at renewal."
            right={<Pill tone="acc"><span className="pulse" /> resets in {daysRemaining} days</Pill>}
          >
            <div className="bill-usage">
              <div className="bu-ring">
                <Donut value={creditPct} size={150} label="OF MONTHLY CREDITS" color="var(--accent)" />
                <div className="bu-ring-sub">
                  <div className="mono">
                    <b>{monthlyUsed.toLocaleString()}</b> of {isUnlimitedCredits ? '∞' : monthlyCap.toLocaleString()} credits
                  </div>
                  <div className="dim mono" style={{ fontSize: 11, marginTop: 3 }}>renews {renewLabel}</div>
                </div>
              </div>
              <div className="bu-meters">
                <UsageMeter
                  label="Monthly credits"
                  used={monthlyUsed}
                  limit={monthlyCap}
                  unlimited={isUnlimitedCredits}
                />
                <UsageMeter
                  label="Brands tracked"
                  used={brands.length}
                  limit={creditCfg.brandsCap}
                  unlimited={creditCfg.brandsCap >= 99999}
                />
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <UsageSection numBrandsFromPage={brands.length} />
            </div>
          </Card>
        )}

        {/* Queries by engine — owner-only, real API cost data */}
        {engineCosts.length > 0 && (
          <Card
            title="Queries by engine · this period"
            info="engine"
            lede="Where your query budget went — totals run against each AI engine this cycle."
            right={<span className="mono dim" style={{ fontSize: 11 }}>${engineCosts.reduce((a, [, c]) => a + c, 0).toFixed(2)} TOTAL</span>}
          >
            <div className="bill-engines">
              {engineCosts.map(([platform, cost]) => (
                <div key={platform} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>{platform}</span>
                    <span className="mono" style={{ fontSize: 12.5 }}><b>${cost.toFixed(2)}</b></span>
                  </div>
                  <Bar value={cost} max={maxEngineCost} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Billing activity / invoice history */}
        <Card
          title="Invoice history"
          info="audit"
          lede="Every charge and plan change on your account."
          padding={false}
        >
          {billingHistory.length === 0 ? (
            <div style={{ padding: '28px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No billing activity yet.
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>DATE</th><th>EVENT</th><th className="right">AMOUNT</th><th>STATUS</th></tr></thead>
              <tbody>
                {billingHistory.map((row, i) => (
                  <tr key={i}>
                    <td className="num">{fmtBillDate(row.date)}</td>
                    <td><b>{row.event}</b></td>
                    <td className="right num">{row.amount || '—'}</td>
                    <td>
                      <Badge tone={/fail|declin|error/i.test(row.status) ? 'neg' : 'pos'}>
                        {(row.status || 'PROCESSED').toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Compare plans / change plan */}
        <div id="plan-comparison">
          <ComparePlansGrid
            currentPlan={currentPlan}
            annualBilling={annualBilling}
            onAnnualToggle={setAnnualBilling}
            onSwitchPlan={switchPlan}
            planSwitching={planSwitching}
          />
        </div>

        {/* Owner-only API cost breakdown stays as an admin view. */}
        {currentPlan === 'owner' && Object.keys(apiCosts).length > 0 && (
          <Card title="API cost breakdown" padding={false}>
            <table className="tbl">
              <thead><tr><th>PLATFORM</th><th className="right">TOTAL COST</th></tr></thead>
              <tbody>
                {Object.entries(apiCosts).sort((a, b) => b[1] - a[1]).map(([platform, cost]) => (
                  <tr key={platform}>
                    <td><b>{platform}</b></td>
                    <td className="right num">${cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td><b>Total</b></td>
                  <td className="right num"><b>${Object.values(apiCosts).reduce((a, b) => a + b, 0).toFixed(2)}</b></td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Change-Plan modal — kept for any caller that still calls
          setShowPlanModal(true). The new design routes Manage plan to
          the in-page #plan-comparison anchor, but the modal stays as
          a fallback for any narrower viewport flow that needs it. */}
      {showPlanModal && (
        <div
          onClick={() => setShowPlanModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: SURFACE, borderRadius: SURFACE_RADIUS,
              padding: '24px 26px', maxWidth: 720, width: '100%',
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>Change plan</div>
                <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>
                  Currently on <strong style={{ textTransform: 'capitalize' }}>{currentPlan}</strong>.
                </div>
              </div>
              <button
                onClick={() => setShowPlanModal(false)}
                aria-label="Close"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: `1px solid ${SURFACE_BORDER}`, background: SURFACE,
                  cursor: 'pointer', fontSize: 18, color: TEXT_SECONDARY,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <ComparePlansGrid
                currentPlan={currentPlan}
                annualBilling={annualBilling}
                onAnnualToggle={setAnnualBilling}
                onSwitchPlan={switchPlan}
                planSwitching={planSwitching}
              />
            </div>
            {currentPlan !== 'free' && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <a
                  href={BILLING_PORTAL_URL}
                  target="_blank"
                  rel="noopener"
                  style={{ fontSize: 12, color: TEXT_SECONDARY, textDecoration: 'underline' }}
                >
                  Manage billing via customer portal
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .billing-row-2col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

void PLAN_LIMITS;
