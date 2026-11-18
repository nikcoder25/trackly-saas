# User stories from bug-fix PRs (last 6 months)

200 stories. Each one is something a user expects, picked because a recent bug-fix PR touched it and the same class of bug could come back. Every story has an automated check in `tests/e2e-stories/`.

## Auth

| ID | Story | PRs |
|---|---|---|
| AUTH-01 | As a user, I can sign in and get secure, HttpOnly session cookies | #765 #814 |
| AUTH-02 | As a user, a wrong password and an unknown email give the same generic error | #771 |
| AUTH-03 | As a scanner hitting /api/auth/login with junk, I get a 400 not a 500 | #743 #771 |
| AUTH-04 | As a scanner hitting /api/auth/register with junk, I get a 400 not a 500 | #743 |
| AUTH-05 | As a scanner hitting /api/auth/forgot-password with junk, I get a 4xx not a 500 | #743 |
| AUTH-06 | As a user, I can sign in with my username instead of my email | #771 |
| AUTH-07 | As a user, my email is matched case-insensitively on sign-in | #771 |
| AUTH-08 | As a security owner, 5 wrong passwords lock the account even with the right one after | #681 #771 |
| AUTH-09 | As a user, a successful sign-in resets my failed-attempt counter | #771 |
| AUTH-10 | As a signed-out visitor, /api/auth/me tells me 401 | #765 |
| AUTH-11 | As a user with many tabs, 20 quick /api/auth/me calls never bounce me to login (no 429) | #765 |
| AUTH-12 | As a security owner, password guessing is still rate-limited per IP on /api/auth/login | #765 |
| AUTH-13 | As a user, signing out invalidates my session token immediately | #814 |
| AUTH-14 | As a user, changing my password signs out my other browsers at once | #814 |
| AUTH-15 | As a user, a wrong current password does not change my password | #814 |
| AUTH-16 | As a user, revoking a session from Account kills that session right away | #814 |
| AUTH-17 | As a security owner, a forged alg=none token is rejected | #814 |
| AUTH-18 | As a security owner, a signed-in POST without the CSRF token is blocked | #720 |
| AUTH-19 | As a security owner, a cross-origin POST is blocked | #720 |
| AUTH-20 | As a security owner, a state-changing request with no Origin or Referer is refused in production | #720 |
| AUTH-21 | As a security owner, the cron secret is not accepted from the query string | #740 #765 |
| AUTH-22 | As a user, /api/auth/refresh with no refresh cookie is a clean 4xx, not 500 | #765 |
| AUTH-23 | As a user, my username change rejects HTML/script characters | #790 |
| AUTH-24 | As a user, deleting my account without my password is refused and says why | #771 |
| AUTH-25 | As a user, 2FA status is reported off for a fresh account | #765 |
| AUTH-26 | As a visitor, an invalid email-verify token gives a friendly 4xx, not a crash | #652 |
| AUTH-27 | As a visitor, registering an email that already exists does not 500 | #771 |
| AUTH-28 | As a visitor, registering with a too-short password is rejected | #771 |
| AUTH-29 | As an unverified user, I cannot read brand data until I verify my email | #765 |

## Brands

