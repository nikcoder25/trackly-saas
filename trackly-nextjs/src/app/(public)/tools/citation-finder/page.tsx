'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

interface Citation {
  url: string;
  domain: string;
  title?: string;
}

interface Result {
  platform: string;
  model: string;
  query: string;
  brand: string;
  brandCited: boolean;
  citations: Citation[];
  answerSnippet: string;
}

export default function CitationFinderPage() {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [platform, setPlatform] = useState<'Perplexity' | 'ChatGPT'>('Perplexity');
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
      const res = await fetch('/api/tools/citation-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), brand: brand.trim(), platform, website: honeypot }),
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
      title={<>AI <span style={{ color: 'var(--brand)' }}>Citation</span> Finder</>}
      subtitle="Ask Perplexity or ChatGPT a question and we'll list every URL it cites. Optionally tell us your brand to see if you're in the references."
      toolName="AI Citation Finder"
      toolSlug="citation-finder"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cf-website">Website</label>
            <input id="cf-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cfQuery" style={labelStyle}>Question to ask</label>
            <input
              id="cfQuery"
              type="text"
              required
              maxLength={400}
              placeholder="e.g. What are the best AI visibility tracking tools and which sources prove it?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label htmlFor="cfBrand" style={labelStyle}>Your brand <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                id="cfBrand"
                type="text"
                maxLength={200}
                placeholder="e.g. Livesov"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="cfPlatform" style={labelStyle}>Platform</label>
              <select
                id="cfPlatform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'Perplexity' | 'ChatGPT')}
                style={{ ...inputStyle, background: '#fff' }}
              >
                <option value="Perplexity">Perplexity</option>
                <option value="ChatGPT">ChatGPT</option>
              </select>
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking AI...' : 'Find Citations'}
          </PrimaryButton>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            2 free checks per day. <a href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign up</a> for unlimited citation tracking across every prompt.
          </div>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{result.citations.length} citations</h2>
              <div style={{ fontSize: 12, color: '#6b7280' }}>via {result.platform} ({result.model})</div>
            </div>
            {result.brand && (
              <div style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: result.brandCited ? '#dcfce7' : '#fee2e2',
                color: result.brandCited ? '#166534' : '#991b1b',
                fontSize: 13,
                fontWeight: 600,
              }}>
                {result.brandCited ? `${result.brand} appears in the citations.` : `${result.brand} was not in the cited sources.`}
              </div>
            )}
            {result.citations.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f9fafb', color: '#6b7280', fontSize: 13 }}>
                No URLs cited. Try a question that benefits from sources, or switch platform.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.citations.map((c, i) => {
                  const isBrand = result.brand && c.domain.toLowerCase().includes(result.brand.toLowerCase());
                  return (
                    <li
                      key={c.url + i}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: isBrand ? '#f0fdf4' : '#f9fafb',
                        border: isBrand ? '1px solid #86efac' : '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
                        {c.title || c.domain}
                        {isBrand && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: '#fff' }}>YOUR BRAND</span>}
                      </div>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        {c.url}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px' }}>Answer snippet</h3>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap' }}>{result.answerSnippet}</div>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
