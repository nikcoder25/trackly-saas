/**
 * Sidebar model for the v3 dashboard design.
 *
 * The 23 classic sidebar links are grouped into sections. A section with
 * more than one page shows its pages as tabs at the top of the content, so
 * every old URL keeps working and keeps its own route - the grouping is
 * navigation only.
 *
 * Keep in sync with LvxShell's NAV and lib/dashboard-nav's navGroups: the
 * parity test in tests/dashboard-nav-v3.test.ts fails when a visible classic
 * page is missing here.
 */

export type V3SectionId =
  | 'overview' | 'prompts' | 'competitors' | 'sources' | 'fixes' | 'reports' | 'audits' | 'settings';

export interface V3Tab {
  href: string;
  label: string;
  adminOnly?: boolean;
  /** Extra route prefixes that belong to this tab (detail pages). */
  also?: string[];
}

export interface V3Section {
  id: V3SectionId;
  label: string;
  /** Short label for the phone bottom bar. */
  short?: string;
  tabs: V3Tab[];
  /** Rendered in the sidebar footer group rather than the main list. */
  bottom?: boolean;
}

export const V3_SECTIONS: V3Section[] = [
  { id: 'overview', label: 'Overview', tabs: [{ href: '/dashboard', label: 'Overview' }] },
  {
    id: 'prompts', label: 'Prompts & answers', short: 'Prompts',
    tabs: [
      { href: '/dashboard/mentions', label: 'Mentions' },
      { href: '/dashboard/proof', label: 'Evidence & Proof' },
      { href: '/dashboard/results', label: 'Results' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', also: ['/dashboard/prompt-details', '/dashboard/query-performance'] },
      { href: '/dashboard/prompts', label: 'Tracked Prompts' },
      { href: '/dashboard/fanout', label: 'Fan-out Queries' },
    ],
  },
  {
    id: 'competitors', label: 'Competitors', short: 'Rivals',
    tabs: [
      { href: '/dashboard/competitors', label: 'Competitors' },
      { href: '/dashboard/trends', label: 'SOV Trends' },
      { href: '/dashboard/volatility', label: 'AI Volatility' },
      { href: '/dashboard/platforms', label: 'Platform Status' },
    ],
  },
  { id: 'sources', label: 'Sources AI cites', short: 'Sources', tabs: [{ href: '/dashboard/citations', label: 'Citations' }] },
  {
    id: 'fixes', label: 'Fixes to make', short: 'Fixes',
    tabs: [
      { href: '/dashboard/recommendations', label: 'Recommendations' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor' },
    ],
  },
  { id: 'reports', label: 'Reports', tabs: [{ href: '/dashboard/reports', label: 'Reports' }] },
  {
    id: 'audits', label: 'Audits',
    tabs: [
      { href: '/dashboard/geo-audit', label: 'GEO Audit' },
      { href: '/dashboard/geo-audits', label: 'Regional Audits' },
      { href: '/dashboard/nap-audits', label: 'NAP Audits' },
    ],
  },
  {
    id: 'settings', label: 'Settings', bottom: true,
    tabs: [
      { href: '/dashboard/setup', label: 'Brand Setup' },
      { href: '/dashboard/account', label: 'Account & Plan' },
      { href: '/dashboard/billing', label: 'Billing & Usage' },
      { href: '/dashboard/alerts', label: 'Alerts' },
      { href: '/dashboard/admin', label: 'Admin Panel', adminOnly: true },
    ],
  },
];

/** Phone bottom tab bar, in order. */
export const V3_BOTTOM_TABS: V3SectionId[] = ['overview', 'prompts', 'competitors', 'fixes'];

function tabMatches(tab: V3Tab, path: string): boolean {
  if (tab.href === '/dashboard') return path === '/dashboard';
  const roots = [tab.href, ...(tab.also || [])];
  return roots.some(r => path === r || path.startsWith(r + '/'));
}

/** The tab (page) a path belongs to, longest match first. */
export function v3TabForPath(path: string | null | undefined): { section: V3Section; tab: V3Tab } | null {
  if (!path) return null;
  let best: { section: V3Section; tab: V3Tab; len: number } | null = null;
  for (const section of V3_SECTIONS) {
    for (const tab of section.tabs) {
      if (tabMatches(tab, path) && (!best || tab.href.length > best.len)) {
        best = { section, tab, len: tab.href.length };
      }
    }
  }
  return best ? { section: best.section, tab: best.tab } : null;
}

export function v3SectionForPath(path: string | null | undefined): V3Section | null {
  return v3TabForPath(path)?.section ?? null;
}

/** Tabs a user can see in a section (drops admin-only tabs for non-admins). */
export function v3VisibleTabs(section: V3Section, isAdmin: boolean): V3Tab[] {
  return section.tabs.filter(t => !t.adminOnly || isAdmin);
}

/** Every page href in the v3 sidebar. */
export const V3_ALL_HREFS: string[] = V3_SECTIONS.flatMap(s => s.tabs.map(t => t.href));

/**
 * One plain-English sentence per page, shown under the page title in v3.
 */
export const V3_PAGE_BLURBS: Record<string, string> = {
  '/dashboard': 'How often AI engines name you, and what to do next.',
  '/dashboard/mentions': 'Every AI answer that named your brand, with the exact words it used.',
  '/dashboard/proof': 'Saved screenshots and quotes you can show a client or your boss.',
  '/dashboard/results': 'The full answer each AI engine gave for every prompt in your last scans.',
  '/dashboard/query-tracker': 'How each tracked question is doing across the AI engines over time.',
  '/dashboard/prompt-details': 'One question, every engine, and how the answers changed.',
  '/dashboard/prompts': 'The buyer questions we ask the AI engines for you on every scan.',
  '/dashboard/fanout': 'The follow-up searches AI engines ran behind the scenes to answer your prompts.',
  '/dashboard/competitors': 'Who AI engines recommend instead of you, and how often.',
  '/dashboard/trends': 'Your share of voice over time, next to your competitors.',
  '/dashboard/volatility': 'How much the AI answers move from one scan to the next.',
  '/dashboard/platforms': 'Whether each AI engine answered on the last scan, and how it sees you.',
  '/dashboard/citations': 'The websites AI engines quote when they answer questions in your category.',
  '/dashboard/recommendations': 'A to-do list of changes most likely to get you named more often.',
  '/dashboard/accuracy': 'Facts AI engines get wrong about your business, so you can correct them.',
  '/dashboard/reports': 'Build and download reports to share with your team or clients.',
  '/dashboard/geo-audit': 'Check how ready one web page is to be quoted by AI engines.',
  '/dashboard/geo-audits': 'See how AI engines answer in different cities and regions.',
  '/dashboard/nap-audits': 'Check that your name, address and phone match across the web.',
  '/dashboard/setup': 'Your brand details, competitors and the engines we scan.',
  '/dashboard/account': 'Your login, plan and security settings.',
  '/dashboard/billing': 'Your plan, scan credits and invoices.',
  '/dashboard/alerts': 'Get an email when something important changes.',
  '/dashboard/admin': 'Owner tools for users, runs and system health.',
};
