import Nav from './_components/Nav';
import Hero from './_components/Hero';
import Logos from './_components/Logos';
import BuyersAskAI from './_components/BuyersAskAI';
import BrandMentions from './_components/BrandMentions';
import QueryTracking from './_components/QueryTracking';
import Features from './_components/Features';
import Stats from './_components/Stats';
import Audience from './_components/Audience';
import HowItWorks from './_components/HowItWorks';
import Comparison from './_components/Comparison';
import Pricing from './_components/Pricing';
import Testimonials from './_components/Testimonials';
import FAQ from './_components/FAQ';
import CTABanner from './_components/CTABanner';
import Footer from './_components/Footer';

export default function HomePage() {
  return (
    <div id="hp-root">
      <a href="#hp-main" className="skip-to-content">Skip to content</a>
      <Nav />
      <main id="hp-main">
        <Hero />
        <Logos />
        <BuyersAskAI />
        <BrandMentions />
        <QueryTracking />
        <Features />
        <Stats />
        <Audience />
        <HowItWorks />
        <Comparison />
        <Pricing />
        <Testimonials />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
