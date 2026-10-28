'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { blogPosts, formatDate } from '@/data/blog-posts';
import { Breadcrumbs } from '@/components/seo/SeoLayout';
import SiteShell from '@/components/site/SiteShell';

/* Card art tint per category (design: soft tint + serif italic mark). */
const TAG_TINTS: Record<string, { tint: string; ink: string }> = {
  GEO:       { tint: '#ECFCCB', ink: '#3F6212' },
  Strategy:  { tint: '#EEF0FF', ink: '#312E81' },
  Guide:     { tint: '#F1F1EC', ink: '#0B0C14' },
  Analytics: { tint: '#EEF0FF', ink: '#312E81' },
  Agency:    { tint: '#FFF4E8', ink: '#9A3412' },
  Metrics:   { tint: '#F1F1EC', ink: '#0B0C14' },
};
const tintFor = (tag: string) => TAG_TINTS[tag] || TAG_TINTS.Guide;

/* ── Unique tags from blog data ── */
const allTags = [...new Set(blogPosts.map(p => p.tag))];

const FEATURED_BARS = [
  { n: 'ChatGPT', w: '92%', c: '#A3E635' },
  { n: 'Claude', w: '70%', c: '#818CF8' },
  { n: 'Gemini', w: '55%', c: '#6366F1' },
  { n: 'Perplexity', w: '42%', c: '#4F46E5' },
];

function Newsletter() {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setState('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website: honeypot, source: 'blog' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save your email.');
        setState('idle');
        return;
      }
      setState('done');
    } catch {
      setError('Network error. Please try again.');
      setState('idle');
    }
  };

  return (
    <div className="ls-card lg" style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', justifyContent: 'space-between', padding: 48 }}>
      <div className="ls-stack ls-gap-10" style={{ maxWidth: 520 }}>
        <h2 className="ls-h2 sm" style={{ fontSize: 'clamp(30px, 3.4vw, 38px)' }}>Get one GEO tip <span className="ls-em">every week.</span></h2>
        <p className="ls-body">Short, practical, no spam.</p>
      </div>
      {state === 'done' ? (
        <p className="ls-alert ok" role="status" style={{ flex: '1 1 380px', maxWidth: 480 }}>You&apos;re in. Watch your inbox.</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 380px', maxWidth: 480 }}>
          <input
            type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            autoComplete="off" tabIndex={-1} aria-hidden="true"
            style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          />
          <label htmlFor="nl-email" className="ls-sr">Email address</label>
          <input id="nl-email" type="email" required autoComplete="email" placeholder="you@agency.com" className="ls-input" style={{ flex: '1 1 220px', minWidth: 0, width: 'auto' }} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="ls-btn ls-btn-pri" disabled={state === 'loading'} style={{ padding: '15px 22px', borderRadius: 12, fontSize: 16 }}>
            {state === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
          {error && <p role="alert" style={{ flexBasis: '100%', fontSize: 13, color: '#B91C1C' }}>{error}</p>}
        </form>
      )}
    </div>
  );
}

export default function BlogPage() {
  const [activeTag, setActiveTag] = useState<string>('All');

  const filtered = useMemo(() =>
    activeTag === 'All' ? blogPosts : blogPosts.filter(p => p.tag === activeTag),
  [activeTag]);

  // The featured slot always shows the newest post; the grid filters.
  const featured = blogPosts[0];
  const rest = activeTag === 'All' ? filtered.slice(1) : filtered;

  return (
    <SiteShell>
      <Breadcrumbs items={[{ name: 'Blog', url: '/blog' }]} />

      {/* ── Hero ── */}
      <section className="ls-wrap ls-stack ls-gap-20" style={{ paddingTop: 80, paddingBottom: 40 }}>
        <span className="ls-eyebrow">Blog</span>
        <h1 className="ls-h1" style={{ maxWidth: 900 }}>Notes on <span className="ls-em">AI search visibility.</span></h1>
        <p className="ls-lead" style={{ maxWidth: 620 }}>
          Guides on LLM SEO, GEO strategy and AI share of voice for agencies who want clients named in AI answers.
        </p>
      </section>

      {/* ── Featured ── */}
      {featured && (
        <section className="ls-wrap" style={{ paddingTop: 16, paddingBottom: 48 }}>
          <Link href={`/blog/${featured.slug}`} className="ls-featured">
            <div className="ls-featured-art" aria-hidden="true">
              <div className="ls-stack ls-gap-12" style={{ width: '100%', maxWidth: 360 }}>
                {FEATURED_BARS.map((b) => (
                  <div key={b.n} className="ls-art-row"><span>{b.n}</span><i style={{ width: b.w, background: b.c }} /></div>
                ))}
              </div>
            </div>
            <div className="ls-featured-body">
              <span className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-lime)', textTransform: 'uppercase' }}>Featured · {featured.tag}</span>
              <h2 className="ls-h2 sm" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', lineHeight: 1.08 }}>{featured.title}</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ls-on-dark-2)' }}>{featured.description}</p>
              <span className="ls-mono" style={{ fontSize: 13, color: 'var(--ls-on-dark-3)' }}>
                {featured.author.name} · {formatDate(featured.date)} · {featured.readTime}
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* ── Filter + grid ── */}
      <section className="ls-wrap ls-stack ls-gap-32" style={{ paddingTop: 16, paddingBottom: 96 }}>
        <div className="ls-chips" role="group" aria-label="Filter posts">
          {['All', ...allTags].map(tag => (
            <button key={tag} type="button" aria-pressed={activeTag === tag} onClick={() => setActiveTag(tag)}>{tag}</button>
          ))}
        </div>
        {rest.length > 0 ? (
          <div className="ls-grid ls-grid-fill">
            {rest.map(post => {
              const t = tintFor(post.tag);
              return (
                <Link key={post.slug} href={`/blog/${post.slug}`} className="ls-post">
                  <div className="ls-post-art" style={{ background: t.tint }} aria-hidden="true">
                    <span style={{ color: t.ink }}>{post.tag}</span>
                  </div>
                  <div className="ls-post-body">
                    <span className="ls-post-cat">{post.tag}</span>
                    <h3 className="ls-post-t">{post.title}</h3>
                    <p className="ls-small">{post.description}</p>
                    <span className="ls-post-meta">{formatDate(post.date)} · {post.readTime}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="ls-body" style={{ textAlign: 'center', padding: '60px 0' }}>No articles in this category yet.</p>
        )}
      </section>

      {/* ── Newsletter ── */}
      <section className="ls-wrap" style={{ paddingBottom: 112 }}>
        <Newsletter />
      </section>
    </SiteShell>
  );
}
