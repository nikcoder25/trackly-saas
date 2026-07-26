// Canonical marketing-page navigation. Single source of truth for the
// public top header. Both src/components/seo/SeoLayout.tsx (interior
// pages) and src/app/(public)/home/page.tsx (homepage) render from
// this array. Tests/header-canonical-links.test.ts pins the link set
// so future drift is caught at CI.
//
// Two-form hrefs (`href` + optional `homeHref`):
//   - Interior pages render `href` (real page form).
//   - The homepage prefers `homeHref` when present (in-page anchor
//     scroll), otherwise falls back to `href`.
// Features always uses the anchor form because `/features` is a 301
// redirect to `/#features` (PR-1), not a real page.
//
// Pricing deliberately has NO homeHref. "pricing" and "cost" queries
// overwhelmingly resolve to a dedicated /pricing URL, so every internal
// link - homepage header included - must point at the real page and
// pass link equity to it. Sending the homepage nav to `/#pricing`
// scrolled the user down the homepage and left /pricing orphaned.

export interface MarketingNavLink {
  href: string;
  homeHref?: string;
  label: string;
}

export const MARKETING_NAV_LINKS: ReadonlyArray<MarketingNavLink> = [
  { href: '/#features',    label: 'Features' },
  { href: '/how-it-works', label: 'How it Works', homeHref: '/#how-it-works' },
  { href: '/pricing',      label: 'Pricing' },
  { href: '/tools',        label: 'Free Tools' },
  { href: '/blog',         label: 'Blog' },
  { href: '/contact',      label: 'Contact' },
] as const;
