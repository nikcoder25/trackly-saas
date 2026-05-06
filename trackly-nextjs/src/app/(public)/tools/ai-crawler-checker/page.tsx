'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

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

      <ToolArticle>
        <h2>What is an AI crawler, exactly?</h2>
        <p>
          An AI crawler is an automated agent that fetches webpages on behalf of a large language model. Some crawlers harvest text to <em>train</em> a model (GPTBot, ClaudeBot, Google-Extended, CCBot, Bytespider). Others fetch live during a conversation to <em>answer</em> a user question with up-to-date data (ChatGPT-User, Perplexity-User, Claude-Web). Both types matter, and they obey the same robots.txt rules - if you block them, you disappear from the model.
        </p>

        <h2>Why this check matters for AI visibility</h2>
        <p>
          Sites accidentally block AI crawlers all the time. A standard <code>Disallow: /</code> for archive-cleanup, a Cloudflare bot-fight rule, an over-eager security plugin - any of these can silently strip your content from the next-generation answer engines that route an increasing share of buying-intent traffic.
        </p>
        <p>
          This tool reads your live <code>robots.txt</code>, applies the longest-match rule per user-agent (the standard the spec defines), and tells you whether each of the 13 crawlers we track is allowed to fetch the URL you supplied. If a crawler is blocked, the rule that did it is shown so you can fix it in seconds.
        </p>

        <h2>The crawlers we check</h2>
        <ul>
          <li><strong>GPTBot, OAI-SearchBot, ChatGPT-User</strong> - OpenAI&apos;s training, search and live-fetch bots.</li>
          <li><strong>ClaudeBot, Claude-Web</strong> - Anthropic&apos;s training and live-citation bots.</li>
          <li><strong>PerplexityBot, Perplexity-User</strong> - Perplexity&apos;s indexer and live fetcher.</li>
          <li><strong>Google-Extended, GoogleOther</strong> - Google&apos;s opt-out for Gemini training and other R&amp;D crawls.</li>
          <li><strong>CCBot</strong> - Common Crawl, the public corpus most open AI labs train on.</li>
          <li><strong>Bytespider, Meta-ExternalAgent, Applebot-Extended</strong> - ByteDance, Meta and Apple training crawlers.</li>
        </ul>

        <h2>How to fix a blocked URL</h2>
        <ol>
          <li>Open your site&apos;s <code>robots.txt</code> at <code>https://yourdomain.com/robots.txt</code>.</li>
          <li>Find the user-agent group that matches the blocked bot - or the wildcard <code>User-agent: *</code> group.</li>
          <li>Replace <code>Disallow: /</code> with <code>Allow: /</code> (or remove the disallow line entirely) for the paths you want indexed.</li>
          <li>If you want to block training but allow live fetches, target only the training bots (GPTBot, ClaudeBot, Google-Extended, CCBot) and leave the *-User bots open.</li>
          <li>Re-run this checker to confirm the change.</li>
        </ol>

        <div className="callout">
          <strong>Tip:</strong> blocking <em>training</em> bots and allowing <em>user</em> bots is a defensible middle ground. It lets ChatGPT and Perplexity cite you in real time without your content being absorbed into the next pre-training run.
        </div>

        <h2>Robots.txt patterns we apply</h2>
        <p>
          We follow the <a href="https://www.rfc-editor.org/rfc/rfc9309.html" rel="noopener noreferrer nofollow">RFC 9309</a> longest-match rule. If two directives match the path, the one with the longer pattern wins. <code>Allow: /blog/</code> beats <code>Disallow: /</code>; <code>Disallow: /blog/draft/</code> beats <code>Allow: /blog/</code>. Wildcards (<code>*</code>) and end-of-string anchors (<code>$</code>) are honoured. If no group matches the user-agent, we fall back to the <code>*</code> group, then to default-allow.
        </p>

        <FaqSection
          items={[
            {
              q: 'Should I block GPTBot or allow it?',
              a: 'Allow it unless you have a strong content-licensing strategy. Blocking GPTBot removes your content from ChatGPT’s next training run AND from many citation pathways. The trade-off is rarely worth it for businesses that benefit from being recommended.',
            },
            {
              q: 'Why does my page show as blocked when robots.txt says Allow?',
              a: 'Check for a longer disallow pattern that matches the same URL. Robots rules use longest-match, so Disallow: /blog/draft/ beats Allow: /blog/ for /blog/draft/post-1. The "Rule applied" column tells you exactly which directive won.',
            },
            {
              q: 'My site has no robots.txt. Am I safe?',
              a: 'You are by default. The absence of robots.txt means everything is allowed. We surface that explicitly in the result so you know the answer is "yes, all crawlers can access this URL".',
            },
            {
              q: 'Does this tool fetch the URL itself?',
              a: 'No. We only fetch /robots.txt on the same host and apply the rules. We never request the user-supplied URL. If your robots.txt is unreachable, we say so.',
            },
            {
              q: 'What about Cloudflare or WAF blocks?',
              a: 'This tool checks robots.txt only. Edge-level blocks (Cloudflare’s "Block AI Bots" toggle, IP allowlists, WAF rules) sit above robots and are not visible from a robots fetch. If your robots.txt looks open but AI bots still cannot reach the page, suspect the edge.',
            },
            {
              q: 'How often should I check?',
              a: 'Whenever you change robots.txt, deploy a new edge rule, or migrate hosts. We recommend a quarterly check on every important landing page.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'llms-txt-generator', name: 'llms.txt Generator', tagline: 'Build a curated AI reading list for your site.' },
            { slug: 'geo-score-checker', name: 'GEO Score Checker', tagline: 'Score any page on its AI-readiness in seconds.' },
            { slug: 'chatgpt-mention-checker', name: 'ChatGPT Mention Checker', tagline: 'See if ChatGPT mentions your brand for any question.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'top' };
