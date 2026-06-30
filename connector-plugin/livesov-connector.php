<?php
/**
 * Plugin Name: Livesov Connector
 * Description: Applies Livesov Fix Engine Channel-B instructions (llms.txt, robots.txt, head schema) by securely pulling them from your Livesov account. No inbound access to your server is required — the plugin only makes outbound requests.
 * Version: 1.0.0
 * Author: Livesov
 * License: GPL-2.0-or-later
 *
 * Security model (mirrors docs/FIX-ENGINE.md):
 *   - Authenticates with a per-brand bearer token (paste from Livesov).
 *   - Verifies each instruction's HMAC signature with the paired secret.
 *   - write_file is restricted to a root-file allow-list (no traversal).
 *   - Pull + apply + ack run on wp-cron every 5 minutes (or "Poll now").
 */

if (!defined('ABSPATH')) { exit; }

define('LVX_CONN_OPT', 'livesov_connector_settings');
define('LVX_CONN_HEAD_OPT', 'livesov_connector_head');     // set_header_block content
define('LVX_CONN_ROBOTS_OPT', 'livesov_connector_robots'); // patch_robots content

/* ─────────────── Settings ─────────────── */

function lvx_conn_settings() {
    $d = array('pull_url' => '', 'token' => '', 'secret' => '');
    return wp_parse_args(get_option(LVX_CONN_OPT, array()), $d);
}

add_action('admin_menu', function () {
    add_options_page('Livesov Connector', 'Livesov Connector', 'manage_options', 'livesov-connector', 'lvx_conn_admin_page');
});

add_action('admin_init', function () {
    register_setting('lvx_conn_group', LVX_CONN_OPT, 'lvx_conn_sanitize');
});

function lvx_conn_sanitize($in) {
    return array(
        'pull_url' => esc_url_raw(trim($in['pull_url'] ?? '')),
        'token'    => sanitize_text_field(trim($in['token'] ?? '')),
        'secret'   => sanitize_text_field(trim($in['secret'] ?? '')),
    );
}

function lvx_conn_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    if (isset($_POST['lvx_poll_now']) && check_admin_referer('lvx_poll_now')) {
        $res = lvx_conn_poll();
        echo '<div class="notice notice-info"><p>Poll result: ' . esc_html($res) . '</p></div>';
    }
    $s = lvx_conn_settings();
    ?>
    <div class="wrap">
        <h1>Livesov Connector</h1>
        <p>Paste the values from your Livesov dashboard (Fix Engine → Connections → Connector).</p>
        <form method="post" action="options.php">
            <?php settings_fields('lvx_conn_group'); ?>
            <table class="form-table">
                <tr><th>Pull URL</th><td><input type="url" name="<?php echo LVX_CONN_OPT; ?>[pull_url]" value="<?php echo esc_attr($s['pull_url']); ?>" class="regular-text" placeholder="https://livesov.com/api/connector/instructions"></td></tr>
                <tr><th>Token</th><td><input type="text" name="<?php echo LVX_CONN_OPT; ?>[token]" value="<?php echo esc_attr($s['token']); ?>" class="regular-text"></td></tr>
                <tr><th>Signing secret</th><td><input type="text" name="<?php echo LVX_CONN_OPT; ?>[secret]" value="<?php echo esc_attr($s['secret']); ?>" class="regular-text"></td></tr>
            </table>
            <?php submit_button('Save settings'); ?>
        </form>
        <form method="post">
            <?php wp_nonce_field('lvx_poll_now'); ?>
            <input type="submit" name="lvx_poll_now" class="button button-secondary" value="Poll now">
        </form>
    </div>
    <?php
}

/* ─────────────── Scheduling ─────────────── */

add_filter('cron_schedules', function ($s) {
    $s['lvx_5min'] = array('interval' => 300, 'display' => 'Every 5 minutes (Livesov)');
    return $s;
});

register_activation_hook(__FILE__, function () {
    if (!wp_next_scheduled('lvx_conn_poll_event')) {
        wp_schedule_event(time() + 60, 'lvx_5min', 'lvx_conn_poll_event');
    }
});
register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('lvx_conn_poll_event');
});
add_action('lvx_conn_poll_event', 'lvx_conn_poll');

/* ─────────────── Allow-list + signature ─────────────── */

function lvx_conn_path_allowed($path) {
    if (!is_string($path) || $path === '' || $path[0] !== '/') { return false; }
    if (strpos($path, '..') !== false || strpos($path, "\0") !== false || strpos($path, '\\') !== false) { return false; }
    if ($path === '/llms.txt' || $path === '/robots.txt') { return true; }
    return (bool) preg_match('#^/\.well-known/[A-Za-z0-9._-]+$#', $path);
}

