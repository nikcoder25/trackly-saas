import Image from 'next/image';

/**
 * Real Livesov dashboard screenshot for money pages, so a searcher sees the
 * product straight away. Pass the page's main keyword as `alt` (Google reads
 * the first image's alt as a relevance hint).
 */
export default function ProductScreenshot({
  alt,
  caption,
  priority = false,
}: {
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure style={{ maxWidth: 924, margin: '0 auto', padding: '0 24px' }}>
      <Image
        src="/dashboard-shot.png"
        alt={alt}
        width={924}
        height={540}
        priority={priority}
        sizes="(max-width: 972px) 100vw, 924px"
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: 14,
          border: '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
        }}
      />
      {caption && (
        <figcaption style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b7280)', marginTop: 10 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
