import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO | Livesov',
  description: 'Compare Livesov and Semrush. Livesov tracks AI visibility (ChatGPT, Claude, Gemini). Semrush tracks traditional Google SEO. Use both for complete coverage.',
  keywords: 'livesov vs semrush, ai seo tool, chatgpt tracking vs semrush, ai visibility tool comparison',
  alternates: { canonical: '/vs/semrush' },
  openGraph: {
    title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO | Livesov',
    description: 'Compare Livesov and Semrush. Livesov tracks AI visibility (ChatGPT, Claude, Gemini). Semrush tracks traditional Google SEO. Use both for complete coverage.',
    url: 'https://livesov.com/vs/semrush',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov vs Semrush — AI Visibility vs Traditional SEO | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO | Livesov',
    description: 'Compare Livesov and Semrush. Livesov tracks AI visibility (ChatGPT, Claude, Gemini). Semrush tracks traditional Google SEO. Use both for complete coverage.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function VsSemrushPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Semrush', url: '/vs/semrush' }]} />
      <SeoHero
        title={<>Livesov vs <span className="text-[var(--brand)]">Semrush</span></>}
        subtitle="Different tools for different problems. Livesov tracks AI visibility. Semrush tracks traditional search. Here's how they compare."
      />
      <SeoContent>
        <h2>The Key Difference</h2>
        <p>Semrush is a comprehensive traditional SEO suite — it tracks Google rankings, backlinks, keyword difficulty, and paid ads. Livesov is purpose-built for AI visibility — tracking how ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews mention and recommend your brand.</p>

        <h2>When to Use Livesov</h2>
        <ul>
          <li>Track brand mentions across 6 AI platforms simultaneously</li>
          <li>Monitor share of voice in AI-generated recommendations</li>
          <li>Detect AI hallucinations about your brand</li>
          <li>Analyze competitor visibility in AI responses</li>
          <li>Track citation sources that AI platforms reference</li>
        </ul>

        <h2>When to Use Semrush</h2>
        <ul>
          <li>Track Google search rankings and keyword positions</li>
          <li>Analyze backlink profiles and domain authority</li>
          <li>Research keywords and search volume</li>
          <li>Monitor paid advertising campaigns</li>
          <li>Audit website technical SEO</li>
        </ul>

        <h2>Use Both Together</h2>
        <p>The best strategy combines both tools. Use Semrush for traditional SEO and Livesov for AI visibility. Together, they give you complete coverage across both search paradigms.</p>
      </SeoContent>
    </SeoLayout>
  );
}
