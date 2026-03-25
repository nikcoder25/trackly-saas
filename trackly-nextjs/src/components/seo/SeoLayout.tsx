import Link from 'next/link';

interface SeoLayoutProps {
  children: React.ReactNode;
}

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/chatgpt-brand-tracking', label: 'ChatGPT Tracking' },
  { href: '/perplexity-brand-tracking', label: 'Perplexity Tracking' },
  { href: '/gemini-brand-tracking', label: 'Gemini Tracking' },
  { href: '/claude-brand-tracking', label: 'Claude Tracking' },
  { href: '/grok-brand-tracking', label: 'Grok Tracking' },
  { href: '/geo-optimization', label: 'GEO Guide' },
  { href: '/vs/semrush', label: 'vs Semrush' },
  { href: '/vs/ahrefs', label: 'vs Ahrefs' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export default function SeoLayout({ children }: SeoLayoutProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-gray-900 no-underline">
            Live<span className="text-[#FF6154]">sov</span>
          </Link>
          <div className="hidden md:flex gap-7 ml-10">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline transition">
                {link.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto">
            <Link href="/signup" className="bg-[#FF6154] hover:bg-[#e8503f] text-white px-6 py-2.5 rounded-lg text-sm font-bold no-underline transition shadow-sm">
              Start Tracking Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main>{children}</main>

      {/* CTA */}
      <section className="bg-gray-50 border-t border-gray-200 py-16 text-center px-6">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Ready to track your AI visibility?</h2>
        <p className="text-gray-500 mb-6">Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</p>
        <Link href="/signup" className="inline-block bg-[#FF6154] hover:bg-[#e8503f] text-white px-9 py-3.5 rounded-lg text-base font-bold no-underline transition shadow-sm">
          Get Started Free
        </Link>
        <p className="text-xs text-gray-400 mt-3">No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-6">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} Livesov — AI Visibility Tracker</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-xs text-gray-400 hover:text-gray-700 no-underline transition">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SeoHero({ title, subtitle }: { title: React.ReactNode; subtitle: string }) {
  return (
    <section className="text-center py-20 px-6 max-w-3xl mx-auto">
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-5">{title}</h1>
      <p className="text-lg text-gray-500 leading-relaxed mb-8">{subtitle}</p>
      <Link href="/signup" className="inline-block bg-[#FF6154] hover:bg-[#e8503f] text-white px-9 py-3.5 rounded-lg text-base font-bold no-underline transition shadow-sm">
        Start Tracking Free
      </Link>
    </section>
  );
}

export function SeoContent({ children }: { children: React.ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-6 pb-16 prose prose-gray prose-headings:tracking-tight prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-bold prose-p:text-gray-500 prose-p:leading-relaxed prose-li:text-gray-500">
      {children}
    </article>
  );
}
