'use client';

import { useState, useEffect } from 'react';
import { useBrandData } from '@/hooks/useBrandData';
import { useToast } from '@/components/dashboard/Toast';

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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div className="view-title">Alerts &amp; Notifications</div>
      <div className="view-sub">Manage alert rules, webhook URLs, notification preferences, and report schedules - all in one place.</div>

      {/* Alert Rules */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>Alert Rules</div>
          <button className="pbtn" onClick={() => setShowAddForm(!showAddForm)} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>+ Add Alert</button>
        </div>
        {rules.length === 0 && !showAddForm && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)', fontSize: 13 }}>
            No alert rules configured. Click &quot;+ Add Alert&quot; to create one.
          </div>
        )}
        {rules.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: r.enabled ? 'var(--green)' : '#888', flexShrink: 0 }} />
                {r.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 16 }}>{r.condition} · Threshold: {r.threshold}% · Cooldown: {r.cooldown}h</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: r.enabled ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>{r.enabled ? 'Active' : 'Disabled'}</span>
              <div style={{ width: 32, height: 18, borderRadius: 9, background: r.enabled ? 'var(--green)' : '#555', position: 'relative', cursor: 'default', transition: 'background 0.2s' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: r.enabled ? 16 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Alert Form */}
      {showAddForm && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--primary-border)' }}>
          <div className="section-title">New Alert Rule</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="flbl">Alert Name</label><input className="finp" value={alertName} onChange={e => setAlertName(e.target.value)} placeholder="e.g. SOV dropped below 20%" style={{ margin: 0 }} /></div>
            <div><label className="flbl">Condition</label><select className="finp" value={alertCondition} onChange={e => setAlertCondition(e.target.value)} style={{ margin: 0 }}>
              <option value="visibility_drop">Visibility Drop (%)</option>
              <option value="sov_below">SOV Below Threshold</option>
              <option value="brand_disappeared">Brand Disappeared</option>
              <option value="negative_sentiment">Negative Sentiment Spike</option>
              <option value="new_competitor">New Competitor Detected</option>
            </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="flbl">Threshold (%)</label><input className="finp" type="number" value={alertThreshold} onChange={e => setAlertThreshold(Number(e.target.value))} min={1} max={100} style={{ margin: 0 }} /></div>
            <div><label className="flbl">Action</label><select className="finp" value={alertAction} onChange={e => setAlertAction(e.target.value)} style={{ margin: 0 }}>
              <option value="in_app">In-App Notification</option>
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
            </select></div>
            <div><label className="flbl">Cooldown (hours)</label><input className="finp" type="number" value={alertCooldown} onChange={e => setAlertCooldown(Number(e.target.value))} min={1} max={168} style={{ margin: 0 }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pbtn" onClick={saveAlert} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontSize: 12, padding: '8px 16px' }}>Save Alert</button>
            <button className="btn-secondary" onClick={() => setShowAddForm(false)} style={{ fontSize: 12, padding: '8px 16px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Email Report Schedule */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Email Report Schedule</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Receive periodic email summaries of your brand visibility.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="finp" value={reportFreq} onChange={e => setReportFreq(e.target.value)} style={{ margin: 0, width: 180 }}>
            <option value="off">Off</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button className="pbtn" onClick={saveReport} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontSize: 11 }}>SAVE</button>
          {reportSaved && <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>SAVED</span>}
        </div>
      </div>

      {/* Notification Types */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Notification Types</div>
        {notifTypes.map(n => (
          <div key={n.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{n.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{n.desc}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>Active</span>
          </div>
        ))}
      </div>

      {/* Webhook URL */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Webhook URL</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>We&apos;ll POST a JSON payload whenever your SOV changes after a run.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="finp" type="url" placeholder="https://hooks.slack.com/services/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} style={{ flex: 1, margin: 0 }} />
          <button className="pbtn" onClick={saveWebhook} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>SAVE</button>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>Receive real-time alert notifications via webhook</div>
        <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{webhookStatus || (webhookUrl ? 'Webhook configured' : 'No webhook configured')}</div>
      </div>

      {/* Recent Notifications */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Recent Notifications</div>
        {notifications.length === 0 ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>No notifications yet.</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {notifications.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{n.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{n.message}</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4 }}>{new Date(n.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
