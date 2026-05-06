'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

interface Brand {
  name: string;
  rank: number;
  description?: string;
}

interface Result {
  industry: string;
  region: string;
  platform: string;
  model: string;
  brands: Brand[];
  raw: string;
}

export default function CompetitorFinderPage() {
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/competitor-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: industry.trim(), region: region.trim(), website: honeypot }),
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
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Competitor</span> Finder</>}
      subtitle="See the top 10 brands AI recommends for your industry. No signup."
      toolName="AI Competitor Finder"
      toolSlug="competitor-finder"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cmp-website">Website</label>
            <input id="cmp-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label htmlFor="cfIndustry" style={labelStyle}>Industry / vertical *</label>
              <input
                id="cfIndustry"
                type="text"
                required
                maxLength={200}
                placeholder="e.g. AI visibility tracking software"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="cfRegion" style={labelStyle}>Region <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                id="cfRegion"
                type="text"
                maxLength={120}
                placeholder="e.g. UK"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking AI...' : 'Find AI-Recommended Brands'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={cardStyle}>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
              Top brands for <strong style={{ color: '#1a1a2e' }}>{result.industry}</strong>
              {result.region && <> in <strong style={{ color: '#1a1a2e' }}>{result.region}</strong></>} - via {result.platform}
            </div>
            {result.brands.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f9fafb', color: '#6b7280', fontSize: 13 }}>
                Couldn&apos;t parse a clean brand list. Raw response is below.
              </div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.brands.map((b) => (
                  <li
                    key={b.rank + b.name}
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'flex-start',
                      padding: 14,
                      borderRadius: 10,
                      background: '#f9fafb',
                      border: '1px solid #f0f0f0',
                    }}
                  >
                    <div style={{
                      flex: '0 0 36px',
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--brand)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 14,
                    }}>
                      {b.rank}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{b.name}</div>
                      {b.description && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.6 }}>{b.description}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <details style={cardStyle}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>Raw AI response</summary>
            <pre style={{ marginTop: 12, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.raw}</pre>
          </details>
        </div>
      )}
    </ToolPage>
  );
}
