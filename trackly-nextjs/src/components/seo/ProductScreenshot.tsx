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
    <figure className="ls-figure">
      <div className="ls-figure-frame">
        <Image
          src="/dashboard-shot.png"
          alt={alt}
          width={924}
          height={540}
          priority={priority}
          sizes="(max-width: 1000px) 100vw, 976px"
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
