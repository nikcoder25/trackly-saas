'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHead } from '@/app/dashboard-v2/ui';
import { ApiError } from '@/lib/fetch-client';
import type { RankCreditStatus } from '@/lib/rank-tracking/types';
import {
  RT, rtFetch, RankTabs, Toggle, btnPrimary, btnSecondary, cardStyle, inputStyle, labelStyle,
} from '@/components/rank-tracking/RankUi';
import AddCityInput, { cityLabel, type CityValue } from '@/components/rank-tracking/AddCityInput';

type Credits = RankCreditStatus & { providersConfigured?: boolean };
type Freq = 'weekly' | 'daily';
type Depth = 30 | 100;

interface AddResult {
  websiteId: string;
  added: number;
  skipped: number;
  location: string;
  ai: { added: number; brandId: string | null; reason?: 'no_brand' | 'prompt_limit' } | null;
}
interface ImportResult { websites: number; keywords: number; checks: number; skippedLocations: string[] }

const MAX_PER_ADD = 1000;
const fmt = (n: number) => n.toLocaleString('en-US');

/** Same rules as the server: trim, lowercase, collapse spaces, drop blanks and duplicates. */
function parseKeywords(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((k) => k.trim().toLowerCase().replace(/\s+/g, ' ')).filter((k) => k && k.length <= 200))];
}

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

