import { describe, expect, it } from 'vitest';
import { readJsonObject, invalidJsonBody } from '@/lib/read-json';

const req = (body: string) => new Request('http://x/api', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

describe('readJsonObject', () => {
  it('returns the parsed object', async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it.each(['', '{oops', 'null', '[]', '"text"', '42'])('returns null for %j so the route can answer 400', async (body) => {
    expect(await readJsonObject(req(body))).toBeNull();
  });

  it('invalidJsonBody is a 400 with an error message', async () => {
    const r = invalidJsonBody();
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid JSON body' });
  });
});
