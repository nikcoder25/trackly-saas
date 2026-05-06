'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

interface Result {
  brandName: string;
  query: string;
  platform: string;
  model: string;
  mentioned: boolean;
  snippet: string;
  competitors: string[];
}

export default function ChatgptMentionCheckerPage() {
  const [brandName, setBrandName] = useState('');
  const [query, setQuery] = useState('');
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
      const res = await fetch('/api/tools/chatgpt-mention-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: brandName.trim(), query: query.trim(), website: honeypot }),
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
      title={<>Free <span style={{ color: 'var(--brand)' }}>ChatGPT</span> Mention Checker</>}
      subtitle="Ask ChatGPT a real question and see if your brand shows up - and which competitors are mentioned alongside it."
      toolName="ChatGPT Mention Checker"
      toolSlug="chatgpt-mention-checker"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cgpt-website">Website</label>
            <input id="cgpt-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="brandName" style={labelStyle}>Your brand name</label>
            <input
              id="brandName"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Livesov"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="query" style={labelStyle}>Question to ask ChatGPT</label>
            <input
              id="query"
              type="text"
              required
              maxLength={400}
              placeholder="e.g. What are the best AI visibility tracking tools?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>One free check per day. <Link href="/signup" style={{ color: 'var(--brand)' }}>Sign up</Link> to track unlimited prompts.</div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking ChatGPT...' : 'Check Mention'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 24px',
                borderRadius: 999,
                background: result.mentioned ? '#dcfce7' : '#fee2e2',
                color: result.mentioned ? '#166534' : '#991b1b',
                fontWeight: 700,
                fontSize: 16,
              }}>
                {result.mentioned ? `Yes, ChatGPT mentioned ${result.brandName}` : `No, ChatGPT did not mention ${result.brandName}`}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>via {result.platform} ({result.model})</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Question</div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 14, color: '#1a1a2e' }}>{result.query}</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{result.mentioned ? 'Where you appear' : 'What ChatGPT said'}</div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap' }}>{result.snippet}</div>
            </div>

            {result.competitors.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Other brands ChatGPT mentioned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.competitors.map((c) => (
                    <span key={c} style={{ padding: '6px 12px', borderRadius: 999, background: '#f3f4f6', fontSize: 13, color: '#1a1a2e' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ToolPage>
  );
}
