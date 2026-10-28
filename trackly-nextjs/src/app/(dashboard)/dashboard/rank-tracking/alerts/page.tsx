'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHead } from '@/app/dashboard-v2/ui';
import { RT, RankTabs, rtFetch, fmtDay, activityTag, btnPrimary, btnSecondary, cardStyle, inputStyle, labelStyle } from '@/components/rank-tracking/RankUi';

type RuleType = 'changes_by' | 'enters_top' | 'leaves_top' | 'gains' | 'loses' | 'new_best' | 'new_worst' | 'ai_mentioned';

const RULES: { type: RuleType; label: string; nLabel: string | null; n: number }[] = [
  { type: 'changes_by', label: 'Changes by more than', nLabel: 'Positions', n: 5 },
  { type: 'enters_top', label: 'Enters the top', nLabel: 'Top', n: 10 },
  { type: 'leaves_top', label: 'Leaves the top', nLabel: 'Top', n: 10 },
  { type: 'gains', label: 'Gains more than', nLabel: 'Positions', n: 5 },
  { type: 'loses', label: 'Loses more than', nLabel: 'Positions', n: 5 },
  { type: 'new_best', label: 'Reaches a new best', nLabel: null, n: 0 },
  { type: 'new_worst', label: 'Reaches a new worst', nLabel: null, n: 0 },
  { type: 'ai_mentioned', label: 'Gets mentioned by AI', nLabel: null, n: 0 },
];

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', slack: 'Slack', client: 'client too' };

interface Rule {
  id: string; type: RuleType; threshold: number | null; websiteId: string | null; groupId: string | null; starredOnly: boolean;
  channels: string[]; domain: string | null; groupName: string | null; label: string;
}
interface LogRow { id: string; message: string; kind: string; createdAt: string }
interface AlertsResp { rules: Rule[]; log: LogRow[]; slackConnected: boolean }
interface SitesResp { websites: { id: string; domain: string }[]; groups: { id: string; name: string; websiteId: string }[] }

const selectStyle: React.CSSProperties = { ...inputStyle, fontSize: 14, padding: '11px 12px', minHeight: 46 };
const checkStyle: React.CSSProperties = { width: 20, height: 20, accentColor: RT.indigo, margin: 0 };
const sectionStyle: React.CSSProperties = { ...cardStyle, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 };
const h2Style: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: RT.ink };

function scopeText(r: Rule): string {
  const parts = [r.domain || 'All websites'];
  if (r.groupName) parts.push(r.groupName);
  if (r.starredOnly) parts.push('Starred only');
  const ch = r.channels.map((c, i) => (i === 0 && c === 'client' ? 'Client too' : CHANNEL_LABEL[c] || c)).join(', ');
  if (ch) parts.push(ch);
  return parts.join(' · ');
}

