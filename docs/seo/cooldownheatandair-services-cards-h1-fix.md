# Cool Down Heating and Air - Service Card CTA + H1 Fix

Site: https://cooldownheatandair.org
Audited: 2026-09-10 (live HTML via DataForSEO OnPage, live SERP via DataForSEO)

## 1. Where the problem lives

The 10 service cards with "LEARN MORE" are **one global Elementor section** titled
`From Quick Fixes to Full System Swaps`. It is not unique to the services page.

Verified live on:

| Page | Section present |
|---|---|
| https://cooldownheatandair.org/ | Yes |
| https://cooldownheatandair.org/services/ | Yes |
| https://cooldownheatandair.org/services/heating/ | Yes |

It is a reusable block, so it is almost certainly on every `/services/*` page.
**Edit the template once and all pages are fixed.** Do not edit page by page.

Elementor build: Elementor 4.2.4.

## 2. Issue 1 - "LEARN MORE" buttons carry zero keyword

Every card uses the same generic anchor. 10 identical internal anchors x ~12 pages
= no keyword signal passed to any service page, and repeated anchor text sitewide.

Replace the button label on each card with the anchor below. Keep the existing URLs.

| Card | Current anchor | New anchor | Link target |
|---|---|---|---|
| Air Conditioning | LEARN MORE | See AC Repair in Claremore | /services/air-conditioning/ |
| Heating | LEARN MORE | See Heating Repair & Furnace Service | /services/heating/ |
| Commercial HVAC | LEARN MORE | See Commercial HVAC Services | /services/commercial/ |
| Emergency HVAC | LEARN MORE | See 24/7 Emergency HVAC Repair | /services/emergency-hvac/ |
| Duct Installation & Repair | LEARN MORE | See Duct Installation & Repair | /services/duct-installation-repair/ |
| Ductless Mini-Splits | LEARN MORE | See Ductless Mini-Split Installation | /services/mini-splits/ |
| Retrofits & Efficiency Upgrades | LEARN MORE | See SEER & Efficiency Upgrades | /services/retrofitting-efficiency-upgrades/ |
| New Construction HVAC | LEARN MORE | See New Construction HVAC | /services/new-construction/ |
| HVAC Zoning | LEARN MORE | See HVAC Zoning Systems | /services/zoning-systems/ |
| Dryer Vent Cleaning | LEARN MORE | See Dryer Vent Cleaning | /services/dryer-vent-cleaning/ |

Rules while editing:
- Anchor text goes in the button label, not in an `aria-label` or a tooltip.
- Keep the arrow as an icon, not as a `->` character inside the text string.
- Do not add `nofollow`. These are internal links.

## 3. Issue 2 - H1, subhead and title tag all say the same thing

### Why the site is not ranking in a 19k-population city

Live SERP for **"hvac claremore ok"** (location: Claremore, OK) - cooldownheatandair.org
does not appear anywhere in the top 20. Every page that does rank puts the service
plus the city in the title:

1. Helt Mechanical - "Trusted HVAC Company | Claremore, OK | Helt Heat Air"
2. Rescue Heat & Air - "Rescue Heat & Air | HVAC Services in Claremore, OK"
3. Air Solutions - "AC Repair in Claremore, OK | Top-Rated"

Cool Down's services page title tag is literally `Services - Cool Down Heating and Air`.
No service keyword, no city. That alone is enough to keep it off page 1.

Keyword data (Oklahoma, Google Ads):
- `ac repair claremore ok` - 30/mo avg, peaks 110 in July, CPC $47.79, competition 92
- `air conditioning repair claremore` - 30/mo, same peak curve
- `hvac claremore ok` - 10/mo, competition 100
- `ac repair near me` - 2,400/mo (won on GBP proximity + on-page city signals)

Low volume is normal for a city this size. It is still the money term, and the
page currently gives Google nothing to match it against.

### /services/ - before and after

