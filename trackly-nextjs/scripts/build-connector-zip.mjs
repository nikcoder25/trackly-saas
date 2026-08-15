/**
 * Builds the installable WordPress plugin zip served from
 * /wordpress-plugin/livesov-connector.zip (the download on
 * /integrations/wordpress).
 *
 * Source of truth is connector-plugin/livesov-connector.php at the repo root.
 * Re-run this after editing the plugin:
 *
 *   node scripts/build-connector-zip.mjs
 *
 * The zip entry is nested under livesov-connector/ so that WordPress's
 * "Upload Plugin" screen unpacks it into wp-content/plugins/livesov-connector/,
 * matching the directory the plugin's own docs reference.
 *
 * Timestamps are pinned so a rebuild with unchanged source produces a
 * byte-identical zip and doesn't churn the committed binary.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..');
const REPO_ROOT = join(APP_ROOT, '..');

const SOURCE = join(REPO_ROOT, 'connector-plugin', 'livesov-connector.php');
const OUT = join(APP_ROOT, 'public', 'wordpress-plugin', 'livesov-connector.zip');

// Fixed epoch => reproducible archive. Any date works; it only shows up as the
// file mtime after the user unzips.
const PINNED_DATE = new Date('2026-01-01T00:00:00Z');

const php = await readFile(SOURCE, 'utf8');

const version = php.match(/^\s*\*\s*Version:\s*(.+)$/m)?.[1]?.trim();
if (!version) {
  throw new Error(`Could not read "Version:" from the plugin header in ${SOURCE}`);
}

const zip = new JSZip();
zip.file('livesov-connector/livesov-connector.php', php, { date: PINNED_DATE });

const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, buf);

console.log(`Wrote ${OUT} (plugin v${version}, ${buf.length} bytes)`);
