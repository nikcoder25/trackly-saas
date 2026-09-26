import { describe, expect, it } from 'vitest';

import { isGovOrEduHost, isNonCompetitorHost, normalizeCompetitorHost } from '../non-competitor-hosts';

describe('isNonCompetitorHost', () => {
  it.each([
    'detroitmi.gov', 'michigan.gov', 'gov.uk', 'hmrc.gov.uk', 'umich.edu', 'army.mil',
    'shelbytwp.org', 'detroittransit.org', 'cantontownship.org', 'waynecounty.org',
    'detroitchamber.org', 'visitdetroit.org', 'mitourism.org', 'kansascity.org',
    'lonelyplanet.com', 'zippia.com', 'carriersource.io', 'thetruckersreport.com',
    'www.expedia.com', 'booking.com', 'kayak.com', 'timeout.com', 'cntraveler.com', 'fodors.com',
    'frommers.com', 'uber.com', 'lyft.com', 'limos.com', 'ridester.com', 'groupon.com',
    'wanderlog.com', 'cityseeker.com', 'news.yahoo.com', 'msn.com', 'patch.com', 'freep.com',
    'detroitnews.com', 'clickondetroit.com', 'crainsdetroit.com', 'bizjournals.com',
    'prnewswire.com', 'cbsnews.com', 'wxyz.com', 'fox2detroit.com',
    'yelp.com', 'bbb.org', 'm.facebook.com',
  ])('hides %s', host => {
    expect(isNonCompetitorHost(host)).toBe(true);
  });

  it.each([
    'metrocars.com', 'detroitlimo.com', 'acmemoving.org', 'bestcars.net', 'govmotors.com',
    'redcross.org', 'educationhvac.com',
  ])('keeps %s', host => {
    expect(isNonCompetitorHost(host)).toBe(false);
  });
});

describe('isGovOrEduHost', () => {
  it('only treats civic keywords as non-rivals on .org', () => {
    expect(isGovOrEduHost('citycab.com')).toBe(false);
    expect(isGovOrEduHost('citycab.org')).toBe(true);
  });
});

describe('normalizeCompetitorHost', () => {
  it('strips scheme, www and path so tracked www.x.com hides x.com', () => {
    expect(normalizeCompetitorHost('www.metrocars.com')).toBe('metrocars.com');
    expect(normalizeCompetitorHost('https://www.MetroCars.com/about')).toBe('metrocars.com');
    expect(normalizeCompetitorHost('metrocars.com')).toBe('metrocars.com');
  });
});
