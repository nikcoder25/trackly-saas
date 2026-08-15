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

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..');
const REPO_ROOT = join(APP_ROOT, '..');

const PLUGIN_DIR = join(REPO_ROOT, 'connector-plugin');
const ENTRY = join(PLUGIN_DIR, 'livesov-connector.php');
const OUT = join(APP_ROOT, 'public', 'wordpress-plugin', 'livesov-connector.zip');

// Fixed epoch => reproducible archive. Any date works; it only shows up as the
// file mtime after the user unzips.
const PINNED_DATE = new Date('2026-01-01T00:00:00Z');

/** Ship every PHP source file except the test harness, which stays in-repo. */
async function pluginFiles(dir = PLUGIN_DIR) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(PLUGIN_DIR, full).split(sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue;
      out.push(...(await pluginFiles(full)));
    } else if (entry.name.endsWith('.php')) {
      out.push(rel);
    }
  }
  // Sorted so the archive's entry order does not depend on the filesystem.
  return out.sort();
}

const php = await readFile(ENTRY, 'utf8');

const version = php.match(/^\s*\*\s*Version:\s*(.+)$/m)?.[1]?.trim();
if (!version) {
  throw new Error(`Could not read "Version:" from the plugin header in ${ENTRY}`);
}

const files = await pluginFiles();
if (!files.includes('livesov-connector.php')) {
  throw new Error('Plugin entry file missing from the packaged set');
}

const zip = new JSZip();
for (const rel of files) {
  zip.file(`livesov-connector/${rel}`, await readFile(join(PLUGIN_DIR, rel), 'utf8'), { date: PINNED_DATE });
}

const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, buf);

console.log(`Wrote ${OUT} (plugin v${version}, ${files.length} files, ${buf.length} bytes)`);
for (const rel of files) { console.log(`  livesov-connector/${rel}`); }
