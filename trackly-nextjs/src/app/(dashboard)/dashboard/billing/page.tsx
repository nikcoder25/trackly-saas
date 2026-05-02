'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, BILLING_PORTAL_URL, PRICING_PLANS } from '@/lib/constants';
import { PLAN_CREDITS } from '@/lib/plan-config';
import { useCredits } from '@/contexts/CreditsContext';
import { useBrands } from '@/contexts/BrandContext';
import UsageSection from '@/components/dashboard/billing/UsageSection';
import CurrentPlanCard from '@/components/dashboard/billing/CurrentPlanCard';
import NextInvoiceCard from '@/components/dashboard/billing/NextInvoiceCard';
import UsageAlertsCard from '@/components/dashboard/billing/UsageAlertsCard';
import RecentActivityCard from '@/components/dashboard/billing/RecentActivityCard';
import type { ActivityEntry } from '@/components/dashboard/billing/RecentActivityCard';
import ComparePlansGrid from '@/components/dashboard/billing/ComparePlansGrid';

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

  return (
    <div style={{ paddingBottom: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: -0.3 }}>
          Billing &amp; usage
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: TEXT_SECONDARY }}>
          Manage your subscription, track usage, and compare plans.
        </p>
      </header>

      <CurrentPlanCard
        planLabel={planLabel}
        priceLabel={
          currentPlanPricing?.price === 'Custom'
            ? 'Custom'
            : monthlyPriceLabel
        }
        cycleSuffix={cycleSuffix}
        renewsOn={creditStatus?.nextResetAt ?? null}
        memberSince={user?.createdAt ?? null}
        daysIntoMonth={periodInfo.daysIntoMonth}
        daysRemainingInMonth={periodInfo.daysRemainingInMonth}
        onManagePlan={handleManagePlan}
      />

      <div
        className="billing-row-2col"
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <NextInvoiceCard
          nextInvoiceAt={creditStatus?.nextResetAt ?? null}
          planLabel={planLabel}
          amountUsd={monthlyPriceUsd}
          noChargeReason={noChargeReason}
        />
        <UsageAlertsCard />
      </div>

      {!isOwner && (
        <UsageSection numBrandsFromPage={brands.length} />
      )}

      <div style={{ marginTop: 16 }}>
        <RecentActivityCard entries={billingHistory} />
      </div>

      <div style={{ marginTop: 24 }}>
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
        <div
          style={{
            marginTop: 24,
            background: SURFACE,
            border: `1px solid ${SURFACE_BORDER}`,
            borderRadius: SURFACE_RADIUS,
            padding: '20px 22px',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 12 }}>
            API cost breakdown
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: TEXT_SECONDARY, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Platform</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: TEXT_SECONDARY, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(apiCosts).sort((a, b) => b[1] - a[1]).map(([platform, cost]) => (
                  <tr key={platform} style={{ borderTop: '1px solid #f1f1ef' }}>
                    <td style={{ padding: '10px 0', color: TEXT_PRIMARY, fontWeight: 500 }}>{platform}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: TEXT_PRIMARY }}>
                      ${cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #ececec' }}>
                  <td style={{ padding: '10px 0', fontWeight: 700, color: TEXT_PRIMARY }}>Total</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: TEXT_PRIMARY }}>
                    ${Object.values(apiCosts).reduce((a, b) => a + b, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
