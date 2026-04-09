'use client';

export default function AdminBackendError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--red)' }}>Something went wrong</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{error.message || 'An unexpected error occurred in the admin panel.'}</p>
      <button
        onClick={reset}
        style={{ padding: '0.5rem 1.5rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Try Again
      </button>
    </div>
  );
}
