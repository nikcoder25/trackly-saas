<?php
/**
 * Minimal harness for the Connector's pure logic.
 *
 * The builder adapters are the risky part of this plugin — they rewrite
 * markup nobody on our side authored — so they are written to be testable
 * without a WordPress install. This file defines just enough of WordPress
 * for the units under test, plus a tiny assertion runner.
 *
 * Run: php connector-plugin/tests/run.php
 */

define('ABSPATH', __DIR__ . '/');

/* ── WordPress functions the units under test touch ── */

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0, $depth = 512) {
        return json_encode($data, $options | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE, $depth);
    }
}
if (!function_exists('wp_slash')) {
    function wp_slash($value) { return addslashes($value); }
}
if (!function_exists('wp_unslash')) {
    function wp_unslash($value) { return is_string($value) ? stripslashes($value) : $value; }
}
if (!function_exists('esc_html')) {
    function esc_html($t) { return htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); }
}
if (!function_exists('__')) {
    function __($t, $d = null) { return $t; }
}

/* ── In-memory postmeta, so adapters can be exercised end to end ── */

$GLOBALS['lvx_test_meta'] = array();

if (!function_exists('get_post_meta')) {
    function get_post_meta($post_id, $key = '', $single = false) {
        $v = isset($GLOBALS['lvx_test_meta'][$post_id][$key]) ? $GLOBALS['lvx_test_meta'][$post_id][$key] : '';
        if ($single) { return $v; }
        return $v === '' ? array() : array($v);
    }
}
if (!function_exists('update_post_meta')) {
    function update_post_meta($post_id, $key, $value) {
        $GLOBALS['lvx_test_meta'][$post_id][$key] = $value;
        return true;
    }
}
if (!function_exists('delete_post_meta')) {
    function delete_post_meta($post_id, $key) {
        unset($GLOBALS['lvx_test_meta'][$post_id][$key]);
        return true;
    }
}
if (!function_exists('maybe_unserialize')) {
    function maybe_unserialize($v) {
        if (!is_string($v)) { return $v; }
        $d = @unserialize($v);
        return ($d !== false || $v === 'b:0;') ? $d : $v;
    }
}
if (!function_exists('maybe_serialize')) {
    function maybe_serialize($v) { return (is_array($v) || is_object($v)) ? serialize($v) : $v; }
}

/* ── Assertion runner ── */

class T {
    public static $pass = 0;
    public static $fail = 0;
    public static $group = '';

    public static function group($name) { self::$group = $name; }

    public static function ok($cond, $what) {
        if ($cond) { self::$pass++; return; }
        self::$fail++;
        echo "  FAIL  [" . self::$group . "] $what\n";
    }

    public static function same($expected, $actual, $what) {
        if ($expected === $actual) { self::$pass++; return; }
        self::$fail++;
        echo "  FAIL  [" . self::$group . "] $what\n";
        echo "        expected: " . var_export($expected, true) . "\n";
        echo "        actual:   " . var_export($actual, true) . "\n";
    }

    public static function contains($haystack, $needle, $what) {
        self::ok(is_string($haystack) && strpos($haystack, $needle) !== false, $what
            . (is_string($haystack) && strpos($haystack, $needle) === false
                ? " (missing '" . $needle . "' in: " . substr($haystack, 0, 300) . ")" : ''));
    }

    public static function report() {
        echo "\n" . (self::$fail === 0 ? "PASS" : "FAIL")
            . ": " . self::$pass . " passed, " . self::$fail . " failed\n";
        return self::$fail === 0 ? 0 : 1;
    }
}
