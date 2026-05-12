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
// `i18nKey` is opt-in for consumers that have a LanguageContext in
// scope (currently only the homepage). Consumers without i18n
// (SeoLayout) render `label` directly. Adding new i18n keys requires
// touching locale files — covered by finding #18.

export interface MarketingNavLink {
  href: string;
  homeHref?: string;
  label: string;
  i18nKey?: 'features' | 'howItWorks' | 'pricing';
}

export const MARKETING_NAV_LINKS: ReadonlyArray<MarketingNavLink> = [
  { href: '/#features',    label: 'Features',     i18nKey: 'features' },
  { href: '/how-it-works', label: 'How it Works', i18nKey: 'howItWorks', homeHref: '/#how-it-works' },
  { href: '/pricing',      label: 'Pricing',      i18nKey: 'pricing',    homeHref: '/#pricing' },
  { href: '/tools',        label: 'Free Tools' },
  { href: '/blog',         label: 'Blog' },
  { href: '/contact',      label: 'Contact' },
] as const;
