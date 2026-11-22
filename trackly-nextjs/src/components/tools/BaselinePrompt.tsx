import Link from 'next/link';

/**
 * Shown under a free page score: the score is a one-off here, but a signed-in
 * audit saves it as the "before" score and compares every later re-check.
 */
export default function BaselinePrompt({ score }: { score: number }) {
  return (
    <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe', fontSize: 14, color: '#374151', textAlign: 'left' }}>
      <strong>Make {score} your &quot;before&quot; score.</strong>{' '}
      With a free Livesov account this score is saved as your baseline. Re-check the page after your AI SEO work and see the before and after side by side.{' '}
      <Link href="/signup" style={{ color: 'var(--brand)', fontWeight: 700 }}>Save my baseline</Link>
    </div>
  );
}