function AlertsInner() {
  const params = useSearchParams();
  const [data, setData] = useState<AlertsResp | null>(null);
  const [sites, setSites] = useState<SitesResp>({ websites: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rule, setRule] = useState<RuleType>('enters_top');
  const [threshold, setThreshold] = useState('10');
  const [websiteId, setWebsiteId] = useState(params.get('website') || '');
  const [groupId, setGroupId] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [channels, setChannels] = useState<Record<string, boolean>>({ email: true, slack: false, client: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        rtFetch<AlertsResp>('/api/rank-tracking/alerts'),
        rtFetch<SitesResp>('/api/rank-tracking/websites'),
      ]);
      setData(a);
      setSites(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Drop a ?website= that is not one of the account's websites.
  useEffect(() => {
    if (!loading && websiteId && !sites.websites.some((w) => w.id === websiteId)) setWebsiteId('');
  }, [loading, sites, websiteId]);

  const cur = RULES.find((r) => r.type === rule)!;
  const groups = sites.groups.filter((g) => g.websiteId === websiteId);

  function pick(t: RuleType) {
    const r = RULES.find((x) => x.type === t)!;
    setRule(t);
    if (r.nLabel) setThreshold(String(r.n));
  }

  function reset() {
    pick('enters_top');
    setGroupId('');
    setStarredOnly(false);
    setChannels({ email: true, slack: false, client: false });
    setFormError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setNotice('');
    const chosen = Object.keys(channels).filter((k) => channels[k]);
    if (!chosen.length) { setFormError('Pick at least one place to send it.'); return; }
    const n = Number(threshold);
    if (cur.nLabel && (!Number.isFinite(n) || n < 1 || n > 100)) { setFormError('Enter a number from 1 to 100.'); return; }
    setSaving(true);
    try {
      const r = await rtFetch<{ id: string; label: string }>('/api/rank-tracking/alerts', 'POST', {
        type: rule, threshold: cur.nLabel ? Math.round(n) : null, websiteId: websiteId || null, groupId: groupId || null, starredOnly, channels: chosen,
      });
      setNotice(`Rule added: ${r.label}.`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the rule.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Rule) {
    if (!window.confirm(`Delete the rule "${r.label}"?`)) return;
    setDeleting(r.id);
    try {
      await rtFetch(`/api/rank-tracking/alerts/${r.id}`, 'DELETE');
      setData((d) => (d ? { ...d, rules: d.rules.filter((x) => x.id !== r.id) } : d));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete the rule.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <RankTabs />
      <PageHead title="Alerts and reports" sub="Get told when rankings move, send clients a report on schedule, or give them a live view." />

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 16, marginBottom: 20, color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}</span>
          <button type="button" style={btnSecondary} onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <form onSubmit={submit} style={{ ...cardStyle, borderRadius: 16, flex: '1 1 420px', minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 style={h2Style}>New alert rule</h2>

          <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: RT.text, marginBottom: 8, padding: 0 }}>When a keyword</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {RULES.map((r) => {
                const on = r.type === rule;
                return (
                  <button key={r.type} type="button" aria-pressed={on} onClick={() => pick(r.type)}
                    style={{ font: 'inherit', fontSize: 13, textAlign: 'left', padding: '10px 12px', minHeight: 44, borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? RT.indigo : RT.line}`, background: on ? RT.indigoSoft : '#fff', color: on ? RT.indigoDark : RT.ink, fontWeight: on ? 600 : 500 }}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {cur.nLabel && (
            <label style={labelStyle}>
              {cur.nLabel}
              <input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ ...inputStyle, fontWeight: 400, width: 140 }} />
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Website
              <select value={websiteId} onChange={(e) => { setWebsiteId(e.target.value); setGroupId(''); }} style={{ ...selectStyle, fontWeight: 400 }}>
                <option value="">All websites</option>
                {sites.websites.map((w) => <option key={w.id} value={w.id}>{w.domain}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Group
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!websiteId || !groups.length} style={{ ...selectStyle, fontWeight: 400 }}>
                <option value="">All groups</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: RT.text, minHeight: 44 }}>
            <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} style={checkStyle} /> Starred keywords only
          </label>

          <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: RT.text, marginBottom: 8, padding: 0 }}>Send to</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {(['email', 'slack', 'client'] as const).map((c) => (
                <label key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 44 }}>
                  <input type="checkbox" checked={channels[c]} onChange={(e) => setChannels((x) => ({ ...x, [c]: e.target.checked }))} style={checkStyle} />
                  {c === 'email' ? 'Email' : c === 'slack' ? 'Slack' : 'Client too'}
                </label>
              ))}
            </div>
            {channels.slack && data && !data.slackConnected && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: RT.muted }}>
                Slack is not connected yet. Add your Slack webhook in{' '}
                <Link href="/dashboard/rank-tracking/clients#branding" style={{ color: '#4338ca', fontWeight: 600 }}>Clients, Branding settings</Link>.
              </p>
            )}
          </fieldset>

          {formError && <div role="alert" style={{ fontSize: 14, color: RT.down }}>{formError}</div>}
          {notice && <div role="status" style={{ fontSize: 14, color: RT.up }}>{notice}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={btnSecondary} onClick={reset}>Cancel</button>
            <button type="submit" style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }} disabled={saving}>{saving ? 'Adding...' : 'Add rule'}</button>
          </div>
        </form>

        <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={sectionStyle} aria-busy={loading}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 style={h2Style}>Alert rules</h2>
              {!!data?.rules.length && <span style={{ fontSize: 12, color: RT.muted }}>{data.rules.length} active</span>}
            </div>
            {loading ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Loading...</p>
            ) : !data?.rules.length ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted, padding: 14, border: `1px dashed ${RT.line}`, borderRadius: 12 }}>
                No rules yet. Pick what to watch for and press Add rule.
              </p>
            ) : data.rules.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 14, border: `1px solid ${RT.line}`, borderRadius: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: RT.muted }}>{scopeText(r)}</span>
                </div>
                <button type="button" onClick={() => remove(r)} disabled={deleting === r.id} aria-label={`Delete rule: ${r.label}`}
                  style={{ ...btnSecondary, fontSize: 13, padding: '8px 12px', flex: 'none' }}>
                  {deleting === r.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </section>

          <section style={sectionStyle} aria-busy={loading}>
            <h2 style={h2Style}>Recent alerts</h2>
            {loading ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Loading...</p>
            ) : !data?.log.length ? (
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>
                Nothing yet. Alerts show here when a rule fires after a rank check.
              </p>
            ) : data.log.map((l) => {
              const t = activityTag(l.message, l.kind);
              return (
                <div key={l.id} style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 10, background: t.bg, fontSize: 13, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, whiteSpace: 'nowrap' }}>{t.label}</span>
                  <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere', color: RT.ink }}>{l.message}</span>
                  <span style={{ color: RT.muted, flex: 'none', fontSize: 12 }}>{fmtDay(l.createdAt)}</span>
                </div>
              );
            })}
          </section>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 20 }}>
        <section style={{ ...sectionStyle, flex: '1 1 340px', minWidth: 0 }}>
          <h2 style={h2Style}>Scheduled reports</h2>
          <p style={{ margin: 0, fontSize: 13, color: RT.muted }}>
            Send a PDF or CSV to a client on a schedule: position spread, gainers and losers, the keyword table with start vs now, AI answers, and your logo and colours.
          </p>
          <div><Link href="/dashboard/rank-tracking/reports" style={{ ...btnSecondary, fontSize: 13 }}>Manage reports</Link></div>
        </section>
        <section style={{ ...sectionStyle, flex: '1 1 340px', minWidth: 0 }}>
          <h2 style={h2Style}>Client view</h2>
          <p style={{ margin: 0, fontSize: 13, color: RT.muted }}>
            A read-only live dashboard for one site, under your branding. Share a link from the Websites table, or invite clients to log in.
          </p>
          <div><Link href="/dashboard/rank-tracking/clients" style={{ ...btnSecondary, fontSize: 13 }}>Manage client access</Link></div>
        </section>
      </div>
    </div>
  );
}

export default function RankAlertsPage() {
  return (
    <Suspense fallback={null}>
      <AlertsInner />
    </Suspense>
  );
}
