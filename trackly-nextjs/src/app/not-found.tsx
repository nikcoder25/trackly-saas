import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';

export default function NotFound() {
  return (
    <SeoLayout>
      <section className="py-24 px-6 text-center" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 className="text-8xl font-extrabold tracking-tight" style={{ color: '#6366f1', lineHeight: 1 }}>404</h1>
        <h2 className="text-2xl font-bold mt-4 mb-2" style={{ color: '#0f172a' }}>Page not found</h2>
        <p className="text-base mb-8" style={{ color: '#64748b', maxWidth: 440 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/"
            className="land-btn land-btn-ghost"
            style={{ padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
          >
            Go Home
          </Link>
          <Link
            href="/signup"
            className="land-btn land-btn-primary"
            style={{ padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
          >
            Start Tracking
          </Link>
        </div>
      </section>
    </SeoLayout>
  );
}
