'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/fetch-client';
import type { RankCreditStatus } from '@/lib/rank-tracking/types';
import {
  RT, rtFetch, RankTabs, Toggle, btnPrimary, btnSecondary, cardStyle, inputStyle, labelStyle,
  useBrandScope,
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
  localized?: { keyword: string; location: string }[];
  ai: { added: number; brandId: string | null; reason?: 'no_brand' | 'prompt_limit' } | null;
}

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
  const [localize, setLocalize] = useState(true);
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
        device, frequency, depth, groupName: group.trim() || undefined, checkAi, localize,
      });
      const hasNews = (r.ai && (r.ai.reason || r.ai.added)) || r.skipped > 0 || r.added === 0 || !!r.localized?.length;
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 26px' }}>
        <DialogHead />
        <Notice tone="ok">
          <strong>{result.added ? `Tracking ${fmt(result.added)} new ${result.added === 1 ? 'keyword' : 'keywords'}` : 'No new keywords added'}</strong>
          {' '}from {cityLabel(result.location)}.
          {result.skipped > 0 && <> {fmt(result.skipped)} {result.skipped === 1 ? 'was' : 'were'} already tracked from this location and device.</>}
          {result.added > 0 && <> The first check runs within 10 minutes.</>}
        </Notice>
        {!!result.localized?.length && (
          <Notice tone="info">
            <strong>{fmt(result.localized.length)} {result.localized.length === 1 ? 'keyword names a place' : 'keywords name a place'}, so {result.localized.length === 1 ? 'it is' : 'they are'} checked from there:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {result.localized.slice(0, 8).map((l) => <li key={l.keyword}>{l.keyword} → {cityLabel(l.location)}</li>)}
              {result.localized.length > 8 && <li>and {fmt(result.localized.length - 8)} more</li>}
            </ul>
          </Notice>
        )}
        {note && <Notice tone="info">{note}{result.ai?.reason === 'no_brand' && <> <Link href="/dashboard/setup" style={{ color: '#3730a3', fontWeight: 600 }}>Add a brand</Link></>}</Notice>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btnSecondary} onClick={() => { setResult(null); setText(''); }}>Add more</button>
          <Link href={`/dashboard/rank-tracking/${result.websiteId}`} style={btnPrimary}>View keywords</Link>
        </div>
      </div>
    );
  }

  const sectionLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: RT.text };
  const sumRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };
  const after = credits ? credits.committed + needed : null;
  const afterPct = credits && credits.allowance ? Math.min(100, Math.round(((after ?? 0) / credits.allowance) * 100)) : 0;
  const checkRow: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: RT.text, cursor: 'pointer' };
  const checkBox: React.CSSProperties = { width: 18, height: 18, margin: '1px 0 0', accentColor: RT.indigo, flex: 'none' };

  return (
    <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '22px 26px', borderBottom: `1px solid ${RT.line}` }}><DialogHead /></div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '3 1 440px', minWidth: 0, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 18, boxSizing: 'border-box' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <label style={labelStyle}>
              Site
              <input type="text" list="rt-add-websites" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
                autoComplete="off" required style={{ ...inputStyle, fontWeight: 400, fontSize: 14 }} />
              <datalist id="rt-add-websites">{websites.map((w) => <option key={w} value={w} />)}</datalist>
            </label>
            <AddCityInput label="Track from" value={city} onChange={setCity} required placeholder="City, state or country"
              hint={city.name && !city.code ? 'Pick a place from the list.' : undefined} />
          </div>

          <label style={labelStyle}>
            Keywords
            <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ac repair austin\nfurnace repair austin'}
              style={{ ...inputStyle, fontWeight: 400, fontSize: 14, lineHeight: 1.6, resize: 'vertical' }} />
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 400, fontSize: 12, color: tooMany ? RT.down : RT.muted }} aria-live="polite">
              <span>{tooMany ? `Add up to ${fmt(MAX_PER_ADD)} at a time.` : 'One per line. Duplicates are removed.'}</span>
              <span>{fmt(n)} {n === 1 ? 'keyword' : 'keywords'}</span>
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={sectionLabel}>Device</span>
              <Toggle<'desktop' | 'mobile'> label="Device" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={sectionLabel}>Check every</span>
              <Toggle<Freq> label="Check every" value={frequency} onChange={setFrequency} options={[{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }]} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={sectionLabel}>How deep</span>
              <Toggle<Depth> label="How deep" value={depth} onChange={setDepth} options={[{ value: 30, label: 'Top 30' }, { value: 100, label: 'Top 100' }]} />
            </div>
            <label style={{ ...labelStyle, gap: 6 }}>
              <span>Group <span style={{ fontWeight: 400, color: RT.muted }}>(optional)</span></span>
              <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} maxLength={80} placeholder="Like: Service pages"
                style={{ ...inputStyle, fontWeight: 400, fontSize: 14, padding: '10px 12px' }} />
            </label>
          </div>
        </div>

        <aside aria-live="polite" style={{ flex: '1 1 260px', minWidth: 0, background: RT.bg, borderLeft: `1px solid ${RT.line}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Summary</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: RT.text }}>
            <div style={sumRow}><span>Keywords</span><span style={{ fontWeight: 600, color: RT.ink }}>{fmt(n)}</span></div>
            <div style={sumRow}><span>× Checks a month</span><span style={{ fontWeight: 600, color: RT.ink }}>{checks}</span></div>
            {per > 1 && <div style={sumRow}><span>× Top 100</span><span style={{ fontWeight: 600, color: RT.ink }}>2</span></div>}
            <div style={{ ...sumRow, borderTop: `1px solid ${RT.line}`, paddingTop: 10 }}>
              <span style={{ fontWeight: 600, color: RT.ink }}>Credits a month</span>
              <span style={{ fontWeight: 700, color: RT.indigoDark, fontSize: 16 }}>{fmt(needed)}</span>
            </div>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${RT.line}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {credits ? (
              <>
                <div style={{ ...sumRow, fontSize: 12, color: RT.muted }}>
                  <span>Plan usage after adding</span>
                  <span style={{ fontWeight: 600, color: block ? RT.down : RT.ink }}>{fmt(after ?? 0)} / {fmt(credits.allowance)}</span>
                </div>
                <div style={{ height: 6, background: RT.lineSoft, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${afterPct}%`, height: 6, background: block ? RT.down : RT.indigo, borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 12, color: RT.muted }}>
                  {credits.providersConfigured === false ? 'Checks start once rank data is set up.' : 'First check runs within 10 minutes.'}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: RT.muted }}>{creditsError ? 'Could not load your credits.' : 'Loading your credits…'}</span>
            )}
          </div>
          {block && <div role="alert" style={{ fontSize: 13, color: '#312e81', lineHeight: 1.5 }}>{block} {upgradeLink}</div>}
          <label style={checkRow}>
            <input type="checkbox" checked={checkAi} onChange={(e) => setCheckAi(e.target.checked)} style={checkBox} />
            <span>Also check AI answers (ChatGPT, Gemini, Perplexity) for these keywords</span>
          </label>
          <label style={checkRow}>
            <input type="checkbox" checked={localize} onChange={(e) => setLocalize(e.target.checked)} style={checkBox} />
            <span>Check keywords that name a place from that place, like &quot;plumber austin&quot; from Austin</span>
          </label>
        </aside>
      </div>

      {error && <div style={{ padding: '0 26px 16px' }}><Notice tone="error">{error.msg}{error.upgrade && <> {upgradeLink}</>}</Notice></div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', padding: '16px 26px', borderTop: `1px solid ${RT.line}` }}>
        <Link href="/dashboard/rank-tracking" style={btnSecondary}>Cancel</Link>
        <button type="submit" disabled={!canSubmit} aria-disabled={!canSubmit}
          style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Adding…' : `Add ${fmt(n)} ${n === 1 ? 'keyword' : 'keywords'}`}
        </button>
      </div>
    </form>
  );
}

