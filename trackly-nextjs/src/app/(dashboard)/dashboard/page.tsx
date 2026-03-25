'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand {
  id: string;
  name: string;
  runs?: Array<{ sov?: number; totalQ?: number; totalM?: number; date?: string; platforms?: Record<string, unknown> }>;
  queries?: string[];
  mentions?: Array<{ platform?: string; query?: string; mentioned?: boolean }>;
  [key: string]: unknown;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setBrands(d.brands || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalBrands = brands.length;
  const latestRuns = brands.map(b => b.runs?.length ? b.runs[b.runs.length - 1] : null).filter(Boolean);
  const avgSov = latestRuns.length ? Math.round(latestRuns.reduce((sum, r) => sum + (r?.sov || 0), 0) / latestRuns.length) : 0;
  const totalMentions = latestRuns.reduce((sum, r) => sum + (r?.totalM || 0), 0);
  const totalQueries = brands.reduce((sum, b) => sum + (b.queries?.length || 0), 0);
  const planLimit = (user?.limits as Record<string, number>)?.prompts || 5;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{t.dashboard.welcomeBack}, {user?.name?.split(' ')[0] || 'there'}!</h1>
        <p className="text-[var(--muted)] text-[13px] mt-1">{t.dashboard.aiOverview}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard label={t.dashboard.brands} value={loading ? '...' : String(totalBrands)} desc={t.dashboard.activeBrands} />
        <StatCard label={t.dashboard.shareOfVoice} value={loading ? '...' : latestRuns.length ? `${avgSov}%` : '\u2014'} desc={t.dashboard.avgAcross} color={avgSov >= 50 ? 'var(--green)' : avgSov > 0 ? 'var(--amber)' : undefined} />
        <StatCard label={t.dashboard.mentionsLabel} value={loading ? '...' : String(totalMentions)} desc={t.dashboard.latestRun} />
        <StatCard label={t.dashboard.queries} value={loading ? '...' : `${totalQueries} / ${planLimit}`} desc={t.dashboard.usedThisMonth} />
      </div>

      {/* Brand cards */}
      {brands.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">Your Brands</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {brands.map(b => {
              const lastRun = b.runs?.length ? b.runs[b.runs.length - 1] : null;
              return (
                <Link href={`/dashboard/setup`} key={b.id} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 hover:shadow-[var(--app-shadow-lg)] hover:-translate-y-px transition no-underline">
                  <h3 className="font-semibold text-[var(--text)] mb-2">{b.name}</h3>
                  <div className="flex gap-4 text-sm text-[var(--muted)]">
                    <span>SOV: <span className="text-[var(--text)] font-medium">{lastRun?.sov ? `${lastRun.sov}%` : '\u2014'}</span></span>
                    <span>Queries: <span className="text-[var(--text)] font-medium">{b.queries?.length || 0}</span></span>
                    <span>Runs: <span className="text-[var(--text)] font-medium">{b.runs?.length || 0}</span></span>
                  </div>
                  {lastRun?.platforms && (
                    <div className="flex gap-1.5 mt-3">
                      {Object.entries(PLATFORM_COLORS).map(([name, color]) => (
                        <span key={name} className="w-2.5 h-2.5 rounded-full opacity-60" style={{ background: color }} title={name} />
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ) : !loading ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center shadow-[var(--app-shadow)]">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Get started with your first brand</h2>
          <p className="text-sm text-[var(--muted)] mb-6 max-w-md mx-auto">Set up your brand and start tracking how AI platforms mention you.</p>
          <Link href="/dashboard/setup" className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-lg font-bold text-sm transition no-underline shadow-[0_1px_2px_rgba(255,97,84,.2)] hover:-translate-y-px">Set Up Brand</Link>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, desc, color }: { label: string; value: string; desc: string; color?: string }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] hover:shadow-[var(--app-shadow-lg)] hover:-translate-y-px transition">
      <p className="text-[11px] text-[var(--muted)] uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-[28px] font-extrabold font-mono mt-1" style={{ color: color || 'var(--text)' }}>{value}</p>
      <p className="text-[11px] text-[var(--muted)] mt-1 font-medium">{desc}</p>
    </div>
  );
}
