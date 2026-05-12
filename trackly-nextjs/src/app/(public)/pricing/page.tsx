'use client';

import { useState } from 'react';
import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import { PLAN_LIMITS, PRICING_PLANS, PRICING_COMPARISON } from '@/lib/constants';
import { PLAN_CREDITS } from '@/lib/plan-config';
import type { AutoRunFrequency } from '@/lib/plan-config';

const PUBLIC_TIERS = ['free', 'starter', 'pro', 'agency'] as const;
type Tier = (typeof PUBLIC_TIERS)[number];
const TIER_LABEL: Record<Tier, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', agency: 'Agency' };

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
// drifts from billing/page.tsx — both read from PLAN_CREDITS + PLAN_LIMITS.
// Row order matches the v3 spec exactly (2026-04-27).
const COMPARISON_ROWS: Array<{
  feature: string;
  values: Record<Tier, string>;
}> = [
  {
    feature: 'Tracked prompts (account-wide)',
    values: {
      free: num(PLAN_CREDITS.free.trackedPromptsPerAccount),
      starter: num(PLAN_CREDITS.starter.trackedPromptsPerAccount),
      pro: num(PLAN_CREDITS.pro.trackedPromptsPerAccount),
      agency: num(PLAN_CREDITS.agency.trackedPromptsPerAccount),
    },
  },
  {
    feature: 'AI platforms (active)',
    values: {
      free: platformsLabel('free'),
      starter: platformsLabel('starter'),
      pro: platformsLabel('pro'),
      agency: platformsLabel('agency'),
    },
  },
  {
    feature: 'Brands',
    values: {
      free: brandsLabel('free'),
      starter: brandsLabel('starter'),
      pro: brandsLabel('pro'),
      agency: brandsLabel('agency'),
    },
  },
  {
    feature: 'Competitors tracked',
    values: {
      free: String(PLAN_LIMITS.free.competitors),
      starter: String(PLAN_LIMITS.starter.competitors),
      pro: String(PLAN_LIMITS.pro.competitors),
      agency: String(PLAN_LIMITS.agency.competitors),
    },
  },
  {
    feature: 'Monthly credits',
    values: {
      free: num(PLAN_CREDITS.free.monthlyCredits),
      starter: num(PLAN_CREDITS.starter.monthlyCredits),
      pro: num(PLAN_CREDITS.pro.monthlyCredits),
      agency: num(PLAN_CREDITS.agency.monthlyCredits),
    },
  },
  {
    feature: 'Auto-run frequency',
    values: {
      free: autoRunLabel(PLAN_CREDITS.free.autoRunFrequency),
      starter: autoRunLabel(PLAN_CREDITS.starter.autoRunFrequency),
      pro: autoRunLabel(PLAN_CREDITS.pro.autoRunFrequency),
      agency: autoRunLabel(PLAN_CREDITS.agency.autoRunFrequency),
    },
  },
  {
    feature: 'Manual Run Query cap',
    values: {
      free: manualCapLabel('free'),
      starter: manualCapLabel('starter'),
      pro: manualCapLabel('pro'),
      agency: manualCapLabel('agency'),
    },
  },
  {
    feature: 'Cooldown per prompt',
    values: {
      free: cooldownLabel(PLAN_CREDITS.free.cooldownSeconds),
      starter: cooldownLabel(PLAN_CREDITS.starter.cooldownSeconds),
      pro: cooldownLabel(PLAN_CREDITS.pro.cooldownSeconds),
      agency: cooldownLabel(PLAN_CREDITS.agency.cooldownSeconds),
    },
  },
  {
    feature: 'Model tier',
    values: {
      free: modelTierLabel('free'),
      starter: modelTierLabel('starter'),
      pro: modelTierLabel('pro'),
      agency: modelTierLabel('agency'),
    },
  },
  {
    feature: 'GEO Audits / month',
    values: {
      free: String(PLAN_LIMITS.free.geoAudits),
      starter: String(PLAN_LIMITS.starter.geoAudits),
      pro: String(PLAN_LIMITS.pro.geoAudits),
      agency: String(PLAN_LIMITS.agency.geoAudits),
    },
  },
  {
    feature: 'Sentiment analysis',
    values: {
      free: PLAN_LIMITS.free.sentiment ? '✓' : '✗',
      starter: PLAN_LIMITS.starter.sentiment ? '✓' : '✗',
      pro: PLAN_LIMITS.pro.sentiment ? '✓' : '✗',
      agency: PLAN_LIMITS.agency.sentiment ? '✓' : '✗',
    },
  },
  {
    feature: 'API access',
    values: { free: '✗', starter: '✗', pro: '✗', agency: '✓' },
  },
  {
    feature: 'Priority support',
    values: {
      free: PLAN_LIMITS.free.prioritySupport ? '✓' : '✗',
      starter: PLAN_LIMITS.starter.prioritySupport ? '✓' : '✗',
      pro: PLAN_LIMITS.pro.prioritySupport ? '✓' : '✗',
      agency: PLAN_LIMITS.agency.prioritySupport ? '✓' : '✗',
    },
  },
];

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
    a: 'Yes. Every paid plan starts with a 7-day free trial — no credit card required. You get 200 credits, all 5 AI platforms, and 30 tracked prompts (account-wide) to evaluate the product.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel in one click from your billing portal. You keep access through the end of the current billing period and then drop to the free tier — no data is lost.',
  },
  {
    q: 'Economy vs. Premium AI models — what changes?',
    a: 'Economy uses fast, cost-efficient models (gpt-4o-mini-search-preview, claude-haiku, gemini-flash-lite, sonar, grok-3-mini). Premium tier (Agency) unlocks Claude Sonnet, Gemini Pro, sonar-pro, and grok-4 for deeper reasoning.',
  },
  {
    q: 'How does annual billing work?',
    a: 'Annual billing saves roughly 20% on every paid plan. Toggle the switch at the top of this page to see annual prices.',
  },
  {
    q: 'I need more than Agency offers.',
    a: 'Reach out via the Contact page — we can put together a custom plan with higher credit limits, dedicated support, and custom integrations.',
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Pricing', url: '/pricing' }]} />

      {/* ── Hero ───────────────────────────────────────────────── */}
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
            Simple, credit-based pricing
          </h1>
          <p style={{
            fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.6,
            margin: '0 auto 8px', maxWidth: 580,
          }}>
            Every paid plan starts with a 7-day free trial — all 5 AI platforms included, no credit card required.
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

      {/* ── Plan cards ─────────────────────────────────────────── */}
      <section style={{ padding: '24px 24px 64px', background: 'var(--bg-landing)' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}>
          {PRICING_PLANS.map((plan) => {
            const featured = !!plan.featured;
            const showTrial = plan.name !== 'Free';
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

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1 }}>
                    {displayPrice}
                  </span>
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
                  {annual && plan.price !== '$0' ? `Billed annually at ${plan.annualPrice}/mo` : ''}
                  {!annual && ' '}
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

      {/* ── Detailed plan comparison (mirrors dashboard) ─────────── */}
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
                              {t !== 'free' ? '/mo' : ''}
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

      {/* ── Competitor comparison ────────────────────────────────── */}
      <section style={{ padding: '64px 24px', background: 'var(--bg-landing)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 30, fontWeight: 800, letterSpacing: -0.5,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              How Livesov compares
            </h2>
            <p style={{
              fontSize: 15, color: 'var(--text-secondary)',
              maxWidth: 560, margin: '0 auto', lineHeight: 1.6,
            }}>
              Built for AI visibility from day one — not bolted on to a legacy SEO suite.
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

      {/* ── FAQ ──────────────────────────────────────────────────── */}
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
