/**
 * Terminal output helpers: colour, key/value blocks, and a compact table
 * renderer. No dependencies - the app ships no CLI table library and we don't
 * want to add one just for this.
 */
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function paint(code: string, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const c = {
  bold: (s: string) => paint('1', s),
  dim: (s: string) => paint('2', s),
  red: (s: string) => paint('31', s),
  green: (s: string) => paint('32', s),
  yellow: (s: string) => paint('33', s),
  cyan: (s: string) => paint('36', s),
};

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface Column<T> {
  header: string;
  get: (row: T) => unknown;
  max?: number; // truncate cell content to this width
}

/** Render an array of rows as an aligned text table. */
export function table<T>(rows: T[], columns: Column<T>[]): string {
  if (rows.length === 0) return c.dim('(no rows)');

  const rendered = rows.map((row) =>
    columns.map((col) => {
      let text = cell(col.get(row));
      if (col.max && text.length > col.max) text = text.slice(0, col.max - 1) + '…';
      return text;
    }),
  );

  const widths = columns.map((col, i) =>
    Math.max(col.header.length, ...rendered.map((r) => r[i].length)),
  );

  const pad = (text: string, w: number) => text + ' '.repeat(w - text.length);
  const line = (cells: string[]) => cells.map((t, i) => pad(t, widths[i])).join('  ').trimEnd();

  const head = c.bold(line(columns.map((col) => col.header)));
  const sep = c.dim(widths.map((w) => '─'.repeat(w)).join('  '));
  const bodyLines = rendered.map((r) => line(r));
  return [head, sep, ...bodyLines].join('\n');
}

/** Render an object as an aligned "key: value" block. */
export function keyValue(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  const width = Math.max(0, ...keys.map((k) => k.length));
  return keys
    .map((k) => `${c.dim((k + ':').padEnd(width + 1))} ${cell(obj[k])}`)
    .join('\n');
}

export function heading(text: string): string {
  return '\n' + c.bold(c.cyan(text));
}
