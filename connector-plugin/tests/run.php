<?php
/**
 * Test runner for the Connector plugin's pure logic.
 *
 *   php connector-plugin/tests/run.php
 *
 * Exits non-zero on the first failing assertion set, so CI can gate on it.
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/../includes/text.php';
require __DIR__ . '/../includes/builders.php';
require __DIR__ . '/../includes/patch.php';
require __DIR__ . '/../includes/publish.php';
require __DIR__ . '/../includes/seo.php';

foreach (array('test-text.php', 'test-builders.php', 'test-patch.php', 'test-publish.php', 'test-seo.php') as $file) {
    $path = __DIR__ . '/' . $file;
    if (file_exists($path)) { require $path; }
}

exit(T::report());
