'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';
import ToolEmailCapture from '@/components/tools/ToolEmailCapture';

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

      {result && <ToolEmailCapture source="ai-crawler-checker" />}

      <ToolArticle>
        <ArticleSchema
          headline="AI Crawler Checker: Test GPTBot, ClaudeBot, PerplexityBot and Google-Extended Access"
          description="Check whether 13 major AI crawlers can fetch any URL on your site. Includes a full guide to robots.txt rules, the user-agents that matter, and how to fix common blocks."
          url="https://livesov.com/tools/ai-crawler-checker"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          The <strong>AI Crawler Checker</strong> reads your live <code>robots.txt</code> and tells you whether 13 of the most important AI crawlers - GPTBot, ClaudeBot, PerplexityBot, Google-Extended and 9 others - are allowed to fetch any URL you supply. It applies <a href="https://www.rfc-editor.org/rfc/rfc9309.html" rel="noopener noreferrer nofollow">RFC 9309</a> longest-match rules, surfaces the exact directive that allowed or blocked each bot, and is free with no signup.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'AI crawlers obey robots.txt. If you block them, you disappear from the AI engines they feed.',
            'There are two kinds of AI crawlers: training bots (one-time data harvest) and user bots (live-fetch during a conversation).',
            'Blocking training bots is defensible. Blocking user bots is almost always a self-inflicted wound.',
            'Edge-level blocks (Cloudflare, WAFs) bypass robots.txt - if your robots is open but bots are still blocked, look there.',
            'A monthly check on your top landing pages catches most accidental regressions.',
          ]}
        />

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

        <ExpertQuote
          quote="The two most common AI visibility regressions we see are not strategic - they're accidental. A WordPress security plugin gets aggressive, a CDN bot-fight rule gets enabled, or a junior dev pastes a generic 'block all bots' robots.txt off Stack Overflow. Three months later the team wonders why ChatGPT suddenly stopped recommending them."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>The 13 crawlers this tool checks</h2>
        <p>
          Each crawler below has its own user-agent string and its own purpose. Robots.txt rules target them by name, so you can allow some and block others. We grade each independently.
        </p>
        <table>
          <thead>
            <tr>
              <th>Crawler</th>
              <th>Vendor</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>GPTBot</code></td><td>OpenAI</td><td>Trains ChatGPT and GPT-series models. Most consequential bot to allow.</td></tr>
            <tr><td><code>OAI-SearchBot</code></td><td>OpenAI</td><td>Powers ChatGPT Search results - a separate index from the training corpus.</td></tr>
            <tr><td><code>ChatGPT-User</code></td><td>OpenAI</td><td>Live-fetches pages during a conversation when ChatGPT browses on a user&apos;s behalf.</td></tr>
            <tr><td><code>ClaudeBot</code></td><td>Anthropic</td><td>Trains Claude models. Trusted, well-documented, respects all standard directives.</td></tr>
            <tr><td><code>Claude-Web</code></td><td>Anthropic</td><td>Fetches pages live when Claude needs to cite a source.</td></tr>
            <tr><td><code>PerplexityBot</code></td><td>Perplexity</td><td>Indexes pages for Perplexity answers. Citation-heavy product.</td></tr>
            <tr><td><code>Perplexity-User</code></td><td>Perplexity</td><td>Live fetches pages cited in answers. Blocking it kills your Perplexity citations.</td></tr>
            <tr><td><code>Google-Extended</code></td><td>Google</td><td>Opt-out for Gemini training and Google Vertex AI. Does NOT affect Google search.</td></tr>
            <tr><td><code>GoogleOther</code></td><td>Google</td><td>Catch-all for Google R&amp;D crawls outside core search.</td></tr>
            <tr><td><code>CCBot</code></td><td>Common Crawl</td><td>Builds the public corpus most open-weight models train on.</td></tr>
            <tr><td><code>Bytespider</code></td><td>ByteDance</td><td>Trains ByteDance / TikTok AI models. Known to be aggressive.</td></tr>
            <tr><td><code>Meta-ExternalAgent</code></td><td>Meta</td><td>Trains Llama models. Respects robots.txt as of 2024.</td></tr>
            <tr><td><code>Applebot-Extended</code></td><td>Apple</td><td>Trains Apple Intelligence models. Recently introduced opt-out.</td></tr>
          </tbody>
        </table>

        <h3>Training bots vs user bots</h3>
        <p>
          The single most useful framing when deciding what to block: training bots harvest content one-time to feed model pre-training; user bots fetch a page live during a conversation, on behalf of a real user, to ground the answer. Blocking the training bots removes you from future model versions but does not affect today&apos;s recommendations. Blocking the user bots removes you from <em>every</em> live citation the moment the rule deploys.
        </p>

        <h3>Live-fetch user bots that you almost never want to block</h3>
        <ul>
          <li><code>ChatGPT-User</code></li>
          <li><code>Claude-Web</code></li>
          <li><code>Perplexity-User</code></li>
          <li><code>OAI-SearchBot</code></li>
        </ul>
        <p>
          These four bots are the difference between &quot;ChatGPT can recommend me&quot; and &quot;ChatGPT cannot see me&quot;. Treat them as you would Googlebot.
        </p>

        <h2>How to fix a blocked URL</h2>
        <ol>
          <li>Open your site&apos;s <code>robots.txt</code> at <code>https://yourdomain.com/robots.txt</code>.</li>
          <li>Find the user-agent group that matches the blocked bot - or the wildcard <code>User-agent: *</code> group.</li>
          <li>Replace <code>Disallow: /</code> with <code>Allow: /</code> (or remove the disallow line entirely) for the paths you want indexed.</li>
          <li>If you want to block training but allow live fetches, target only the training bots (GPTBot, ClaudeBot, Google-Extended, CCBot) and leave the *-User bots open.</li>
          <li>Re-run this checker to confirm the change.</li>
        </ol>

        <h3>A copy-paste robots.txt for &quot;allow everything reasonable&quot;</h3>
        <p>
          The simplest stance: allow every documented AI crawler, block only the obviously-aggressive ones, and rely on edge rules for emergencies.
        </p>
        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.6, overflowX: 'auto' }}>
{`User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml

# Block aggressive scrapers
User-agent: Bytespider
Disallow: /`}
        </pre>

        <h3>A robots.txt for &quot;allow live citation, opt out of training&quot;</h3>
        <p>
          The middle-ground stance: get cited live by ChatGPT, Claude and Perplexity, but opt out of being absorbed into the next pre-training run.
        </p>
        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.6, overflowX: 'auto' }}>
{`User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml

# Opt out of training crawlers
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Applebot-Extended
Disallow: /

# Keep live-fetch bots open
User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: OAI-SearchBot
Allow: /`}
        </pre>

        <div className="callout">
          <strong>Tip:</strong> blocking <em>training</em> bots and allowing <em>user</em> bots is a defensible middle ground. It lets ChatGPT and Perplexity cite you in real time without your content being absorbed into the next pre-training run.
        </div>

        <h2>Robots.txt patterns we apply</h2>
        <p>
          We follow the <a href="https://www.rfc-editor.org/rfc/rfc9309.html" rel="noopener noreferrer nofollow">RFC 9309</a> longest-match rule. If two directives match the path, the one with the longer pattern wins. <code>Allow: /blog/</code> beats <code>Disallow: /</code>; <code>Disallow: /blog/draft/</code> beats <code>Allow: /blog/</code>. Wildcards (<code>*</code>) and end-of-string anchors (<code>$</code>) are honoured. If no group matches the user-agent, we fall back to the <code>*</code> group, then to default-allow.
        </p>
        <p>
          A few subtleties worth knowing. An empty <code>Disallow:</code> directive (no path) is interpreted as &quot;allow everything&quot;. <code>Disallow: /search?</code> targets only paths that include the query string. <code>$</code> at the end of a pattern anchors the match to the end of the URL. Crawl-delay and sitemap directives are honoured by some bots but ignored by others.
        </p>

        <h2>Beyond robots.txt: edge-level blocks</h2>
        <p>
          Robots.txt is the polite layer. The forceful layer lives at the edge - Cloudflare, AWS WAF, Fastly, Akamai. Several products now bundle one-click &quot;block AI bots&quot; toggles, and many security plugins (Wordfence, Sucuri) ship aggressive defaults. None of those rules are visible from a robots.txt fetch.
        </p>
        <p>
          If this checker says all crawlers are allowed but your <a href="/tools/chatgpt-mention-checker">ChatGPT mention checker</a> shows zero mentions, suspect the edge. Specifically: check Cloudflare&apos;s &quot;Block AI Bots&quot; setting, Bot Fight Mode, and any custom firewall rule that filters by user-agent. Also check whether your origin is returning a 403 for the test bot - a JA3 fingerprint mismatch is the common culprit.
        </p>

        <h3>A 30-second edge-block diagnostic</h3>
        <ol>
          <li>Open a terminal and run: <code>curl -A &quot;GPTBot/1.0&quot; -I https://yourdomain.com/your-page</code></li>
          <li>Look at the status. <code>200</code> = your origin and edge let GPTBot through. <code>403</code> or <code>429</code> = blocked at the edge.</li>
          <li>Repeat with <code>ClaudeBot</code>, <code>PerplexityBot</code>, <code>ChatGPT-User</code>.</li>
          <li>If only some return 403, you have a per-bot edge rule. If all return 403, you have a category-level &quot;block AI&quot; toggle.</li>
        </ol>

        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Blocking <code>*</code> with <code>Disallow: /</code> and forgetting to add <code>Allow:</code> rules.</strong> The wildcard rule applies to bots that have no group - many AI bots fall through to it.</li>
          <li><strong>Listing the wrong user-agent.</strong> <code>OpenAI-GPTBot</code> is not the right name. The correct user-agent is <code>GPTBot</code> (case-insensitive).</li>
          <li><strong>Trusting the &quot;Disallow: /admin&quot; line in a wildcard group.</strong> AI bots may match a more specific group with no Disallow on /admin and slip through. Always check.</li>
          <li><strong>Adding Crawl-delay to slow GPTBot.</strong> GPTBot does not respect Crawl-delay. Use rate limits at the edge instead.</li>
          <li><strong>Forgetting that robots.txt is per-host.</strong> <code>www.example.com/robots.txt</code> and <code>example.com/robots.txt</code> are separate files. Both must be open.</li>
        </ul>

        <h2>How often to run this check</h2>
        <ul>
          <li><strong>Once now</strong> - establish a baseline for your most important landing pages.</li>
          <li><strong>After every robots.txt change</strong> - even a one-character edit.</li>
          <li><strong>After every CDN / WAF rule deploy</strong> - those are the silent regressors.</li>
          <li><strong>Monthly</strong> - on a calendar reminder, against your top 10 landing pages.</li>
          <li><strong>Whenever an AI mention rate drops</strong> - the first thing to rule out is a crawl block.</li>
        </ul>

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
              a: 'Whenever you change robots.txt, deploy a new edge rule, or migrate hosts. We recommend a quarterly check on every important landing page, and an immediate check any time AI mention rates drop unexpectedly.',
            },
            {
              q: 'Does Disallow: / really block ChatGPT?',
              a: 'For the wildcard group it blocks any bot without an explicit allow rule. GPTBot has its own group; if you have not declared one, it falls through to the wildcard. The result is yes - your site is blocked from training. Live-fetch (ChatGPT-User) follows the same fall-through unless you explicitly allow it.',
            },
            {
              q: 'What is the difference between Google-Extended and Googlebot?',
              a: 'Googlebot crawls for Google search. Google-Extended is a separate user-agent for Gemini training and Vertex AI. Blocking Google-Extended does NOT affect your Google search rankings. It only opts you out of generative AI training.',
            },
            {
              q: 'My robots.txt looks fine but the page is still 403. Why?',
              a: 'Edge-level blocking. Cloudflare\'s Bot Fight Mode, AWS WAF rules, and many security plugins reject AI user-agents before robots.txt is even evaluated. Run the curl diagnostic above to see status codes per bot.',
            },
            {
              q: 'Should I add a meta noai tag to pages I want excluded?',
              a: 'It does no harm but adoption is patchy. The robots.txt directive is the universally-understood signal. Use noai/noimageai meta as a belt-and-braces additional layer if you want.',
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
