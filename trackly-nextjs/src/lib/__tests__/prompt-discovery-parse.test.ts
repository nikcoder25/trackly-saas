/**
 * Prompt discovery - reading a prompt list out of a model reply.
 *
 * These cases are the bug report. `jsonMode` is only wired to Gemini and
 * the default generator is Claude, so nothing enforces "return ONLY a JSON
 * array" - the model answers in whatever shape it likes. The original
 * single greedy `/\[[\s\S]*\]/` handled three of those shapes and returned
 * nothing for the rest, which surfaced to the user as "The model returned
 * no usable prompts. Try again." on a reply that was perfectly usable.
 */

import { describe, expect, it } from 'vitest';
import { parseStringArray } from '@/lib/prompt-discovery';

describe('parseStringArray - shapes that already worked', () => {
  it('reads a clean JSON array', () => {
    expect(parseStringArray('["who fixes furnaces at night","best hvac company near me"]'))
      .toEqual(['who fixes furnaces at night', 'best hvac company near me']);
  });

  it('reads a fenced JSON array', () => {
    expect(parseStringArray('```json\n["who fixes furnaces","how much is a new furnace"]\n```'))
      .toEqual(['who fixes furnaces', 'how much is a new furnace']);
  });

  it('reads an array wrapped in prose', () => {
    const reply = 'Here are the prompts:\n["who fixes furnaces","how much is a new furnace"]\nHope that helps.';
    expect(parseStringArray(reply)).toEqual(['who fixes furnaces', 'how much is a new furnace']);
  });

  it('reads the object wrapper that JSON mode forces', () => {
    expect(parseStringArray('{"prompts":["who fixes furnaces","emergency ac repair cost"]}'))
      .toEqual(['who fixes furnaces', 'emergency ac repair cost']);
  });
});

describe('parseStringArray - shapes that used to fail the job', () => {
  it('reads output grouped into the categories the prompt asks for', () => {
    // The generate prompt lists five journey stages, so a model in object
    // mode reasonably groups by them. The old greedy regex spanned from the
    // first [ to the last ], producing unparseable text and zero prompts.
    const reply = JSON.stringify({
      urgent: ['who fixes furnaces at night', 'emergency furnace repair'],
      price: ['how much does a new furnace cost', 'furnace financing options'],
      trust: ['how to choose an hvac contractor'],
    });
    expect(parseStringArray(reply)).toEqual([
      'who fixes furnaces at night',
      'emergency furnace repair',
      'how much does a new furnace cost',
      'furnace financing options',
      'how to choose an hvac contractor',
    ]);
  });

  it('reads an array of objects', () => {
    const reply = '[{"prompt":"who fixes furnaces at night"},{"prompt":"emergency furnace repair"}]';
    expect(parseStringArray(reply))
      .toEqual(['who fixes furnaces at night', 'emergency furnace repair']);
  });

  it('recovers prompts from an array truncated by the token limit', () => {
    const reply = '["who fixes furnaces at night",\n"emergency furnace repair",\n"how much does a new';
    const out = parseStringArray(reply);
    expect(out).toContain('who fixes furnaces at night');
    expect(out).toContain('emergency furnace repair');
  });

  it('reads a plain numbered list', () => {
    const reply = '1. who fixes furnaces at night\n2. how much does a new furnace cost\n3. best hvac company near me';
    expect(parseStringArray(reply)).toEqual([
      'who fixes furnaces at night',
      'how much does a new furnace cost',
      'best hvac company near me',
    ]);
  });

  it('reads a bulleted list', () => {
    const reply = '- who fixes furnaces at night\n- how much does a new furnace cost';
    expect(parseStringArray(reply))
      .toEqual(['who fixes furnaces at night', 'how much does a new furnace cost']);
  });

  it('reads several arrays scattered through prose', () => {
    const reply = 'Urgent:\n["who fixes furnaces at night"]\n\nPrice:\n["how much does a new furnace cost"]';
    expect(parseStringArray(reply))
      .toEqual(['who fixes furnaces at night', 'how much does a new furnace cost']);
  });
});

describe('parseStringArray - what it must still reject', () => {
  it('returns nothing for an empty reply', () => {
    expect(parseStringArray('')).toEqual([]);
    expect(parseStringArray('   \n  ')).toEqual([]);
  });

  it('does not mistake a refusal for a prompt list', () => {
    // Two sentences of prose. Neither is prompt-shaped, so the job should
    // still fail loudly rather than track the model's apology.
    expect(parseStringArray('I cannot help with that request.')).toEqual([]);
  });

  it('drops category keys and scaffolding words', () => {
    const reply = JSON.stringify({ urgent: ['prompts', 'who fixes furnaces at night'] });
    expect(parseStringArray(reply)).toEqual(['who fixes furnaces at night']);
  });

  it('drops the model talking to us', () => {
    const reply = 'Here are 3 prompts for you:\n- who fixes furnaces at night';
    expect(parseStringArray(reply)).toEqual(['who fixes furnaces at night']);
  });

  it('drops fragments too short to be a question', () => {
    expect(parseStringArray('["hvac","who fixes furnaces at night"]'))
      .toEqual(['who fixes furnaces at night']);
  });

  it('drops a paragraph too long to be a prompt', () => {
    const essay = 'w'.repeat(250);
    expect(parseStringArray(JSON.stringify([essay, 'who fixes furnaces at night'])))
      .toEqual(['who fixes furnaces at night']);
  });

  it('deduplicates case and whitespace variants', () => {
    const reply = '["Who Fixes Furnaces At Night","who fixes furnaces at night","  who fixes furnaces at night  "]';
    expect(parseStringArray(reply)).toEqual(['Who Fixes Furnaces At Night']);
  });

  it('is not confused by brackets inside prompt text', () => {
    const reply = '["who fixes furnaces [emergency] at night","best hvac near me"]';
    expect(parseStringArray(reply))
      .toEqual(['who fixes furnaces [emergency] at night', 'best hvac near me']);
  });
});