| ID | Story | PRs |
|---|---|---|
| BRAND-01 | As an owner, my brand list shows only my brands | #800 |
| BRAND-02 | As a stranger, I cannot read another account's brand | #815 |
| BRAND-03 | As a stranger, I cannot edit another account's brand | #771 |
| BRAND-04 | As a stranger, I cannot start a scan on another account's brand | #815 |
| BRAND-05 | As an owner, saving a brand with non-array prompts is rejected | #771 |
| BRAND-06 | As an owner, the brand list ships at most 10 runs and no raw AI answers | #790 |
| BRAND-07 | As a free user at my brand limit, I cannot add another brand | #628 #771 |
| BRAND-08 | As an owner, creating a brand with a malformed body gives 400 not 500 | #743 |
| BRAND-09 | As an owner, opening a brand that does not exist gives 404 | #765 |
| BRAND-10 | As an owner, the competitor analysis endpoint loads instead of 500ing | #765 |
| BRAND-11 | As an owner, the scan cost estimate counts my real prompt list | #807 |
| BRAND-12 | As an owner, I can export my brand data, and a stranger cannot | #815 |
| BRAND-13 | As a stranger, I cannot force-release another account's run lock | #740 |
| BRAND-14 | As a team viewer, I can see the owner's brand but not edit it | #771 |
| BRAND-15 | As a team viewer, I cannot start a scan | #771 |
| BRAND-16 | As an owner, a team member's save never writes shared/teamRole into my brand | #771 |
| BRAND-17 | As an owner, deleting a brand also removes its citations and recommendations | #681 #815 |

## Scans

| ID | Story | PRs |
|---|---|---|
| RUN-01 | As a free user out of credits, starting a scan is refused with a clear 402/429 | #740 #807 |
| RUN-02 | As a free user, a refused scan leaves no credits reserved | #740 |
| RUN-03 | As an owner, an idle brand reports run status "none" | #663 |
| RUN-04 | As an owner, asking to scan an unknown engine is rejected | #677 |
| RUN-05 | As a user, my credit status numbers are internally consistent | #740 #521 |
| RUN-06 | As a trial user, my daily cap fits at least one full default scan | #807 #655 |
| RUN-07 | As a user, the active runs list never shows other accounts' runs | #653 |
| RUN-08 | As infra, /api/cron without the secret is refused | #765 |
| RUN-09 | As infra, /api/cron with a wrong secret is refused | #765 |
| RUN-10 | As a user, /api/plans lists the plan limits the pricing page sells | #789 #795 |
| RUN-11 | As a user, credits usage covers the last 30 days with no gaps | #790 |
| RUN-12 | As a user, my credit ledger loads with totals | #765 |

## Data

| ID | Story | PRs |
|---|---|---|
| DATA-01 | As an owner, citation analysis loads (no is_brand/brands.name 500) | #765 #772 |
| DATA-02 | As an owner, Gemini grounding redirect hosts are not counted as citation domains | #772 |
| DATA-03 | As an owner, the competitor leaderboard trend comes from real data | #577 |
| DATA-04 | As an owner, the Query Tracker loads without the missing prompt_run_stats 500 | #765 |
| DATA-05 | As an owner, Query Tracker counts distinct prompts, with mention rate 0-100 | #772 #790 |
| DATA-06 | As an owner, Fan-out defaults to 30 days, not a collapsed 1 | #749 |
| DATA-07 | As an owner, AI Volatility defaults to its full window, not 7 days | #749 |
| DATA-08 | As an owner, junk query params (days=abc) fall back to defaults instead of erroring | #749 |
| DATA-09 | As an owner, prompt-runs with a silly limit does not 500 | #749 |
| DATA-10 | As an owner, Prompt Map lists every tracked prompt | #747 |
| DATA-11 | As an owner, global search returns my prompts | #774 #745 |
| DATA-12 | As an owner, searching with SQL wildcard characters does not 500 | #774 |
| DATA-13 | As a stranger, global search never shows another account's prompts | #774 #800 |
| DATA-14 | As an owner, empty search returns an empty result, not an error | #774 |
| DATA-15 | As an owner, the Activity log loads before any run | #765 |
| DATA-16 | As an owner, API logs load and never echo raw DB errors | #679 |
| DATA-17 | As a stranger, I cannot read another brand's prompt runs, fan-out or accuracy | #815 |
| DATA-18 | As an owner, notifications load and mark-read works | #653 |

## Accuracy

