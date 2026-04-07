'use client';

import { useState, useEffect, useCallback } from 'react';

interface Revenue {
  totalMrr: number;
  planRevenue: Array<{ plan: string; count: number; price_per_user: number; estimated_mrr: number }>;
  subscriptionStats: { paid_users: number; free_users: number; active_subscriptions: number };
  recentPayments: Array<{ event_type: string; subscription_id: string; product_id: string; created_at: string }>;
  monthlyGrowth: Array<{ month: string; new_users: number; new_paid: number }>;
  churnedUsers: Array<{ email: string; plan: string; details: Record<string, unknown>; created_at: string }>;
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#3b82f6', pro: '#6366f1', agency: '#8b5cf6', enterprise: '#f59e0b',
};

export default function AdminRevenuePage() {
  const [data, setData] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/admin-backend/revenue', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Failed to load revenue data</div>;

  const conversionRate = data.subscriptionStats.paid_users + data.subscriptionStats.free_users > 0
    ? ((data.subscriptionStats.paid_users / (data.subscriptionStats.paid_users + data.subscriptionStats.free_users)) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', marginBottom: 4 }}>Revenue & Subscriptions</h1>
        <p style={{ fontSize: 13, color: '#52525b' }}>Track MRR, subscriber growth, conversions, and churn.</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 8 }}>Estimated MRR</p>
          <p style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', color: '#22c55e', lineHeight: 1 }}>${data.totalMrr}</p>
          <p style={{ fontSize: 11, color: '#52525b', marginTop: 6 }}>Based on current subscribers</p>
        </div>
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 8 }}>Paid Users</p>
          <p style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', color: '#6366f1', lineHeight: 1 }}>{data.subscriptionStats.paid_users}</p>
          <p style={{ fontSize: 11, color: '#52525b', marginTop: 6 }}>{data.subscriptionStats.active_subscriptions} active subscriptions</p>
        </div>
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 8 }}>Free Users</p>
          <p style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', color: '#71717a', lineHeight: 1 }}>{data.subscriptionStats.free_users}</p>
        </div>
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 8 }}>Conversion Rate</p>
          <p style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1 }}>{conversionRate}%</p>
          <p style={{ fontSize: 11, color: '#52525b', marginTop: 6 }}>Free to paid</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* MRR by Plan */}
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>MRR by Plan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.planRevenue.map(p => (
              <div key={p.plan} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#18181b', borderRadius: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: PLAN_COLORS[p.plan] || '#a1a1aa', textTransform: 'capitalize' }}>{p.plan}</span>
                  <p style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>{p.count} users x ${p.price_per_user}/mo</p>
                </div>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#22c55e' }}>${p.estimated_mrr}</span>
              </div>
            ))}
            {data.planRevenue.length === 0 && <p style={{ fontSize: 12, color: '#3f3f46' }}>No paid users yet</p>}
          </div>
        </div>

        {/* Monthly Growth */}
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly Growth (6mo)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.monthlyGrowth.map(m => (
              <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#18181b', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>
                  {new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: 'monospace' }}>
                  <span style={{ color: '#6366f1' }}>+{m.new_users} users</span>
                  <span style={{ color: '#22c55e' }}>+{m.new_paid} paid</span>
                </div>
              </div>
            ))}
            {data.monthlyGrowth.length === 0 && <p style={{ fontSize: 12, color: '#3f3f46' }}>No data yet</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent Payment Events */}
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Payment Events</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {data.recentPayments.map((p, i) => {
              const isSuccess = p.event_type?.includes('created') || p.event_type?.includes('updated');
              const isFail = p.event_type?.includes('failed') || p.event_type?.includes('cancelled');
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#18181b', borderRadius: 6, fontSize: 11 }}>
                  <div>
                    <span style={{ color: isSuccess ? '#22c55e' : isFail ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                      {p.event_type || 'unknown'}
                    </span>
                    {p.product_id && <span style={{ color: '#3f3f46', marginLeft: 6 }}>{p.product_id}</span>}
                  </div>
                  <span style={{ color: '#3f3f46', whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleString()}</span>
                </div>
              );
            })}
            {data.recentPayments.length === 0 && <p style={{ fontSize: 12, color: '#3f3f46' }}>No payment events</p>}
          </div>
        </div>

        {/* Churned Users */}
        <div style={{ background: '#0f0f17', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Churn (30d)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {data.churnedUsers.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#18181b', borderRadius: 6, fontSize: 11 }}>
                <div>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{u.email}</span>
                  <span style={{ color: '#3f3f46', marginLeft: 6 }}>{u.plan}</span>
                </div>
                <span style={{ color: '#3f3f46', whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {data.churnedUsers.length === 0 && <p style={{ fontSize: 12, color: '#3f3f46', textAlign: 'center' }}>No churn in the last 30 days</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
