/**
 * Sanitize a CSV cell value to prevent formula injection.
 * Prefixes cells starting with =, +, -, @, \t, \r with a single quote.
 */
export function csvSafe(value: string): string {
  const s = String(value).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`;
  return `"${s}"`;
}