function Notice({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: React.ReactNode }) {
  const c = tone === 'error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' } : tone === 'ok' ? { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534' } : { bg: RT.lineSoft, bd: RT.line, fg: RT.text };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} style={{ background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

const upgradeLink = <Link href="/dashboard/billing" style={{ color: '#3730a3', fontWeight: 600 }}>Upgrade</Link>;

function aiNote(ai: AddResult['ai']): string | null {
  if (!ai) return null;
  if (ai.reason === 'no_brand') return 'AI answers are not checked: no brand in Livesov uses this website. Add a brand with this website to track AI answers.';
  if (ai.reason === 'prompt_limit') {
    return ai.added
      ? `${fmt(ai.added)} keywords were added as AI prompts. Your prompt limit was reached, so the rest are not checked in AI answers.`
      : 'Your AI prompt limit is reached, so these keywords are not checked in AI answers.';
  }
  return ai.added ? `${fmt(ai.added)} keywords were added as AI prompts.` : 'These keywords are already tracked as AI prompts.';
}

/* ─── Add keywords form ─────────────────────────────────────────── */

function AddForm({ initialWebsite, websites, credits, creditsError }: { initialWebsite: string; websites: string[]; credits: Credits | null; creditsError: string }) {
  const router = useRouter();
  const [domain, setDomain] = useState(initialWebsite);
  const [city, setCity] = useState<CityValue>({ code: null, name: '' });
  const [text, setText] = useState('');
  const [frequency, setFrequency] = useState<Freq>('weekly');
  const [depth, setDepth] = useState<Depth>(30);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [group, setGroup] = useState('');
  const [checkAi, setCheckAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; upgrade: boolean } | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);

  useEffect(() => { if (initialWebsite) setDomain(initialWebsite); }, [initialWebsite]);

  const keywords = useMemo(() => parseKeywords(text), [text]);
  const n = keywords.length;
  const checks = frequency === 'daily' ? 30 : 4;
  const per = depth === 100 ? 2 : 1;
  const needed = n * checks * per;
  const left = credits ? Math.max(0, credits.allowance - credits.committed) : null;

  let block: string | null = null;
  if (credits) {
    if (credits.allowance <= 0) block = 'Rank tracking is not part of your plan.';
    else if (frequency === 'daily' && !credits.allowsDaily) block = 'Daily checks are not on your plan. Pick weekly, or upgrade.';
    else if (depth === 100 && !credits.allowsTop100) block = 'Top 100 checks are not on your plan. Pick top 30, or upgrade.';
    else if (left != null && needed > left) block = `That is ${fmt(needed - left)} credits more than you have left. Remove some keywords, check less often, or upgrade.`;
  }
  const tooMany = n > MAX_PER_ADD;
  const canSubmit = !busy && n > 0 && !tooMany && !!domain.trim() && !!city.name && !block;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const r = await rtFetch<AddResult>('/api/rank-tracking/keywords', 'POST', {
        domain: domain.trim(), keywords: keywords.join('\n'),
        locationCode: city.code ?? undefined, locationName: city.name,
        device, frequency, depth, groupName: group.trim() || undefined, checkAi,
      });
      const hasNews = (r.ai && (r.ai.reason || r.ai.added)) || r.skipped > 0 || r.added === 0;
      if (!hasNews) { router.push(`/dashboard/rank-tracking/${r.websiteId}`); return; }
      setResult(r);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError({ msg: (err as Error).message || 'Could not add the keywords.', upgrade: status === 402 });
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const note = aiNote(result.ai);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Notice tone="ok">
          <strong>{result.added ? `Tracking ${fmt(result.added)} new ${result.added === 1 ? 'keyword' : 'keywords'}` : 'No new keywords added'}</strong>
          {' '}from {cityLabel(result.location)}.
          {result.skipped > 0 && <> {fmt(result.skipped)} {result.skipped === 1 ? 'was' : 'were'} already tracked from this city and device.</>}
          {result.added > 0 && <> The first check runs within 10 minutes.</>}
        </Notice>
        {note && <Notice tone="info">{note}{result.ai?.reason === 'no_brand' && <> <Link href="/dashboard/setup" style={{ color: '#3730a3', fontWeight: 600 }}>Add a brand</Link></>}</Notice>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btnSecondary} onClick={() => { setResult(null); setText(''); }}>Add more</button>
          <Link href={`/dashboard/rank-tracking/${result.websiteId}`} style={btnPrimary}>View keywords</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }} noValidate>
      <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>We check Google from the city you pick, the way a local customer searches.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <label style={labelStyle}>
          Website
          <input type="text" list="rt-add-websites" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            autoComplete="off" required style={{ ...inputStyle, fontWeight: 400 }} />
          <datalist id="rt-add-websites">{websites.map((w) => <option key={w} value={w} />)}</datalist>
        </label>
        <AddCityInput label="Track from city" value={city} onChange={setCity} required
          hint={city.name && !city.code ? 'Pick the city from the list.' : undefined} />
      </div>

      <label style={labelStyle}>
        Keywords, one per line
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ac repair austin\nfurnace repair austin'}
          style={{ ...inputStyle, fontWeight: 400, lineHeight: 1.6, resize: 'vertical' }} />
        <span style={{ fontWeight: 400, color: tooMany ? RT.down : RT.muted }} aria-live="polite">
          {fmt(n)} {n === 1 ? 'keyword' : 'keywords'}.{tooMany ? ` Add up to ${fmt(MAX_PER_ADD)} at a time.` : ' Tip: paste from the Livesov keyword finder or a spreadsheet.'}
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: RT.text }}>How often</div>
          <Toggle<Freq> label="How often" value={frequency} onChange={setFrequency} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'daily', label: 'Daily' }]} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: RT.text }}>How deep</div>
          <Toggle<Depth> label="How deep" value={depth} onChange={setDepth} options={[{ value: 30, label: 'Top 30' }, { value: 100, label: 'Top 100' }]} />
        </div>
        <label style={labelStyle}>
          Device
          <select value={device} onChange={(e) => setDevice(e.target.value === 'mobile' ? 'mobile' : 'desktop')}
            style={{ ...inputStyle, fontWeight: 400, padding: '11px 12px', minHeight: 48 }}>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        <span>Group <span style={{ fontWeight: 400, color: RT.muted }}>(optional)</span></span>
        <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} maxLength={80} placeholder="Like: Service pages"
          style={{ ...inputStyle, fontWeight: 400 }} />
      </label>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: RT.text, cursor: 'pointer' }}>
        <input type="checkbox" checked={checkAi} onChange={(e) => setCheckAi(e.target.checked)} style={{ width: 20, height: 20, margin: '2px 0 0', accentColor: RT.indigo, flex: 'none' }} />
        <span><strong style={{ color: RT.ink }}>Also check AI answers</strong><br />Turn these keywords into prompts and track if ChatGPT, Gemini and Perplexity mention this business.</span>
      </label>

      <div style={{ background: RT.indigoSoft, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 13, color: '#3730a3', fontWeight: 500 }}>Uses per month</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1e1b4b' }}>{fmt(needed)} credits</div>
            <div style={{ fontSize: 13, color: '#3730a3' }}>{fmt(n)} {n === 1 ? 'keyword' : 'keywords'} × {checks} checks{per > 1 ? ' × 2 (top 100)' : ''}</div>
          </div>
          <div style={{ fontSize: 13, color: '#3730a3', textAlign: 'right' }}>
            {left != null ? <>You have {fmt(left)} credits left</> : creditsError ? <>Could not load your credits</> : <>Loading your credits…</>}
            <br />
            {credits && credits.providersConfigured === false ? 'Checks start once rank data is set up' : 'First check runs within 10 minutes'}
          </div>
        </div>
        {block && (
          <div role="alert" style={{ borderTop: '1px solid #c7d2fe', paddingTop: 12, fontSize: 14, color: '#312e81' }}>
            {block} {upgradeLink}
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error.msg}{error.upgrade && <> {upgradeLink}</>}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/dashboard/rank-tracking" style={btnSecondary}>Cancel</Link>
        <button type="submit" disabled={!canSubmit} aria-disabled={!canSubmit}
          style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Adding…' : `Start tracking ${fmt(n)} ${n === 1 ? 'keyword' : 'keywords'}`}
        </button>
      </div>
    </form>
  );
}

