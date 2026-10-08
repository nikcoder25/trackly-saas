# SEO audit fixes (8 Oct 2026)

## Done in code

- 301: `/chatgpt|perplexity|claude|gemini|grok-brand-tracking` to the matching `/x-rank-tracker`. Pages deleted, all internal links moved.
- 301: two duplicate Perplexity blogs merged into `/blog/how-to-track-brand-mentions-in-perplexity`.
- Noindex + out of sitemap: 30 glossary term pages (hub `/glossary` stays) and all case studies (hub too). Case studies removed from nav and footer.
- Homepage: title, meta and JSON-LD now actually render on `/` (they only reached `/home` before). New title "AI Visibility Tracker for Agencies | ChatGPT & Gemini | Livesov", H1 "AI Visibility Tracker for Agencies".
- `/geo-audit` retargeted to "AI Visibility Checker". Copy is honest: it scores a page for citation readiness, it does not query the AI engines.
- `/solutions/agencies` retargeted to "AI Visibility Tool for Agencies". `/tools/nap-verification` now targets "NAP audit".
- New pages: `/ai-overview-tracker`, `/uses`, `/uses/ai-visibility-for-local-businesses`, `/uses/white-label-ai-visibility-report`, `/uses/ai-visibility-for-hvac-companies`.
- Real dashboard screenshot on rank tracker, alternative, agencies, GEO tool, AI visibility checker and new pages.
- Long titles and metas fixed site wide.
- Disavow file: `docs/seo/disavow-livesov.txt` (707 domains).

## You must do (needs your logins)

1. **Disavow**: upload `docs/seo/disavow-livesov.txt` at https://search.google.com/search-console/disavow-links. Also Bing Webmaster Tools.
2. **Spam source**: nothing in this codebase creates those links. The admin backlink tool only writes articles, it never posts them. The pattern (`backlinksgenerator.space`, `dachecker...`) is a known network that makes a page for every domain typed into their "free backlink generator" / "DA checker". Do not enter livesov.com into those tools, and cancel any "high DA backlinks" package. Re-export new domains monthly and add them to the file.
3. **GSC Pages report**: count "Crawled, currently not indexed".
4. **Request indexing** in this order: `/`, `/pricing`, `/solutions/agencies`, `/geo-audit`, `/ai-overview-tracker`, `/uses/white-label-ai-visibility-report`, `/uses/ai-visibility-for-local-businesses`, `/chatgpt-rank-tracker`, `/perplexity-rank-tracker`, `/gemini-rank-tracker`, `/claude-rank-tracker`, `/grok-rank-tracker`, `/llm-rank-tracker`, `/peec-ai-alternative`.
5. **Resubmit sitemap** in GSC after deploy.
6. **Stop new informational blogs.** Put the effort into BOFU pages (next: plumbers, roofers, dentists, law firms on the HVAC template).
7. **Link plan** (workbook "Link Plan" tab): directories, launch sites, expert quotes, podcasts.
