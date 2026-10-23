'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/SeoLayout';
import SiteShell from '@/components/site/SiteShell';
import { PLAN_LIMITS, PRICING_PLANS, PRICING_COMPARISON } from '@/lib/constants';
import { PLAN_CREDITS, ECONOMY_MODEL_BY_PLATFORM, PREMIUM_MODEL_BY_PLATFORM } from '@/lib/plan-config';

/**
 * Human names for the model ids in plan-config, so this FAQ can never drift
 * from what the engine actually calls. Unknown ids fall back to the raw id.
 */
const MODEL_LABELS: Record<string, string> = {
  'gpt-5.4-nano': 'GPT-5.4 nano',
  'gpt-5.4-mini': 'GPT-5.4 mini',
  'gpt-5.4': 'GPT-5.4',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'grok-3-mini': 'Grok 3 mini',
  'grok-4': 'Grok 4',
  'sonar': 'Perplexity Sonar',
  'sonar-pro': 'Perplexity Sonar Pro',
};
const MODEL_ORDER = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'];
function modelList(map: Record<string, string>): string {
  return MODEL_ORDER.filter((k) => map[k]).map((k) => MODEL_LABELS[map[k]] || map[k]).join(', ');
}
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
  // A daily cadence on a large prompt set can exceed the monthly budget -
  // clamp so we never advertise more scheduled scans (or spend) than the
  // credits actually cover.
  const cadenceRuns = RUNS_PER_MONTH[cfg.autoRunFrequency];
  const scheduledRuns = Math.min(cadenceRuns, Math.floor(cfg.monthlyCredits / fullScanCost));
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
    q: 'Does "unlimited brands" mean unlimited websites?',
    a: 'Yes. On Pro and Agency you can add as many websites or brands as you like. Free includes 1 brand and Starter includes 3.',
  },
  {
    q: 'Are tracked prompts per brand or for the whole account?',
    a: `For the whole account. Your plan's tracked prompts are shared across all your brands, and you decide how to split them. For example, Pro's ${PLAN_CREDITS.pro.trackedPromptsPerAccount} prompts could be 5 prompts for each of 5 brands, or 20 for one brand and 5 for another.`,
  },
  {
    q: 'Which AI platforms are included in my plan?',
    a: `We support 5 AI platforms: ChatGPT, Perplexity, Claude, Gemini and Grok. Free and Starter let you pick any ${PLAN_CREDITS.starter.maxPlatforms}, Pro lets you pick any ${PLAN_CREDITS.pro.maxPlatforms}, and Agency includes all ${PLAN_CREDITS.agency.maxPlatforms}. You choose them per brand in Brand Setup and can change them at any time.`,
  },
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
    a: `Economy uses fast, cost-efficient models (${modelList(ECONOMY_MODEL_BY_PLATFORM)}). The Premium tier on Agency unlocks ${modelList(PREMIUM_MODEL_BY_PLATFORM)} for deeper reasoning.`,
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

