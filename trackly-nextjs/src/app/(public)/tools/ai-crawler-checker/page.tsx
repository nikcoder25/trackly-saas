'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

interface CrawlerResult {
  name: string;
  vendor: string;
  purpose: string;
  allowed: boolean;
  reason: string;
  matchedUserAgent: string | null;
}

interface ApiResult {
  url: string;
  robotsUrl: string;
  robotsExists: boolean;
  robotsStatus: number;
  results: CrawlerResult[];
}

export default function AiCrawlerCheckerPage() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ApiResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/ai-crawler-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), website: honeypot }),
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

  const blocked = result?.results.filter((r) => !r.allowed) || [];
  const allowedCount = result ? result.results.length - blocked.length : 0;

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Crawler</span> Checker</>}
      subtitle="Check whether GPTBot, ClaudeBot, PerplexityBot, Google-Extended and 9 other AI crawlers can access any URL."
      toolName="AI Crawler Checker"
      toolSlug="ai-crawler-checker"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="crawler-website">Website</label>
            <input id="crawler-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="crawlerUrl" style={labelStyle}>URL to check</label>
            <input
              id="crawlerUrl"
              type="text"
              required
              placeholder="https://yoursite.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              We fetch <code>/robots.txt</code> on the same host and apply the matching rules.
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Checking...' : 'Check Crawler Access'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Checked URL</div>
                <div style={{ fontSize: 14, color: '#1a1a2e', wordBreak: 'break-all' }}>{result.url}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: blocked.length === 0 ? '#10b981' : '#f59e0b', lineHeight: 1 }}>
                  {allowedCount}/{result.results.length}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>crawlers allowed</div>
              </div>
            </div>
            {!result.robotsExists && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                No <code>robots.txt</code> found at <code>{result.robotsUrl}</code> (HTTP {result.robotsStatus || 'no response'}). All crawlers default to allowed.
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={th}>Crawler</th>
                    <th style={th}>Vendor</th>
                    <th style={th}>Status</th>
                    <th style={th}>Rule applied</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.name} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{r.name}</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{r.purpose}</div>
                      </td>
                      <td style={td}>{r.vendor}</td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 12,
                          background: r.allowed ? '#dcfce7' : '#fee2e2',
                          color: r.allowed ? '#166534' : '#991b1b',
                        }}>
                          {r.allowed ? 'Allowed' : 'Blocked'}
                        </span>
                      </td>
                      <td style={{ ...td, color: '#4b5563', fontSize: 12 }}>
                        {r.reason}
                        {r.matchedUserAgent && (
                          <div style={{ color: '#9ca3af' }}>matched user-agent: <code>{r.matchedUserAgent}</code></div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ToolPage>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'top' };