/* ─── Import from Serpfox ───────────────────────────────────────── */

function ImportForm({ websites, initialWebsite }: { websites: string[]; initialWebsite: string }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [domain, setDomain] = useState(initialWebsite);
  const [city, setCity] = useState<CityValue>({ code: null, name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; upgrade: boolean } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(null); setFileError(''); setResult(null); setError(null);
    if (!f) return;
    if (f.size > 15_000_000) { setFileError('This file is too big. The limit is 15 MB.'); return; }
    try {
      setFile({ name: f.name, text: await f.text() });
    } catch {
      setFileError('Could not read this file.');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await rtFetch<ImportResult>('/api/rank-tracking/import', 'POST', {
        csv: file.text, domain: domain.trim() || undefined, location: city.name || undefined,
      });
      setResult(r);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError({ msg: (err as Error).message || 'Import failed.', upgrade: status === 402 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ margin: 0, fontSize: 14, color: RT.muted }}>
        Export your keywords from Serpfox as CSV and bring them here with their rank history. Imported keywords are checked weekly, top 30 (top 100 if the history goes past 30).
      </p>

      <label style={labelStyle}>
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={onFile}
          style={{ ...inputStyle, fontWeight: 400, padding: '10px 12px', minHeight: 48 }} />
        {file && <span style={{ fontWeight: 400, color: RT.muted }}>{file.name}, ready to import.</span>}
        {fileError && <span role="alert" style={{ fontWeight: 400, color: RT.down }}>{fileError}</span>}
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <label style={labelStyle}>
          <span>Website <span style={{ fontWeight: 400, color: RT.muted }}>(optional)</span></span>
          <input type="text" list="rt-import-websites" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            autoComplete="off" style={{ ...inputStyle, fontWeight: 400 }} />
          <datalist id="rt-import-websites">{websites.map((w) => <option key={w} value={w} />)}</datalist>
          <span style={{ fontWeight: 400, color: RT.muted }}>Used when the CSV has no URL column.</span>
        </label>
        <AddCityInput label="Default city (optional)" value={city} onChange={setCity}
          hint="Used for rows with no location." />
      </div>

      {error && <Notice tone="error">{error.msg}{error.upgrade && <> {upgradeLink}</>}</Notice>}

      {result && (
        <Notice tone={result.keywords ? 'ok' : 'info'}>
          <strong>Imported {fmt(result.keywords)} {result.keywords === 1 ? 'keyword' : 'keywords'}</strong> on {fmt(result.websites)} {result.websites === 1 ? 'website' : 'websites'} with {fmt(result.checks)} past {result.checks === 1 ? 'check' : 'checks'}.
          {result.skippedLocations.length > 0 && (
            <> Skipped rows with an unknown city: {result.skippedLocations.slice(0, 10).join('; ')}{result.skippedLocations.length > 10 ? ` and ${result.skippedLocations.length - 10} more` : ''}. Pick a default city and import again to add them.</>
          )}
          {' '}<Link href="/dashboard/rank-tracking" style={{ color: '#3730a3', fontWeight: 600 }}>Go to Rank Tracking</Link>
        </Notice>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/dashboard/rank-tracking" style={btnSecondary}>Cancel</Link>
        <button type="submit" disabled={!file || busy} aria-disabled={!file || busy}
          style={{ ...btnPrimary, opacity: file && !busy ? 1 : 0.55, cursor: file && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </form>
  );
}

/* ─── Page ──────────────────────────────────────────────────────── */

function AddKeywordsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: 'add' | 'import' = params.get('tab') === 'import' ? 'import' : 'add';
  const initialWebsite = (params.get('website') || '').trim();
  const [websites, setWebsites] = useState<string[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [creditsError, setCreditsError] = useState('');

  useEffect(() => {
    rtFetch<{ websites: { id: string; domain: string }[] }>('/api/rank-tracking/websites')
      .then((r) => setWebsites((r.websites || []).map((w) => w.domain)))
      .catch(() => setWebsites([]));
    rtFetch<Credits>('/api/rank-tracking/credits')
      .then(setCredits)
      .catch((e) => setCreditsError((e as Error).message || 'Could not load credits'));
  }, []);

  const setTab = (t: 'add' | 'import') => {
    const q = new URLSearchParams(params.toString());
    if (t === 'import') q.set('tab', 'import'); else q.delete('tab');
    const s = q.toString();
    router.replace(`/dashboard/rank-tracking/add${s ? `?${s}` : ''}`, { scroll: false });
  };

  const tabBtn = (t: 'add' | 'import', label: string) => (
    <button type="button" role="tab" id={`rt-tab-${t}`} aria-selected={tab === t} aria-controls={`rt-panel-${t}`} onClick={() => setTab(t)}
      style={{ font: 'inherit', fontSize: 14, fontWeight: 600, minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 8, cursor: 'pointer',
        background: tab === t ? '#fff' : 'transparent', color: tab === t ? RT.ink : RT.muted, boxShadow: tab === t ? '0 1px 2px rgba(15,23,42,0.08)' : 'none' }}>
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <PageHead title="Add keywords" sub="Track Google rankings from the city your customers search in." />
      <RankTabs />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 48px' }}>
        <div style={{ ...cardStyle, borderRadius: 18, width: '100%', maxWidth: 760, padding: 'clamp(20px, 4vw, 32px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div role="tablist" aria-label="Add keywords" style={{ display: 'flex', flexWrap: 'wrap', background: RT.lineSoft, borderRadius: 10, padding: 4, gap: 4 }}>
              {tabBtn('add', 'Add keywords')}
              {tabBtn('import', 'Import from Serpfox')}
            </div>
            <Link href="/dashboard/rank-tracking" aria-label="Close"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, color: RT.muted, textDecoration: 'none', flex: 'none' }}>
              <CloseIcon />
            </Link>
          </div>
          <div role="tabpanel" id={`rt-panel-${tab}`} aria-labelledby={`rt-tab-${tab}`}>
            {tab === 'add'
              ? <AddForm initialWebsite={initialWebsite} websites={websites} credits={credits} creditsError={creditsError} />
              : <ImportForm websites={websites} initialWebsite={initialWebsite} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function AddKeywordsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '80px 0', textAlign: 'center', color: RT.muted }}>Loading…</div>}>
      <AddKeywordsInner />
    </Suspense>
  );
}