function lvx_conn_verify_sig($secret, $id, $op, $content, $sig) {
    if ($secret === '') { return true; } // no secret configured → skip (token still gates access)
    $expected = hash_hmac('sha256', $id . '|' . $op . '|' . hash('sha256', $content), $secret);
    return hash_equals($expected, (string) $sig);
}

/* ─────────────── Poll → apply → ack ─────────────── */

function lvx_conn_poll() {
    $s = lvx_conn_settings();
    if (empty($s['pull_url']) || empty($s['token'])) { return 'not configured'; }

    $resp = wp_remote_get($s['pull_url'], array(
        'headers' => array('Authorization' => 'Bearer ' . $s['token']),
        'timeout' => 20,
    ));
    if (is_wp_error($resp)) { return 'pull error: ' . $resp->get_error_message(); }
    $code = wp_remote_retrieve_response_code($resp);
    if ($code !== 200) { return 'pull HTTP ' . $code; }

    $body = json_decode(wp_remote_retrieve_body($resp), true);
    $instructions = isset($body['instructions']) && is_array($body['instructions']) ? $body['instructions'] : array();
    if (empty($instructions)) { return 'no pending instructions'; }

    $applied = 0; $failed = 0;
    foreach ($instructions as $ins) {
        $id      = isset($ins['id']) ? (string) $ins['id'] : '';
        $op      = isset($ins['op']) ? (string) $ins['op'] : '';
        $payload = isset($ins['payload']) && is_array($ins['payload']) ? $ins['payload'] : array();
        $sig     = isset($ins['sig']) ? (string) $ins['sig'] : '';
        if ($id === '') { continue; }

        $content = isset($payload['content']) ? (string) $payload['content'] : wp_json_encode($payload);
        if (!lvx_conn_verify_sig($s['secret'], $id, $op, $content, $sig)) {
            lvx_conn_ack($s, $id, false, 'signature mismatch'); $failed++; continue;
        }

        $err = lvx_conn_apply($op, $payload);
        if ($err === '') { lvx_conn_ack($s, $id, true, null); $applied++; }
        else { lvx_conn_ack($s, $id, false, $err); $failed++; }
    }
    return "applied $applied, failed $failed";
}

/** Apply one instruction. Returns '' on success or an error string. */
function lvx_conn_apply($op, $payload) {
    switch ($op) {
        case 'write_file':
            $path = isset($payload['path']) ? $payload['path'] : '';
            if (!lvx_conn_path_allowed($path)) { return 'path not allowed: ' . $path; }
            $content = isset($payload['content']) ? (string) $payload['content'] : '';
            $full = rtrim(ABSPATH, '/') . '/' . ltrim($path, '/');
            $ok = @file_put_contents($full, $content);
            return ($ok === false) ? 'could not write ' . $path : '';

        case 'set_header_block':
            // Stored and echoed on wp_head (we never edit theme files).
            update_option(LVX_CONN_HEAD_OPT, (string) ($payload['content'] ?? ''));
            return '';

        case 'patch_robots':
            // Appended via the robots_txt filter (works with WP's virtual robots.txt).
            update_option(LVX_CONN_ROBOTS_OPT, (string) ($payload['content'] ?? ''));
            return '';

        default:
            return 'unknown op: ' . $op;
    }
}

function lvx_conn_ack($s, $id, $ok, $error) {
    $url = rtrim($s['pull_url'], '/') . '/' . rawurlencode($id) . '/ack';
    wp_remote_post($url, array(
        'headers' => array('Authorization' => 'Bearer ' . $s['token'], 'Content-Type' => 'application/json'),
        'timeout' => 15,
        'body'    => wp_json_encode($ok ? array('ok' => true) : array('ok' => false, 'error' => $error)),
    ));
}

/* ─────────────── Render stored head / robots ─────────────── */

add_action('wp_head', function () {
    $head = get_option(LVX_CONN_HEAD_OPT, '');
    if (!empty($head)) {
        // Content is generated by Livesov (JSON-LD / meta); printed verbatim.
        echo "\n" . $head . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
});

add_filter('robots_txt', function ($output) {
    $extra = get_option(LVX_CONN_ROBOTS_OPT, '');
    if (!empty($extra)) { $output .= "\n" . $extra . "\n"; }
    return $output;
}, 20);
