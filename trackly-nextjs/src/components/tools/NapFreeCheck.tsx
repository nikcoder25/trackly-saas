'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';
import ToolEmailCapture from '@/components/tools/ToolEmailCapture';

// Interactive free NAP check for the public /tools/nap-verification page.
// Calls the anonymous /api/tools/nap-checker endpoint (5 URLs, 3 runs/day per
// IP, no unblocker) and renders a compact result list - the full experience
// (500 URLs, saved audits, schedules, PDF, unblocker) lives in the dashboard.

interface FieldResult { status: 'match' | 'variation' | 'mismatch' | 'missing'; expected?: string; found?: string }
interface FreeUrlResult {
  url: string;
  httpStatus: number | null;
  reachable: boolean;
  error?: string;
  fields: { name: FieldResult; phone: FieldResult; address: FieldResult; postcode: FieldResult; suite: FieldResult };
  tags: string[];
  matchScore: number;
  backlink?: { found: boolean; nofollow?: boolean; anchor?: string };
}
interface FreeCheckResult {
  score: number;
  summary: { total: number; clean: number; withIssues: number; deadLinks: number; missingBacklink?: number } | null;
  results: FreeUrlResult[];
}

const STATUS_META: Record<FieldResult['status'], { color: string; bg: string; icon: string }> = {
  match: { color: '#047857', bg: 'rgba(16,185,129,.1)', icon: '✓' },
  variation: { color: '#b45309', bg: 'rgba(245,158,11,.12)', icon: '≈' },
  mismatch: { color: '#b91c1c', bg: 'rgba(239,68,68,.1)', icon: '✕' },
  missing: { color: '#6b7280', bg: 'rgba(107,114,128,.1)', icon: '–' },
};

function FieldChip({ label, status }: { label: string; status: FieldResult['status'] }) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 999 }}>
      <span aria-hidden style={{ fontSize: 10 }}>{m.icon}</span>{label}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

export default function NapFreeCheck() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [website, setWebsite] = useState('');
  const [urls, setUrls] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FreeCheckResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/nap-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical: {
            name: name.trim(),
            phone: phone.trim() || undefined,
            street: street.trim() || undefined,
            city: city.trim() || undefined,
            postcode: postcode.trim() || undefined,
            website: website.trim() || undefined,
          },
          urls,
          company: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={cardStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px' }}>
          Try a free NAP check
        </h2>
        <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 18px', lineHeight: 1.6 }}>
          Enter your correct business details and up to 5 citation or backlink URLs - we&apos;ll fetch each
          page and flag any mismatched name, address or phone. No signup needed.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="nfc-company">Company</label>
            <input id="nfc-company" type="text" name="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="nfc-name" style={labelStyle}>Business name</label>
              <input id="nfc-name" type="text" required maxLength={200} placeholder="e.g. Acme Dental Care" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="nfc-phone" style={labelStyle}>Phone <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input id="nfc-phone" type="text" maxLength={200} placeholder="020 7946 0123" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="nfc-street" style={labelStyle}>Street <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input id="nfc-street" type="text" maxLength={200} placeholder="12 High Street" value={street} onChange={(e) => setStreet(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="nfc-city" style={labelStyle}>City</label>
              <input id="nfc-city" type="text" maxLength={200} placeholder="London" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="nfc-postcode" style={labelStyle}>Postcode</label>
              <input id="nfc-postcode" type="text" maxLength={200} placeholder="SW1A 1AA" value={postcode} onChange={(e) => setPostcode(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="nfc-website" style={labelStyle}>
              Your website <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional - we&apos;ll also verify each page links to it)</span>
            </label>
            <input id="nfc-website" type="text" maxLength={500} placeholder="https://example.com" value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="nfc-urls" style={labelStyle}>Citation / backlink URLs - one per line (up to 5)</label>
            <textarea
              id="nfc-urls" required rows={4} maxLength={2500}
              placeholder={'https://www.yelp.com/biz/...\nhttps://www.yell.com/...'}
              value={urls} onChange={(e) => setUrls(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
            />
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Checking pages…' : 'Run free check'}
          </PrimaryButton>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            3 free checks per day, 5 URLs each.{' '}
            <Link href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign up</Link> for 500-URL audits,
            schedules, alerts and the anti-bot unblocker.
          </div>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && result.summary && (
        <div style={{ ...cardStyle, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor(result.score), lineHeight: 1 }}>
              {result.score}<span style={{ fontSize: 16, color: '#9ca3af', fontWeight: 600 }}>/100</span>
            </div>
            <div style={{ fontSize: 14, color: '#4b5563' }}>
              NAP consistency across {result.summary.total} page{result.summary.total === 1 ? '' : 's'} ·{' '}
              <strong style={{ color: '#047857' }}>{result.summary.clean} clean</strong> ·{' '}
              <strong style={{ color: '#b45309' }}>{result.summary.withIssues} with issues</strong> ·{' '}
              <strong style={{ color: '#b91c1c' }}>{result.summary.deadLinks} unreachable</strong>
              {typeof result.summary.missingBacklink === 'number' && (
                <> · <strong style={{ color: '#b91c1c' }}>{result.summary.missingBacklink} missing your link</strong></>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {result.results.map((r) => (
              <div key={r.url} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', wordBreak: 'break-all', textDecoration: 'none' }}>
                    {r.url.replace(/^https?:\/\//, '')}
                  </a>
                  <span style={{ fontSize: 16, fontWeight: 700, color: r.reachable ? scoreColor(r.matchScore) : '#9ca3af' }}>
                    {r.reachable ? `${r.matchScore}/100` : 'unreachable'}
                  </span>
                </div>
                {r.reachable ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <FieldChip label="Name" status={r.fields.name.status} />
                    {phone.trim() && <FieldChip label="Phone" status={r.fields.phone.status} />}
                    {street.trim() && <FieldChip label="Address" status={r.fields.address.status} />}
                    {postcode.trim() && <FieldChip label="Postcode" status={r.fields.postcode.status} />}
                    {r.backlink && (
                      r.backlink.found ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.backlink.nofollow ? '#b45309' : '#047857', background: r.backlink.nofollow ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.1)', padding: '3px 9px', borderRadius: 999 }}>
                          {r.backlink.nofollow ? '≈ nofollow link' : '✓ dofollow link'}
                          {r.backlink.anchor ? ` · “${r.backlink.anchor.slice(0, 40)}”` : ''}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', background: 'rgba(239,68,68,.1)', padding: '3px 9px', borderRadius: 999 }}>
                          ✕ no link to your site
                        </span>
                      )
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                    {r.error || `HTTP ${r.httpStatus ?? '-'}`}
                    {r.tags.includes('blocked') && (
                      <> - anti-bot blocked. The dashboard&apos;s unblocker reads these automatically.</>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'rgba(91,91,214,.06)', border: '1px solid rgba(91,91,214,.2)', borderRadius: 12, fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>
            This was a taste - the dashboard audits up to <strong>500 URLs per run</strong>, saves an audit per
            client, re-runs on a schedule with email alerts, reads bot-blocked pages via the unblocker, and
            exports branded CSV/PDF reports.{' '}
            <Link href="/signup" style={{ color: 'var(--brand)', fontWeight: 700 }}>Start free →</Link>
          </div>
          <div style={{ marginTop: 16 }}>
            <ToolEmailCapture source="nap-verification" />
          </div>
        </div>
      )}
    </>
  );
}
