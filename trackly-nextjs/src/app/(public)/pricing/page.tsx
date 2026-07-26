'use client';

import { useState } from 'react';
import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import { PLAN_LIMITS, PRICING_PLANS, PRICING_COMPARISON } from '@/lib/constants';
import { PLAN_CREDITS } from '@/lib/plan-config';
import type { AutoRunFrequency } from '@/lib/plan-config';

// The internal `free` tier still exists in plan-config (it's where
// cancelled accounts land), but it is no longer marketed - the public
// page shows the three paid plans only.
const PUBLIC_TIERS = ['starter', 'pro', 'agency'] as const;
type Tier = (typeof PUBLIC_TIERS)[number];
const TIER_LABEL: Record<Tier, string> = { starter: 'Starter', pro: 'Pro', agency: 'Agency' };

const TIER_TO_PLAN: Record<Tier, (typeof PRICING_PLANS)[number] | undefined> =
  Object.fromEntries(
    PUBLIC_TIERS.map((t) => [t, PRICING_PLANS.find((p) => p.name.toLowerCase() === t)]),
  ) as Record<Tier, (typeof PRICING_PLANS)[number] | undefined>;

const num = (n: number) => (n >= 9999 ? 'Unlimited' : n.toLocaleString());
const cooldownLabel = (s: number) => {
  if (s === 0) return 'None';
  if (s >= 60 && s % 60 === 0) {
    const m = s / 60;
    return m === 1 ? '1 min' : `${m} min`;
  }
  return `${s} sec`;
};
const autoRunLabel = (f: AutoRunFrequency | undefined) => {
  if (!f) return '-';
  if (f === 'weekly') return 'Weekly';
  if (f === 'every_2_days') return 'Every 2 days';
  return 'Daily';
};
const modelTierLabel = (t: Tier) => {
  const cfg = PLAN_CREDITS[t];
  if (cfg.modelTier === 'premium') return 'Premium unlocked';
  if (t === 'pro') return 'Economy (default)';
  return 'Economy only';
};
const platformsLabel = (t: Tier) => {
  const n = PLAN_CREDITS[t].maxPlatforms;
  return n >= 5 ? `${n} (all)` : String(n);
};
const manualCapLabel = (t: Tier) => {
  const n = PLAN_CREDITS[t].manualDailyCap;
  return n >= 9999 ? 'Unlimited' : `${n} / day`;
};
const brandsLabel = (t: Tier) => {
  const n = PLAN_CREDITS[t].brandsCap;
  return n >= 9999 ? 'Unlimited' : String(n);
};

