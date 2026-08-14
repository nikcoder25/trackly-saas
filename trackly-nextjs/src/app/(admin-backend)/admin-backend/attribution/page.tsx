'use client';

/**
 * Admin view for "Where did you find us?".
 *
 * Laid out around the comparison rather than around the raw counts: the top
 * row is the self-report vs click-data gap, because a table of source counts
 * alone tells you nothing you could not get from the signup form. The number
 * worth looking at is how many people name an AI assistant while analytics
 * records nothing at all.
 */

import { useState, useEffect, useCallback } from 'react';
import { ATTRIBUTION_CLASS_LABELS, type AttributionClass } from '@/lib/attribution';

interface RecentRow {
  user_id: string;
  email: string;
  plan: string;
  source: string;
  source_detail: string | null;
  signup_method: string;
  referrer: string | null;
  referrer_domain: string | null;
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  promo_code: string | null;
  created_at: string;
}

interface Data {
  period: number;
  answered: number;
  unattributedSignups: number;
  summary: Record<AttributionClass, number>;
  aiTotal: number;
  aiInvisibleShare: number;
  bySource: Array<{ source: string; label: string; ai: boolean; total: number; withClickData: number }>;
  promoCodes: Array<{ promo_code: string; signups: number }>;
  recent: RecentRow[];
}

const CLASS_COLORS: Record<AttributionClass, string> = {
  ai_invisible: 'var(--purple)',
  ai_corroborated: 'var(--green)',
  ai_conflicting: 'var(--amber, #f59e0b)',
  tracked: 'var(--primary)',
  untracked: 'var(--muted)',
  unknown: 'var(--muted)',
};

const CARD: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px 18px',
};
const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: 1, color: 'var(--muted)', marginBottom: 8,
};
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
};

export default function AdminAttributionPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin-backend/attribution?days=${days}`, { credentials: 'include' })
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

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load attribution</div>;

  const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="view-title">Signup Attribution</h1>
          <p className="view-sub">What people say at signup, next to what click tracking actually recorded.</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 365 days</option>
        </select>
      </div>

      {/* The headline: AI-reported signups that analytics cannot see. */}
      <div style={{ ...CARD, marginBottom: 20, borderColor: 'var(--purple)' }}>
        <p style={LABEL}>The gap</p>
        <p style={{ fontSize: 15, lineHeight: 1.6 }}>
          <strong style={{ fontSize: 30, fontFamily: 'monospace', color: 'var(--purple)' }}>{data.summary.ai_invisible}</strong>
          {' '}of <strong>{data.aiTotal}</strong> people who named an AI assistant arrived with{' '}
          <strong>no referrer, no UTM tag and no click ID</strong> — {data.aiInvisibleShare}% of AI-reported
          signups are invisible to analytics. In a click-based dashboard these all file as “Direct”.
        </p>
        {data.unattributedSignups > 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
            {data.unattributedSignups} signup(s) in this window have no attribution row — accounts created
            before this shipped, or through a path that does not ask. They are excluded from every number here.
          </p>
        )}
      </div>

      {/* Class breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(Object.keys(ATTRIBUTION_CLASS_LABELS) as AttributionClass[]).map(cls => (
          <div key={cls} style={CARD}>
            <p style={LABEL}>{ATTRIBUTION_CLASS_LABELS[cls]}</p>
            <p style={{ fontSize: 26, fontWeight: 800, fontFamily: 'monospace', color: CLASS_COLORS[cls] }}>
              {data.summary[cls]}
            </p>
          </div>
        ))}
      </div>

      {/* Promo codes - does the agent-facing offer actually convert? */}
      <div style={{ ...CARD, marginBottom: 24 }}>
        <p style={LABEL}>Offer codes cited at signup</p>
        {data.promoCodes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            No signups arrived with a <code>?promo=</code> code in this window. Codes are captured when a
            visitor lands from the offer link published in /llms.txt and /ai-offer.json.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={TH}>Code</th><th style={TH}>Signups</th></tr></thead>
            <tbody>
              {data.promoCodes.map(p => (
                <tr key={p.promo_code}>
                  <td style={{ ...TD, fontFamily: 'monospace' }}>{p.promo_code}</td>
                  <td style={{ ...TD, fontFamily: 'monospace' }}>{p.signups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By source */}
      <div style={{ ...CARD, marginBottom: 24, padding: 0, overflowX: 'auto' }}>
        <p style={{ ...LABEL, padding: '18px 18px 0', marginBottom: 12 }}>By answer</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={TH}>Source</th>
              <th style={TH}>Signups</th>
              <th style={TH}>With click data</th>
              <th style={TH}>Invisible</th>
            </tr>
          </thead>
          <tbody>
            {data.bySource.map(s => (
              <tr key={s.source}>
                <td style={TD}>
                  {s.label}
                  {s.ai && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase' }}>AI</span>}
                </td>
                <td style={{ ...TD, fontFamily: 'monospace' }}>{s.total}</td>
                <td style={{ ...TD, fontFamily: 'monospace' }}>{s.withClickData}</td>
                <td style={{ ...TD, fontFamily: 'monospace', color: s.total - s.withClickData > 0 ? 'var(--purple)' : 'var(--muted)' }}>
                  {s.total - s.withClickData}
                </td>
              </tr>
            ))}
            {data.bySource.length === 0 && (
              <tr><td style={{ ...TD, color: 'var(--muted)' }} colSpan={4}>No signups in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Raw rows */}
      <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
        <p style={{ ...LABEL, padding: '18px 18px 0', marginBottom: 12 }}>Recent signups ({data.recent.length})</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={TH}>When</th>
              <th style={TH}>User</th>
              <th style={TH}>Said</th>
              <th style={TH}>Referrer</th>
              <th style={TH}>UTM / gclid</th>
              <th style={TH}>Landed on</th>
              <th style={TH}>Promo</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map(r => {
              const utm = [r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(' / ');
              return (
                <tr key={r.user_id}>
                  <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                  <td style={{ ...TD, fontSize: 12 }}>
                    {r.email}
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{r.plan} · {r.signup_method}</span>
                  </td>
                  <td style={TD}>
                    {r.source}
                    {r.source_detail && <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{r.source_detail}</span>}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: r.referrer_domain ? 'var(--text)' : 'var(--muted)' }}>
                    {r.referrer_domain || '— none —'}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: utm || r.gclid ? 'var(--text)' : 'var(--muted)' }}>
                    {utm || (r.gclid ? 'gclid' : '— none —')}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: 'var(--muted)', maxWidth: 220, overflowWrap: 'anywhere' }}>
                    {r.landing_path || '—'}
                  </td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.promo_code || '—'}</td>
                </tr>
              );
            })}
            {data.recent.length === 0 && (
              <tr><td style={{ ...TD, color: 'var(--muted)' }} colSpan={7}>No signups in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
