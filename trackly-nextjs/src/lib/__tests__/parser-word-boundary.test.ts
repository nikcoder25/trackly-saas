import { describe, it, expect } from 'vitest';
import { parseResponse, buildBrandMatcher, detectCompetitors, isBrandedPrompt } from '../parser';

function parse(text: string, name: string, extra: Record<string, unknown> = {}) {
  const brand = { name, ...extra };
  return parseResponse(text, brand, 'best tools for small business', buildBrandMatcher(brand));
}

describe('parser: brand names need word boundaries', () => {
  it.each([
    ['Square', '1. Squarespace is a popular website builder'],
    ['Square', 'Squarespace and Wix are both easy to use.'],
    ['Thrive', 'Great hiking trails with rivers nearby.'],
    ['Notion', 'The promotional offer ends soon.'],
    ['Notion', 'It is a notional value only.'],
    ['Stripe', 'He wore pinstripes to the meeting.'],
  ])('brand %j is not mentioned in %j', (name, text) => {
    const r = parse(text, name);
    expect(r.mentioned).toBe(false);
    expect(r.listPosition).toBeNull();
  });

  it.each([
    ['Square', 'Square is a popular payments provider.'],
    ['Square', 'square is a popular payments provider.'],
    ['Square', 'SQUARE offers card readers.'],
    ['Stripe', "Stripe's API is well documented and reliable."],
    ['Stripe', 'Stripe’s API is well documented and reliable.'],
    ['Notion', 'For notes, I recommend Notion.'],
    ['Square', 'Payment processors (Square) are popular.'],
    ['LiveSov', 'Live Sov is a tool that tracks AI visibility.'],
    ['LiveSov', 'live-sov is a tool that tracks AI visibility.'],
    ['Live Sov', 'LiveSov is a tool that tracks AI visibility.'],
    ['Live Sov', 'Check out live-sov, it offers tracking.'],
  ])('brand %j is mentioned in %j', (name, text) => {
    expect(parse(text, name).mentioned).toBe(true);
  });

  it('the space-insensitive match is still bounded on both ends', () => {
    expect(parse('The xlivesov tool is new.', 'LiveSov').mentioned).toBe(false);
    expect(parse('Try Live Sovereign tools.', 'LiveSov').mentioned).toBe(false);
  });

  it('a website domain only matches as a whole domain', () => {
    expect(parse('Visit www.square.com for details.', 'Sq Up', { website: 'https://square.com' }).mentioned).toBe(true);
    expect(parse('Visit mysquare.com for details.', 'Sq Up', { website: 'https://square.com' }).mentioned).toBe(false);
  });

  it('branded-prompt detection uses the same boundaries', () => {
    expect(isBrandedPrompt('squarespace pricing', { name: 'Square' })).toBe(false);
    expect(isBrandedPrompt('is square any good', { name: 'Square' })).toBe(true);
  });
});

describe('parser: list position needs a word boundary after the brand', () => {
  it('"1. Squarespace" is not position 1 for Square', () => {
    const r = parse('1. Squarespace - builder\n2. Square - payments', 'Square');
    expect(r.mentioned).toBe(true);
    expect(r.listPosition).toBe(2);
  });

  it.each([
    ['1. **Square** - easy card payments', 1],
    ['2. Square\'s reader is the best pick', 2],
    ['**3. Square** - top pick', 3],
    ['(4) Square, best for retail', 4],
  ])('matches %j → position %i', (text, pos) => {
    expect(parse(text, 'Square').listPosition).toBe(pos);
  });

  it('finds the position for a spaced variant of the brand', () => {
    expect(parse('Top picks:\n1. **Live Sov** - best AI visibility tracker', 'LiveSov').listPosition).toBe(1);
  });
});

describe('detectCompetitors: word-bounded domain matching', () => {
  function comps(text: string, competitors: string[]) {
    return detectCompetitors(text, buildBrandMatcher({ name: 'Acme', competitors }));
  }

  it('apple.com is not matched by pineapple', () => {
    expect(comps('Try the pineapple smoothie.', ['apple.com'])).toEqual([]);
    expect(comps('Visit pineapple.com today.', ['apple.com'])).toEqual([]);
  });

  it.each(['apple.com is the official store.', 'Go to www.apple.com for details.', 'Apple makes laptops.'])(
    'apple.com is matched by %j', text => {
      expect(comps(text, ['apple.com'])).toEqual(['apple.com']);
    },
  );

  it('metrocars.com is not matched by scattered words', () => {
    expect(comps('Metro Airport Taxi offers sedans and luxury cars for groups.', ['metrocars.com'])).toEqual([]);
  });

  it.each(['Metro Cars is a reliable choice.', 'Book with MetroCars today.', 'metro-cars has good reviews.', 'www.metrocars.com'])(
    'metrocars.com is matched by %j', text => {
      expect(comps(text, ['metrocars.com'])).toEqual(['metrocars.com']);
    },
  );

  it('possessive domain words still match', () => {
    expect(comps("Luke's Paving did our driveway.", ['lukespaving.com'])).toEqual(['lukespaving.com']);
  });

  it('plain-name competitors need word boundaries', () => {
    expect(comps('He wore pinstripes.', ['Stripe'])).toEqual([]);
    expect(comps("Stripe's fees are low.", ['Stripe'])).toEqual(['Stripe']);
  });
});
