// Review sites, directories, social, media, travel and job hosts AI engines
// cite a lot. They are sources, not rivals, so they never show as discovered
// competitors. Entries with a dot match the host or its subdomains; bare
// entries match any non-TLD label.
export const NON_COMPETITOR_HOSTS = [
  'tripadvisor', 'yelp', 'bbb.org', 'google', 'facebook', 'instagram', 'linkedin', 'x', 'twitter',
  'youtube', 'reddit', 'quora', 'wikipedia', 'yellowpages', 'angi', 'thumbtack', 'homeadvisor',
  'houzz', 'nextdoor', 'mapquest', 'foursquare', 'manta', 'chamberofcommerce', 'birdeye',
  'trustpilot', 'indeed', 'glassdoor', 'apple', 'bing', 'medium', 'forbes', 'grdd.net',
  'expertise.com', 'threebestrated', 'porch', 'superpages', 'citysearch',
  'lonelyplanet', 'zippia', 'carriersource', 'thetruckersreport', 'expedia', 'booking', 'kayak',
  'timeout', 'cntraveler', 'fodors', 'frommers', 'uber', 'lyft', 'limos', 'ridester', 'groupon',
  'wanderlog', 'cityseeker', 'yahoo', 'msn', 'patch', 'freep', 'detroitnews', 'clickondetroit',
  'crainsdetroit', 'bizjournals', 'prnewswire', 'cbsnews', 'wxyz', 'fox2detroit',
];

// Civic .org hosts: townships, cities, counties, chambers, transit, tourism.
const CIVIC_ORG_LABEL = /twp|township|city|county|chamber|transit|visit|tourism/;

/** Government, education and military hosts (.gov, .gov.<cc>, .edu, .mil) plus civic .org hosts. */
export function isGovOrEduHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (/(^|\.)(gov|edu|mil)$/.test(h) || /(^|\.)gov\.[a-z]{2}$/.test(h)) return true;
  if (h.endsWith('.org')) return CIVIC_ORG_LABEL.test(h.split('.')[0]);
  return false;
}

export function isNonCompetitorHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (isGovOrEduHost(h)) return true;
  const nonTld = h.split('.').slice(0, -1);
  return NON_COMPETITOR_HOSTS.some(e => (e.includes('.')
    ? h === e || h.endsWith('.' + e)
    : nonTld.includes(e)));
}

/** Normalizes a tracked competitor or URL to a bare host: no scheme, path or www. */
export function normalizeCompetitorHost(value: string): string {
  return value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}
