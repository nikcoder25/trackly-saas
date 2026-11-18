/**
 * Parse a request body that must be a JSON object.
 *
 * A bare `await request.json()` throws on an empty or malformed body, and a
 * body of `null`/`[]`/`"x"` breaks the destructuring that follows it. Either
 * way the route answered 500 for what is a client error, which scanners and
 * broken clients hit routinely. This returns null for anything that is not a
 * plain object so the caller can answer 400 instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonObject<T = Record<string, any>>(request: Request): Promise<T | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

export function invalidJsonBody(): Response {
  return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
}
