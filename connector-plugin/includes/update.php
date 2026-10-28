<?php
/**
 * Lvx_Update — self-update decisions.
 *
 * The plugin is installed from a zip on livesov.com, not wordpress.org, so
 * WordPress has no update channel for it: whatever version was uploaded is
 * the version the site keeps, forever. That is how a broken release stays in
 * the field after the fix ships. The main plugin file feeds this class's
 * answers into the `update_plugins` transient so wp-admin shows its normal
 * "update available" row and one-click update.
 *
 * Everything here is pure (no WordPress calls) so the decisions — what counts
 * as a valid update response, when to offer it — are unit tested. The
 * fetching and transient caching stay in livesov-connector.php.
 */

if (!defined('ABSPATH')) { exit; }

class Lvx_Update {

    /**
     * Parse + validate an update-check response body.
     *
     * The response tells WordPress what zip to install with admin privileges,
     * so it is validated strictly rather than trusted: the version must be
     * x.y.z, and the package URL must be https on the SAME HOST the check was
     * made against. The endpoint is fetched over TLS from the configured
     * Livesov URL — host-pinning the package means a bad response can, at
     * worst, point at a broken zip on that host, never at code elsewhere.
     *
     * @param string $body          Raw JSON response body.
     * @param string $expected_host Host the update check was requested from.
     * @return array{version:string,package:string,url:string}|null
     */
    public static function parse_response($body, $expected_host) {
        $data = json_decode((string) $body, true);
        if (!is_array($data)) { return null; }

        $version = isset($data['version']) ? (string) $data['version'] : '';
        $package = isset($data['package']) ? (string) $data['package'] : '';
        if (!preg_match('/^\d+\.\d+\.\d+$/', $version)) { return null; }

        $parts = parse_url($package);
        if (!is_array($parts)
            || !isset($parts['scheme'], $parts['host'])
            || strtolower($parts['scheme']) !== 'https'
            || strcasecmp($parts['host'], (string) $expected_host) !== 0) {
            return null;
        }

        return array(
            'version' => $version,
            'package' => $package,
            'url'     => isset($data['url']) ? (string) $data['url'] : '',
        );
    }

    /** Is the remote version strictly newer than the installed one? */
    public static function is_newer($current, $remote) {
        return version_compare((string) $remote, (string) $current, '>');
    }

    /**
     * The object WordPress expects under $transient->response[$basename].
     *
     * @param string $basename e.g. livesov-connector/livesov-connector.php
     * @param array  $info     Validated parse_response() result.
     */
    public static function update_object($basename, $info) {
        $o = new stdClass();
        $o->slug        = dirname($basename);
        $o->plugin      = $basename;
        $o->new_version = $info['version'];
        $o->package     = $info['package'];
        $o->url         = $info['url'];
        return $o;
    }
}
