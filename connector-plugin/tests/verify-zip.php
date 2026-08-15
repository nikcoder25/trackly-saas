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

echo 'OK: zip matches ' . count($expected) . " plugin source file(s)\n";
exit(0);
