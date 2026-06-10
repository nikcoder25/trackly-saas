# Livesov Growth Action Plan — Items Needing Your Decision

**Date:** June 10, 2026
**Context:** Companion to the competitive/growth research (see PR #629 audit report and the chat research summary). The code-level items (tool email capture, comparison pages, FAQ schema, case-study disclosures, sitemap) are already implemented. Everything below requires a business decision, an external account, or content only you can approve — ordered by expected impact.

---

## 1. Pricing — you are 3–10x below the market (HIGH IMPACT, decision only)

Current: Free $0 / Starter $9 / Pro $29 / Agency $89. The market (June 2026):

| Competitor | Entry plan | Mid plan |
|---|---|---|
| Otterly | $29/mo (~10 prompts) | $189/mo |
| Profound | $99/mo (ChatGPT-only) | $399/mo |
| Peec AI | ~$100/mo + per-platform add-ons | ~$241/mo |
| Knowatoa | $59/mo | $199/mo |
| Trakkr | $79/mo | $399/mo |
| AthenaHQ | $295/mo | ~$545/mo |

Livesov includes all 5 LLMs on every plan — something Peec charges add-ons for and Profound locks behind $399/mo. At $9, buyers may read the product as a toy, and each customer's AI API costs eat the margin.

**Suggested move (decide, then I can implement):** Starter $29 / Pro $79 / Agency $149–199, grandfather existing customers, keep the free tier as the acquisition wedge. Expected effect: 3–5x revenue per customer with the same traffic. Requires: your sign-off, new DodoPayments products, pricing-page + plan-config updates (I can do the code).

## 2. Get listed on G2, Capterra, and Product Hunt (HIGH IMPACT, ~2-4 hours)

You currently have zero third-party review presence. Research found G2 pages are themselves cited by ChatGPT/Perplexity when people ask "best AI visibility tool" — so this is simultaneously social proof AND a GEO play for your own product category. Otterly's growth leaned heavily on G2 High Performer badges.

- Create vendor profiles on G2 and Capterra (free), category: Answer Engine Optimization / SEO software.
- Ask your existing paid users for reviews (email + in-app prompt; 10–15 reviews gets you category visibility).
- Plan a Product Hunt launch — competitors in this niche got meaningful signup spikes from it.
- Once live, I can add the badges to the marketing site.

## 3. Replace the illustrative case studies with real ones (HIGH IMPACT for conversion + risk removal)

I've labeled the current five case studies as illustrative scenarios (they used fictional brands and invented quotes presented as real — an FTC/trust risk that's now disclosed). The permanent fix: 2–3 real customer stories, even small ones. A real "$2k MRR agency grew client mentions 3x" beats a fictional Fortune-500-style story. Needs: customer outreach + permission. Also verify the mention-rate figures on the `/best/*` pages come from actual product runs — if those are invented too, they need the same treatment (tell me and I'll label them).

## 4. Publish a quarterly "State of AI Search" report from your own product data (HIGHEST organic-traffic leverage)

This is the single most-proven link magnet in your niche (Semrush's 10M-keyword AI Overviews study, AthenaHQ's State of AI Search, Profound's citation research are the most-cited assets in the category; original-research pages average +42% backlink growth). You're sitting on the raw material: millions of logged AI responses across 5 platforms.

Outline I'd suggest: mention-rate benchmarks by industry, which platforms agree/disagree on recommendations, citation source distribution (which domains LLMs cite), hallucination rate per platform, quarter-over-quarter movement. Needs: your decision on what aggregate data is OK to publish + a few hours of analysis. I can build the page template and charts when you say go.

## 5. Trial email sequence (MEDIUM-HIGH, needs copy approval + Resend config)

Benchmarks: automated behavioral trial sequences lift trial→paid 20–28%; behavioral triggers beat time-based drips 3–4x. For your 7-day trial: Day 0 welcome + "add your brand now", Day 1 "your first results are in" (triggered on first run), Day 3 tip + comparison vs competitors, Day 5 social proof + annual-discount mention, Day 7 trial-ends + one-click upgrade. Needs: RESEND_AUDIENCE_ID / email infra confirmed in production, and your approval of copy. I can write the sequence and the trigger code next session.

## 6. Show new users their own data during onboarding (MEDIUM-HIGH, product change)

Personalized onboarding lifts activation 30–50%; the single best activation event for a tracking tool is "here's your brand's actual mention rate" on day one. Today, signup → empty dashboard → user must configure everything. Consider: run a small free check automatically during signup using the brand name/domain they enter (the /api/free-check engine already exists). Needs: your call on credit cost per signup + UX. I can implement once you decide.

## 7. YouTube + Reddit presence (MEDIUM, ongoing founder effort)

Ahrefs' 75k-brand study: YouTube mentions are the #1 correlate of AI visibility (0.737 — stronger than backlinks at 0.218). Even 5–10 simple videos (tool demos, "how to check if ChatGPT recommends you") help both YouTube SEO and your own LLM citations. Reddit: authentic participation in r/SEO, r/bigseo, r/marketing — LLMs cite threads with <20 upvotes, no virality needed. This cannot be automated credibly; it needs you or a team member.

## 8. Listicle & community outreach (MEDIUM, ongoing)

The pages LLMs cite for "best AI visibility tool" are third-party listicles (Amplitude's comparison hub, Zapier's "best AI visibility tools", Rankability's tools roundup, llmrefs.com's 200-tool index, plus a dozen consultant blogs). Getting Livesov added to even 5 of these directly feeds ChatGPT's training/retrieval for your category. Also: the Wikipedia "Generative engine optimization" article exists — a citation from your statistics page there is high-value if it sticks. Needs: outreach emails from a real person (templates available on request).

## 9. Paid spend (LOW priority until the above land)

Your conversion funnel improvements (#1, #5, #6) should land before buying traffic, otherwise you pay to fill a leaky funnel. When ready: the highest-intent cheap keywords in this niche are long-tail ("check if chatgpt recommends my brand", "[competitor] alternative") — the new /vs pages are the natural landing pages.

---

## Already done in code (this branch)

- Email capture on all 7 free tools that lacked it (newsletter signup with per-tool source tagging, post-result placement per the research's "instant value first, ask second" pattern)
- Comparison pages: /vs/otterly, /vs/profound, /vs/peec-ai (honest, dated competitor claims), linked from the footer and sitemap
- FAQPage schema on the pricing page (the shared FAQ component already emits it elsewhere)
- Case-study pages relabeled as illustrative scenarios (hub headline, metadata, per-page disclosure)