/** Worked "is this worth it" arithmetic, one per plan. */
const SCENARIOS = [
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
];

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <SiteShell>
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
      <section className="ls-wrap ls-hero-c" style={{ paddingBottom: 40, gap: 20 }}>
        <span className="ls-eyebrow">AI visibility tracker pricing</span>
        <h1 className="ls-h1 lg" style={{ maxWidth: 900 }}>One coffee a month to see <span className="ls-em">what AI says about you.</span></h1>
        <p className="ls-lead" style={{ maxWidth: 600 }}>
          Livesov starts at $9/mo. Every plan has a 7 day free trial with all 5 AI platforms. No credit card needed.
        </p>
        <div className="ls-toggle" role="group" aria-label="Billing period" style={{ marginTop: 8 }}>
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Annual <span className="save">-20%</span></button>
        </div>
      </section>

      {/* ── Plan cards ─────────────────────────────── */}
      <section className="ls-wrap" style={{ paddingTop: 24, paddingBottom: 72 }}>
        <div className="ls-grid ls-grid-3w" style={{ alignItems: 'stretch' }}>
          {PRICING_PLANS.filter((plan) => plan.name !== 'Free').map((plan) => {
            const pop = !!plan.featured;
            return (
              <div key={plan.name} className={'ls-tier' + (pop ? ' pop' : '')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{plan.name}</span>
                  {pop && <span className="ls-badge">Most popular</span>}
                </div>
                <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{plan.sub}</p>
                <div className="ls-tier-price" style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <b>{annual ? plan.annualPrice : plan.price}</b>
                  {annual && <s>{plan.price}</s>}
                  <span className="muted">{annual ? '/mo, billed yearly' : '/mo'}</span>
                </div>
                <div className="ls-mono muted" style={{ fontSize: 13 }}>{plan.headline.replace(/\/month$/, ' / month')}</div>
                <Link href="/signup" className={'ls-btn ls-btn-block ' + (pop ? 'ls-btn-pri' : 'ls-btn-out')}>{plan.cta}</Link>
                <p className="ls-mono muted" style={{ fontSize: 12, textAlign: 'center', marginTop: -6 }}>7 day free trial · No credit card</p>
                <hr />
                <ul>
                  {plan.features.map((f) => <li key={f}><CheckIcon /><span>{f}</span></li>)}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="ls-note" style={{ marginTop: 24, textAlign: 'center' }}>1 credit = 1 prompt checked on 1 engine. Cancel anytime. No setup fees.</p>
      </section>

      {/* ── Detailed plan comparison (mirrors dashboard) ───────── */}
      <section className="ls-wrap ls-sec" style={{ paddingTop: 48, paddingBottom: 48, gap: 32 }}>
        <div className="ls-sec-head">
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>Compare <span className="ls-em">every plan.</span></h2>
          <p className="ls-body">The same comparison your dashboard shows after sign in. Numbers come straight from the plan configuration, so they never drift.</p>
        </div>
        <div className="ls-table-box">
          <table className="ls-table">
            <caption className="ls-sr">Plan limits for Starter, Pro and Agency</caption>
            <thead>
              <tr>
                <th className="lbl" scope="col">Feature</th>
                {PUBLIC_TIERS.map((t) => {
                  const plan = TIER_TO_PLAN[t];
                  const displayPrice = annual && plan ? plan.annualPrice : (plan?.price ?? PLAN_CREDITS[t].price);
                  return (
                    <th key={t} scope="col" className={t === 'pro' ? 'hl' : undefined}>
                      {TIER_LABEL[t]} <span className="ls-mono" style={{ fontWeight: 400, fontSize: 13, opacity: 0.75 }}>{displayPrice}/mo</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="k">{row.feature}</th>
                  {PUBLIC_TIERS.map((t) => {
                    const v = row.values[t];
                    const label = v === '✓' ? 'Yes' : v === '✗' ? 'No' : v;
                    return <td key={t} className={t === 'pro' ? 'hl' : undefined}>{label}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Credit maths: what the allowance actually buys ─────── */}
      <section className="ls-wrap ls-sec" style={{ gap: 32 }}>
        <div className="ls-sec-head">
          <span className="ls-eyebrow">Credit maths</span>
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>
            What {PUBLIC_TIERS.map((t) => PLAN_CREDITS[t].monthlyCredits.toLocaleString()).join(', ')} credits <span className="ls-em">actually buy.</span>
          </h2>
          <p className="ls-body">
            One credit = one prompt sent to one AI platform, so a <strong>full scan</strong> (every tracked prompt
            against every platform your plan allows) costs prompts &times; platforms credits. Here is that
            arithmetic, worked out per plan.
          </p>
        </div>
        <div className="ls-grid ls-grid-3">
          {PUBLIC_TIERS.map((t) => {
            const m = CREDIT_MATH[t];
            return (
              <div key={t} className="ls-card ls-math ls-stack ls-gap-16" style={t === 'pro' ? { borderColor: 'var(--ls-accent)' } : undefined}>
                <span className="ls-kicker">{TIER_LABEL[t]}</span>
                <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em' }}>
                  {m.monthlyCredits.toLocaleString()}
                  <span className="ls-note" style={{ fontSize: 14, fontWeight: 400 }}> credits / mo</span>
                </div>
                <dl>
                  {[
                    ['One full scan costs', `${m.prompts} x ${m.platforms} = ${m.fullScanCost.toLocaleString()} credits`],
                    ['Full scans per month', `${m.fullScansPerMonth}`],
                    ['Scheduled scans included', `${m.scheduledRuns} (${autoRunLabel(PLAN_CREDITS[t].autoRunFrequency).toLowerCase()}${RUNS_PER_MONTH[PLAN_CREDITS[t].autoRunFrequency] > m.scheduledRuns ? ', capped by credits' : ''})`],
                    ['Cost per full scan', money(m.costPerScan)],
                  ].map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
                <p className="ls-small" style={{ fontSize: 14 }}>{creditVerdict(m)}</p>
              </div>
            );
          })}
        </div>
        <p className="ls-note">
          Scheduled scan counts assume a 30 day month. Credits reset at the start of every UTC month
          and do not roll over. Failed provider calls are refunded automatically, so a platform outage
          never costs you credits.
        </p>
      </section>

      {/* ── Total cost of ownership ──────────────────────── */}
      <section className="ls-wrap ls-sec" style={{ gap: 32 }}>
        <div className="ls-sec-head">
          <span className="ls-eyebrow">Total cost</span>
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>Total cost, <span className="ls-em">written out in full.</span></h2>
          <p className="ls-body">What you will actually be charged over twelve months, on both billing cycles. No setup fee, no per seat charge, no overage billing.</p>
        </div>
        <div className="ls-table-box">
          <table className="ls-table" aria-label="Total 12-month cost by plan and billing cycle">
            <caption className="ls-sr">Twelve-month total cost for each Livesov plan on monthly and annual billing</caption>
            <thead>
              <tr>
                {['Plan', 'Billed monthly', '12 month total', 'Billed annually', '12 month total', 'You save'].map((h, i) => (
                  <th key={h + i} scope="col" className={i === 0 ? 'lbl' : 'num'}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PUBLIC_TIERS.map((t) => {
                const m = CREDIT_MATH[t];
                const monthlyYear = m.monthlyPrice * 12;
                const annualYear = m.annualMonthlyPrice * 12;
                return (
                  <tr key={t}>
                    <th scope="row" className="k" style={{ fontWeight: 600 }}>{TIER_LABEL[t]}</th>
                    <td className="num">{money(m.monthlyPrice)}/mo</td>
                    <td className="num" style={{ color: 'var(--ls-ink)', fontWeight: 600 }}>{money(monthlyYear)}</td>
                    <td className="num">{money(m.annualMonthlyPrice)}/mo</td>
                    <td className="num" style={{ color: 'var(--ls-ink)', fontWeight: 600 }}>{money(annualYear)}</td>
                    <td className="num" style={{ color: 'var(--ls-green-ink)', fontWeight: 600 }}>{money(monthlyYear - annualYear)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ls-grid ls-grid-3">
          {SCENARIOS.map((s) => (
            <div key={s.plan} className="ls-card ls-stack ls-gap-10" style={{ padding: 28 }}>
              <span className="ls-kicker">{s.plan}</span>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{s.who}</h3>
              <p className="ls-small" style={{ fontSize: 14 }}>{s.body}</p>
            </div>
          ))}
        </div>
        <p className="ls-note">
          Prices in USD. Annual plans are charged once for the full 12 months; the credit
          allowance still resets monthly. Cancel anytime and keep access to the end of the paid period.
        </p>
      </section>

      {/* ── Competitor comparison ──────────────────────── */}
      <section className="ls-wrap ls-sec" style={{ gap: 32 }}>
        <div className="ls-sec-head">
          <span className="ls-eyebrow">Compare</span>
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>How our GEO tools <span className="ls-em">compare.</span></h2>
          <p className="ls-body">Built as AI brand monitoring software from day one, not bolted on to a legacy SEO suite.</p>
        </div>
        <div className="ls-table-box">
          <table className="ls-table" aria-label="Livesov vs Ahrefs vs Semrush feature comparison">
            <caption className="ls-sr">Feature comparison between Livesov, Ahrefs, and Semrush</caption>
            <thead>
              <tr>
                {PRICING_COMPARISON.headers.map((h, i) => (
                  <th key={h} scope="col" className={i === 0 ? 'lbl' : i === 1 ? 'hl-dark' : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PRICING_COMPARISON.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, ci) => (
                    ci === 0
                      ? <th key={ci} scope="row" className="k">{cell}</th>
                      : <td key={ci} className={ci === 1 ? 'hl' : undefined}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="ls-wrap ls-sec" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 48 }}>
        <div className="ls-stack ls-gap-16" style={{ flex: '1 1 320px' }}>
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 4vw, 48px)' }}>Questions, <span className="ls-em">answered.</span></h2>
          <p className="ls-body">Still unsure? <Link href="/contact">Talk to us</Link>.</p>
        </div>
        <div className="ls-faq" style={{ flex: '2 1 560px' }}>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary><span>{item.q}</span><span className="pm" aria-hidden="true">+</span></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Free audit CTA ──────────────────────────────── */}
      <section className="ls-wrap" style={{ paddingTop: 24, paddingBottom: 112 }}>
        <div className="ls-cta-band row">
          <div className="ls-stack ls-gap-10" style={{ maxWidth: 620 }}>
            <h2 className="ls-h2 sm">Not ready to pay? <span className="ls-em">Run a free audit.</span></h2>
            <p style={{ fontSize: 17 }}>No signup. About 90 seconds.</p>
          </div>
          <Link href="/geo-audit" className="ls-btn ls-btn-dark ls-btn-lg">Run my free audit</Link>
        </div>
      </section>
    </SiteShell>
  );
}
