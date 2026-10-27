'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHead } from '@/app/dashboard-v2/ui';
import { RT, RankTabs, rtFetch, btnPrimary, btnSecondary, cardStyle, inputStyle, labelStyle } from '@/components/rank-tracking/RankUi';

type Format = 'csv' | 'csv_changes' | 'html' | 'html_graphs' | 'pdf' | 'pdf_graphs';
const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' }, { value: 'csv_changes', label: 'CSV (changes)' }, { value: 'html', label: 'HTML' },
  { value: 'html_graphs', label: 'HTML (graphs)' }, { value: 'pdf', label: 'PDF' }, { value: 'pdf_graphs', label: 'PDF (graphs)' },
];

interface ReportDto {
  id: string; title: string; format: Format; formatLabel: string; schedule: 'weekly' | 'monthly' | null; recipients: string[];
  website: string; group: string | null; starredOnly: boolean; start: string; end: string; lastSentAt: string | null; createdAt: string; downloadUrl: string;
}
interface ReportsResp { scheduled: ReportDto[]; saved: ReportDto[] }
interface SitesResp { websites: { id: string; domain: string }[]; groups: { id: string; name: string; websiteId: string }[] }

const selectStyle: React.CSSProperties = { ...inputStyle, fontSize: 14, padding: '11px 12px', minHeight: 46, fontWeight: 400 };
const checkStyle: React.CSSProperties = { width: 20, height: 20, accentColor: RT.indigo, margin: 0 };
const sectionStyle: React.CSSProperties = { ...cardStyle, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 };
const h2Style: React.CSSProperties = { margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: RT.ink };
const smallBtn: React.CSSProperties = { ...btnSecondary, fontSize: 13, padding: '8px 12px', flex: 'none' };

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-09-28" -> "Sep 28" without a timezone shift. */
function shortDay(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return s || '-';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scopeOf(r: ReportDto): string {
  return [r.website, r.group, r.starredOnly ? 'Starred only' : null].filter(Boolean).join(', ');
}

function ReportsInner() {
  const params = useSearchParams();
  const today = new Date();
  const [mode, setMode] = useState<'one' | 'sch'>('one');
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<Format>('pdf_graphs');
  const [start, setStart] = useState(isoDay(new Date(today.getTime() - 28 * 86_400_000)));
  const [end, setEnd] = useState(isoDay(today));
  const [every, setEvery] = useState<'weekly' | 'monthly'>('weekly');
  const [emails, setEmails] = useState('');
  const [websiteId, setWebsiteId] = useState(params.get('website') || '');
  const [groupId, setGroupId] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [includeAi, setIncludeAi] = useState(true);
  const [useLogo, setUseLogo] = useState(true);

  const [data, setData] = useState<ReportsResp | null>(null);
  const [sites, setSites] = useState<SitesResp>({ websites: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        rtFetch<ReportsResp>('/api/rank-tracking/reports'),
        rtFetch<SitesResp>('/api/rank-tracking/websites'),
      ]);
      setData(r);
      setSites(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loading && websiteId && !sites.websites.some((w) => w.id === websiteId)) setWebsiteId('');
  }, [loading, sites, websiteId]);

  const groups = sites.groups.filter((g) => g.websiteId === websiteId);
  const one = mode === 'one';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setNotice('');
    const recipients = emails.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!one && !recipients.length) { setFormError('Add an email address to send it to.'); return; }
    if (one && start && end && start > end) { setFormError('The start date is after the end date.'); return; }
    setSaving(true);
    try {
      const r = await rtFetch<{ id: string; downloadUrl: string }>('/api/rank-tracking/reports', 'POST', {
        title: title.trim(), format, websiteId: websiteId || null, groupId: groupId || null, starredOnly, includeAi, useLogo,
        ...(one ? { start, end } : { schedule: every, recipients }),
      });
      if (one) {
        setNotice('Report created. Your download starts now.');
        window.location.href = r.downloadUrl;
      } else {
        setNotice('Schedule saved.');
      }
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the report.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: ReportDto) {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    setDeleting(r.id);
    try {
      await rtFetch(`/api/rank-tracking/reports/${r.id}`, 'DELETE');
      setData((d) => (d ? { scheduled: d.scheduled.filter((x) => x.id !== r.id), saved: d.saved.filter((x) => x.id !== r.id) } : d));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete the report.');
    } finally {
      setDeleting(null);
    }
  }

  function row(r: ReportDto, details: string) {
    return (
      <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: `1px solid ${RT.lineSoft}`, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' }}>
          <span style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{r.title}</span>
          <span style={{ fontSize: 12, color: RT.muted, overflowWrap: 'anywhere' }}>{details}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, background: RT.lineSoft, color: RT.text, padding: '4px 10px', borderRadius: 999 }}>{r.formatLabel}</span>
          <a href={r.downloadUrl} style={smallBtn} aria-label={`Download ${r.title}`}>Download</a>
          <button type="button" style={smallBtn} onClick={() => remove(r)} disabled={deleting === r.id} aria-label={`Delete ${r.title}`}>
            {deleting === r.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <RankTabs />
      <PageHead title="Reports" sub="PDF and CSV reports with your logo. One-off, or emailed to clients on a schedule." />

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 16, marginBottom: 20, color: RT.down, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}</span>
          <button type="button" style={btnSecondary} onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <form onSubmit={submit} style={{ ...cardStyle, flex: '1 1 440px', minWidth: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div role="group" aria-label="Report type" style={{ display: 'flex', background: RT.lineSoft, borderRadius: 10, padding: 4, gap: 4 }}>
            {([['one', 'Create once'], ['sch', 'Schedule']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => { setMode(v); setFormError(''); setNotice(''); }}
                style={{ flex: 1, font: 'inherit', fontSize: 14, fontWeight: 600, minHeight: 44, border: 0, borderRadius: 8, cursor: 'pointer',
                  background: mode === v ? '#fff' : 'transparent', color: mode === v ? RT.ink : RT.muted }}>
                {l}
              </button>
            ))}
          </div>

          <label style={labelStyle}>Title
            <input type="text" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Rankings report" style={{ ...inputStyle, fontWeight: 400 }} />
          </label>

          <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: RT.text, marginBottom: 8, padding: 0 }}>Format</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {FORMATS.map((f) => {
                const a = f.value === format;
                return (
                  <button key={f.value} type="button" aria-pressed={a} onClick={() => setFormat(f.value)}
                    style={{ font: 'inherit', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 10, cursor: 'pointer',
                      border: a ? `2px solid ${RT.indigo}` : '1px solid #cbd5e1', background: a ? RT.indigoSoft : '#fff', color: a ? RT.indigoDark : RT.ink, fontWeight: a ? 600 : 400 }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {one ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>Start date
                <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} style={{ ...inputStyle, fontSize: 14, padding: '11px 12px', fontWeight: 400 }} />
              </label>
              <label style={labelStyle}>End date
                <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} style={{ ...inputStyle, fontSize: 14, padding: '11px 12px', fontWeight: 400 }} />
              </label>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>Send every
                <select value={every} onChange={(e) => setEvery(e.target.value as 'weekly' | 'monthly')} style={selectStyle}>
                  <option value="weekly">Week, Monday</option>
                  <option value="monthly">Month, 1st</option>
                </select>
              </label>
              <label style={labelStyle}>Email to
                <input type="text" inputMode="email" autoComplete="off" value={emails} onChange={(e) => setEmails(e.target.value)}
                  placeholder="owner@client.com, you@agency.com" style={{ ...inputStyle, fontSize: 14, padding: '11px 12px', fontWeight: 400 }} />
                <span style={{ fontSize: 12, fontWeight: 400, color: RT.muted }}>Separate addresses with commas. Up to 10.</span>
              </label>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Website
              <select value={websiteId} onChange={(e) => { setWebsiteId(e.target.value); setGroupId(''); }} style={selectStyle}>
                <option value="">All websites</option>
                {sites.websites.map((w) => <option key={w.id} value={w.id}>{w.domain}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Group
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!websiteId || !groups.length} style={selectStyle}>
                <option value="">All groups</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([
              ['Starred keywords only', starredOnly, setStarredOnly],
              ['Include AI visibility page', includeAi, setIncludeAi],
              ['Use my logo and colors', useLogo, setUseLogo],
            ] as const).map(([l, v, set]) => (
              <label key={l} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, minHeight: 44 }}>
                <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} style={checkStyle} /> {l}
              </label>
            ))}
          </div>

          {formError && <div role="alert" style={{ fontSize: 14, color: RT.down }}>{formError}</div>}
          {notice && <div role="status" style={{ fontSize: 14, color: RT.up }}>{notice}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? (one ? 'Creating...' : 'Saving...') : one ? 'Create report' : 'Save schedule'}
            </button>
          </div>
        </form>

        <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={sectionStyle} aria-busy={loading}>
            <h2 style={h2Style}>Scheduled reports</h2>
            {loading ? <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Loading...</p>
              : !data?.scheduled.length ? (
                <div style={{ padding: '12px 0', borderTop: `1px solid ${RT.lineSoft}`, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>No scheduled reports. Email a client their rankings every week or month.</p>
                  <button type="button" style={smallBtn} onClick={() => setMode('sch')}>Set up a schedule</button>
                </div>
              ) : data.scheduled.map((r) => row(r, [
                r.schedule === 'monthly' ? '1st of month' : 'Every Monday',
                r.recipients.length === 1 ? r.recipients[0] : `${r.recipients.length} recipients`,
                scopeOf(r),
              ].join(' · ')))}
          </section>

          <section style={sectionStyle} aria-busy={loading}>
            <h2 style={h2Style}>Saved reports</h2>
            {loading ? <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>Loading...</p>
              : !data?.saved.length ? (
                <p style={{ margin: 0, fontSize: 14, color: RT.muted, padding: '12px 0', borderTop: `1px solid ${RT.lineSoft}` }}>
                  No saved reports yet. Pick a format and press Create report.
                </p>
              ) : data.saved.map((r) => row(r, `${scopeOf(r)} · ${shortDay(r.start)} to ${shortDay(r.end)}`))}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function RankReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsInner />
    </Suspense>
  );
}
