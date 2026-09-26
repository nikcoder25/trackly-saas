import { describe, it, expect } from 'vitest';
import { allNavItems } from '@/lib/dashboard-nav';
import {
  V3_SECTIONS, V3_ALL_HREFS, V3_BOTTOM_TABS, V3_PAGE_BLURBS, v3TabForPath, v3SectionForPath, v3VisibleTabs,
} from '@/lib/dashboard-nav-v3';

describe('v3 dashboard nav', () => {
  it('covers every visible classic sidebar page exactly once', () => {
    const classic = allNavItems.filter(i => !i.hidden).map(i => i.href).sort();
    expect([...V3_ALL_HREFS].sort()).toEqual(classic);
    expect(new Set(V3_ALL_HREFS).size).toBe(V3_ALL_HREFS.length);
    expect(V3_ALL_HREFS.length).toBe(23);
  });

  it('maps routes to their section and tab', () => {
    expect(v3SectionForPath('/dashboard')?.id).toBe('overview');
    expect(v3SectionForPath('/dashboard/mentions')?.id).toBe('prompts');
    expect(v3SectionForPath('/dashboard/geo-audits/abc')?.id).toBe('audits');
    expect(v3TabForPath('/dashboard/geo-audits/abc')?.tab.href).toBe('/dashboard/geo-audits');
    expect(v3TabForPath('/dashboard/geo-audit')?.tab.href).toBe('/dashboard/geo-audit');
    expect(v3TabForPath('/dashboard/prompt-details')?.tab.href).toBe('/dashboard/query-tracker');
    expect(v3TabForPath('/dashboard/billing/ledger')?.tab.href).toBe('/dashboard/billing');
    expect(v3TabForPath('/dashboard/admin/runs')?.section.id).toBe('settings');
    expect(v3TabForPath('/login')).toBeNull();
  });

  it('hides the admin tab from non-admins', () => {
    const settings = V3_SECTIONS.find(s => s.id === 'settings')!;
    expect(v3VisibleTabs(settings, false).some(t => t.adminOnly)).toBe(false);
    expect(v3VisibleTabs(settings, true).some(t => t.adminOnly)).toBe(true);
  });

  it('has a blurb for every page and valid bottom tabs', () => {
    for (const href of V3_ALL_HREFS) expect(V3_PAGE_BLURBS[href], href).toBeTruthy();
    for (const id of V3_BOTTOM_TABS) expect(V3_SECTIONS.some(s => s.id === id)).toBe(true);
  });
});