| ID | Story | PRs |
|---|---|---|
| ACC-01 | As an owner, marking a false claim fixed shows up straight away | #573 |
| ACC-02 | As an owner, a bad issue id gives 404, not a 500 | #765 |
| ACC-03 | As a stranger, I cannot toggle another brand's accuracy issue | #771 |
| ACC-04 | As a team viewer, I cannot run accuracy checks or edit facts | #771 |
| ACC-05 | As an owner, saving facts with a malformed body gives 400, not 500 | #771 |
| ACC-06 | As an owner, I can save brand facts and read them back | #771 |

## Recommendations

| ID | Story | PRs |
|---|---|---|
| REC-01 | As an owner, I can mark a recommendation done and it sticks | #792 |
| REC-02 | As an owner, an invalid recommendation status is rejected | #771 |
| REC-03 | As a stranger, I cannot change another brand's recommendation | #815 |
| REC-04 | As an owner, recommendations only cover engines I track | #772 |

## Alerts

| ID | Story | PRs |
|---|---|---|
| ALERT-01 | As an owner, saving an alert from the flat UI form works and it appears in the list | #668 |
| ALERT-02 | As an owner, I can edit an alert with PUT (no 405) | #771 |
| ALERT-03 | As an owner, a nonsense alert value gives 400, not a 500 | #771 |
| ALERT-04 | As a stranger, I cannot edit or delete someone else's alert | #771 |
| ALERT-05 | As an owner, an alert I make for one brand does not show under my other brand | #653 #668 |
| ALERT-06 | As an owner, an alert without a name or condition is rejected | #668 |
| ALERT-07 | As an owner, deleting my alert works | #771 |

## Reports

| ID | Story | PRs |
|---|---|---|
| REP-01 | As an owner, Download report gives me a real PDF | #588 #589 #590 |
| REP-02 | As an owner, a downloaded report shows up in report history | #586 #589 |
| REP-03 | As an owner, a custom report with no items explains itself instead of failing silently | #591 |
| REP-04 | As an owner, I can schedule weekly reports and it persists | #587 |
| REP-05 | As an owner, an unknown schedule frequency is rejected | #587 |
| REP-06 | As a stranger, I cannot download another brand's PDF | #815 |
| REP-07 | As an owner, report items save and read back | #585 |

## Public

| ID | Story | PRs |
|---|---|---|
| PUB-01 | As an AI crawler, /llms.txt is plain text with links | #743 #795 |
| PUB-02 | As a visitor, our own llms.txt passes our own validator | #743 |
| PUB-03 | As a visitor, the contact page has no Cloudflare email-protection links | #733 |
| PUB-04 | As a visitor, /features is a real page (no redirect loop) with its own title | #529 #787 |
| PUB-05 | As a visitor, /free-tools lands on /tools | #667 |
| PUB-06 | As a signed-out visitor, the retired /dashboard/query-performance page asks me to log in first | #766 |
| PUB-07 | As a search engine, robots.txt keeps the dashboard out of the index | #782 |
| PUB-08 | As a search engine, the sitemap has no private or redirecting URLs | #782 #766 |
| PUB-09 | As a visitor, the home page has a title, description and canonical | #782 #599 |
| PUB-10 | As a visitor, the canonical uses the public origin, not an internal host | #806 |
| PUB-11 | As a visitor, an unknown page returns a real 404 status | #765 |
| PUB-12 | As a search engine, /connect/connector is noindex | #743 |
| PUB-13 | As a visitor, the CSP lets Google Fonts load | #765 |
| PUB-14 | As a buyer, the white-label reports /pricing sells actually exist (rank branding API) | #743 #803 |
| PUB-15 | As a visitor, home and pricing agree on the Agency price | #743 #789 |
| PUB-16 | As a visitor, contact form junk body gives 400 not 500 | #743 |
| PUB-17 | As a spam bot filling the hidden honeypot, my contact message is not accepted | #771 |
| PUB-18 | As a visitor, newsletter signup with a bad email is rejected | #740 |
| PUB-19 | As an attacker, the AI crawler checker will not fetch localhost | #815 #740 |
| PUB-20 | As an attacker, an IPv4-mapped IPv6 address cannot sneak past the SSRF guard | #815 |
| PUB-21 | As an attacker, cloud metadata IPs are blocked in the free GEO audit | #815 |
| PUB-22 | As a visitor, free tools reject junk bodies with 400 | #743 |
| PUB-23 | As a visitor, the health endpoint reports DB and Redis | #765 |
| PUB-24 | As a visitor, key public pages all render (no 500s) | #765 #786 #787 |
| PUB-25 | As a visitor, page copy uses no em dashes | #600 #660 #716 |