// Mirrors the dashboard's Plan Comparison rows so the public page never
// drifts from billing/page.tsx - both read from PLAN_CREDITS + PLAN_LIMITS.
// Row order matches the v3 spec exactly (2026-04-27).
const COMPARISON_ROWS: Array<{
  feature: string;
  values: Record<Tier, string>;
}> = [
  {
    feature: 'Tracked prompts (account-wide)',
    values: {
      starter: num(PLAN_CREDITS.starter.trackedPromptsPerAccount),
      pro: num(PLAN_CREDITS.pro.trackedPromptsPerAccount),
      agency: num(PLAN_CREDITS.agency.trackedPromptsPerAccount),
    },
  },
  {
    feature: 'AI platforms (active)',
    values: {
      starter: platformsLabel('starter'),
      pro: platformsLabel('pro'),
      agency: platformsLabel('agency'),
    },
  },
  {
    feature: 'Brands',
    values: {
      starter: brandsLabel('starter'),
      pro: brandsLabel('pro'),
      agency: brandsLabel('agency'),
    },
  },
  {
    feature: 'Competitors tracked',
    values: {
      starter: String(PLAN_LIMITS.starter.competitors),
      pro: String(PLAN_LIMITS.pro.competitors),
      agency: String(PLAN_LIMITS.agency.competitors),
    },
  },
  {
    feature: 'Monthly credits',
    values: {
      starter: num(PLAN_CREDITS.starter.monthlyCredits),
      pro: num(PLAN_CREDITS.pro.monthlyCredits),
      agency: num(PLAN_CREDITS.agency.monthlyCredits),
    },
  },
  {
    feature: 'Auto-run frequency',
    values: {
      starter: autoRunLabel(PLAN_CREDITS.starter.autoRunFrequency),
      pro: autoRunLabel(PLAN_CREDITS.pro.autoRunFrequency),
      agency: autoRunLabel(PLAN_CREDITS.agency.autoRunFrequency),
    },
  },
  {
    feature: 'Manual Run Query cap',
    values: {
      starter: manualCapLabel('starter'),
      pro: manualCapLabel('pro'),
      agency: manualCapLabel('agency'),
    },
  },
  {
    feature: 'Cooldown per prompt',
    values: {
      starter: cooldownLabel(PLAN_CREDITS.starter.cooldownSeconds),
      pro: cooldownLabel(PLAN_CREDITS.pro.cooldownSeconds),
      agency: cooldownLabel(PLAN_CREDITS.agency.cooldownSeconds),
    },
  },
  {
    feature: 'Model tier',
    values: {
      starter: modelTierLabel('starter'),
      pro: modelTierLabel('pro'),
      agency: modelTierLabel('agency'),
    },
  },
  {
    feature: 'GEO Audits / month',
    values: {
      starter: String(PLAN_LIMITS.starter.geoAudits),
      pro: String(PLAN_LIMITS.pro.geoAudits),
      agency: String(PLAN_LIMITS.agency.geoAudits),
    },
  },
  {
    feature: 'Sentiment analysis',
    values: {
      starter: PLAN_LIMITS.starter.sentiment ? '✓' : '✗',
      pro: PLAN_LIMITS.pro.sentiment ? '✓' : '✗',
      agency: PLAN_LIMITS.agency.sentiment ? '✓' : '✗',
    },
  },
  {
    feature: 'API access',
    values: { starter: '✗', pro: '✗', agency: '✓' },
  },
  {
    feature: 'Priority support',
    values: {
      starter: PLAN_LIMITS.starter.prioritySupport ? '✓' : '✗',
      pro: PLAN_LIMITS.pro.prioritySupport ? '✓' : '✗',
      agency: PLAN_LIMITS.agency.prioritySupport ? '✓' : '✗',
    },
  },
];

