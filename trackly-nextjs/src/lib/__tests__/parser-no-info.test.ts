import { describe, it, expect } from 'vitest';
import { parseResponse, isBrandedPrompt, isNoInfoText, buildBrandMatcher } from '../parser';

const brand = { name: 'Easypump Concrete Ltd', website: 'https://easypump.co.uk', city: 'Leeds' };
const branded = 'How much does Easypump Concrete Ltd charge for concrete pumping?';
const buyer = 'best concrete pumping company in Leeds';

function parse(text: string, query = buyer) {
  return parseResponse(text, brand, query, buildBrandMatcher(brand));
}

describe('parser: no-information answers are not visibility', () => {
  it('the production case: "I don\'t have specific pricing information" is not Found, Recommended or Positive', () => {
    const r = parse(
      "I don't have specific pricing information for Easypump Concrete Ltd. Concrete pumping in the UK typically costs "
      + 'between £400 and £900 per day depending on the pump. I recommend contacting Easypump Concrete Ltd directly for an '
      + 'accurate quote, as they are the best source for current prices.',
      branded,
    );
    expect(r.mentioned).toBe(false);
    expect(r.recommended).toBe(false);
    expect(r.sentiment).toBe('neutral');
    expect(r.noInfo).toBe(true);
    expect(r.branded).toBe(true);
  });

  it.each([
    "I don't have information about Easypump Concrete Ltd.",
    'I do not have any reliable details on Easypump Concrete Ltd.',
    "I'm not aware of a company called Easypump Concrete Ltd.",
    'I am not familiar with Easypump Concrete Ltd.',
    "I couldn't find any information on Easypump Concrete Ltd.",
    'I was unable to find reviews for Easypump Concrete Ltd.',
    'There is no information available about Easypump Concrete Ltd.',
    "Unfortunately I don’t have details about Easypump Concrete Ltd in my training data.",
    'Easypump Concrete Ltd does not appear in my knowledge base.',
    "I'm not sure about Easypump Concrete Ltd, it may be a small local firm.",
  ])('"%s" is not a mention', text => {
    const r = parse(text);
    expect(r.mentioned).toBe(false);
    expect(r.recommended).toBe(false);
    expect(r.sentiment).toBe('neutral');
  });

  it('isNoInfoText recognises the common phrasings', () => {
    expect(isNoInfoText("I don't have specific information on that")).toBe(true);
    expect(isNoInfoText('No information is available for this business')).toBe(true);
    expect(isNoInfoText('Easypump is a concrete pumping firm in Leeds')).toBe(false);
  });

  it('a no-info caveat followed by real knowledge still counts', () => {
    const r = parse(
      "I don't have current pricing for Easypump Concrete Ltd. Easypump Concrete Ltd is a concrete pumping company based in Leeds "
      + 'that offers boom and line pumps.',
      branded,
    );
    expect(r.mentioned).toBe(true);
    expect(r.noInfo).toBe(true);
  });
});

describe('parser: branded prompts need the answer to describe the brand', () => {
  it('detects branded prompts by name, alias and domain label', () => {
    expect(isBrandedPrompt(branded, brand)).toBe(true);
    expect(isBrandedPrompt('easypump reviews', brand)).toBe(true);
    expect(isBrandedPrompt('is EPC any good', { ...brand, aliases: ['EPC'] })).toBe(true);
    expect(isBrandedPrompt(buyer, brand)).toBe(false);
  });

  it('an answer that only echoes the brand from the question is not a mention', () => {
    const r = parse(
      'Here is what to consider when looking at Easypump Concrete Ltd: check their reviews, ask for insurance documents '
      + 'and compare quotes from several local firms.',
      branded,
    );
    expect(r.mentioned).toBe(false);
    expect(r.recommended).toBe(false);
  });

  it('an answer that describes the brand counts', () => {
    const r = parse(
      'Easypump Concrete Ltd is a well-regarded concrete pumping contractor in Leeds that provides boom pumps for residential jobs.',
      branded,
    );
    expect(r.mentioned).toBe(true);
    expect(r.sentiment).toBe('positive');
  });
});

describe('parser: recommendation needs recommending language about the brand', () => {
  it('a neutral mention next to "recommend contacting" boilerplate is not a recommendation', () => {
    const r = parse(
      'Local options include Easypump Concrete Ltd and Leeds Pumping Services. I recommend getting quotes from several firms.',
    );
    expect(r.mentioned).toBe(true);
    expect(r.recommended).toBe(false);
  });

  it('recommending the brand itself counts', () => {
    const r = parse('For concrete pumping in Leeds I would highly recommend Easypump Concrete Ltd for its reliable crews.');
    expect(r.mentioned).toBe(true);
    expect(r.recommended).toBe(true);
    expect(r.sentiment).toBe('positive');
  });

  it('ranking in a recommendation list still counts', () => {
    const r = parse('Here are the best concrete pumping companies in Leeds:\n\n1. **Easypump Concrete Ltd** - fast crews\n2. **Leeds Pumping**');
    expect(r.mentioned).toBe(true);
    expect(r.listPosition).toBe(1);
    expect(r.recommended).toBe(true);
  });

  it('unbranded prompts keep the original mention behaviour', () => {
    const r = parse('Easypump Concrete Ltd and Leeds Pumping both serve the area.');
    expect(r.mentioned).toBe(true);
    expect(r.branded).toBe(false);
  });
});
