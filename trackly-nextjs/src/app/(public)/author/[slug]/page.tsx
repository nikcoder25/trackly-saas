import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import EmailOff from '@/components/EmailOff';
import { Section, SectionHeader, JsonLd } from '@/components/seo/SeoSections';
import { AUTHORS, getAuthor, authorPersonSchema } from '@/data/authors';
import { blogPosts, formatDate } from '@/data/blog-posts';

export async function generateStaticParams() {
  return Object.keys(AUTHORS).map((slug) => ({ slug }));
}

// Authors are a closed set from the data module - reject anything else at the
// router level so an unknown slug is a hard 404, not a soft one.
export const dynamicParams = false;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const author = getAuthor(slug);
  if (!author) notFound();

  const title = `${author.name} - ${author.role} | Livesov`;
  return {
    title,
    description: author.summary,
    alternates: { canonical: `/author/${author.slug}` },
    openGraph: {
      title,
      description: author.summary,
      url: `https://livesov.com/author/${author.slug}`,
      siteName: 'Livesov',
      type: 'profile',
      images: [{ url: `https://livesov.com${author.avatar}`, alt: author.avatarAlt }],
    },
    twitter: {
      card: 'summary',
      title,
      description: author.summary,
      images: [`https://livesov.com${author.avatar}`],
    },
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = getAuthor(slug);
  if (!author) notFound();

  const posts = blogPosts
    .filter((p) => p.author.slug === author.slug)
    .sort((a, b) => b.date.localeCompare(a.date));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: authorPersonSchema(author),
  };

  return (
    <SeoLayout>
      <JsonLd data={schema} />
      <Breadcrumbs items={[{ name: author.name, url: `/author/${author.slug}` }]} />

      <Section pad="64px 24px 32px" width={820}>
        <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img
            src={author.avatar}
            alt={author.avatarAlt}
            width={128}
            height={128}
            style={{
              width: 128, height: 128, borderRadius: '50%', objectFit: 'cover',
              flexShrink: 0, background: '#e2e8f0',
              border: '1px solid rgba(15,23,42,.08)',
            }}
          />
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1 style={{
              fontSize: 38, fontWeight: 800, letterSpacing: -1,
              color: 'var(--text-primary)', margin: '0 0 6px', lineHeight: 1.15,
            }}>
              {author.name}
            </h1>
            <p style={{
              fontSize: 15, fontWeight: 600, color: 'var(--brand, #6366f1)',
              margin: '0 0 16px',
            }}>
              {author.role}
            </p>
            {author.bio.map((para) => (
              <p key={para} style={{
                fontSize: 15, lineHeight: 1.75, color: 'var(--text-secondary)',
                margin: '0 0 14px',
              }}>
                {para}
              </p>
            ))}
            {author.email && (
              <p style={{ fontSize: 14, margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                Get in touch:{' '}
                <EmailOff>
                  <a href={`mailto:${author.email}`} style={{ color: 'var(--brand, #6366f1)', fontWeight: 600 }}>
                    {author.email}
                  </a>
                </EmailOff>
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section pad="16px 24px 40px" width={820}>
        <div style={{
          background: 'var(--bg-section, #f7f5f1)', borderRadius: 14,
          border: '1px solid var(--card-border, #e5e7eb)', padding: '22px 24px',
        }}>
          <h2 style={{
            fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--text-secondary)', margin: '0 0 12px',
          }}>
            Why trust this byline
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {author.credentials.map((c) => (
              <li key={c} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section pad="24px 24px 80px" width={820}>
        <SectionHeader
          label="Articles"
          title={`${posts.length} ${posts.length === 1 ? 'article' : 'articles'} by ${author.name}`}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{
                display: 'block', textDecoration: 'none',
                background: '#fff', borderRadius: 12, padding: '18px 20px',
                border: '1px solid var(--card-border, #e5e7eb)',
              }}
            >
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center',
                fontSize: 11.5, color: 'var(--text-muted, #94a3b8)', marginBottom: 6,
              }}>
                <span style={{ fontWeight: 700, color: 'var(--brand, #6366f1)' }}>{post.tag}</span>
                <span>{formatDate(post.date)}</span>
                <span>{post.readTime}</span>
              </div>
              <h3 style={{
                fontSize: 16.5, fontWeight: 700, color: 'var(--text-primary)',
                margin: '0 0 6px', lineHeight: 1.4,
              }}>
                {post.title}
              </h3>
              <p style={{
                fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0,
              }}>
                {post.description}
              </p>
            </Link>
          ))}
        </div>
      </Section>
    </SeoLayout>
  );
}
