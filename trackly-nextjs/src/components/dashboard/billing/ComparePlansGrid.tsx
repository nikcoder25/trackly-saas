'use client';

import { PLAN_LIMITS, PRICING_PLANS } from '@/lib/constants';
import { PLAN_CREDITS } from '@/lib/plan-config';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const HAIRLINE = '#f1f1ef';
const ACCENT = '#4f46e5';
const CURRENT_BG = '#f1f0fb';
const CURRENT_BORDER = '#d8d6f0';

const PLAN_TIERS: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
  owner: 99,
};

const PLAN_TAGLINES: Record<string, string> = {
  free: 'Test the waters',
  starter: 'Solo founders',
  pro: 'Growing brands',
  agency: 'Agencies & teams',
  enterprise: 'Custom contracts',
};

interface ComparePlansGridProps {
  currentPlan: string;
  annualBilling: boolean;
  onAnnualToggle: (next: boolean) => void;
  /** Called with the lowercase target plan key (e.g. 'pro'). */
  onSwitchPlan: (planKey: string) => void;
  planSwitching: string;
}

function autoRunCopy(p: string): string {
  const cfg = PLAN_CREDITS[p];
  if (!cfg) return '';
  if (!cfg.scheduledRuns) return 'No auto-run';
  const f = cfg.autoRunFrequency;
  if (f === 'weekly') return 'Weekly auto-run';
  if (f === 'every_2_days') return 'Auto-run every 2 days';
  return 'Daily auto-run';
}

function modelCopy(p: string): string {
  const cfg = PLAN_CREDITS[p];
  if (!cfg) return '';
  if (cfg.modelTier === 'premium') return 'Premium model · API · priority';
  if (p === 'pro') return 'Economy model · sentiment analysis';
  return 'Economy model only';
}

function platformCopy(p: string): string {
  const n = PLAN_CREDITS[p]?.maxPlatforms ?? 0;
  if (n >= 5) return 'All 5 AI platforms';
  return `${n} AI platform${n === 1 ? '' : 's'}`;
}

function brandsCopy(p: string): string {
  const n = PLAN_CREDITS[p]?.brandsCap ?? 0;
  if (n >= 9999) return 'unlimited brands';
  return `${n} brand${n === 1 ? '' : 's'}`;
}

function promptsCopy(p: string): string {
  const n = PLAN_CREDITS[p]?.trackedPromptsPerAccount ?? 0;
  if (n >= 9999) return '∞ prompts';
  return `${n} prompts`;
}

function creditsCopy(p: string): string {
  const n = PLAN_CREDITS[p]?.monthlyCredits ?? 0;
  if (n >= 99999) return 'Unlimited credits';
  return `${n.toLocaleString()} credits/mo`;
}

function cooldownSuffix(p: string): string {
  const s = PLAN_CREDITS[p]?.cooldownSeconds ?? 0;
  if (s <= 0) return '';
  if (s >= 60 && s % 60 === 0) return `, ${s / 60}m cooldown`;
  return `, ${s}s cooldown`;
}

function buildBullets(planKey: string): string[] {
  const bullets: string[] = [];
  bullets.push(`${promptsCopy(planKey)} · ${brandsCopy(planKey)}`);
  bullets.push(platformCopy(planKey));
  bullets.push(creditsCopy(planKey));

  const auto = autoRunCopy(planKey);
  const cool = cooldownSuffix(planKey);
  bullets.push(cool ? `${auto}${cool}` : auto);

  bullets.push(modelCopy(planKey));

  // GEO audits as a 6th bullet for plans where it's a meaningful number.
  const geo = PLAN_LIMITS[planKey]?.geoAudits ?? 0;
  if (geo > 0 && geo < 9999) bullets.push(`${geo} GEO audits/mo`);
  else if (geo >= 9999) bullets.push('Unlimited GEO audits');

  return bullets;
}

function fmtPrice(planKey: string, annualBilling: boolean): string {
  const p = PRICING_PLANS.find((x) => x.name.toLowerCase() === planKey);
  if (!p) return '—';
  if (p.price === 'Custom') return 'Custom';
  return annualBilling ? p.annualPrice || p.price : p.price;
}