// ── Credit maths + total cost ────────────────────────────────────────────
// Every number below is DERIVED from PLAN_CREDITS / PRICING_PLANS rather
// than typed by hand, so "what 750 credits actually buys" can never drift
// from what the backend enforces or from the price on the card above.
//
// One credit = one query sent to one AI platform. So a *full scan* - every
// tracked prompt run against every platform the plan allows - costs
// (trackedPromptsPerAccount x maxPlatforms) credits.
const priceNum = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
const money = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2).replace(/\.00$/, '')}`;

/** Scheduled runs a plan's cadence fires in a 30-day month. */
const RUNS_PER_MONTH: Record<AutoRunFrequency, number> = {
  weekly: 4,
  every_2_days: 15,
  daily: 30,
};

interface CreditMath {
  tier: Tier;
  monthlyCredits: number;
  prompts: number;
  platforms: number;
  /** Credits burned by one full scan of every prompt on every platform. */
  fullScanCost: number;
  fullScansPerMonth: number;
  scheduledRuns: number;
  scheduledSpend: number;
  /** Extra full scans still affordable after the scheduled cadence runs. */
  headroomScans: number;
  /** Prompts you can scan on EVERY platform, every day, within budget. */
  dailyPromptCapacity: number;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  costPerScan: number;
}

const buildCreditMath = (t: Tier): CreditMath => {
  const cfg = PLAN_CREDITS[t];
  const plan = TIER_TO_PLAN[t];
  const fullScanCost = cfg.trackedPromptsPerAccount * cfg.maxPlatforms;
  const scheduledRuns = RUNS_PER_MONTH[cfg.autoRunFrequency];
  // A daily cadence on a large prompt set can exceed the monthly budget -
  // clamp so we never advertise more scheduled spend than credits exist.
  const scheduledSpend = Math.min(cfg.monthlyCredits, scheduledRuns * fullScanCost);
  const monthlyPrice = priceNum(plan?.price ?? cfg.price);
  return {
    tier: t,
    monthlyCredits: cfg.monthlyCredits,
    prompts: cfg.trackedPromptsPerAccount,
    platforms: cfg.maxPlatforms,
    fullScanCost,
    fullScansPerMonth: Math.floor(cfg.monthlyCredits / fullScanCost),
    scheduledRuns,
    scheduledSpend,
    headroomScans: Math.floor((cfg.monthlyCredits - scheduledSpend) / fullScanCost),
    dailyPromptCapacity: Math.floor(cfg.monthlyCredits / 30 / cfg.maxPlatforms),
    monthlyPrice,
    annualMonthlyPrice: priceNum(plan?.annualPrice ?? cfg.price),
    costPerScan: (monthlyPrice / cfg.monthlyCredits) * fullScanCost,
  };
};

const CREDIT_MATH: Record<Tier, CreditMath> = Object.fromEntries(
  PUBLIC_TIERS.map((t) => [t, buildCreditMath(t)]),
) as Record<Tier, CreditMath>;

/**
 * Plain-English answer to "what does my monthly credit allowance actually
 * get me?" - the sentence a buyer needs before they can compare plans.
 */
const creditVerdict = (m: CreditMath): string => {
  const scan = `${m.prompts} prompts x ${m.platforms} platforms = ${m.fullScanCost.toLocaleString()} credits`;
  if (m.dailyPromptCapacity >= m.prompts) {
    return `${scan}. Your full set runs every single day (${m.scheduledSpend.toLocaleString()} credits/month) and still leaves ${(m.monthlyCredits - m.scheduledSpend).toLocaleString()} credits - about ${m.headroomScans} extra on-demand scans - for the weeks you need to check something now.`;
  }
  if (m.headroomScans > 0) {
    return `${scan}. The ${m.scheduledRuns} scheduled scans in a month use ${m.scheduledSpend.toLocaleString()} credits, leaving ${(m.monthlyCredits - m.scheduledSpend).toLocaleString()} credits - roughly ${m.headroomScans} extra on-demand scans - for launches, PR moments, and spot checks.`;
  }
  return `${scan}. That funds ${m.fullScansPerMonth} complete scans a month. If you want to scan daily instead, budget covers about ${m.dailyPromptCapacity} prompts across all ${m.platforms} platforms every day - so track your ${m.dailyPromptCapacity} highest-intent prompts daily and rotate the long tail weekly.`;
};

const FAQ = [
  {
    q: 'What is one AI credit?',
    a: 'One credit = one query sent to one AI platform. A run with 10 queries across 3 platforms uses 30 credits. Credits refresh at the start of every UTC month.',
  },
  {
    q: 'What happens when I run out of credits?',
    a: 'Manual runs are blocked until the next monthly reset or you upgrade. Scheduled runs pause and resume automatically when credits return.',
  },
  {
    q: 'Is there a free trial?',
    a: `Yes. Every paid plan starts with a 7-day free trial - no credit card required. You get ${PLAN_CREDITS.trial.monthlyCredits.toLocaleString()} credits (scans), all 5 AI platforms, and 30 tracked prompts (account-wide) to evaluate the product.`,
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel in one click from your billing portal. You keep access through the end of the current billing period, and your data is preserved so you can pick up where you left off if you resubscribe.',
  },
  {
    q: 'Economy vs. Premium AI models - what changes?',
    a: 'Economy uses fast, cost-efficient models (GPT-5 mini, Claude Haiku 4.5, Gemini 3 Flash-Lite, Perplexity Sonar, Grok 4 Mini). Premium tier (Agency) unlocks Claude Sonnet 4.5, Gemini 3 Pro, Sonar Pro, and Grok 5 for deeper reasoning.',
  },
  {
    q: 'How does annual billing work?',
    a: `Annual billing is charged once, up front, for 12 months and saves roughly 20% versus paying monthly. Starter is ${money(CREDIT_MATH.starter.monthlyPrice * 12)}/year billed monthly or ${money(CREDIT_MATH.starter.annualMonthlyPrice * 12)} billed annually. Pro is ${money(CREDIT_MATH.pro.monthlyPrice * 12)} vs ${money(CREDIT_MATH.pro.annualMonthlyPrice * 12)}. Agency is ${money(CREDIT_MATH.agency.monthlyPrice * 12)} vs ${money(CREDIT_MATH.agency.annualMonthlyPrice * 12)}. Your credit allowance still resets monthly - annual billing changes the invoice, not the limits. Toggle the switch at the top of this page to see annual prices on the cards.`,
  },
  {
    q: `What does ${PLAN_CREDITS.starter.monthlyCredits.toLocaleString()} credits actually buy me on Starter?`,
    a: creditVerdict(CREDIT_MATH.starter),
  },
  {
    q: `What does ${PLAN_CREDITS.pro.monthlyCredits.toLocaleString()} credits actually buy me on Pro?`,
    a: creditVerdict(CREDIT_MATH.pro),
  },
  {
    q: `What does ${PLAN_CREDITS.agency.monthlyCredits.toLocaleString()} credits actually buy me on Agency?`,
    a: creditVerdict(CREDIT_MATH.agency),
  },
  {
    q: 'Are there setup fees, overage charges, or per-seat costs?',
    a: 'No. The monthly or annual price is the total cost - there is no setup fee, no per-seat charge, and no overage billing. Credits are a hard ceiling rather than a meter: when they run out, runs pause until the next monthly reset or until you upgrade. You can never receive a surprise invoice larger than the plan price you agreed to.',
  },
  {
    q: 'I need more than Agency offers.',
    a: 'Reach out via the Contact page - we can put together a custom plan with higher credit limits, dedicated support, and custom integrations.',
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Pricing', url: '/pricing' }]} />
      {/* FAQPage JSON-LD: the FAQ below renders custom markup instead of the
          shared FaqSection (which injects schema itself), so emit it here. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />

      {/* ── Hero ───────────────────────────────── */}
      <section style={{ padding: '80px 24px 32px', textAlign: 'center', background: 'var(--bg-landing)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <span style={{
            display: 'inline-block', padding: '6px 14px', borderRadius: 100,
            background: 'rgba(99,102,241,.08)', color: 'var(--primary)',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
            marginBottom: 18,
          }}>
            Pricing
          </span>
          <h1 style={{
            fontSize: 48, fontWeight: 800, letterSpacing: -1.5,
            color: 'var(--text-primary)', marginBottom: 14, lineHeight: 1.1,
          }}>
            Simple pricing for generative engine optimization tools
          </h1>
          <p style={{
            fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.6,
            margin: '0 auto 8px', maxWidth: 580,
          }}>
            Livesov&apos;s generative engine optimization tools start at $9/mo. Every paid plan begins with a 7-day free trial - all 5 AI platforms included, no credit card required.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', marginBottom: 36 }}>
            Cancel anytime · 14-day money-back guarantee · No setup fees
          </p>

          {/* Billing toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            <span style={{
              fontSize: 14, fontWeight: annual ? 500 : 700,
              color: annual ? 'var(--text-secondary)' : 'var(--text-primary)',
            }}>
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnual(!annual)}
              aria-label="Toggle annual billing"
              aria-pressed={annual}
              style={{
                position: 'relative', width: 52, height: 28, border: 'none', borderRadius: 100,
                background: annual ? 'var(--primary)' : '#cbd5e1',
                cursor: 'pointer', transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: annual ? 27 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.18)',
              }} />
            </button>
            <span style={{
              fontSize: 14, fontWeight: annual ? 700 : 500,
              color: annual ? 'var(--text-primary)' : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              Annual
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                background: 'rgba(16,185,129,.12)', color: '#059669',
              }}>
                save 20%
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Plan cards ─────────────────────────────── */}
      <section style={{ padding: '24px 24px 64px', background: 'var(--bg-landing)' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}>
          {PRICING_PLANS.filter((plan) => plan.name !== 'Free').map((plan) => {
            const featured = !!plan.featured;
            const showTrial = plan.name !== 'Free';
            const isAnnual = annual && plan.price !== '$0';
            const displayPrice = annual ? plan.annualPrice : plan.price;
            return (
              <div
                key={plan.name}
                style={{
                  position: 'relative', display: 'flex', flexDirection: 'column',
                  padding: '32px 24px', borderRadius: 16,
                  background: featured ? 'linear-gradient(160deg, #6366f1 0%, #818cf8 100%)' : '#fff',
                  color: featured ? '#fff' : 'var(--text-primary)',
                  border: featured ? 'none' : '1px solid var(--card-border)',
                  boxShadow: featured
                    ? '0 20px 40px -12px rgba(99,102,241,.45)'
                    : '0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.03)',
                  transition: 'transform .2s, box-shadow .2s',
                }}
              >
                {featured && (
                  <span style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 10, fontWeight: 800, letterSpacing: 1,
                    padding: '5px 14px', borderRadius: 100,
                    background: '#fff', color: 'var(--primary)',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,.12)',
                  }}>
                    Most popular
                  </span>
                )}

                <div style={{
                  fontSize: 14, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                  color: featured ? 'rgba(255,255,255,.85)' : 'var(--text-secondary)',
                  marginBottom: 10,
                }}>
                  {plan.name}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1 }}>
                    {displayPrice}
                  </span>
                  {isAnnual && (
                    <span style={{
                      fontSize: 18, fontWeight: 600, textDecoration: 'line-through',
                      color: featured ? 'rgba(255,255,255,.6)' : 'var(--text-muted, #94a3b8)',
                    }}>
                      {plan.price}
                    </span>
                  )}
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: featured ? 'rgba(255,255,255,.75)' : 'var(--text-muted, #94a3b8)',
                  }}>
                    /mo
                  </span>
                </div>
                <div style={{
                  fontSize: 12, minHeight: 18, marginBottom: 14,
                  color: featured ? 'rgba(255,255,255,.75)' : 'var(--text-muted, #94a3b8)',
                }}>
                  {plan.price === '$0'
                    ? ' '
                    : isAnnual
                      ? 'Billed annually · save 20%'
                      : 'Billed monthly'}
                </div>

                <div style={{
                  padding: '14px 16px', borderRadius: 12, marginBottom: 18,
                  background: featured ? 'rgba(255,255,255,.14)' : 'rgba(99,102,241,.06)',
                  border: featured ? '1px solid rgba(255,255,255,.18)' : '1px solid rgba(99,102,241,.14)',
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                    color: featured ? 'rgba(255,255,255,.8)' : 'var(--primary)',
                    marginBottom: 2,
                  }}>
                    Includes
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
                    {plan.headline}
                  </div>
                </div>

                <p style={{
                  fontSize: 13, lineHeight: 1.5, marginBottom: 14,
                  color: featured ? 'rgba(255,255,255,.85)' : 'var(--text-secondary)',
                }}>
                  {plan.sub}
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        fontSize: 13.5, lineHeight: 1.5,
                        color: featured ? 'rgba(255,255,255,.92)' : 'var(--text-primary)',
                      }}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 16 16" fill="none"
                        style={{ flexShrink: 0, marginTop: 2 }}
                        aria-hidden="true"
                      >
                        <path
                          d="M13.3 4.3L6 11.6L2.7 8.3"
                          stroke={featured ? '#fff' : '#10b981'}
                          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    transition: 'transform .15s, background .15s',
                    background: featured ? '#fff' : 'var(--primary)',
                    color: featured ? 'var(--primary)' : '#fff',
                    boxShadow: featured ? 'none' : '0 1px 2px rgba(99,102,241,.4)',
                    marginTop: 'auto',
                  }}
                >
                  {plan.cta}
                </Link>

                {showTrial && (
                  <p style={{
                    fontSize: 11, textAlign: 'center', marginTop: 10, marginBottom: 0,
                    color: featured ? 'rgba(255,255,255,.75)' : 'var(--text-muted, #94a3b8)',
                  }}>
                    7-day free trial · No credit card
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Detailed plan comparison (mirrors dashboard) ───────── */}
      <section style={{ padding: '64px 24px', background: 'var(--bg-section)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 32, fontWeight: 800, letterSpacing: -0.6,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              Compare every feature
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              maxWidth: 560, margin: '0 auto', lineHeight: 1.6,
            }}>
              The same comparison your dashboard shows after sign-in. No fine print.
            </p>
          </div>

          <div style={{
            background: '#fff', borderRadius: 16, overflow: 'hidden',
            border: '1px solid var(--card-border)',
            boxShadow: '0 1px 3px rgba(15,23,42,.04)',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720,
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <th style={{
                      textAlign: 'left', padding: '20px 22px', fontWeight: 700,
                      color: 'var(--text-secondary)', fontSize: 12, letterSpacing: 0.5,
                      textTransform: 'uppercase', width: '32%',
                    }}>
                      Feature
                    </th>
                    {PUBLIC_TIERS.map((t) => {
                      const isPro = t === 'pro';
                      const plan = TIER_TO_PLAN[t];
                      const displayPrice = annual && plan ? plan.annualPrice : (plan?.price ?? PLAN_CREDITS[t].price);
                      return (
                        <th
                          key={t}
                          style={{
                            padding: '20px 14px', textAlign: 'center',
                            background: isPro ? 'rgba(99,102,241,.06)' : 'transparent',
                            borderLeft: isPro ? '2px solid var(--primary)' : 'none',
                            borderRight: isPro ? '2px solid var(--primary)' : 'none',
                          }}
                        >
                          <div style={{
                            fontSize: 13, fontWeight: 700, letterSpacing: 0.4,
                            textTransform: 'uppercase',
                            color: isPro ? 'var(--primary)' : 'var(--text-secondary)',
                            marginBottom: 4,
                          }}>
                            {TIER_LABEL[t]}
                          </div>
                          <div style={{
                            fontSize: 22, fontWeight: 800, color: 'var(--text-primary)',
                            letterSpacing: -0.5,
                          }}>
                            {displayPrice}
                            <span style={{
                              fontSize: 12, fontWeight: 500,
                              color: 'var(--text-muted, #94a3b8)',
                            }}>
                              /mo
                            </span>
                          </div>
                          {isPro && (
                            <span style={{
                              display: 'inline-block', marginTop: 6,
                              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
                              padding: '2px 8px', borderRadius: 100,
                              background: 'var(--primary)', color: '#fff',
                              textTransform: 'uppercase',
                            }}>
                              Most popular
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      style={{
                        borderBottom: i < COMPARISON_ROWS.length - 1
                          ? '1px solid var(--card-border)'
                          : 'none',
                        background: i % 2 === 1 ? 'rgba(15,23,42,.015)' : 'transparent',
                      }}
                    >
                      <td style={{
                        textAlign: 'left', padding: '14px 22px',
                        fontWeight: 500, color: 'var(--text-primary)',
                      }}>
                        {row.feature}
                      </td>
                      {PUBLIC_TIERS.map((t) => {
                        const v = row.values[t];
                        const isPro = t === 'pro';
                        const isCheck = v === '✓';
                        const isDash = v === '–';
                        return (
                          <td
                            key={t}
                            style={{
                              padding: '14px 14px', textAlign: 'center',
                              background: isPro ? 'rgba(99,102,241,.04)' : 'transparent',
                              borderLeft: isPro ? '2px solid var(--primary)' : 'none',
                              borderRight: isPro ? '2px solid var(--primary)' : 'none',
                              fontWeight: isPro ? 700 : 500,
                              color: isCheck
                                ? '#10b981'
                                : isDash
                                  ? 'var(--text-muted, #94a3b8)'
                                  : isPro
                                    ? 'var(--primary)'
                                    : 'var(--text-primary)',
                              fontSize: isCheck ? 18 : 14,
                            }}
                          >
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{
            fontSize: 12, color: 'var(--text-muted, #94a3b8)',
            textAlign: 'center', marginTop: 20,
          }}>
            Numbers above are sourced directly from the dashboard&apos;s plan configuration.
            Backend limits and these published values can never drift.
          </p>
        </div>
      </section>

      {/* ── Credit maths: what the allowance actually buys ─────── */}
      <section style={{ padding: '64px 24px', background: 'var(--bg-landing)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 32, fontWeight: 800, letterSpacing: -0.6,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              What {PUBLIC_TIERS.map((t) => PLAN_CREDITS[t].monthlyCredits.toLocaleString()).join(', ')} credits actually buy
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              maxWidth: 620, margin: '0 auto', lineHeight: 1.6,
            }}>
              &ldquo;Credits&rdquo; is a meaningless unit until you can convert it into scans. One credit
              = one prompt sent to one AI platform, so a <strong>full scan</strong> - every tracked prompt
              against every platform your plan allows - costs (prompts &times; platforms) credits. Here is
              that arithmetic, worked out per plan.
            </p>
          </div>

          <div style={{
            display: 'grid', gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {PUBLIC_TIERS.map((t) => {
              const m = CREDIT_MATH[t];
              const isPro = t === 'pro';
              return (
                <div
                  key={t}
                  style={{
                    background: '#fff', borderRadius: 16, padding: '26px 24px',
                    border: isPro ? '2px solid var(--primary)' : '1px solid var(--card-border)',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: isPro ? 'var(--primary)' : 'var(--text-secondary)',
                    marginBottom: 6,
                  }}>
                    {TIER_LABEL[t]}
                  </div>
                  <div style={{
                    fontSize: 30, fontWeight: 800, letterSpacing: -0.8,
                    color: 'var(--text-primary)', marginBottom: 2,
                  }}>
                    {m.monthlyCredits.toLocaleString()}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>
                      {' '}credits / mo
                    </span>
                  </div>

                  <dl style={{ margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      ['One full scan costs', `${m.prompts} x ${m.platforms} = ${m.fullScanCost.toLocaleString()} credits`],
                      ['Full scans per month', `${m.fullScansPerMonth}`],
                      ['Scheduled scans included', `${m.scheduledRuns} (${autoRunLabel(PLAN_CREDITS[t].autoRunFrequency).toLowerCase()})`],
                      ['Cost per full scan', money(m.costPerScan)],
                    ].map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: 12,
                        fontSize: 13.5, lineHeight: 1.5,
                        borderBottom: '1px dashed var(--card-border)', paddingBottom: 8,
                      }}>
                        <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
                        <dd style={{
                          margin: 0, fontWeight: 700, textAlign: 'right',
                          color: 'var(--text-primary)',
                        }}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p style={{
                    margin: '16px 0 0', fontSize: 13.5, lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                  }}>
                    {creditVerdict(m)}
                  </p>
                </div>
              );
            })}
          </div>

          <p style={{
            fontSize: 12, color: 'var(--text-muted, #94a3b8)',
            textAlign: 'center', marginTop: 22, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto',
            lineHeight: 1.6,
          }}>
            Scheduled-scan counts assume a 30-day month. Credits reset at the start of every UTC month
            and do not roll over. Failed provider calls are refunded automatically, so a platform outage
            never costs you credits.
          </p>
        </div>
      </section>

      {/* ── Total cost of ownership ──────────────────────── */}
      <section style={{ padding: '64px 24px', background: 'var(--bg-section)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 32, fontWeight: 800, letterSpacing: -0.6,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              Total cost, written out in full
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              maxWidth: 620, margin: '0 auto', lineHeight: 1.6,
            }}>
              What you will actually be charged over twelve months, on both billing cycles.
              No setup fee, no per-seat charge, no overage billing.
            </p>
          </div>

          <div style={{
            background: '#fff', borderRadius: 16, overflow: 'hidden',
            border: '1px solid var(--card-border)',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 680 }}
                aria-label="Total 12-month cost by plan and billing cycle"
              >
                <caption className="sr-only">
                  Twelve-month total cost for each Livesov plan on monthly and annual billing
                </caption>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                    {['Plan', 'Billed monthly', '12-month total', 'Billed annually', '12-month total', 'You save'].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          padding: '16px 18px', textAlign: i === 0 ? 'left' : 'right',
                          fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5,
                          textTransform: 'uppercase', color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PUBLIC_TIERS.map((t, ri) => {
                    const m = CREDIT_MATH[t];
                    const monthlyYear = m.monthlyPrice * 12;
                    const annualYear = m.annualMonthlyPrice * 12;
                    const saving = monthlyYear - annualYear;
                    const isPro = t === 'pro';
                    return (
                      <tr
                        key={t}
                        style={{
                          borderBottom: ri < PUBLIC_TIERS.length - 1 ? '1px solid var(--card-border)' : 'none',
                          background: isPro ? 'rgba(99,102,241,.04)' : 'transparent',
                        }}
                      >
                        <th scope="row" style={{
                          padding: '16px 18px', textAlign: 'left', fontWeight: 700,
                          color: isPro ? 'var(--primary)' : 'var(--text-primary)',
                        }}>
                          {TIER_LABEL[t]}
                        </th>
                        <td style={{ padding: '16px 18px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {money(m.monthlyPrice)}/mo
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {money(monthlyYear)}
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {money(m.annualMonthlyPrice)}/mo
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {money(annualYear)}
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                          {money(saving)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Worked scenarios - the "is this worth it" arithmetic */}
          <div style={{
            display: 'grid', gap: 16, marginTop: 26,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {[
              {
                who: 'Solo founder, one brand',
                plan: 'Starter',
                body: `${money(CREDIT_MATH.starter.monthlyPrice)}/mo (${money(CREDIT_MATH.starter.annualMonthlyPrice * 12)}/year on annual). Tracks ${CREDIT_MATH.starter.prompts} buyer-intent prompts across ${CREDIT_MATH.starter.platforms} platforms, scanned ${autoRunLabel(PLAN_CREDITS.starter.autoRunFrequency).toLowerCase()}. Works out to ${money(CREDIT_MATH.starter.costPerScan)} per full scan.`,
              },
              {
                who: 'In-house marketing team',
                plan: 'Pro',
                body: `${money(CREDIT_MATH.pro.monthlyPrice)}/mo (${money(CREDIT_MATH.pro.annualMonthlyPrice * 12)}/year on annual). ${CREDIT_MATH.pro.prompts} prompts across ${CREDIT_MATH.pro.platforms} platforms with daily scans and sentiment analysis - ${money(CREDIT_MATH.pro.costPerScan)} per full scan, or about ${money(CREDIT_MATH.pro.monthlyPrice / 30)} a day.`,
              },
              {
                who: 'Agency, 10 client brands',
                plan: 'Agency',
                body: `${money(CREDIT_MATH.agency.monthlyPrice)}/mo (${money(CREDIT_MATH.agency.annualMonthlyPrice * 12)}/year on annual) covers unlimited brands, so ten clients is ${money(CREDIT_MATH.agency.monthlyPrice / 10)} per client per month. ${CREDIT_MATH.agency.prompts} prompts account-wide across all ${CREDIT_MATH.agency.platforms} platforms, plus API access and premium models.`,
              },
            ].map((s) => (
              <div key={s.plan} style={{
                background: '#fff', borderRadius: 14, padding: '22px 22px',
                border: '1px solid var(--card-border)',
              }}>
                <div style={{
                  fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6,
                  textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 8,
                }}>
                  {s.plan}
                </div>
                <h3 style={{
                  fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
                  margin: '0 0 8px',
                }}>
                  {s.who}
                </h3>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 12, color: 'var(--text-muted, #94a3b8)',
            textAlign: 'center', marginTop: 22,
          }}>
            Prices in USD. Annual plans are charged once for the full 12 months; the credit
            allowance still resets monthly. Cancel anytime - you keep access to the end of the paid period.
          </p>
        </div>
      </section>

      {/* ── Competitor comparison ──────────────────────── */}
      <section style={{ padding: '64px 24px', background: 'var(--bg-landing)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 30, fontWeight: 800, letterSpacing: -0.5,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              How our generative engine optimization tools compare
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              maxWidth: 560, margin: '0 auto', lineHeight: 1.6,
            }}>
              Built as AI brand monitoring software from day one - not bolted on to a legacy SEO suite.
            </p>
          </div>

          <div style={{
            background: '#fff', borderRadius: 16, overflow: 'hidden',
            border: '1px solid var(--card-border)',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
                aria-label="Livesov vs Ahrefs vs Semrush feature comparison"
              >
                <caption className="sr-only">Feature comparison between Livesov, Ahrefs, and Semrush</caption>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                    {PRICING_COMPARISON.headers.map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '18px 20px', textAlign: 'left',
                          fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: i === 1 ? 'var(--primary)' : 'var(--text-secondary)',
                          background: i === 1 ? 'rgba(99,102,241,.04)' : 'transparent',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRICING_COMPARISON.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      style={{
                        borderBottom: ri < PRICING_COMPARISON.rows.length - 1
                          ? '1px solid var(--card-border)'
                          : 'none',
                      }}
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: '14px 20px',
                            fontWeight: ci === 0 ? 600 : ci === 1 ? 700 : 500,
                            color: ci === 0
                              ? 'var(--text-primary)'
                              : ci === 1
                                ? 'var(--primary)'
                                : 'var(--text-secondary)',
                            background: ci === 1 ? 'rgba(99,102,241,.04)' : 'transparent',
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section style={{ padding: '64px 24px 96px', background: 'var(--bg-section)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{
              fontSize: 30, fontWeight: 800, letterSpacing: -0.5,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              Pricing questions
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              Still wondering? <Link href="/contact" style={{ color: 'var(--primary)', fontWeight: 600 }}>Get in touch</Link>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="lp-faq-item"
                style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid var(--card-border)',
                  padding: '18px 22px',
                }}
              >
                <summary style={{
                  cursor: 'pointer', listStyle: 'none',
                  fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12,
                }}>
                  <span>{item.q}</span>
                  <span aria-hidden="true" className="lp-faq-icon" style={{
                    flexShrink: 0, color: 'var(--primary)', fontSize: 22, fontWeight: 400,
                    lineHeight: 1, transition: 'transform .2s',
                  }}>
                    +
                  </span>
                </summary>
                <p style={{
                  margin: '12px 0 0', fontSize: 14, lineHeight: 1.7,
                  color: 'var(--text-secondary)',
                }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .lp-faq-item summary::-webkit-details-marker { display: none; }
        .lp-faq-item[open] .lp-faq-icon { transform: rotate(45deg); }
        .lp-faq-item:hover { border-color: rgba(99,102,241,.4); }
      `}</style>
    </SeoLayout>
  );
}
