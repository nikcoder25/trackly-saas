'use client';

import { useAuth } from '@/contexts/AuthContext';
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0] || 'there'}!</h1>
        <p className="text-[var(--text-muted)] mt-1">Here&apos;s your AI visibility overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Brands" value={loading ? '...' : String(totalBrands)} desc="Active brands" />
        <StatCard label="Share of Voice" value={loading ? '...' : latestRuns.length ? `${avgSov}%` : '—'} desc="Avg across platforms" color={avgSov >= 50 ? 'var(--green)' : avgSov > 0 ? 'var(--amber)' : undefined} />
        <StatCard label="Mentions" value={loading ? '...' : String(totalMentions)} desc="Latest run" />
        <StatCard label="Queries" value={loading ? '...' : `${totalQueries} / ${planLimit}`} desc="Used this month" />
      </div>

      {/* Brand cards */}
      {brands.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Your Brands</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map(b => {
              const lastRun = b.runs?.length ? b.runs[b.runs.length - 1] : null;
              return (
                <Link href={`/dashboard/setup`} key={b.id} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--primary)]/30 transition no-underline">
                  <h3 className="font-semibold text-white mb-2">{b.name}</h3>
                  <div className="flex gap-4 text-sm text-[var(--text-muted)]">
                    <span>SOV: <span className="text-white font-medium">{lastRun?.sov ? `${lastRun.sov}%` : '—'}</span></span>
                    <span>Queries: <span className="text-white font-medium">{b.queries?.length || 0}</span></span>
                    <span>Runs: <span className="text-white font-medium">{b.runs?.length || 0}</span></span>
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
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-white mb-2">Get started with your first brand</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md mx-auto">Set up your brand and start tracking how AI platforms mention you.</p>
          <Link href="/dashboard/setup" className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-lg font-medium transition no-underline">Set Up Brand</Link>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, desc, color }: { label: string; value: string; desc: string; color?: string }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: color || 'white' }}>{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">{desc}</p>
    </div>
  );
}
