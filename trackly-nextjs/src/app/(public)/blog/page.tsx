'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { blogPosts, formatDate } from '@/data/blog-posts';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';

/* ── Category color map ── */
const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GEO:       { bg: 'rgba(99,102,241,.08)',  text: '#6366f1', border: 'rgba(99,102,241,.2)' },
  Strategy:  { bg: 'rgba(168,85,247,.08)',   text: '#a855f7', border: 'rgba(168,85,247,.2)' },
  Guide:     { bg: 'rgba(16,185,129,.08)',   text: '#10b981', border: 'rgba(16,185,129,.2)' },
  Analytics: { bg: 'rgba(59,130,246,.08)',    text: '#3b82f6', border: 'rgba(59,130,246,.2)' },
  Agency:    { bg: 'rgba(245,158,11,.08)',    text: '#f59e0b', border: 'rgba(245,158,11,.2)' },
  Metrics:   { bg: 'rgba(236,72,153,.08)',    text: '#ec4899', border: 'rgba(236,72,153,.2)' },
};

const ACCENT_GRADIENTS: Record<string, string> = {
  GEO:       'linear-gradient(135deg, #6366f1, #a855f7)',
  Strategy:  'linear-gradient(135deg, #a855f7, #ec4899)',
  Guide:     'linear-gradient(135deg, #10b981, #06b6d4)',
  Analytics: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  Agency:    'linear-gradient(135deg, #f59e0b, #ef4444)',
  Metrics:   'linear-gradient(135deg, #ec4899, #8b5cf6)',
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || TAG_COLORS.Guide;
}

function getAccentGradient(tag: string) {
  return ACCENT_GRADIENTS[tag] || ACCENT_GRADIENTS.Guide;
}

/* ── Unique tags from blog data ── */
const allTags = [...new Set(blogPosts.map(p => p.tag))];

