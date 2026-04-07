'use client';

import { useState, useEffect, useCallback } from 'react';

interface Analytics {
  platformUsage: Array<{ platform: string; calls: number; tokens_in: string; tokens_out: string; cost: string; avg_latency_ms: number }>;
  dailyCosts: Array<{ date: string; calls: number; cost: string; active_users: number }>;
  topPlatforms: Array<{ platform: string; model: string; calls: number; cost: string }>;
  errorRates: Array<{ platform: string; total: number; errors: number; error_rate: string }>;
  costByUser: Array<{ email: string; plan: string; calls: number; cost: string }>;
  period: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d', OpenAI: '#19c37d', Claude: '#d97706', Gemini: '#4285f4', Grok: '#1d9bf0', Perplexity: '#20b8cd',
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin-backend/analytics?days=${days}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load analytics</div>;

  const totalCost = data.platformUsage.reduce((s, p) => s + Number(p.cost), 0);
  const totalCalls = data.platformUsage.reduce((s, p) => s + p.calls, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="view-title">API Analytics</h1>
          <p className="view-sub">Monitor API usage, costs, and performance across all platforms.</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Total API Calls</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>{totalCalls.toLocaleString()}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Total Cost</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--amber)' }}>${totalCost.toFixed(2)}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Platforms Used</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--green)' }}>{data.platformUsage.length}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Avg Cost/Call</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--purple)' }}>${totalCalls > 0 ? (totalCost / totalCalls).toFixed(4) : '0'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Platform Breakdown */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Platform Breakdown</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.platformUsage.map(p => {
              const pct = totalCalls > 0 ? (p.calls / totalCalls) * 100 : 0;
              return (
                <div key={p.platform}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: PLATFORM_COLORS[p.platform] || 'var(--muted)' }}>{p.platform}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>{p.calls.toLocaleString()} calls &middot; ${Number(p.cost).toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: PLATFORM_COLORS[p.platform] || 'var(--primary)', transition: 'width .5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                    <span>Avg latency: {p.avg_latency_ms}ms</span>
                    <span>Tokens: {Number(p.tokens_in).toLocaleString()} in / {Number(p.tokens_out).toLocaleString()} out</span>
                  </div>
                </div>
              );
            })}
            {data.platformUsage.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No API calls in this period</p>}
          </div>
        </div>

        {/* Error Rates */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Error Rates</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.errorRates.map(e => (
              <div key={e.platform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: PLATFORM_COLORS[e.platform] || 'var(--muted)' }}>{e.platform}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: Number(e.error_rate) > 5 ? 'var(--red)' : Number(e.error_rate) > 1 ? 'var(--amber)' : 'var(--green)' }}>
                    {e.error_rate || '0'}%
                  </span>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{e.errors} / {e.total} calls</p>
                </div>
              </div>
            ))}
            {data.errorRates.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Model Usage */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Model Usage</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.topPlatforms.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
                <div>
                  <span style={{ color: PLATFORM_COLORS[p.platform] || 'var(--muted)', fontWeight: 600 }}>{p.platform}</span>
                  {p.model && <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>{p.model}</span>}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--muted)' }}>{p.calls.toLocaleString()}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>${Number(p.cost).toFixed(2)}</span>
                </div>
              </div>
            ))}
            {data.topPlatforms.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data</p>}
          </div>
        </div>

        {/* Cost by User */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Users by Cost</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.costByUser.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{u.plan} &middot; {u.calls} calls</p>
                </div>
                <span style={{ fontFamily: 'monospace', color: 'var(--amber)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>${Number(u.cost).toFixed(2)}</span>
              </div>
            ))}
            {data.costByUser.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data</p>}
          </div>
        </div>
      </div>

      {/* Daily Trend */}
      {data.dailyCosts.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily API Cost Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {data.dailyCosts.map((d, i) => {
              const maxCost = Math.max(...data.dailyCosts.map(x => Number(x.cost)), 0.01);
              const h = Math.max(2, (Number(d.cost) / maxCost) * 80);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  title={`${new Date(d.date).toLocaleDateString()}: $${Number(d.cost).toFixed(2)} (${d.calls} calls, ${d.active_users} users)`}>
                  <div style={{ width: '100%', minWidth: 3, maxWidth: 20, height: h, background: 'linear-gradient(180deg, var(--amber), var(--amber))', borderRadius: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
            <span>{new Date(data.dailyCosts[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>{new Date(data.dailyCosts[data.dailyCosts.length - 1]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
