import Link from 'next/link';
import { PLATFORM_COLORS } from '@/lib/constants';

export default function HomePage() {
  const platforms = Object.entries(PLATFORM_COLORS);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Livesov
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-[var(--text-muted)] hover:text-white transition">
              Log in
            </Link>
            <Link href="/signup" className="text-sm bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded-lg transition">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[var(--bg3)] text-[var(--text-muted)] text-xs px-3 py-1.5 rounded-full mb-6 border border-[var(--border)]">
            <span className="w-2 h-2 bg-[var(--green)] rounded-full animate-pulse" />
            Tracking 5 AI platforms in real-time
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
            Track Your Brand Across{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[#06b6d4]">
              AI Platforms
            </span>
          </h1>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto mb-10">
            Monitor how ChatGPT, Claude, Gemini, Perplexity & Grok mention your brand.
            Track share of voice, detect hallucinations, and optimize your AI visibility.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-8 py-3 rounded-lg font-medium transition text-lg">
              Start Free Trial
            </Link>
            <Link href="/how-it-works" className="bg-[var(--bg3)] hover:bg-[var(--bg4)] text-white px-8 py-3 rounded-lg font-medium transition text-lg border border-[var(--border)]">
              How It Works
            </Link>
          </div>

          {/* Platform badges */}
          <div className="flex flex-wrap justify-center gap-3 mt-12">
            {platforms.map(([name, color]) => (
              <div key={name} className="flex items-center gap-2 bg-[var(--bg2)] px-4 py-2 rounded-full border border-[var(--border)]">
                <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-sm text-[var(--text-muted)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Everything you need to dominate AI visibility</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Share of Voice', desc: 'Track how often AI recommends your brand vs competitors across all platforms.', icon: '📊' },
              { title: 'Real-time Monitoring', desc: 'Stream live queries and see results as they come in from each AI platform.', icon: '⚡' },
              { title: 'Hallucination Detection', desc: 'Detect when AI generates incorrect information about your brand.', icon: '🔍' },
              { title: 'Citation Tracking', desc: 'See which sources AI cites when mentioning your brand.', icon: '📝' },
              { title: 'Competitor Analysis', desc: 'Monitor competitor mentions and co-occurrence patterns.', icon: '🏆' },
              { title: 'AI Recommendations', desc: 'Get actionable insights to improve your AI visibility.', icon: '💡' },
            ].map((f) => (
              <div key={f.title} className="bg-[var(--bg2)] p-6 rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/30 transition">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--text-muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[var(--border)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to track your AI visibility?</h2>
          <p className="text-[var(--text-muted)] mb-8">Start monitoring your brand across all major AI platforms in minutes.</p>
          <Link href="/signup" className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-8 py-3 rounded-lg font-medium transition text-lg">
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-sm text-[var(--text-muted)]">&copy; {new Date().getFullYear()} Livesov. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-sm text-[var(--text-muted)] hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="text-sm text-[var(--text-muted)] hover:text-white transition">Terms</Link>
            <Link href="/contact" className="text-sm text-[var(--text-muted)] hover:text-white transition">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