export default function BlogPage() {
  const [activeTag, setActiveTag] = useState<string>('All');

  const filtered = useMemo(() =>
    activeTag === 'All' ? blogPosts : blogPosts.filter(p => p.tag === activeTag),
  [activeTag]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Blog', url: '/blog' }]} />

      {/* ═══ Hero Header ═══ */}
      <section style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        padding: '72px 24px 56px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: '#a5b4fc', background: 'rgba(99,102,241,.12)',
            border: '1px solid rgba(99,102,241,.2)', padding: '6px 16px', borderRadius: 100,
            marginBottom: 20,
          }}>
            Livesov Blog
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#f1f5f9',
            letterSpacing: '-1.5px', lineHeight: 1.15, marginBottom: 14, maxWidth: 620, margin: '0 auto 14px',
          }}>
            AI Visibility Insights &amp; Strategies
          </h1>
          <p style={{
            fontSize: 17, color: 'rgba(255,255,255,.55)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6,
          }}>
            Expert guides on GEO, AI brand tracking, share of voice, and optimizing your presence across AI platforms.
          </p>
        </div>
      </section>

      {/* ═══ Category Filter Pills ═══ */}
      <div style={{
        maxWidth: 1000, margin: '-24px auto 0', padding: '0 24px', position: 'relative', zIndex: 2,
      }}>
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          padding: '14px 20px', boxShadow: '0 4px 20px rgba(0,0,0,.06)',
        }}>
          {['All', ...allTags].map(tag => {
            const isActive = activeTag === tag;
            const color = tag === 'All' ? TAG_COLORS.GEO : getTagColor(tag);
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                style={{
                  padding: '8px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600,
                  border: isActive ? `1.5px solid ${tag === 'All' ? '#6366f1' : color.text}` : '1.5px solid #e2e8f0',
                  background: isActive ? (tag === 'All' ? 'rgba(99,102,241,.08)' : color.bg) : 'transparent',
                  color: isActive ? (tag === 'All' ? '#6366f1' : color.text) : '#64748b',
                  cursor: 'pointer', transition: 'all .2s ease',
                  fontFamily: 'var(--font, Inter, system-ui, sans-serif)',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Blog Content ═══ */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Featured Article (first post) */}
        {featured && (
          <Link
            href={`/blog/${featured.slug}`}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 40 }}
          >
            <div style={{
              display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
              overflow: 'hidden', transition: 'all .3s ease', position: 'relative',
            }}
              className="blog-featured-card"
            >
              {/* Left: gradient image area */}
              <div style={{
                background: getAccentGradient(featured.tag),
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 40, minHeight: 280, position: 'relative',
              }}>
                <div style={{ fontSize: 72, opacity: 0.15, position: 'absolute', top: 20, right: 30 }}>&#x25C6;</div>
                <div style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.7)', marginBottom: 12,
                }}>
                  Featured Article
                </div>
                <div style={{
                  fontSize: 56, fontWeight: 800, color: 'rgba(255,255,255,.2)',
                  fontFamily: 'var(--mono, monospace)', letterSpacing: -2,
                }}>
                  {featured.tag}
                </div>
              </div>
              {/* Right: content */}
              <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
                    background: getTagColor(featured.tag).bg, color: getTagColor(featured.tag).text,
                    border: `1px solid ${getTagColor(featured.tag).border}`,
                  }}>
                    {featured.tag}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(featured.date)}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{featured.readTime}</span>
                </div>
                <h2 style={{
                  fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px',
                  lineHeight: 1.3, marginBottom: 12,
                }}>
                  {featured.title}
                </h2>
                <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, marginBottom: 20 }}>
                  {featured.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: getAccentGradient(featured.tag), color: '#fff',
                  }}>
                    {featured.author.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{featured.author.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{featured.author.role}</div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Article Grid */}
        {rest.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: 24,
          }}>
            {rest.map(post => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <article
                  className="blog-card-hover"
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
                    overflow: 'hidden', transition: 'all .3s cubic-bezier(.4,0,.2,1)',
                    borderLeft: `4px solid ${getTagColor(post.tag).text}`,
                    height: '100%', display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Card top gradient strip */}
                  <div style={{
                    height: 4, background: getAccentGradient(post.tag), flexShrink: 0,
                  }} />
                  <div style={{ padding: '24px 24px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                        background: getTagColor(post.tag).bg, color: getTagColor(post.tag).text,
                        border: `1px solid ${getTagColor(post.tag).border}`,
                      }}>
                        {post.tag}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{post.readTime}</span>
                    </div>
                    {/* Title */}
                    <h3 style={{
                      fontSize: 17, fontWeight: 700, color: '#0f172a', lineHeight: 1.4,
                      letterSpacing: '-0.3px', marginBottom: 10,
                    }}>
                      {post.title}
                    </h3>
                    {/* Description */}
                    <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.65, marginBottom: 16, flex: 1 }}>
                      {post.description}
                    </p>
                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', fontSize: 9, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: getAccentGradient(post.tag), color: '#fff',
                        }}>
                          {post.author.initials}
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(post.date)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>
                        Read &rarr;
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>&#x25C7;</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No articles in this category yet.</div>
          </div>
        )}
      </section>

      {/* Hover styles */}
      <style>{`
        .blog-featured-card:hover {
          box-shadow: 0 20px 50px -12px rgba(0,0,0,0.12);
          transform: translateY(-3px);
        }
        .blog-card-hover:hover {
          box-shadow: 0 12px 32px -8px rgba(0,0,0,0.1);
          transform: translateY(-4px);
          border-color: rgba(99,102,241,.2) !important;
        }
        .blog-card-hover:hover h3 {
          color: #6366f1 !important;
        }
        @media (max-width: 768px) {
          .blog-featured-card {
            grid-template-columns: 1fr !important;
          }
          .blog-featured-card > div:first-child {
            min-height: 160px !important;
            padding: 24px !important;
          }
        }
      `}</style>
    </SeoLayout>
  );
}
