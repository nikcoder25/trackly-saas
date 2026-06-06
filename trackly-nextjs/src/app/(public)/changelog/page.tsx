import type { Metadata } from 'next';
import { Rocket, ShieldCheck, Cpu, BarChart3, Globe, Zap, FileText } from 'lucide-react';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Livesov Changelog | Product Updates & Features',
  description: 'Latest Livesov updates: new AI platforms, features, and improvements shipped to the AI visibility tracker.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Livesov Changelog | Product Updates & Features',
    description: 'Latest Livesov updates: new AI platforms, features, and improvements shipped to the AI visibility tracker.',
    url: 'https://livesov.com/changelog',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Changelog - What\'s New | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov Changelog | Product Updates & Features',
    description: 'Latest Livesov updates: new AI platforms, features, and improvements shipped to the AI visibility tracker.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function ChangelogPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Changelog', url: '/changelog' }]} />
      <SeoHero
        title="Changelog"
        subtitle="Track every improvement, new feature, and bug fix we ship."
      />
      <div className="max-w-3xl mx-auto px-6 pb-16 space-y-8">
        <div className="border-l-2 border-[var(--brand)] pl-6">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-[var(--brand)]" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">March 2026</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Next.js Migration</h3>
          <p className="text-gray-500 text-sm mt-1">Migrated from Express to Next.js for improved SSR, SEO, and performance. All existing features preserved with the same database.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">February 2026</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Accuracy Monitor</h3>
          <p className="text-gray-500 text-sm mt-1">Detect AI hallucinations about your brand with our canonical fact store. Set known facts and automatically flag incorrect AI responses.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">January 2026</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">5-Platform Support</h3>
          <p className="text-gray-500 text-sm mt-1">Added Grok (xAI) tracking, completing support for all 5 major AI platforms: ChatGPT, Claude, Gemini, Perplexity, and Grok.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">December 2025</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">GEO Audit Tool</h3>
          <p className="text-gray-500 text-sm mt-1">Launched the free GEO Audit tool - paste any URL and get an AI-readiness score with actionable recommendations in seconds.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">November 2025</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Share of Voice Dashboard</h3>
          <p className="text-gray-500 text-sm mt-1">New Share of Voice dashboard showing your brand mention percentage vs competitors across all tracked AI platforms over time.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">October 2025</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Scheduled Runs & Alerts</h3>
          <p className="text-gray-500 text-sm mt-1">Set up automated brand tracking on a schedule - daily, every 3 days, or weekly. Get email alerts when your visibility changes significantly.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">September 2025</p>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Evidence Export & Proof</h3>
          <p className="text-gray-500 text-sm mt-1">Export full AI responses as CSV reports with timestamps. Share verifiable proof of brand mentions with clients and stakeholders.</p>
        </div>
      </div>
    </SeoLayout>
  );
}
