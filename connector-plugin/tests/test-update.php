<?php
/**
 * Lvx_Update — self-update decisions.
 *
 * The update response tells WordPress what zip to install with admin
 * privileges, so the validation is the security boundary: these pin down
 * exactly what is accepted and everything that must be rejected.
 */

T::group('update');

$good = json_encode(array(
    'version' => '1.5.0',
    'package' => 'https://livesov.com/wordpress-plugin/livesov-connector.zip',
    'url'     => 'https://livesov.com/integrations/wordpress',
));

/* ── parse_response accepts a well-formed answer ── */

$info = Lvx_Update::parse_response($good, 'livesov.com');
T::ok(is_array($info), 'valid response parses');
T::same('1.5.0', $info['version'], 'version extracted');
T::same('https://livesov.com/wordpress-plugin/livesov-connector.zip', $info['package'], 'package extracted');
T::same('https://livesov.com/integrations/wordpress', $info['url'], 'url extracted');

// Host comparison is case-insensitive (hosts are).
T::ok(is_array(Lvx_Update::parse_response($good, 'LIVESOV.COM')), 'host match ignores case');

/* ── and rejects everything else ── */

T::same(null, Lvx_Update::parse_response('not json', 'livesov.com'), 'malformed JSON rejected');
T::same(null, Lvx_Update::parse_response('"just a string"', 'livesov.com'), 'non-object JSON rejected');
T::same(null, Lvx_Update::parse_response('{}', 'livesov.com'), 'missing fields rejected');

T::same(null, Lvx_Update::parse_response(json_encode(array(
    'version' => '1.5', 'package' => 'https://livesov.com/x.zip',
)), 'livesov.com'), 'non-x.y.z version rejected');

T::same(null, Lvx_Update::parse_response(json_encode(array(
    'version' => '1.5.0', 'package' => 'http://livesov.com/x.zip',
)), 'livesov.com'), 'plain-http package rejected');

// The one that matters: a package pointing anywhere but the host the check
// was made against must never reach WordPress's installer.
T::same(null, Lvx_Update::parse_response(json_encode(array(
    'version' => '1.5.0', 'package' => 'https://evil.example.com/livesov-connector.zip',
)), 'livesov.com'), 'package on a different host rejected');

T::same(null, Lvx_Update::parse_response(json_encode(array(
    'version' => '1.5.0', 'package' => 'https://livesov.com.evil.example.com/x.zip',
)), 'livesov.com'), 'host-prefix spoof rejected');

T::same(null, Lvx_Update::parse_response(json_encode(array(
    'version' => '1.5.0', 'package' => '//livesov.com/x.zip',
)), 'livesov.com'), 'scheme-relative package rejected');

/* ── is_newer ── */

T::ok(Lvx_Update::is_newer('1.4.0', '1.5.0'), 'newer minor offered');
T::ok(Lvx_Update::is_newer('1.4.0', '1.4.1'), 'newer patch offered');
T::ok(Lvx_Update::is_newer('1.9.0', '1.10.0'), 'numeric compare, not string (1.10 > 1.9)');
T::ok(!Lvx_Update::is_newer('1.4.0', '1.4.0'), 'same version not offered');
T::ok(!Lvx_Update::is_newer('1.4.0', '1.3.9'), 'downgrade not offered');

/* ── update_object carries what WordPress reads ── */

$o = Lvx_Update::update_object('livesov-connector/livesov-connector.php', $info);
T::same('livesov-connector', $o->slug, 'slug is the plugin directory');
T::same('livesov-connector/livesov-connector.php', $o->plugin, 'plugin is the basename');
T::same('1.5.0', $o->new_version, 'new_version set');
T::same('https://livesov.com/wordpress-plugin/livesov-connector.zip', $o->package, 'package set');