## NAP

| ID | Story | PRs |
|---|---|---|
| NAP-01 | As an owner, a saved NAP audit keeps region, country and website | #762 |
| NAP-02 | As an owner, editing a NAP audit keeps the fields I did not touch | #762 |
| NAP-03 | As a stranger, I cannot open another account's NAP audit | #616 |
| NAP-04 | As an owner, pasting more than 500 URLs is refused or split, never silently truncated | #621 #762 |
| NAP-05 | As an owner, Pull from Google without a Places key returns a clear JSON error fast | #619 #627 #638 |
| NAP-06 | As a signed-out visitor, NAP audits require login | #610 |
| NAP-07 | As an owner, bare domains count as URLs in an audit | #762 |

## Fix Engine

| ID | Story | PRs |
|---|---|---|
| FIX-01 | As an owner, the Fixes page loads its catalog | #683 |
| FIX-02 | As a team viewer, I cannot start a fix scan or approve fixes | #720 |
| FIX-03 | As a security owner, edge/serve is never publicly cacheable across tenants | #720 |
| FIX-04 | As the WordPress plugin, an unauthenticated instructions call gets 401, not an origin 403 | #815 |
| FIX-05 | As a stranger, I cannot read or change another brand's fixes | #815 |
| FIX-06 | As an owner, a fixes CSV export cannot carry spreadsheet formulas | #740 |
| FIX-07 | As an owner, the autopilot settings load and save | #770 |
| FIX-08 | As an owner, an unknown fix id gives 404, not 500 | #736 |

## Rank

| ID | Story | PRs |
|---|---|---|
| RANK-01 | As an owner, adding example.com and https://www.example.com/ gives one website | #812 |
| RANK-02 | As an owner, adding keywords works and they appear in the list | #793 #799 |
| RANK-03 | As a free user, adding rank keywords is gated by rank credits | #815 |
| RANK-04 | As a stranger, I cannot queue a recheck of someone else's keyword | #815 |
| RANK-05 | As an owner, city search works without DataForSEO configured | #798 |
| RANK-06 | As a stranger, I cannot see another account's rank websites | #800 |
| RANK-07 | As a free user, CSV import at depth 100 is gated | #815 |
| RANK-08 | As an owner, an empty domain gives a helpful 400 | #808 |
| RANK-09 | As an owner, rank overview and summary load | #810 #811 |
| RANK-10 | As an owner, rank keyword JSON junk gets 400 | #808 |

## Billing

| ID | Story | PRs |
|---|---|---|
| BILL-01 | As an attacker, an unsigned payments webhook is refused | #740 #815 |
| BILL-02 | As an owner/admin plan, I am not offered a cancel that makes no sense | #790 |
| BILL-03 | As a user, checkout without payments configured says so, no 500 | #791 |
| BILL-04 | As a user, checkout for a made-up plan is rejected | #791 |
| BILL-05 | As a user, payment history and subscription load | #740 |
| BILL-06 | As a user with no subscription, refresh does not downgrade me | #679 |

## API

| ID | Story | PRs |
|---|---|---|
| KEY-01 | As an owner, my personal API key lets the MCP server list my brands | #781 |
| KEY-02 | As an owner, a revoked API key stops working at once | #781 |
| KEY-03 | As an owner, a huge API key name is trimmed, and the key is never shown again in the list | #781 |
| KEY-04 | As a stranger, I cannot revoke someone else's API key | #781 |
| MCP-01 | As Claude, OAuth metadata advertises the public issuer | #806 |
| MCP-02 | As an MCP client, an unauthenticated call gets 401 with a resource-metadata hint | #781 #806 |
| MCP-03 | As an MCP client with a key, tools/list includes rank tools with titles | #809 |
| MCP-04 | As an MCP client, start_scan respects my plan credits | #781 #815 |