| Element | Current | Change to |
|---|---|---|
| Title tag | Services - Cool Down Heating and Air | HVAC Services in Claremore, OK \| Cool Down Heating and Air |
| Meta description | When your AC quits in July or your furnace won't fire on the coldest night of the year, you need a team that answers the phone and shows up ready to work. | AC repair, furnace service, duct work and full system replacement in Claremore, OK and across Rogers County. Same-day service, free second opinions, 24/7 emergency calls. Call (918) 527-6792. |
| H1 | HVAC Services for Green Country Homes & Businesses | HVAC Services in Claremore, OK |
| Hero subhead | One Team for Every Heating and Cooling Need | Repair, installation and maintenance for homes and light-commercial buildings across Rogers County and the Tulsa metro. Same-day appointments, free second opinions. |
| H2 (mid page) | Our Heating and Cooling Services | AC, Heating and Commercial HVAC Services We Provide |
| H2 (intro) | Your Trusted HVAC Team in Claremore and Beyond | keep as is |

The current H1, the hero subhead and the mid-page H2 are three restatements of
"we do heating and cooling". Only one of them should describe the page. The other
two should carry proof, service names, or the local angle.

### / (home) - before and after

| Element | Current | Change to |
|---|---|---|
| H1 | 24/7 Emergency HVAC Company Serving Claremore & The Green Country | HVAC Repair & Installation in Claremore, OK |
| Hero subhead | We Treat Your Home Like It's Our Own | 24/7 emergency service across Rogers County and the Tulsa metro. Owner-operated since 2019, licensed and insured, OK #099177. |

The current home H1 pins the whole domain to "emergency", which is a narrow slice
of the demand. Move "24/7 emergency" into the subhead and let the H1 hold the head term.

### /services/heating/ - before and after

| Element | Current | Change to |
|---|---|---|
| H1 | Heating Services for Green Country Homes | Furnace Repair & Heating Services in Claremore, OK |
| H2 | Heating Services for Homes and Businesses Across Green Country | Why Oklahoma Winters Are Hard on a Furnace |

H1 and that H2 are near-identical strings today. Straight duplication.

Apply the same pattern to the remaining service pages: `<Service> in Claremore, OK`
in the H1, and never repeat the H1 wording in the next heading.

## 4. Other defects found during the audit

These are live on the same pages and should go in the same edit pass.

1. **Wrong card copy.** The `New Construction HVAC` card in the second (mobile) copy of
   the grid reads "No-duct comfort for additions, garages, shops, and older homes."
   That is the mini-split description. Correct copy is "System design and install for
   new builds, residential and light commercial." Present on home, /services/, and
   /services/heating/.

2. **Every card section is rendered twice in the DOM.** The services page ships 20 card
   `<h3>` tags instead of 10, and 8 trust-badge `<h3>` tags instead of 4, because the
   desktop and mobile variants are both in the HTML with one hidden by CSS. Page weight
   is 1.58 MB DOM / 302 KB transferred. Rebuild as one responsive section.

3. **Placeholder design copy is published live.** Under the H2
   "Built on Honesty, Backed by 25+ Years of Experienc" the visible body text is
   "Highlights the company's strongest trust signals in a quick, easy-to-scan format.
   Each card reinforces credibility and helps visitors feel confident about choosing
   the company." That is an internal design note, not customer copy. Sitewide.

4. **Typo in the same H2, sitewide:** "Experienc" is missing its final `e`.

5. **FAQ mismatch on /services/.** The question "How much does AC repair cost in Catoosa?"
   is answered with "Yes. We service all major brands and system types..." - the answer
   belongs to a different question and it does not contain a price.

6. **Images have no alt text** on /services/ (DataForSEO `no_image_alt` flag, 8 images).

7. **100+ HTML validation errors** on /services/ - mismatched closing tags from the
   builder output.

## 5. Order of work

1. Edit the reusable card section: 10 button labels, fix the New Construction copy.
2. Fix the placeholder trust-section paragraph and the "Experienc" typo.
3. Rewrite title tag, meta description, H1 and hero subhead on /services/, /, and
   /services/heating/.
4. Roll the H1 pattern out to the rest of the service pages.
5. Fix the /services/ FAQ answer and add image alt text.
6. Re-crawl and request reindex for the edited URLs in Search Console.
