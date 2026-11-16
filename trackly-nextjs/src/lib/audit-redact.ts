/**
 * Strip a plaintext `password` from a request body before it is written to
 * audit_logs.details. The key is replaced with `passwordChanged: true` so
 * the audit trail still records that the password was changed.
 */
export function redactPasswordForAudit<T>(body: T): T | Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  if (!Object.prototype.hasOwnProperty.call(body, 'password')) return body;
  const { password, ...rest } = body as unknown as Record<string, unknown>;
  const changed = password !== undefined && password !== null && password !== '';
  return changed ? { ...rest, passwordChanged: true } : rest;
}
