<?php
/**
 * Guards the committed plugin zip against drifting from its source.
 *
 * trackly-nextjs/public/wordpress-plugin/livesov-connector.zip is what people
 * actually download, and it is a build artifact checked into the repo — so
 * editing the PHP without regenerating it ships an old plugin from a page
 * advertising the new version. Compare contents rather than rebuilding, so
 * this runs without the Node toolchain.
 *
 *   php connector-plugin/tests/verify-zip.php
 */

$root   = dirname(__DIR__, 2);
$plugin = $root . '/connector-plugin';
$zip_path = $root . '/trackly-nextjs/public/wordpress-plugin/livesov-connector.zip';

if (!class_exists('ZipArchive')) {
    fwrite(STDERR, "SKIP: ext-zip not available\n");
    exit(0);
}
if (!file_exists($zip_path)) {
    fwrite(STDERR, "FAIL: $zip_path is missing — run: node scripts/build-connector-zip.mjs\n");
    exit(1);
}

/** Every PHP file the zip is expected to carry, relative to connector-plugin/. */
$expected = array();
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($plugin, FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
    $rel = substr($file->getPathname(), strlen($plugin) + 1);
    if (substr($rel, -4) !== '.php') { continue; }
    if (strpos($rel, 'tests/') === 0) { continue; }   // tests are not shipped
    $expected[str_replace('\\', '/', $rel)] = file_get_contents($file->getPathname());
}

$zip = new ZipArchive();
if ($zip->open($zip_path) !== true) {
    fwrite(STDERR, "FAIL: could not open $zip_path\n");
    exit(1);
}

$errors = array();
$seen   = array();
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if (substr($name, -1) === '/') { continue; }
    if (strpos($name, 'livesov-connector/') !== 0) {
        $errors[] = "zip entry outside livesov-connector/: $name";
        continue;
    }
    $rel = substr($name, strlen('livesov-connector/'));
    $seen[$rel] = true;
    if (!isset($expected[$rel])) {
        $errors[] = "zip contains a file that is not in connector-plugin/: $rel";
        continue;
    }
    if ($zip->getFromIndex($i) !== $expected[$rel]) {
        $errors[] = "zip copy of $rel differs from the source";
    }
}
foreach (array_keys($expected) as $rel) {
    if (!isset($seen[$rel])) { $errors[] = "zip is missing $rel"; }
}
$zip->close();

if ($errors) {
    foreach ($errors as $e) { fwrite(STDERR, "FAIL: $e\n"); }
    fwrite(STDERR, "\nRegenerate with: cd trackly-nextjs && node scripts/build-connector-zip.mjs\n");
    exit(1);
}

/**
 * The version is written in four places: the plugin header, LVX_CONN_VERSION,
 * and the PLUGIN_VERSION constant on each page that offers the download. The
 * zip check above cannot catch it — the zip can match its source perfectly
 * while both download pages advertise a version nobody is shipping.
 */
$main = $expected['livesov-connector.php'];
preg_match('/^\s*\*\s*Version:\s*(\S+)/m', $main, $m_header);
preg_match("/define\('LVX_CONN_VERSION',\s*'([^']+)'\)/", $main, $m_const);

$versions = array(
    'plugin header (Version:)'      => isset($m_header[1]) ? $m_header[1] : null,
    'plugin LVX_CONN_VERSION'       => isset($m_const[1]) ? $m_const[1] : null,
);
foreach (array(
    'trackly-nextjs/src/app/(public)/integrations/wordpress/page.tsx',
    'trackly-nextjs/src/app/dashboard-v2/pages/connect.tsx',
) as $rel_page) {
    $path = $root . '/' . $rel_page;
    if (!file_exists($path)) { $versions[$rel_page] = null; continue; }
    preg_match("/PLUGIN_VERSION\s*=\s*'([^']+)'/", file_get_contents($path), $m_page);
    $versions[$rel_page] = isset($m_page[1]) ? $m_page[1] : null;
}

$distinct = array_unique(array_values($versions));
if (count($distinct) !== 1 || in_array(null, $versions, true)) {
    fwrite(STDERR, "FAIL: plugin version disagrees across files\n");
    foreach ($versions as $where => $v) {
        fwrite(STDERR, sprintf("  %-60s %s\n", $where, $v === null ? '(not found)' : $v));
    }
    exit(1);
}

echo 'OK: zip matches ' . count($expected) . ' plugin source file(s); version '
    . reset($distinct) . " consistent across " . count($versions) . " files\n";
exit(0);
