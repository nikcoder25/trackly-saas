'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner } from '@/components/tools/ToolPage';

interface Result {
  domain: string;
  urlCount: number;
  sitemapsCrawled: number;
  llmsTxt: string;
}

export default function LlmsTxtGeneratorPage() {
  const [domain, setDomain] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/llms-txt-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), website: honeypot }),
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

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.llmsTxt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.llmsTxt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llms.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      title={<>Free <span style={{ color: 'var(--brand)' }}>llms.txt</span> Generator</>}
      subtitle="Build a valid llms.txt for your site in seconds. We crawl your sitemap and group URLs into clean sections."
      toolName="llms.txt Generator"
      toolSlug="llms-txt-generator"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="llms-website">Website</label>
            <input id="llms-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="domain" style={labelStyle}>Your domain</label>
            <input
              id="domain"
              type="text"
              required
              placeholder="https://example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              We&apos;ll fetch <code>/sitemap.xml</code> or <code>/sitemap_index.xml</code>.
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Generating...' : 'Generate llms.txt'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Generated for {result.domain}</div>
                <div style={{ fontSize: 14, color: '#1a1a2e', marginTop: 4 }}>
                  <strong>{result.urlCount}</strong> URLs across <strong>{result.sitemapsCrawled}</strong> sitemap{result.sitemapsCrawled !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Download
                </button>
              </div>
            </div>
            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: 20,
                borderRadius: 10,
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: 'auto',
                maxHeight: 460,
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {result.llmsTxt}
            </pre>
            <p style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
              Upload the file to the root of your domain so it&apos;s reachable at <code>https://{(() => { try { return new URL(result.domain).host; } catch { return 'yourdomain.com'; } })()}/llms.txt</code>.
            </p>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