## Team

| ID | Story | PRs |
|---|---|---|
| TEAM-01 | As an owner, inviting an unknown email does not leak a 500 | #771 |
| TEAM-02 | As an owner, inviting with a junk body gives 400 | #771 |
| TEAM-03 | As an owner, an invite cannot grant admin/owner roles | #771 |

## Admin

| ID | Story | PRs |
|---|---|---|
| ADMIN-01 | As a normal user, admin APIs are forbidden | #765 |
| ADMIN-02 | As an admin, the admin APIs load | #563 #565 |
| ADMIN-03 | As an admin, changing a user's password is not written to the audit log in plain text | #815 |

## Dashboard UI

| ID | Story | PRs |
|---|---|---|
| UI-01 | As a user, I can sign in through the login form and land on my dashboard | #765 |
| UI-02 | As an owner, the Overview shows my real brand, never the "Acme" sample data | #741 #561 #562 |
| UI-03 | As an owner, the greeting is not hardcoded to someone else's name | #679 |
| UI-04 | As a signed-out visitor, opening /dashboard sends me to login | #667 |
| UI-05 | As a signed-in user, opening /login sends me to my dashboard | #765 |
| UI-06 | As a user, a login ?redirect= to another site is ignored (no open redirect) | #806 |
| UI-07 | As a phone user, the menu drawer lists the pages (not empty) | #774 |
| UI-08 | As a phone user, the Overview has no sideways scroll | #774 #788 |
| UI-09 | As a user, every dashboard page loads without a crash or a 5xx API call | #765 #774 #771 |
| UI-10 | As a user, I can reach Fan-out and AI Volatility from the navigation | #749 |
| UI-11 | As a user, the command palette finds my prompt | #745 #774 |
| UI-12 | As a user, Account never offers the internal Free tier as a downgrade | #667 |
| UI-13 | As a brand-new trial user with no brand, the dashboard shows onboarding, not a crash | #652 #664 |
| UI-14 | As a brand-new user, the Overview does not show made-up SOV numbers | #652 #741 |
| UI-15 | As an owner, switching brand in the topbar changes the Overview | #561 #571 |
| UI-16 | As an owner, saving an alert rule shows it in the list (no fake "Saved") | #668 #771 |
| UI-17 | As an owner, Reports has a download button that returns a PDF | #588 #590 |
| UI-18 | As an owner, Query Tracker period buttons actually change the request | #771 |
| UI-19 | As a free user with a locked brand, the UI shows it as locked and does not crash | #800 #771 |
| UI-20 | As an admin, the admin page loads | #563 #565 |
| UI-21 | As a normal user, /admin-backend bounces me to my dashboard | #765 |
| UI-22 | As a user, the SOV chart puts 0% at the bottom | #682 |
| UI-23 | As a user, cited-source chips are real links, not href="#" | #579 |
| UI-24 | As a user, numbers read "1 pt" not "1 pts" | #775 |
| UI-25 | As a user, Platform Status does not show engines I turned off as failing | #792 #667 |
| UI-26 | As a user with an old bookmark, /dashboard/query-performance lands on Query Tracker | #766 |

## Public UI

| ID | Story | PRs |
|---|---|---|
| PUBUI-01 | As a visitor, public pages hydrate without React mismatch errors | #766 |
| PUBUI-02 | As a signed-in user browsing the site, the header offers a Dashboard button | #792 |
| PUBUI-03 | As a phone visitor, the home page has no sideways scroll | #788 #787 |
| PUBUI-04 | As a visitor, the CTA above the footer has its heading, text and button spaced apart | #604 |

