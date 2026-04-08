'use client';

import { useState, useEffect, useCallback } from 'react';

interface Analytics {
  platformUsage: Array<{ platform: string; calls: number; avg_latency_ms: number; errors: number }>;
  dailyCosts: Array<{ date: string; calls: number; active_users: number; avg_latency: number }>;
  topPlatforms: Array<{ platform: string; model: string; calls: number }>;
  errorRates: Array<{ platform: string; total: number; errors: number; error_rate: string }>;
  costByUser: Array<{ email: string; plan: string; calls: number }>;
  costSummary: { total_cost: number; total_tokens_in: number; total_tokens_out: number; total_tokens: number };
  costByPlatform: Array<{ platform: string; cost: number; tokens_in: number; tokens_out: number; successful_calls: number }>;
  dailyCostTrend: Array<{ date: string; cost: number; tokens_in: number; tokens_out: number }>;
  costByUserRanked: Array<{ email: string; plan: string; cost: number; tokens_in: number; tokens_out: number; calls: number }>;
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
      </div>
    );
  }

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load analytics</div>;

  const totalCalls = data.platformUsage.reduce((s, p) => s + p.calls, 0);
  const totalErrors = data.platformUsage.reduce((s, p) => s + p.errors, 0);
  const cs = data.costSummary;
  const fmtCost = (v: number) => '$' + Number(v).toFixed(4);
  const fmtTokens = (v: number) => Number(v) >= 1_000_000 ? (Number(v) / 1_000_000).toFixed(2) + 'M' : Number(v) >= 1_000 ? (Number(v) / 1_000).toFixed(1) + 'K' : String(v);
  const totalPlatformCost = data.costByPlatform.reduce((s, p) => s + Number(p.cost), 0);

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
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Total Errors</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: totalErrors > 0 ? 'var(--red)' : 'var(--green)' }}>{totalErrors.toLocaleString()}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Platforms Used</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--green)' }}>{data.platformUsage.length}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Error Rate</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--purple)' }}>{totalCalls > 0 ? (totalErrors / totalCalls * 100).toFixed(1) : '0'}%</p>
        </div>
      </div>

      {/* API Cost Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Total API Cost</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: '#f59e0b' }}>{fmtCost(cs.total_cost)}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Tokens In</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>{fmtTokens(cs.total_tokens_in)}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Tokens Out</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: '#8b5cf6' }}>{fmtTokens(cs.total_tokens_out)}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Total Tokens</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--green)' }}>{fmtTokens(cs.total_tokens)}</p>
        </div>
      </div>

      {/* Cost by Platform & Cost by User */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cost by Platform</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.costByPlatform.map(p => {
              const pct = totalPlatformCost > 0 ? (Number(p.cost) / totalPlatformCost) * 100 : 0;
              return (
                <div key={p.platform}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: PLATFORM_COLORS[p.platform] || 'var(--muted)' }}>{p.platform}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#f59e0b' }}>{fmtCost(p.cost)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: PLATFORM_COLORS[p.platform] || 'var(--primary)', transition: 'width .5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                    <span>In: {fmtTokens(p.tokens_in)}</span>
                    <span>Out: {fmtTokens(p.tokens_out)}</span>
                    <span>{p.successful_calls} calls</span>
                  </div>
                </div>
              );
            })}
            {data.costByPlatform.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No cost data in this period</p>}
          </div>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Users by Cost</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.costByUserRanked.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{u.plan} &middot; {u.calls} calls &middot; {fmtTokens(Number(u.tokens_in) + Number(u.tokens_out))} tokens</p>
                </div>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{fmtCost(u.cost)}</span>
              </div>
            ))}
            {data.costByUserRanked.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No cost data</p>}
          </div>
        </div>
      </div>

      {/* Daily Cost Trend */}
      {data.dailyCostTrend.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily Cost Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {data.dailyCostTrend.map((d, i) => {
              const maxCost = Math.max(...data.dailyCostTrend.map(x => Number(x.cost)), 0.0001);
              const h = Math.max(2, (Number(d.cost) / maxCost) * 80);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  title={`${new Date(d.date).toLocaleDateString()}: ${fmtCost(d.cost)} — In: ${fmtTokens(d.tokens_in)} Out: ${fmtTokens(d.tokens_out)}`}>
                  <div style={{ width: '100%', minWidth: 3, maxWidth: 20, height: h, background: '#f59e0b', borderRadius: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
            <span>{new Date(data.dailyCostTrend[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>Total: {fmtCost(cs.total_cost)}</span>
            <span>{new Date(data.dailyCostTrend[data.dailyCostTrend.length - 1]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      )}

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
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>{p.calls.toLocaleString()} calls</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: PLATFORM_COLORS[p.platform] || 'var(--primary)', transition: 'width .5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                    <span>Avg latency: {p.avg_latency_ms}ms</span>
                    <span>Errors: {p.errors}</span>
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
                <span style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{p.calls.toLocaleString()} calls</span>
              </div>
            ))}
            {data.topPlatforms.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data</p>}
          </div>
        </div>

        {/* Cost by User */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Users by API Calls</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.costByUser.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{u.plan} &middot; {u.calls} calls</p>
                </div>
                <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{u.calls.toLocaleString()}</span>
              </div>
            ))}
            {data.costByUser.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No data</p>}
          </div>
        </div>
      </div>

      {/* Daily Trend */}
      {data.dailyCosts.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily API Calls Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {data.dailyCosts.map((d, i) => {
              const maxCalls = Math.max(...data.dailyCosts.map(x => x.calls), 1);
              const h = Math.max(2, (d.calls / maxCalls) * 80);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  title={`${new Date(d.date).toLocaleDateString()}: ${d.calls} calls, ${d.active_users} users`}>
                  <div style={{ width: '100%', minWidth: 3, maxWidth: 20, height: h, background: 'var(--primary)', borderRadius: 2 }} />
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
