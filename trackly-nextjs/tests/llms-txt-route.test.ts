import { describe, expect, it } from 'vitest';
import { GET } from '@/app/llms.txt/route';

// Regression guard for finding #3. Pins the three invariants AI
// crawlers depend on: HTTP 200, text/plain content-type, body under
// the 4 KB conventional ceiling for llms.txt files.
describe('GET /llms.txt', () => {
  it('returns 200, content-type text/plain, body under 4096 bytes', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);

    const body = await res.text();
    const bytes = Buffer.byteLength(body, 'utf8');
    expect(bytes).toBeLessThan(4096);
    expect(bytes).toBeGreaterThan(100); // sanity: body is not empty
  });
});
