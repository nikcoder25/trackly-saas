'use client';

import { useState, useEffect, useCallback } from 'react';

interface Stats {
  overview: { total_users: number; users_this_week: number; users_this_month: number; users_today: number };
  planDistribution: Array<{ plan: string; count: number }>;
  recentSignups: Array<{ id: string; email: string; name: string; plan: string; role: string; email_verified: boolean; created_at: string }>;
  apiUsage24h: { total_calls: number; active_users: number; total_errors: number };
  topUsers: Array<{ id: string; email: string; name: string; plan: string; query_count: number; api_calls: number; tokens_in: string; tokens_out: string; total_cost: string }>;
  dailySignups: Array<{ date: string; count: number }>;
  verificationStats: { verified: number; unverified: number };
}

const PLAN_COLORS: Record<string, string> = {
  free: 'var(--muted)', starter: '#3b82f6', pro: 'var(--primary)', agency: 'var(--purple)', enterprise: 'var(--amber)', owner: 'var(--red)',
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px', boxShadow: 'var(--app-shadow)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: color || 'var(--text)', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function MiniBarChart({ data, maxHeight = 60 }: { data: Array<{ date: string; count: number }>; maxHeight?: number }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: maxHeight }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', minWidth: 4, maxWidth: 16,
            height: Math.max(2, (d.count / maxCount) * maxHeight),
            background: 'var(--primary)', borderRadius: 2, transition: 'height .3s',
          }} title={`${new Date(d.date).toLocaleDateString()}: ${d.count}`} />
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(() => {
    setLoading(true);
    fetch('/api/admin-backend/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setStats(d);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error || !stats) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{error || 'Failed to load stats'}</div>;
  }

  const { overview, planDistribution, recentSignups, apiUsage24h, topUsers, dailySignups, verificationStats } = stats;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="view-title">Admin Dashboard</h1>
        <p className="view-sub">Overview of your SaaS platform metrics and activity.</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Users" value={overview.total_users} sub={`+${overview.users_today} today`} color="var(--primary)" />
        <StatCard label="This Week" value={overview.users_this_week} sub="new signups" color="#3b82f6" />
        <StatCard label="This Month" value={overview.users_this_month} sub="new signups" color="var(--purple)" />
        <StatCard label="API Calls (24h)" value={Number(apiUsage24h.total_calls).toLocaleString()} sub={`${apiUsage24h.active_users} active users`} color="var(--green)" />
        <StatCard label="Errors (24h)" value={apiUsage24h.total_errors} sub={`${apiUsage24h.total_calls > 0 ? ((apiUsage24h.total_errors / apiUsage24h.total_calls) * 100).toFixed(1) : 0}% error rate`} color={apiUsage24h.total_errors > 0 ? "var(--red)" : "var(--green)"} />
        <StatCard label="Verified" value={verificationStats.verified} sub={`${verificationStats.unverified} unverified`} color="var(--green)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Plan Distribution */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--app-shadow)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Plan Distribution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {planDistribution.map(p => {
              const pct = overview.total_users > 0 ? (p.count / overview.total_users) * 100 : 0;
              return (
                <div key={p.plan}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: PLAN_COLORS[p.plan] || 'var(--muted)', textTransform: 'capitalize' }}>{p.plan}</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>{p.count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: PLAN_COLORS[p.plan] || 'var(--muted)', transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Signup Trend */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--app-shadow)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Signups (Last 30 Days)</h3>
          {dailySignups.length > 0 ? (
            <div>
              <MiniBarChart data={dailySignups} maxHeight={80} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
                <span>{new Date(dailySignups[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(dailySignups[dailySignups.length - 1]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data yet</p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent Signups */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--app-shadow)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Signups</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentSignups.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: PLAN_COLORS[u.plan] || 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {(u.name || u.email)?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{u.plan} {u.email_verified ? '' : '(unverified)'}</p>
                </div>
                <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Users */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--app-shadow)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Users (30d)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topUsers.map((u, i) => {
              const tokensIn = Number(u.tokens_in);
              const tokensOut = Number(u.tokens_out);
              const totalTokens = tokensIn + tokensOut;
              const cost = Number(u.total_cost);
              return (
                <div key={u.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', width: 18, textAlign: 'center' }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                      <p style={{ fontSize: 10, color: 'var(--muted)' }}>{u.plan}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{u.query_count.toLocaleString()} queries</p>
                      <p style={{ fontSize: 12, fontFamily: 'monospace', color: cost > 0 ? 'var(--amber)' : 'var(--muted)', fontWeight: 600 }}>${cost.toFixed(4)}</p>
                    </div>
                  </div>
                  {/* Token breakdown */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, marginLeft: 28, fontSize: 10, fontFamily: 'monospace' }}>
                    <span style={{ color: 'var(--muted)' }}>{u.api_calls} API calls</span>
                    <span style={{ color: 'var(--muted)' }}>{totalTokens > 0 ? totalTokens.toLocaleString() : '0'} tokens</span>
                    {totalTokens > 0 && (
                      <span style={{ color: 'var(--muted)' }}>({tokensIn.toLocaleString()} in / {tokensOut.toLocaleString()} out)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
