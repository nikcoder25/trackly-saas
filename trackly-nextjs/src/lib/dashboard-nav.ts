/**
 * The dashboard navigation tree.
 *
 * Extracted from Sidebar so the command palette can offer the same
 * destinations without a second copy drifting out of sync - a palette that
 * cannot reach a page the sidebar has is worse than no palette, because the
 * user stops trusting it.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Hidden from non-admin users in both the sidebar and the palette. */
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/dashboard/mentions', label: 'Mentions', icon: '◎' },
      { href: '/dashboard/proof', label: 'Evidence & Proof', icon: '◆' },
      { href: '/dashboard/platforms', label: 'Platform Status', icon: '●' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/competitors', label: 'Competitors', icon: '⊘' },
      { href: '/dashboard/trends', label: 'SOV Trends', icon: '◆' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', icon: '◎' },
      { href: '/dashboard/citations', label: 'Citations', icon: '◇' },
      { href: '/dashboard/fanout', label: 'Fan-out Queries', icon: '⑂' },
      { href: '/dashboard/volatility', label: 'AI Volatility', icon: '◬' },
      { href: '/dashboard/results', label: 'Results', icon: '☰' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', icon: '◈' },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: '◆' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/reports', label: 'Reports', icon: '🗂️' },
      { href: '/dashboard/geo-audit', label: 'GEO Audit', icon: '◉' },
      { href: '/dashboard/geo-audits', label: 'Regional Audits', icon: '🌍' },
      { href: '/dashboard/nap-audits', label: 'NAP Audits', icon: '📍' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', icon: '◇' },
      { href: '/dashboard/prompts', label: 'Tracked Prompts', icon: '⚡' },
      { href: '/dashboard/account', label: 'Account & Plan', icon: '◉' },
      { href: '/dashboard/billing', label: 'Billing & Usage', icon: '◆' },
      { href: '/dashboard/alerts', label: 'Alerts', icon: '◈' },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: '⚑', adminOnly: true },
    ],
  },
];

/** Flat list of every page, for the palette's fuzzy page matching. */
export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

/**
 * Subsequence match, the behaviour people expect from a command palette:
 * "qt" finds "Query Tracker", "geoau" finds "GEO Audit". A plain substring
 * test would miss both.
 */
export function matchesNavQuery(label: string, query: string): boolean {
  const l = label.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  if (l.includes(q)) return true;

  let i = 0;
  for (const char of l) {
    if (char === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}