export default function ComparePlansGrid({
  currentPlan,
  annualBilling,
  onAnnualToggle,
  onSwitchPlan,
  planSwitching,
}: ComparePlansGridProps) {
  const visiblePlans = ['free', 'starter', 'pro', 'agency'] as const;
  const currentTier = PLAN_TIERS[currentPlan] ?? 0;

  return (
    <section id="plan-comparison" style={{ scrollMarginTop: 16 }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              letterSpacing: -0.2,
            }}
          >
            Compare plans
          </h2>
          <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 4 }}>
            Switch anytime · prorated billing
          </div>
        </div>
        <BillingCycleToggle annual={annualBilling} onChange={onAnnualToggle} />
      </div>

      {/* Cards */}
      <div
        className="cpg-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        {visiblePlans.map((planKey) => {
          const isCurrent = planKey === currentPlan;
          const tier = PLAN_TIERS[planKey] ?? 0;
          const direction =
            isCurrent ? 'current' : tier > currentTier ? 'upgrade' : 'downgrade';
          const pricing = PRICING_PLANS.find((p) => p.name.toLowerCase() === planKey);
          const isCustom = pricing?.price === 'Custom';
          return (
            <div
              key={planKey}
              style={{
                position: 'relative',
                background: isCurrent ? CURRENT_BG : SURFACE,
                border: `1px solid ${isCurrent ? CURRENT_BORDER : SURFACE_BORDER}`,
                borderRadius: SURFACE_RADIUS,
                padding: '20px 18px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                minHeight: 360,
              }}
            >
              {isCurrent && (
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    padding: '3px 9px',
                    borderRadius: 999,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    background: ACCENT,
                    color: '#fff',
                  }}
                >
                  Current
                </span>
              )}

              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: TEXT_PRIMARY,
                    marginBottom: 2,
                  }}
                >
                  {pricing?.name ?? planKey}
                </div>
                <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>
                  {PLAN_TAGLINES[planKey] ?? '—'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: TEXT_PRIMARY,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: -0.5,
                    lineHeight: 1,
                  }}
                >
                  {fmtPrice(planKey, annualBilling)}
                </span>
                {!isCustom && (
                  <span
                    style={{
                      fontSize: 13,
                      color: TEXT_MUTED,
                      fontWeight: 500,
                    }}
                  >
                    /mo
                  </span>
                )}
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12.5,
                  color: TEXT_SECONDARY,
                  lineHeight: 1.45,
                }}
              >
                {buildBullets(planKey).map((line, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: 7,
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: isCurrent ? ACCENT : TEXT_MUTED,
                        flexShrink: 0,
                      }}
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                <PlanCta
                  direction={direction}
                  planKey={planKey}
                  isCustom={isCustom}
                  isSwitching={planSwitching === planKey}
                  onClick={() => onSwitchPlan(planKey)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer link */}
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <a
          href="#plan-comparison"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          style={{
            fontSize: 13,
            color: ACCENT,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          See full feature comparison →
        </a>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .cpg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 560px) {
          .cpg-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function BillingCycleToggle({
  annual,
  onChange,
}: {
  annual: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: HAIRLINE,
        padding: 3,
        borderRadius: 999,
        gap: 2,
      }}
    >
      <CycleButton active={!annual} onClick={() => onChange(false)}>
        Monthly
      </CycleButton>
      <CycleButton active={annual} onClick={() => onChange(true)}>
        Annual <span style={{ marginLeft: 4, color: '#0f7a3a', fontWeight: 700 }}>−20%</span>
      </CycleButton>
    </div>
  );
}

function CycleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        border: 'none',
        background: active ? SURFACE : 'transparent',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

function PlanCta({
  direction,
  planKey,
  isCustom,
  isSwitching,
  onClick,
}: {
  direction: 'current' | 'upgrade' | 'downgrade';
  planKey: string;
  isCustom: boolean;
  isSwitching: boolean;
  onClick: () => void;
}) {
  if (direction === 'current') {
    return (
      <button
        disabled
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: 10,
          border: `1px solid ${CURRENT_BORDER}`,
          background: SURFACE,
          color: ACCENT,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'default',
        }}
      >
        Your plan
      </button>
    );
  }
  if (isCustom) {
    return (
      <a
        href="/contact"
        style={{
          display: 'block',
          width: '100%',
          padding: '9px 12px',
          borderRadius: 10,
          background: '#161614',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        Contact us
      </a>
    );
  }
  const isUpgrade = direction === 'upgrade';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSwitching}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: 10,
        border: isUpgrade ? '1px solid #161614' : `1px solid ${SURFACE_BORDER}`,
        background: isUpgrade ? '#161614' : SURFACE,
        color: isUpgrade ? '#fff' : TEXT_PRIMARY,
        fontSize: 12,
        fontWeight: 700,
        cursor: isSwitching ? 'wait' : 'pointer',
        opacity: isSwitching ? 0.7 : 1,
      }}
    >
      {isSwitching ? 'Processing…' : isUpgrade ? `Upgrade to ${cap(planKey)}` : 'Downgrade'}
    </button>
  );
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
