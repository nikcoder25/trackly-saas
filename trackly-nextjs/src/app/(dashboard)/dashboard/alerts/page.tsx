'use client';

import { useState, useEffect, useCallback } from 'react';

interface Alert {
  id: string;
  name: string;
  condition_type: string;
  condition_params: Record<string, unknown>;
  action_type: string;
  action_params: Record<string, unknown>;
  enabled: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  created_at: string;
}
interface Brand { id: string; name: string; }
interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

const CONDITION_OPTIONS = [
  { value: 'visibility_drop', label: 'Visibility Drop' },
  { value: 'sov_below', label: 'SOV Below Threshold' },
  { value: 'brand_disappeared', label: 'Brand Disappeared' },
  { value: 'negative_sentiment', label: 'Negative Sentiment' },
  { value: 'new_competitor', label: 'New Competitor Detected' },
];

const ACTION_OPTIONS = [
  { value: 'in_app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
];

export default function AlertsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCondition, setNewCondition] = useState('visibility_drop');
  const [newThreshold, setNewThreshold] = useState(10);
  const [newAction, setNewAction] = useState('in_app');
  const [newCooldown, setNewCooldown] = useState(24);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCondition, setEditCondition] = useState('visibility_drop');
  const [editThreshold, setEditThreshold] = useState(10);
  const [editAction, setEditAction] = useState('in_app');
  const [editCooldown, setEditCooldown] = useState(24);
  const [editSaving, setEditSaving] = useState(false);

  // Email report schedule
  const [emailSchedule, setEmailSchedule] = useState<'off' | 'weekly' | 'monthly'>('off');
  const [emailScheduleSaving, setEmailScheduleSaving] = useState(false);
  const [emailScheduleSaved, setEmailScheduleSaved] = useState(false);

  // Notification type toggles
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWebhook, setNotifyWebhook] = useState(false);
  const [notifyToggleSaving, setNotifyToggleSaving] = useState(false);

  // Webhook URL
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<'none' | 'active' | 'error'>('none');
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);

  // Recent notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // Load brands
  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || [];
      setBrands(b);
      if (b.length) setSelectedBrand(b[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Load alerts for selected brand
  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/alerts`, { credentials: 'include' })
      .then(r => r.json()).then(d => setAlerts(d.alerts || [])).catch(() => setAlerts([]));
  }, [selectedBrand]);

  // Load user settings (email schedule, notification types, webhook)
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(d => {
      const s = d.settings || {};
      if (s.emailReportSchedule) setEmailSchedule(s.emailReportSchedule);
      if (s.notifyInApp !== undefined) setNotifyInApp(!!s.notifyInApp);
      if (s.notifyEmail !== undefined) setNotifyEmail(!!s.notifyEmail);
      if (s.notifyWebhook !== undefined) setNotifyWebhook(!!s.notifyWebhook);
      if (s.webhookUrl) setWebhookUrl(s.webhookUrl);
      if (s.webhookStatus) setWebhookStatus(s.webhookStatus);
    }).catch(() => {});
  }, []);

  // Load recent notifications
  const loadNotifications = useCallback(() => {
    setNotificationsLoading(true);
    fetch('/api/notifications', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setNotifications(d.notifications || []))
      .catch(() => setNotifications([]))
      .finally(() => setNotificationsLoading(false));
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // --- Handlers ---

  const handleCreate = async () => {
    if (!selectedBrand || !newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrand.id}/alerts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          name: newName,
          condition_type: newCondition,
          condition_params: { threshold: newThreshold },
          action_type: newAction,
          cooldown_hours: newCooldown,
        }),
      });
      const data = await res.json();
      if (data.alert) {
        setAlerts([data.alert, ...alerts]);
        setShowCreate(false);
        setNewName('');
        setNewCondition('visibility_drop');
        setNewThreshold(10);
        setNewAction('in_app');
        setNewCooldown(24);
      }
    } catch {}
    setSaving(false);
  };

  const startEdit = (a: Alert) => {
    setEditingId(a.id);
    setEditName(a.name);
    setEditCondition(a.condition_type);
    setEditThreshold((a.condition_params as Record<string, number>)?.threshold ?? 10);
    setEditAction(a.action_type);
    setEditCooldown(a.cooldown_hours);
  };

  const cancelEdit = () => setEditingId(null);

  const handleEdit = async (id: string) => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          name: editName,
          condition_params: { threshold: editThreshold },
          action_params: {},
          cooldown_hours: editCooldown,
        }),
      });
      const data = await res.json();
      if (data.alert) {
        setAlerts(alerts.map(a => a.id === id ? data.alert : a));
        setEditingId(null);
      }
    } catch {}
    setEditSaving(false);
  };

  const toggleAlert = async (alert: Alert) => {
    await fetch(`/api/alerts/${alert.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ enabled: !alert.enabled }),
    });
    setAlerts(alerts.map(a => a.id === alert.id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlert = async (id: string) => {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const saveEmailSchedule = async () => {
    setEmailScheduleSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ emailReportSchedule: emailSchedule }),
      });
      setEmailScheduleSaved(true);
      setTimeout(() => setEmailScheduleSaved(false), 2000);
    } catch {}
    setEmailScheduleSaving(false);
  };

  const saveNotificationTypes = async (key: string, value: boolean) => {
    setNotifyToggleSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [key]: value }),
      });
    } catch {}
    setNotifyToggleSaving(false);
  };

  const handleToggleInApp = () => { const v = !notifyInApp; setNotifyInApp(v); saveNotificationTypes('notifyInApp', v); };
  const handleToggleEmail = () => { const v = !notifyEmail; setNotifyEmail(v); saveNotificationTypes('notifyEmail', v); };
  const handleToggleWebhook = () => { const v = !notifyWebhook; setNotifyWebhook(v); saveNotificationTypes('notifyWebhook', v); };

  const saveWebhookUrl = async () => {
    setWebhookSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ webhookUrl, webhookStatus: webhookUrl.trim() ? 'active' : 'none' }),
      });
      setWebhookStatus(webhookUrl.trim() ? 'active' : 'none');
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 2000);
    } catch {
      setWebhookStatus('error');
    }
    setWebhookSaving(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  // --- Toggle component ---
  const Toggle = ({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) => (
    <button onClick={onChange} disabled={disabled} className={`w-10 h-5 rounded-full relative transition shrink-0 ${enabled ? 'bg-[var(--primary)]' : 'bg-[var(--bg4)]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${enabled ? 'left-5' : 'left-0.5'}`} />
    </button>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Alerts</h1>
          <p className="text-[var(--text-muted)] mt-1">Set up alert rules and notifications</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-2 rounded-lg text-sm font-medium transition">
          + New Alert
        </button>
      </div>

      {/* Brand selector */}
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* ============ ADD ALERT FORM ============ */}
      {showCreate && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Add Alert</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Alert Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" placeholder="e.g. SOV Drop Alert" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Condition</label>
              <select value={newCondition} onChange={e => setNewCondition(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm">
                {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Threshold %</label>
              <input type="number" min={0} max={100} value={newThreshold} onChange={e => setNewThreshold(Number(e.target.value))} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Action</label>
              <select value={newAction} onChange={e => setNewAction(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm">
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Cooldown (hours)</label>
              <input type="number" min={1} max={720} value={newCooldown} onChange={e => setNewCooldown(Number(e.target.value))} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={handleCreate} disabled={saving || !newName.trim()} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition">
                {saving ? 'Creating...' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ ALERT RULES LIST ============ */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Alert Rules</h2>
        {alerts.length === 0 ? (
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--text-muted)]">No alerts configured. Create one to get notified about visibility changes.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-4">
                {editingId === a.id ? (
                  /* --- Edit mode --- */
                  <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Alert Name</label>
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Condition</label>
                        <select value={editCondition} onChange={e => setEditCondition(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" disabled>
                          {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Threshold %</label>
                        <input type="number" min={0} max={100} value={editThreshold} onChange={e => setEditThreshold(Number(e.target.value))} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Action</label>
                        <select value={editAction} onChange={e => setEditAction(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" disabled>
                          {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Cooldown (hours)</label>
                        <input type="number" min={1} max={720} value={editCooldown} onChange={e => setEditCooldown(Number(e.target.value))} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(a.id)} disabled={editSaving} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition">
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] px-4 py-1.5 rounded-lg text-sm transition hover:text-[var(--text)]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* --- Display mode --- */
                  <div className="flex items-center gap-4">
                    <Toggle enabled={a.enabled} onChange={() => toggleAlert(a)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {a.condition_type.replace(/_/g, ' ')}
                        {(a.condition_params as Record<string, number>)?.threshold !== undefined && (
                          <> &middot; {(a.condition_params as Record<string, number>).threshold}% threshold</>
                        )}
                        {' '}&middot; {a.action_type} &middot; {a.cooldown_hours}h cooldown
                        {a.last_triggered_at && <> &middot; last triggered {formatTime(a.last_triggered_at)}</>}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(a)} className="text-[var(--text-muted)] hover:text-[var(--primary)] text-xs transition">Edit</button>
                      <button onClick={() => deleteAlert(a.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] text-xs transition">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ SETTINGS GRID ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* --- Email Report Schedule --- */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Email Report Schedule</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Receive periodic email summaries of your alert activity.</p>
          <div className="flex gap-2 mb-3">
            {(['off', 'weekly', 'monthly'] as const).map(opt => (
              <button key={opt} onClick={() => setEmailSchedule(opt)} className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${emailSchedule === opt ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {opt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveEmailSchedule} disabled={emailScheduleSaving} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition">
              {emailScheduleSaving ? 'Saving...' : 'Save'}
            </button>
            {emailScheduleSaved && <span className="text-xs text-green-500">Saved</span>}
          </div>
        </div>

        {/* --- Notification Types --- */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Notification Types</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Choose how you want to receive alert notifications.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text)]">In-App Notifications</p>
                <p className="text-xs text-[var(--text-muted)]">Show alerts in the notification bell</p>
              </div>
              <Toggle enabled={notifyInApp} onChange={handleToggleInApp} disabled={notifyToggleSaving} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text)]">Email Notifications</p>
                <p className="text-xs text-[var(--text-muted)]">Send alerts to your email</p>
              </div>
              <Toggle enabled={notifyEmail} onChange={handleToggleEmail} disabled={notifyToggleSaving} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text)]">Webhook Notifications</p>
                <p className="text-xs text-[var(--text-muted)]">POST alerts to a webhook URL</p>
              </div>
              <Toggle enabled={notifyWebhook} onChange={handleToggleWebhook} disabled={notifyToggleSaving} />
            </div>
          </div>
        </div>
      </div>

      {/* ============ WEBHOOK URL ============ */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Webhook URL</h2>
          {webhookStatus !== 'none' && (
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${webhookStatus === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${webhookStatus === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
              {webhookStatus === 'active' ? 'Active' : 'Error'}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Alert payloads will be sent as POST requests to this URL. Ensure the endpoint returns a 2xx status.
        </p>
        <div className="flex gap-2">
          <input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm font-mono"
            placeholder="https://example.com/webhook"
          />
          <div className="flex items-center gap-2">
            <button onClick={saveWebhookUrl} disabled={webhookSaving} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition shrink-0">
              {webhookSaving ? 'Saving...' : 'Save'}
            </button>
            {webhookSaved && <span className="text-xs text-green-500 shrink-0">Saved</span>}
          </div>
        </div>
      </div>

      {/* ============ RECENT NOTIFICATIONS ============ */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Recent Notifications</h2>
          <button onClick={loadNotifications} disabled={notificationsLoading} className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition disabled:opacity-50">
            {notificationsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {notifications.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">No notifications yet.</p>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`flex items-start gap-3 p-2.5 rounded-lg transition ${n.read ? 'opacity-60' : 'bg-[var(--bg)]'}`}>
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-[var(--bg4)]' : 'bg-[var(--primary)]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text)] font-medium truncate">{n.title || n.type}</p>
                  <p className="text-xs text-[var(--text-muted)] line-clamp-2">{n.message}</p>
                </div>
                <span className="text-xs text-[var(--text-muted)] shrink-0">{formatTime(n.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
