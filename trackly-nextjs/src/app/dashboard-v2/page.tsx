'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Livesov dashboard redesign - full design-system port of Dashboard.html.
// Mounted at /dashboard-v2 so it owns the full-viewport shell without disturbing
// the production dashboard. All styles are scoped under the `.lvx` root.

import * as React from 'react';
import './dashboard-v2.css';
import { Card, useLS } from './ui';
import { RouterProvider, ExtrasProvider, Shell, useRouter, findPage } from './shell';
import { PageOverview } from './pages/overview';
import {
  PageMentions, PageProof, PagePlatforms, PageCompetitors, PageTrends,
  PageAccuracy, PageCitations, PageResults, PageQueryTracker, PageRecommendations,
} from './pages/analysis';
import { PagePromptDiscovery, PageAgentAnalytics } from './pages/discovery';
import { PageGeoAudit, PageRegional, PageOnboarding } from './pages/tools';
import { PageFixes } from './pages/fixes';
import { PageSetup, PagePrompts, PageAccount, PageBilling, PageAlerts } from './pages/settings';
import { BrandProvider } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';

const PAGE_REGISTRY: Record<string, () => React.JSX.Element> = {
  overview: () => <PageOverview />,
  mentions: () => <PageMentions />,
  proof: () => <PageProof />,
  platforms: () => <PagePlatforms />,
  'prompt-discovery': () => <PagePromptDiscovery />,
  'agent-analytics': () => <PageAgentAnalytics />,
  competitors: () => <PageCompetitors />,
  trends: () => <PageTrends />,
  accuracy: () => <PageAccuracy />,
  citations: () => <PageCitations />,
  results: () => <PageResults />,
  'query-tracker': () => <PageQueryTracker />,
  recommendations: () => <PageRecommendations />,
  'geo-audit': () => <PageGeoAudit />,
  regional: () => <PageRegional />,
  fixes: () => <PageFixes />,
  onboarding: () => <PageOnboarding />,
  setup: () => <PageSetup />,
  prompts: () => <PagePrompts />,
  account: () => <PageAccount />,
  billing: () => <PageBilling />,
  alerts: () => <PageAlerts />,
};

function PagePlaceholder({ id }: { id: string }) {
  const meta = findPage(id);
  return (
    <>
      <div className="page-head"><div><h1 className="page-t">{meta.label}</h1><p className="page-s">Coming up: {meta.label} page.</p></div></div>
      <div className="page-body">
        <Card title="Under design">
          <p className="quiet" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            This screen is included in the layout but its specific design is in the next batch.
          </p>
        </Card>
      </div>
    </>
  );
}

function PageRouter() {
  const { page } = useRouter();
  const fn = PAGE_REGISTRY[page];
  try { return fn ? fn() : <PagePlaceholder id={page} />; }
  catch { return <PagePlaceholder id={page} />; }
}

// Minimal appearance control (the prototype's design-tool tweaks panel is omitted;
// these three knobs map to the same data-attributes on the `.lvx` root).
function AppearanceDock({ t, setTweak }: { t: any; setTweak: (k: string, v: any) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9000, fontFamily: 'var(--mono)', fontSize: 11 }}>
      {open && (
        <div style={{ marginBottom: 8, padding: 12, width: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--shadow-pop)', display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-2)' }}>
            Dark mode
            <input type="checkbox" checked={!!t.dark} onChange={e => setTweak('dark', e.target.checked)} />
          </label>
          <div style={{ color: 'var(--text-2)' }}>Accent</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['indigo', 'emerald', 'orange', 'rose'].map(a => (
              <button key={a} onClick={() => setTweak('accent', a)} title={a}
                style={{ flex: 1, height: 22, borderRadius: 5, cursor: 'pointer', border: t.accent === a ? '2px solid var(--text)' : '1px solid var(--line)', background: a === 'indigo' ? '#5B5BD6' : a === 'emerald' ? '#059669' : a === 'orange' ? '#EA580C' : '#E11D48' }} />
            ))}
          </div>
          <div style={{ color: 'var(--text-2)' }}>Density</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['compact', 'comfortable'].map(dn => (
              <button key={dn} onClick={() => setTweak('density', dn)}
                style={{ flex: 1, padding: '5px 4px', borderRadius: 5, cursor: 'pointer', border: t.density === dn ? '1px solid var(--primary)' : '1px solid var(--line)', background: t.density === dn ? 'var(--primary-50)' : 'var(--surface)', color: t.density === dn ? 'var(--primary)' : 'var(--text-2)', fontSize: 10 }}>{dn}</button>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} title="Appearance"
        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', boxShadow: 'var(--shadow-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export default function DashboardV2() {
  const [t, setT] = useLS('lvx_tweaks', { dark: false, accent: 'indigo', density: 'comfortable' });
  const setTweak = (k: string, v: any) => setT(prev => ({ ...prev, [k]: v }));
  // This is an internal design-preview route: it renders fabricated
  // "Acme PM" sample data, an appearance dev-dock, and "Under design"
  // placeholder screens. Middleware only auth-gates it (startsWith
  // '/dashboard'), so any logged-in customer who guesses the URL could
  // see unfinished UI. Restrict it to admins/owners.
  const { user, loading: authLoading } = useAuth();
  const isStaff = user?.role === 'admin' || user?.plan === 'owner';
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #5B5BD6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '48px 40px', textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#e11d48', marginBottom: 8 }}>Not available</p>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>This is an internal preview. Head to your dashboard to see your real data.</p>
          <a href="/dashboard" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 8, background: '#5B5BD6', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Go to dashboard</a>
        </div>
      </div>
    );
  }
  return (
    <div className="lvx lvx-standalone" data-theme={t.dark ? 'dark' : 'light'} data-accent={t.accent} data-density={t.density}>
      {/* BrandProvider is mounted by the classic /dashboard layout but NOT by
          this standalone shell — without it, useBrandData never resolves
          (context default is loading:true) and data pages spin forever. */}
      <BrandProvider>
        <RouterProvider>
          <ExtrasProvider>
            <Shell>
              <PageRouter />
            </Shell>
          </ExtrasProvider>
        </RouterProvider>
      </BrandProvider>
      <AppearanceDock t={t} setTweak={setTweak} />
    </div>
  );
}
