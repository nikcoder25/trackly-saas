/**
 * Reading text out of an Anthropic Messages response.
 *
 * The bug these pin: `content` is an array of blocks and only "text"
 * blocks carry prose, but it was read as `content[0].text`. Any response
 * whose first block is a thinking or tool_use block yielded "" from a call
 * that had succeeded and been billed, which reached users as "AI returned
 * empty response" across every AI-backed feature.
 */

import { describe, expect, it } from 'vitest';
import { extractAnthropicText } from '@/lib/ai-platforms';

describe('extractAnthropicText', () => {
  it('reads a single text block', () => {
    expect(extractAnthropicText([{ type: 'text', text: 'hello' }])).toBe('hello');
  });

  it('reads text that follows a thinking block', () => {
    // The regression. A reasoning model puts its thinking first, so
    // content[0].text is undefined and the reply looks empty.
    const content = [
      { type: 'thinking', thinking: 'considering the options' },
      { type: 'text', text: '["who fixes furnaces","best hvac near me"]' },
    ];
    expect(extractAnthropicText(content)).toBe('["who fixes furnaces","best hvac near me"]');
  });

  it('reads text that follows a redacted thinking block', () => {
    const content = [
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: 'the answer' },
    ];
    expect(extractAnthropicText(content)).toBe('the answer');
  });

  it('concatenates several text blocks', () => {
    const content = [
      { type: 'text', text: 'part one ' },
      { type: 'text', text: 'part two' },
    ];
    expect(extractAnthropicText(content)).toBe('part one part two');
  });

  it('ignores tool_use blocks', () => {
    const content = [
      { type: 'tool_use', id: 't1', name: 'search', input: {} },
      { type: 'text', text: 'the answer' },
    ];
    expect(extractAnthropicText(content)).toBe('the answer');
  });

  it('returns empty when there is genuinely no text', () => {
    expect(extractAnthropicText([{ type: 'thinking', thinking: 'only thought' }])).toBe('');
    expect(extractAnthropicText([])).toBe('');
  });

  it('survives a malformed or missing content field', () => {
    expect(extractAnthropicText(undefined)).toBe('');
    expect(extractAnthropicText(null)).toBe('');
    expect(extractAnthropicText({})).toBe('');
    expect(extractAnthropicText([null, undefined, 3])).toBe('');
  });

  it('accepts a plain string body', () => {
    expect(extractAnthropicText('  hello  ')).toBe('hello');
  });

  it('falls back to an untyped block that still carries text', () => {
    expect(extractAnthropicText([{ text: 'no type field' }])).toBe('no type field');
  });

  it('prefers typed text blocks over untyped ones', () => {
    const content = [{ text: 'untyped' }, { type: 'text', text: 'typed' }];
    expect(extractAnthropicText(content)).toBe('typed');
  });
});
