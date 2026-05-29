'use client';

import { useState, useEffect } from 'react';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';
import { Card, Badge, PageHead, KPIRail } from '@/app/dashboard-v2/ui';

interface AlertRule { id: string; name: string; condition: string; threshold: number; action: string; cooldown: number; enabled: boolean; }
interface Notification { id: string; title: string; message: string; timestamp: string; read: boolean; }

export default function AlertsPage() {
  const { brand, loading } = useBrandData();
  const { toast } = useToast();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [reportFreq, setReportFreq] = useState('off');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState('');
  const [reportSaved, setReportSaved] = useState(false);
  const [alertName, setAlertName] = useState('');
  const [alertCondition, setAlertCondition] = useState('visibility_drop');
  const [alertThreshold, setAlertThreshold] = useState(10);
  const [alertAction, setAlertAction] = useState('in_app');
  const [alertCooldown, setAlertCooldown] = useState(24);

  useEffect(() => {
    if (!brand?.id) return;
    const load = () => fetch(`/api/brands/${brand.id}/alerts`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); })
      .then(d => { setRules(d.rules || []); setNotifications(d.notifications || []); setWebhookUrl(d.webhookUrl || ''); setReportFreq(d.reportFreq || 'off'); })
      .catch(() => {});
    load();
    const handler = () => load();
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brand?.id]);

  function saveAlert() {
    if (!brand || !alertName.trim()) { toast('Alert name is required', 'error'); return; }
    const threshold = Math.max(1, Math.min(100, alertThreshold));
    const cooldown = Math.max(1, Math.min(168, alertCooldown));
    fetch(`/api/brands/${brand.id}/alerts`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: alertName.trim(), condition: alertCondition, threshold, action: alertAction, cooldown }),
    }).then(r => { if (!r.ok) throw new Error('Request failed'); return r.json(); }).then(d => { if (d.rules) setRules(d.rules); setShowAddForm(false); setAlertName(''); setAlertThreshold(10); setAlertCooldown(24); toast('Alert saved successfully'); }).catch(() => { toast('Failed to save alert', 'error'); });
  }

  function saveWebhook() {
    if (!brand) return;
    fetch(`/api/brands/${brand.id}/alerts`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    }).then(() => { setWebhookStatus('Saved!'); toast('Webhook saved successfully'); }).catch(() => { setWebhookStatus('Failed'); toast('Failed to save webhook', 'error'); });
  }

  function saveReport() {
    if (!brand) return;
    fetch(`/api/brands/${brand.id}/alerts`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportFreq }),
    }).then(() => { setReportSaved(true); setTimeout(() => setReportSaved(false), 3000); toast('Report schedule saved'); }).catch(() => { toast('Failed to save report schedule', 'error'); });
  }

  const notifTypes = [
    { name: 'Visibility Drop Alerts', desc: 'When your brand visibility drops significantly' },
    { name: 'SOV Below Threshold', desc: 'When share of voice falls below your target' },
    { name: 'Negative Sentiment', desc: 'When negative sentiment spikes' },
    { name: 'Team Invitations', desc: 'When you are added to a team' },
  ];

  if (loading) return (
    <div className="lvx">
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
        <span style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
      </div>
    </div>
  );

  const activeCount = rules.filter(r => r.enabled).length;

  return (
    <div className="lvx">
      <PageHead title="Alerts" sub="Manage alert rules, webhook URLs, notification preferences, and report schedules — all in one place."
        actions={<button className="btn-p" onClick={() => setShowAddForm(!showAddForm)}>+ Add Alert</button>} />
      <div className="page-body">
        <KPIRail items={[
          { k: 'RULES ACTIVE', v: String(activeCount), info: `of ${rules.length}` },
          { k: 'TOTAL RULES', v: String(rules.length) },
          { k: 'NOTIFICATIONS', v: String(notifications.length) },
          { k: 'WEBHOOK', v: webhookUrl ? 'ON' : 'OFF' },
          { k: 'EMAIL REPORT', v: reportFreq === 'off' ? 'OFF' : reportFreq.toUpperCase() },
        ]} />

        <div className="g2">
          <Card title="Alert rules" right={<button className="btn-d" style={{ fontSize: 11 }} onClick={() => setShowAddForm(!showAddForm)}>+ Add</button>} padding={false} style={{ gridColumn: 'span 2' }}>
            {rules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--mute)', fontSize: 13 }}>
                No alert rules configured. Click &quot;+ Add Alert&quot; to create one.
              </div>
            ) : (
              <table className="tbl">
                <thead><tr><th>WHEN</th><th>CHANNELS</th><th>THRESHOLD · COOLDOWN</th><th>STATUS</th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td><b>{r.name}</b></td>
                      <td className="mono dim">{r.action} · {r.condition}</td>
                      <td className="num mono"><b>{r.threshold}%</b> <span className="dim">· {r.cooldown}h</span></td>
                      <td><Badge tone={r.enabled ? 'pos' : 'neu'}>{r.enabled ? 'ACTIVE' : 'DISABLED'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {showAddForm && (
            <Card title="New alert rule" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>ALERT NAME</div>
                  <input className="sel" value={alertName} onChange={e => setAlertName(e.target.value)} placeholder="e.g. SOV dropped below 20%" style={{ width: '100%' }} />
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>CONDITION</div>
                  <select className="sel" value={alertCondition} onChange={e => setAlertCondition(e.target.value)} style={{ width: '100%' }}>
                    <option value="visibility_drop">Visibility Drop (%)</option>
                    <option value="sov_below">SOV Below Threshold</option>
                    <option value="brand_disappeared">Brand Disappeared</option>
                    <option value="negative_sentiment">Negative Sentiment Spike</option>
                    <option value="new_competitor">New Competitor Detected</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>THRESHOLD (%)</div>
                  <input className="sel" type="number" value={alertThreshold} onChange={e => setAlertThreshold(Number(e.target.value))} min={1} max={100} style={{ width: '100%' }} />
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>ACTION</div>
                  <select className="sel" value={alertAction} onChange={e => setAlertAction(e.target.value)} style={{ width: '100%' }}>
                    <option value="in_app">In-App Notification</option>
                    <option value="email">Email</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>COOLDOWN (HOURS)</div>
                  <input className="sel" type="number" value={alertCooldown} onChange={e => setAlertCooldown(Number(e.target.value))} min={1} max={168} style={{ width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-p" onClick={saveAlert}>Save Alert</button>
                <button className="btn-d" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </Card>
          )}

          <Card title="Recent activity" padding={false}>
            {notifications.length === 0 ? (
              <div style={{ padding: '22px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>No notifications yet.</div>
            ) : (
              <ul className="alert-feed">
                {notifications.map(n => (
                  <li key={n.id}>
                    <span className={'dot ' + (n.read ? 'neu' : 'warn')} />
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{n.title}</div>
                      <div className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>{n.message}</div>
                    </div>
                    <span className="mono dim" style={{ fontSize: 11 }}>{new Date(n.timestamp).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Channels & schedule">
            <div className="chan">
              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{ background: 'var(--surface-3)' }}>↗</span>
                  <div style={{ minWidth: 0 }}>
                    <b>Webhook</b>
                    <div className="quiet mono" style={{ fontSize: 11 }}>{webhookStatus || (webhookUrl ? 'Webhook configured' : 'No webhook configured')}</div>
                  </div>
                </div>
                <Badge tone={webhookUrl ? 'pos' : 'neu'}>{webhookUrl ? 'CONNECTED' : 'OFF'}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="sel" type="url" placeholder="https://hooks.slack.com/services/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} style={{ flex: 1 }} />
                <button className="btn-p" onClick={saveWebhook}>Save</button>
              </div>

              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{ background: 'var(--mute-2)' }}>@</span>
                  <div style={{ minWidth: 0 }}>
                    <b>Email report</b>
                    <div className="quiet" style={{ fontSize: 11 }}>Periodic email summaries of your visibility</div>
                  </div>
                </div>
                <Badge tone={reportFreq === 'off' ? 'neu' : 'pos'}>{reportFreq === 'off' ? 'OFF' : reportFreq.toUpperCase()}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="sel" value={reportFreq} onChange={e => setReportFreq(e.target.value)} style={{ flex: 1 }}>
                  <option value="off">Off</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <button className="btn-p" onClick={saveReport}>Save</button>
                {reportSaved && <Badge tone="pos">SAVED</Badge>}
              </div>
            </div>
          </Card>

          <Card title="Notification types" style={{ gridColumn: 'span 2' }}>
            <div className="chan">
              {notifTypes.map(n => (
                <div key={n.name} className="chan-row">
                  <div className="chan-l">
                    <div>
                      <b>{n.name}</b>
                      <div className="quiet" style={{ fontSize: 11 }}>{n.desc}</div>
                    </div>
                  </div>
                  <Badge tone="pos">ACTIVE</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
