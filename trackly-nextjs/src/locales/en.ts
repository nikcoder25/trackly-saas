const en = {
  // Navigation
  nav: {
    features: 'Features',
    howItWorks: 'How it Works',
    pricing: 'Pricing',
    useCases: 'Use Cases',
    faq: 'FAQ',
    login: 'Login',
    getStarted: 'Get Started',
  },

  // Hero
  hero: {
    badge: 'AI Visibility Tracker',
    title: 'Is your brand visible in ',
    titleHighlight: 'AI answers?',
    description: 'Track how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Get real proof, measure share of voice, and optimize your GEO strategy.',
    cta: 'Start Tracking',
    ctaDemo: 'See Demo',
  },

  // Social Proof
  socialProof: {
    brandsTracked: 'Brands tracked',
    aiPlatforms: 'AI platforms',
    queriesRun: 'Queries run',
    liveResults: 'Live results',
  },

  // Demo
  demo: {
    query: 'QUERY: "Best HVAC company in Austin TX"',
    mentioned: 'MENTIONED',
    notFound: 'NOT FOUND',
    tryIt: 'Try It With Your Brand',
    plansStart: 'Plans start at just $9/mo',
    chatgptResponse: 'Based on available information, <mark>CoolAir Pro</mark> is a well-regarded HVAC provider in Austin TX. Customers frequently praise them for responsive service and transparent pricing...',
    perplexityResponse: '<mark>CoolAir Pro</mark> is a leading HVAC company in Austin TX [1]. Reviews highlight professional technicians and fair pricing [2]. Compared to other providers, they consistently score higher...',
    claudeResponse: 'I can share what I know about <mark>CoolAir Pro</mark> as an HVAC provider in Austin TX. They\'ve developed a solid reputation for professional service and customer transparency...',
    geminiResponse: '<mark>CoolAir Pro</mark> is an HVAC provider in Austin TX with consistent 4+ star ratings. Professional, licensed team. Transparent pricing. Strong local reputation...',
    grokResponse: 'For HVAC in Austin TX, I\'d recommend checking out AC Express, Stan\'s Heating, and Green Leaf Air. They all have solid reviews and competitive pricing in that area...',
  },

  // Features
  features: {
    label: 'Features',
    title: 'Everything you need to track AI visibility',
    subtitle: 'Monitor your brand across all major AI platforms in one dashboard.',
    items: [
      { title: '5 AI Platforms', desc: 'Track mentions on ChatGPT, Perplexity, Claude, Gemini, and Grok \u2014 all from one place.', icon: '\u25CE' },
      { title: 'Evidence & Proof', desc: 'Get full AI responses saved as proof. Share with clients, export to CSV, and build trust with real evidence.', icon: '\u25C6' },
      { title: 'Share of Voice', desc: 'Measure what percentage of AI responses mention your brand vs competitors across platforms.', icon: '\u25CB' },
      { title: 'Sentiment Analysis', desc: 'Know whether AI is recommending your brand positively, negatively, or neutrally.', icon: '\u26A1' },
      { title: 'Custom Queries', desc: 'Define the exact questions your customers ask. Track performance per query and per platform.', icon: '\u2699' },
      { title: 'Competitor Tracking', desc: 'Add competitors to see how they appear in AI responses alongside your brand.', icon: '\u2B21' },
      { title: 'Scheduled Runs', desc: 'Set up automated daily or weekly tracking. Get notified when your AI visibility changes with webhooks.', icon: '\u25D4' },
    ],
  },

  // How it Works
  howItWorks: {
    label: 'How it works',
    title: 'Start tracking in 3 steps',
    subtitle: 'Set up in under 2 minutes. Plans start at $9/mo.',
    steps: [
      { num: '01', title: 'Add Your Brand', desc: 'Enter your brand name, industry, and location. We generate smart default queries for you.' },
      { num: '02', title: 'Automatic Tracking', desc: 'We automatically query all 5 AI platforms with your custom questions on a daily schedule. Results appear in your dashboard.' },
      { num: '03', title: 'Analyze & Report', desc: 'See exactly what each AI says about your brand. Track trends over time, export proof as CSV, and share reports with clients.' },
    ],
  },

  // Pricing
  pricing: {
    label: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'Simple plans that scale with you. Best value in AI visibility tracking.',
    mostPopular: 'MOST POPULAR',
    getStarted: 'Get Started',
    startPro: 'Start Pro',
    startAgency: 'Start Agency',
    contactSales: 'Contact Sales',
    perMonth: '/mo',
    plans: [
      {
        name: 'Starter', price: '$9', sub: 'Perfect for getting started',
        features: ['30 prompts/month', '1 brand', '2 AI platforms', 'Every 3 days schedule', 'SOV tracking & export'],
      },
      {
        name: 'Pro', price: '$29', sub: 'For growing businesses', featured: true,
        features: ['250 prompts/month', '5 brands', 'All 5 AI platforms', 'Daily schedule', 'Competitor tracking (5)', 'Sentiment analysis', 'Email alerts'],
      },
      {
        name: 'Agency', price: '$89', sub: 'For agencies & teams',
        features: ['1,000 prompts/month', '20 brands', 'All 5 AI platforms', '6-hour schedule', 'Competitor tracking (20)', 'Team collaboration', 'Priority support'],
      },
    ],
    comparison: {
      title: 'How Livesov compares',
      subtitle: 'More platforms, better pricing, lowest starting price.',
      headers: ['Feature', 'Livesov', 'Otterly.ai', 'Peec AI', 'Knowatoa'],
      rows: [
        ['Lowest Plan', '\u2713 $9/mo', '\u2717 Trial only', '\u2717 No', 'Audit only'],
        ['AI Platforms', '5 platforms', '4 (+add-ons)', '3', '5'],
        ['Starting Price', '$9/mo', '$29/mo', '$89/mo', '$59/mo'],
        ['Sentiment Analysis', '\u2713 From $29', '\u2717 No', '$199+/mo', '\u2713 Yes'],
        ['Competitor Tracking', '\u2713 From $29', '\u2713 Yes', '\u2713 Yes', '\u2713 Yes'],
        ['30-prompt plan', '$9/mo', '$189/mo', '$199/mo', 'Custom'],
        ['150-prompt plan', '$29/mo', '$189/mo', '$399/mo', 'Custom'],
      ],
      disclaimer: 'Competitor pricing sourced from public websites as of March 2026. Prices may have changed.',
    },
  },

  // Why AI Visibility
  whyAI: {
    label: 'Why it matters',
    title: 'Why AI Visibility is the New SEO',
    subtitle: 'AI chatbots are becoming the #1 way people discover brands. If you\'re not visible, you\'re invisible.',
    items: [
      { title: '40% of searches now use AI', desc: 'Users are shifting from Google to AI chatbots for recommendations. ChatGPT, Perplexity, and other AI platforms are replacing traditional search for buying decisions.', icon: '\u25B2' },
      { title: 'Traditional SEO isn\'t enough', desc: 'Ranking #1 on Google doesn\'t mean AI will recommend you. AI models pull from different signals \u2014 reviews, authority, content quality, and brand mentions across the web.', icon: '\u25CE' },
      { title: 'GEO is the future of marketing', desc: 'Generative Engine Optimization (GEO) is how brands ensure they appear in AI-generated answers. Livesov gives you the data to measure and improve your GEO strategy.', icon: '\u25C6' },
      { title: 'Proof for your clients', desc: 'If you\'re an agency or SEO consultant, Livesov provides verifiable evidence of AI visibility \u2014 real API responses, not screenshots. Export proof as CSV reports.', icon: '\u25A0' },
    ],
  },

  // Use Cases
  useCases: {
    label: 'Use cases',
    title: 'Who uses Livesov?',
    subtitle: 'From local businesses to enterprise agencies.',
    items: [
      { title: 'Local Businesses', desc: 'HVAC, plumbers, dentists, lawyers \u2014 track if AI recommends your business when locals ask for services in your area.', icon: '\u25CB' },
      { title: 'SEO Agencies', desc: 'Offer AI visibility tracking as a service. Show clients real proof of their brand\'s presence across ChatGPT, Perplexity, and more.', icon: '\u25C8' },
      { title: 'SaaS & E-commerce', desc: 'Monitor if AI platforms recommend your product when users ask for solutions in your category. Track competitors too.', icon: '\u2B21' },
      { title: 'Marketing Teams', desc: 'Track brand perception across AI platforms. Measure the impact of PR campaigns and content strategies on AI recommendations.', icon: '\u25C6' },
      { title: 'Brand Managers', desc: 'Monitor brand sentiment in AI responses. Get alerts when AI platforms change how they describe or recommend your brand.', icon: '\u25CE' },
      { title: 'Consultants & Freelancers', desc: 'Offer AI visibility audits as a service. Use Livesov\'s proof exports to deliver data-backed reports to your clients.', icon: '\u26A1' },
    ],
  },

  // FAQ
  faq: {
    label: 'FAQ',
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know about AI visibility tracking.',
    items: [
      { q: 'What is AI visibility tracking?', a: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand when users ask questions. It helps you understand your brand\'s presence in AI-generated answers.' },
      { q: 'How does Livesov track brand mentions in AI?', a: 'Livesov sends your custom queries to real AI platforms via their official APIs and captures the complete, unmodified responses. It then analyzes each response to detect if your brand was mentioned, the sentiment, and whether your brand was recommended.' },
      { q: 'Which AI platforms does Livesov support?', a: 'Livesov tracks your brand across 5 AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, and Grok (xAI).' },
      { q: 'What is Share of Voice in AI?', a: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked. A higher SOV means AI platforms are more likely to recommend your brand to users.' },
      { q: 'What is Generative Engine Optimization (GEO)?', a: 'Generative Engine Optimization (GEO) is the practice of optimizing your brand\'s online presence to appear more frequently and positively in AI-generated answers. Unlike traditional SEO, GEO focuses on being mentioned and recommended by AI chatbots.' },
      { q: 'Can I use Livesov for client reporting?', a: 'Yes. Livesov saves complete AI responses as proof, which you can export as CSV reports. The Evidence & Proof section shows full AI responses with brand name highlighted, model used, and timestamp.' },
      { q: 'How much does Livesov cost?', a: 'Livesov starts at $9/mo with the Starter plan \u2014 1 brand, 2 AI platforms, and 30 prompts/month. Pro ($29/mo) and Agency ($89/mo) plans unlock more brands, platforms, and features.' },
      { q: 'How often does Livesov run queries?', a: 'Livesov supports daily automated tracking on all paid plans. You can also run queries manually at any time. Pro and Agency plans include scheduled runs with webhook notifications so you\'re alerted when your AI visibility changes.' },
      { q: 'How is Livesov different from traditional SEO tools?', a: 'Traditional SEO tools track your rankings on Google Search. Livesov tracks your visibility in AI-generated answers \u2014 a completely different channel. As more users shift to AI, tracking AI visibility becomes essential.' },
    ],
  },

  // Testimonials
  testimonials: {
    title: 'What Early Adopters Are Saying',
    subtitle: 'Real feedback from marketers, agency owners, and founders using Livesov.',
    items: [
      { text: '"We discovered that ChatGPT was consistently recommending a competitor we hadn\'t even considered. Once we saw the data, we adjusted our content strategy and started showing up within weeks."', name: 'S.K.', role: 'Marketing Director at a SaaS startup', initials: 'SK' },
      { text: '"Our agency needed a way to show clients their AI visibility without manually querying five different chatbots. Livesov replaced hours of manual checking with an actual dashboard and exportable proof."', name: 'M.R.', role: 'Founder of a boutique digital agency', initials: 'MR' },
      { text: '"As a solo founder, I had no idea whether AI platforms even knew my product existed. Turns out they didn\'t. Now I can track my progress as I work on improving it."', name: 'J.L.', role: 'Indie SaaS founder', initials: 'JL' },
    ],
  },

  // CTA
  cta: {
    title: 'Ready to track your AI visibility?',
    subtitle: 'Start monitoring your presence across AI platforms today.',
    button: 'Start Tracking',
    note: 'Plans start at just $9/mo. Set up in under 2 minutes.',
  },

  // Footer
  footer: {
    desc: 'AI Visibility Tracker \u2014 Track how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
    product: 'Product',
    resources: 'Resources',
    legal: 'Legal',
    links: {
      features: 'Features',
      pricing: 'Pricing',
      howItWorks: 'How it Works',
      useCases: 'Use Cases',
      integrations: 'Integrations',
      blog: 'Blog',
      geoGuide: 'GEO Guide',
      about: 'About',
      contact: 'Contact',
      changelog: 'Changelog',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      cookies: 'Cookie Policy',
    },
    copyright: 'Livesov. All rights reserved.',
  },

  // Auth
  auth: {
    login: 'Log In',
    signup: 'Sign Up',
    emailOrUsername: 'Email or Username',
    email: 'Email',
    password: 'Password',
    name: 'Name',
    forgotPassword: 'Forgot password?',
    backToLogin: 'Back to login',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    createAccount: 'Create Account',
    creatingAccount: 'Creating account...',
    resetPassword: 'Reset Password',
    sendResetLink: 'Send Reset Link',
    sending: 'Sending...',
    newPassword: 'New Password',
    setNewPassword: 'Set New Password',
    resetting: 'Resetting...',
    welcomeBack: 'Welcome back',
    signInToAccount: 'Sign in to your account',
    createYourAccount: 'Create your account',
    startTracking: 'Start tracking your AI visibility for free',
    emailVerified: 'Email verified successfully! You can now log in.',
    enterResetEmail: "Enter your email and we'll send you a reset link.",
    enterNewPassword: 'Enter your new password below.',
    twoFACode: 'Two-Factor Authentication Code',
    enterTotpCode: 'Enter the code from your authenticator app, or a backup code.',
    verify: 'Verify',
    continueWithGoogle: 'Continue with Google',
    or: 'or',
    brandPanel: {
      title: 'Track your brand\'s AI visibility',
      desc: 'See exactly how ChatGPT, Perplexity, Claude, Gemini, and other AI platforms mention your brand.',
      features: [
        { title: 'Real-time AI Monitoring', desc: 'Track mentions across 5 AI platforms with live query results' },
        { title: 'Share of Voice Analytics', desc: "Measure your brand's visibility vs competitors in AI responses" },
        { title: 'Evidence & Proof', desc: 'Get actual AI responses as proof of brand mentions' },
        { title: 'Automated Scheduled Runs', desc: 'Set up recurring checks and get notified of changes' },
      ],
      trusted: 'Built for brands and agencies tracking AI visibility',
    },
    backToHome: 'Back to home',
  },

  // Dashboard
  dashboard: {
    overview: 'Overview',
    mentions: 'Mentions',
    platforms: 'Platforms',
    trends: 'Trends',
    competitors: 'Competitors',
    analytics: 'Analytics',
    brandSetup: 'Brand Setup',
    alerts: 'Alerts',
    billing: 'Billing',
    account: 'Account',
    signOut: 'Sign out',
    welcomeBack: 'Welcome back',
    aiOverview: "Here's your AI visibility overview",
    brands: 'Brands',
    activeBrands: 'Active brands',
    shareOfVoice: 'Share of Voice',
    avgAcross: 'Avg across platforms',
    mentionsLabel: 'Mentions',
    latestRun: 'Latest run',
    queries: 'Queries',
    usedThisMonth: 'Used this month',
    verifyEmail: 'Verify email',
  },

  // Language
  language: {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    hi: 'Hindi',
  },
};

export default en;
export type Translations = typeof en;
