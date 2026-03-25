'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0] || 'there'}!</h1>
        <p className="text-[var(--text-muted)] mt-1">Here&apos;s your AI visibility overview</p>
      </div>

      {/* Quick stats placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Brands', value: '—', desc: 'Active brands' },
          { label: 'Share of Voice', value: '—', desc: 'Avg across platforms' },
          { label: 'Mentions', value: '—', desc: 'Last 7 days' },
          { label: 'Queries', value: '—', desc: 'Remaining this month' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{stat.desc}</p>
          </div>
        ))}
      </div>

      {/* Get started */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Get started with your first brand</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md mx-auto">
          Set up your brand, add your API keys, and start tracking how AI platforms mention your brand.
        </p>
        <Link
          href="/dashboard/setup"
          className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-lg font-medium transition"
        >
          Set Up Brand
        </Link>
      </div>
    </div>
  );
}
