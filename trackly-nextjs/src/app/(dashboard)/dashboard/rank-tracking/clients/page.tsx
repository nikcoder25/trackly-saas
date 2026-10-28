'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageHead } from '@/app/dashboard-v2/ui';
import { RT, RankTabs, rtFetch, fmtDay, btnPrimary, btnSecondary, cardStyle, inputStyle, labelStyle } from '@/components/rank-tracking/RankUi';

interface ClientDto { id: string; name: string; email: string | null; scope: 'websites' | 'groups' | 'starred'; status: string; lastLoginAt: string | null; createdAt: string; sees: string }
interface SitesResp { websites: { id: string; domain: string }[]; groups: { id: string; name: string; websiteId: string }[] }
interface BrandingResp { agencyName: string; logoUrl: string; logoSrc?: string; primaryColor: string; customDomain: string; slackConnected: boolean }

const checkStyle: React.CSSProperties = { width: 20, height: 20, accentColor: RT.indigo, margin: 0, flex: 'none' };
const th: React.CSSProperties = { padding: '14px 12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '14px 12px', color: RT.text, verticalAlign: 'middle' };

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function AddClientModal({ sites, onClose, onCreated }: { sites: SitesResp; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<'websites' | 'groups' | 'starred'>('websites');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const domainOf = new Map(sites.websites.map((w) => [w.id, w.domain]));
  const options = scope === 'groups'
    ? sites.groups.map((g) => ({ id: g.id, label: `${domainOf.get(g.websiteId) || ''} · ${g.name}` }))
    : sites.websites.map((w) => ({ id: w.id, label: w.domain }));

  function toggle(id: string, on: boolean) {
    setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Enter the client name.'); return; }
    const ids = options.map((o) => o.id).filter((id) => picked.has(id));
    if (!ids.length) { setError(scope === 'groups' ? 'Pick at least one group.' : 'Pick at least one website.'); return; }
    setSaving(true);
    try {
      const r = await rtFetch<{ id: string; url: string }>('/api/rank-tracking/clients', 'POST', {
        name: name.trim(), email: email.trim() || null, scope,
        websiteIds: scope === 'groups' ? [] : ids, groupIds: scope === 'groups' ? ids : [],
      });
      setUrl(r.url);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client.');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-client-title"
        style={{ ...cardStyle, width: '100%', maxWidth: 560, marginTop: '6vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 id="add-client-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{url ? 'Client added' : 'Add client'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btnSecondary, padding: 0, width: 44, border: 0 }}><CloseIcon /></button>
        </div>

        {url ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: RT.text }}>
              This is their login link. It is shown only now, so copy it before you close this window.{email.trim() ? ' We also emailed it to them.' : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input readOnly value={url} aria-label="Client link" onFocus={(e) => e.target.select()} style={{ ...inputStyle, flex: '1 1 260px', fontSize: 14 }} />
              <button type="button" onClick={copy} style={btnPrimary}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p role="status" style={{ margin: 0, fontSize: 13, color: RT.muted }}>Anyone with this link can see these rankings. Revoke it from the table at any time.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={labelStyle}>Client name
              <input ref={firstRef} type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, fontWeight: 400 }} />
            </label>
            <label style={labelStyle}>Email (optional)
              <input type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} placeholder="owner@client.com" style={{ ...inputStyle, fontWeight: 400 }} />
              <span style={{ fontSize: 12, fontWeight: 400, color: RT.muted }}>When you add an email we send them the invite.</span>
            </label>

            <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: RT.text, marginBottom: 8, padding: 0 }}>They can see</legend>
              <div role="group" aria-label="They can see" style={{ display: 'flex', background: RT.lineSoft, borderRadius: 10, padding: 4, gap: 4, flexWrap: 'wrap' }}>
                {([['websites', 'Websites'], ['groups', 'Groups'], ['starred', 'Starred keywords']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={scope === v} onClick={() => { setScope(v); setPicked(new Set()); }}
                    style={{ flex: '1 1 120px', font: 'inherit', fontSize: 13, fontWeight: 600, minHeight: 44, border: 0, borderRadius: 8, cursor: 'pointer',
                      background: scope === v ? '#fff' : 'transparent', color: scope === v ? RT.ink : RT.muted }}>
                    {l}
                  </button>
                ))}
              </div>
              <p style={{ margin: '8px 0', fontSize: 13, color: RT.muted }}>
                {scope === 'websites' ? 'Every keyword of the websites you pick.' : scope === 'groups' ? 'Every keyword in the groups you pick.' : 'Only the starred keywords of the websites you pick.'}
              </p>
              {!options.length ? (
                <p style={{ margin: 0, fontSize: 14, color: RT.text }}>
                  {scope === 'groups' ? 'You have no keyword groups yet.' : 'You have no websites yet. Add one on the Websites tab first.'}
                </p>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${RT.line}`, borderRadius: 10, padding: '4px 12px' }}>
                  {options.map((o) => (
                    <label key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, minHeight: 44, overflowWrap: 'anywhere' }}>
                      <input type="checkbox" checked={picked.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} style={checkStyle} /> {o.label}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {error && <div role="alert" style={{ fontSize: 14, color: RT.down }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding...' : 'Add client'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PreviewCard({ b }: { b: BrandingResp | null }) {
  const color = b?.primaryColor || RT.indigo;
  const hasBrand = !!(b?.logoUrl || b?.agencyName);
  return (
    <section style={{ ...cardStyle, flex: '1 1 360px', minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>What your client sees</h2>
      <div style={{ border: `1px solid ${RT.line}`, borderRadius: 12, overflow: 'hidden' }} aria-label="Preview of the client page">
        <div style={{ background: color, color: '#fff', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          {b?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoSrc || b.logoUrl} alt={b.agencyName || 'Agency logo'} style={{ maxHeight: 28, maxWidth: 160, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 2 }} />
          ) : (
            <span style={{ fontWeight: 700 }}>{hasBrand ? b?.agencyName : '[YOUR AGENCY LOGO]'}</span>
          )}
          <span style={{ fontSize: 12 }}>Client name</span>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {['Top 10', 'Moved up', 'AI share'].map((l) => (
              <div key={l} style={{ background: RT.bg, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: RT.muted }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8' }} aria-hidden="true">-</div>
              </div>
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: `1px solid ${RT.lineSoft}`, color: RT.muted }}>
              <span>Keyword</span><span style={{ fontWeight: 700 }}>Rank</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 13, color: RT.muted }}>Set your logo, color and a custom domain like rankings.youragency.com in Branding below.</div>
    </section>
  );
}

function BrandingForm({ b, onSaved }: { b: BrandingResp | null; onSaved: () => void }) {
  const [agencyName, setAgencyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [color, setColor] = useState('#4f46e5');
  const [domain, setDomain] = useState('');
  const [slack, setSlack] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!b) return;
    setAgencyName(b.agencyName || '');
    setLogoUrl(b.logoUrl || '');
    setColor(b.primaryColor || '#4f46e5');
    setDomain(b.customDomain || '');
  }, [b]);

  async function save(slackWebhook: string) {
    setError('');
    setNotice('');
    if (logoUrl.trim() && !/^https:\/\/\S+$/.test(logoUrl.trim())) { setError('The logo URL must start with https://'); return; }
    if (slackWebhook && slackWebhook !== 'remove' && !/^https:\/\/hooks\.slack\.com\/\S+$/.test(slackWebhook)) { setError('The Slack webhook must start with https://hooks.slack.com/'); return; }
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (d && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { setError('Enter the domain like rankings.youragency.com'); return; }
    setSaving(true);
    try {
      await rtFetch('/api/rank-tracking/branding', 'PUT', { agencyName: agencyName.trim(), logoUrl: logoUrl.trim(), primaryColor: color, customDomain: d, slackWebhook });
      setSlack('');
      setNotice(slackWebhook === 'remove' ? 'Slack removed.' : 'Branding saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="branding" style={{ ...cardStyle, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, scrollMarginTop: 80 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Branding</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: RT.muted }}>Used on client pages and reports.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(slack.trim()); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <label style={labelStyle}>Agency name
            <input type="text" value={agencyName} maxLength={80} onChange={(e) => setAgencyName(e.target.value)} style={{ ...inputStyle, fontWeight: 400 }} />
          </label>
          <label style={labelStyle}>Logo URL
            <input type="url" value={logoUrl} maxLength={500} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://youragency.com/logo.png" style={{ ...inputStyle, fontWeight: 400 }} />
          </label>
          <label style={labelStyle}>Brand color
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 56, height: 44, padding: 2, border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', cursor: 'pointer' }} />
              <span style={{ fontWeight: 400, fontSize: 14, color: RT.text }}>{color}</span>
            </span>
          </label>
          <label style={labelStyle}>Custom domain
            <input type="text" value={domain} maxLength={200} onChange={(e) => setDomain(e.target.value)} placeholder="rankings.youragency.com" style={{ ...inputStyle, fontWeight: 400 }} />
            <span style={{ fontSize: 12, fontWeight: 400, color: RT.muted }}>Point a CNAME record at the app host, then add the domain in DigitalOcean.</span>
          </label>
        </div>

        <label style={labelStyle}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            Slack webhook URL for alerts
            {b?.slackConnected && <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>Connected</span>}
          </span>
          <input type="url" value={slack} maxLength={500} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/..." style={{ ...inputStyle, fontWeight: 400 }} />
          <span style={{ fontSize: 12, fontWeight: 400, color: RT.muted }}>
            {b?.slackConnected ? 'Leave blank to keep the saved webhook.' : 'Paste an incoming webhook from your Slack app.'}
          </span>
        </label>

        {error && <div role="alert" style={{ fontSize: 14, color: RT.down }}>{error}</div>}
        {notice && <div role="status" style={{ fontSize: 14, color: RT.up }}>{notice}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          {b?.slackConnected && <button type="button" onClick={() => save('remove')} disabled={saving} style={btnSecondary}>Remove Slack</button>}
          <button type="submit" disabled={saving || !b} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save branding'}</button>
        </div>
      </form>
    </section>
  );
}

export default function RankClientsPage() {
  const [clients, setClients] = useState<ClientDto[] | null>(null);
  const [sites, setSites] = useState<SitesResp>({ websites: [], groups: [] });
  const [branding, setBranding] = useState<BrandingResp | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  const loadClients = useCallback(async () => {
    const r = await rtFetch<{ clients: ClientDto[] }>('/api/rank-tracking/clients');
    setClients(r.clients);
  }, []);
  const loadBranding = useCallback(async () => {
    setBranding(await rtFetch<BrandingResp>('/api/rank-tracking/branding'));
  }, []);

  const load = useCallback(async () => {
    try {
      const [, s] = await Promise.all([loadClients(), rtFetch<SitesResp>('/api/rank-tracking/websites'), loadBranding()]);
      setSites(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load clients.');
      setClients((c) => c ?? []);
    }
  }, [loadClients, loadBranding]);

  useEffect(() => { load(); }, [load]);

  const closeModal = useCallback(() => { setAdding(false); addBtn.current?.focus(); }, []);

  async function revoke(c: ClientDto) {
    if (!window.confirm(`Revoke access for ${c.name}? Their link stops working at once.`)) return;
    setRevoking(c.id);
    try {
      await rtFetch(`/api/rank-tracking/clients/${c.id}`, 'DELETE');
      setClients((x) => (x || []).filter((y) => y.id !== c.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not revoke access.');
    } finally {
      setRevoking(null);
    }
  }

  const addButton = (
    <button ref={addBtn} type="button" style={btnPrimary} onClick={() => setAdding(true)}>+ Add client</button>
  );

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <RankTabs />
      <PageHead title="Clients" sub="Give each client their own read-only login with your branding, showing only their keywords." actions={addButton} />

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 16, marginBottom: 20, color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}</span>
          <button type="button" style={btnSecondary} onClick={load}>Try again</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section style={{ ...cardStyle, flex: '999 1 520px', minWidth: 0, overflow: 'hidden' }} aria-busy={clients === null}>
          {clients === null ? (
            <p style={{ margin: 0, padding: 20, fontSize: 14, color: RT.muted }}>Loading...</p>
          ) : !clients.length ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>No client logins yet</h2>
              <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Add a client to give them a private link to their rankings.</p>
              <button type="button" style={btnPrimary} onClick={() => setAdding(true)}>+ Add client</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: RT.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <th scope="col" style={{ ...th, paddingLeft: 20 }}>Client</th>
                    <th scope="col" style={th}>Can see</th>
                    <th scope="col" style={th}>Last login</th>
                    <th scope="col" style={th}>Access</th>
                    <th scope="col" style={{ ...th, paddingRight: 20 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const active = c.status === 'active';
                    return (
                      <tr key={c.id} style={{ borderTop: `1px solid ${RT.lineSoft}` }}>
                        <td style={{ ...td, paddingLeft: 20 }}>
                          <div style={{ fontWeight: 600, color: RT.ink }}>{c.name}</div>
                          {c.email && <div style={{ fontSize: 12, color: RT.muted }}>{c.email}</div>}
                        </td>
                        <td style={td}>{c.sees || '-'}</td>
                        <td style={td}>{c.lastLoginAt ? fmtDay(c.lastLoginAt) : 'Not yet'}</td>
                        <td style={td}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: active ? '#dcfce7' : RT.lineSoft, color: active ? '#166534' : RT.text }}>
                            {active ? 'Active' : 'Invited'}
                          </span>
                        </td>
                        <td style={{ ...td, paddingRight: 20, textAlign: 'right' }}>
                          <button type="button" onClick={() => revoke(c)} disabled={revoking === c.id} aria-label={`Revoke access for ${c.name}`}
                            style={{ ...btnSecondary, fontSize: 13, padding: '8px 12px' }}>
                            {revoking === c.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <PreviewCard b={branding} />
      </div>

      <div style={{ marginTop: 20 }}>
        <BrandingForm b={branding} onSaved={() => { loadBranding().catch(() => {}); }} />
      </div>

      {adding && <AddClientModal sites={sites} onClose={closeModal} onCreated={() => { loadClients().catch(() => {}); }} />}
    </div>
  );
}