function DialogHead() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add keywords</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: RT.muted }}>Each keyword is checked on Google from the place and device you pick.</p>
      </div>
      <Link href="/dashboard/rank-tracking" aria-label="Close"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, color: RT.text, textDecoration: 'none', flex: 'none' }}>
        <CloseIcon />
      </Link>
    </div>
  );
}

/* ─── Import a CSV ──────────────────────────────────────────────── */

interface ImportResult { websites: number; keywords: number; checks: number; skippedLocations: string[] }

/** Upload a Serpfox export (or any CSV shaped like one) through
 *  /api/rank-tracking/import, keeping its ranking history. */
function ImportPanel({ initialWebsite, websites }: { initialWebsite: string; websites: string[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState(initialWebsite);
  const [city, setCity] = useState<CityValue>({ code: null, name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; upgrade: boolean } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const r = await rtFetch<ImportResult>('/api/rank-tracking/import', 'POST', { csv, domain: domain.trim() || undefined, location: city.name || undefined });
      setResult(r);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError({ msg: (err as Error).message || 'Could not import the file.', upgrade: status === 402 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 26px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Import from a CSV</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: RT.muted }}>
          Moving from Serpfox or another rank tracker? Upload its export. Keywords and their ranking history come with it, then they are checked weekly.
        </p>
      </div>
      <label style={labelStyle}>
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
          style={{ ...inputStyle, fontWeight: 400, fontSize: 14 }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <label style={labelStyle}>
          <span>Site <span style={{ fontWeight: 400, color: RT.muted }}>(if the file has no URL column)</span></span>
          <input type="text" list="rt-import-websites" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            autoComplete="off" style={{ ...inputStyle, fontWeight: 400, fontSize: 14 }} />
          <datalist id="rt-import-websites">{websites.map((w) => <option key={w} value={w} />)}</datalist>
        </label>
        <AddCityInput label="Track from (if the file has no location)" value={city} onChange={setCity} placeholder="City, state or country" />
      </div>
      {error && <Notice tone="error">{error.msg}{error.upgrade && <> {upgradeLink}</>}</Notice>}
      {result && (
        <Notice tone="ok">
          <strong>Imported {fmt(result.keywords)} {result.keywords === 1 ? 'keyword' : 'keywords'}</strong> on {fmt(result.websites)} {result.websites === 1 ? 'site' : 'sites'}, with {fmt(result.checks)} past {result.checks === 1 ? 'check' : 'checks'}.
          {result.skippedLocations.length > 0 && <> Skipped rows from places we could not match: {result.skippedLocations.slice(0, 5).join(', ')}{result.skippedLocations.length > 5 ? ' and more' : ''}.</>}
          {' '}<Link href="/dashboard/rank-tracking" style={{ color: '#166534', fontWeight: 600 }}>View rankings</Link>
        </Notice>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={!file || busy} aria-disabled={!file || busy}
          style={{ ...btnPrimary, opacity: file && !busy ? 1 : 0.55, cursor: file && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Importing…' : 'Import CSV'}
        </button>
      </div>
    </form>
  );
}

/* ─── Page ──────────────────────────────────────────────────────── */

function AddKeywordsInner() {
  const params = useSearchParams();
  const brand = useBrandScope();
  // Default to the brand picked in the sidebar when no website is in the URL.
  const initialWebsite = (params.get('website') || brand.domain || '').trim();
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

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: RT.ink }}>
      <RankTabs />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0 24px' }}>
        <div style={{ ...cardStyle, borderRadius: 18, width: '100%', maxWidth: 900, overflow: 'hidden', boxSizing: 'border-box' }}>
          <AddForm key={initialWebsite} initialWebsite={initialWebsite} websites={websites} credits={credits} creditsError={creditsError} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 48 }}>
        <div id="import" style={{ ...cardStyle, borderRadius: 18, width: '100%', maxWidth: 900, overflow: 'hidden', boxSizing: 'border-box' }}>
          <ImportPanel key={initialWebsite} initialWebsite={initialWebsite} websites={websites} />
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
