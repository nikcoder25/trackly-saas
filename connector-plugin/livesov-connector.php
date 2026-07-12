<?php
/**
 * Plugin Name: Livesov Connector
 * Description: Applies Livesov Fix Engine Channel-B instructions (llms.txt, robots.txt, head schema) and ship-as-draft page edits by securely pulling them from your Livesov account. No inbound access to your server is required — the plugin only makes outbound requests.
 * Version: 1.2.0
 * Author: Livesov
 * License: GPL-2.0-or-later
 *
 * Security model (mirrors docs/FIX-ENGINE.md):
 *   - Authenticates with a per-brand bearer token (paste from Livesov).
 *   - Verifies each instruction's HMAC signature with the paired secret.
 *   - write_file is restricted to a root-file allow-list (no traversal).
 *   - stage_content saves a DRAFT revision (never touches the live page);
 *     publish_content promotes it. A backup of the live content is kept so
 *     publish is reversible from wp-admin → Revisions.
 *   - Pull + apply + ack run on wp-cron every 5 minutes (or "Poll now").
 */

if (!defined('ABSPATH')) { exit; }

define('LVX_CONN_VERSION', '1.2.0');
define('LVX_CONN_OPT', 'livesov_connector_settings');
define('LVX_CONN_HEAD_OPT', 'livesov_connector_head');     // set_header_block content
define('LVX_CONN_ROBOTS_OPT', 'livesov_connector_robots'); // patch_robots content
define('LVX_CONN_STATUS_OPT', 'livesov_connector_status'); // last poll result + time
define('LVX_CONN_STAGED_OPT', 'livesov_connector_staged');  // post_id => staged patch

function lvx_conn_ua() {
    return 'LivesovConnector/' . LVX_CONN_VERSION . '; ' . home_url('/');
}

/* ─────────────── Settings ─────────────── */

function lvx_conn_settings() {
    $d = array('pull_url' => '', 'token' => '', 'secret' => '', 'livesov_url' => 'https://livesov.com');
    return wp_parse_args(get_option(LVX_CONN_OPT, array()), $d);
}

add_action('admin_menu', function () {
    add_options_page('Livesov Connector', 'Livesov Connector', 'manage_options', 'livesov-connector', 'lvx_conn_admin_page');
});

add_action('admin_init', function () {
    register_setting('lvx_conn_group', LVX_CONN_OPT, 'lvx_conn_sanitize');
});

function lvx_conn_sanitize($in) {
    $existing = get_option(LVX_CONN_OPT, array());
    return array(
        'pull_url'    => esc_url_raw(trim($in['pull_url'] ?? '')),
        'token'       => sanitize_text_field(trim($in['token'] ?? '')),
        'secret'      => sanitize_text_field(trim($in['secret'] ?? '')),
        // Preserve a livesov_url set via the one-click flow if the manual
        // form doesn't include it.
        'livesov_url' => esc_url_raw(trim($in['livesov_url'] ?? ($existing['livesov_url'] ?? 'https://livesov.com'))),
    );
}

function lvx_conn_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    if (isset($_POST['lvx_poll_now']) && check_admin_referer('lvx_poll_now')) {
        $res = lvx_conn_poll();
        echo '<div class="notice notice-info"><p>Poll result: ' . esc_html($res) . '</p></div>';
    }
    $s = lvx_conn_settings();
    $connected = !empty($s['pull_url']) && !empty($s['token']);
    ?>
    <div class="wrap">
        <h1>Livesov Connector</h1>

        <?php if ($connected) : ?>
            <div class="notice notice-success inline" style="margin:14px 0;"><p><strong>Connected to Livesov.</strong> Approved fixes will be applied automatically every 5 minutes.</p></div>
        <?php endif; ?>

        <h2>Connect in one click</h2>
        <p>The easy way — like “Sign in with Google”. Click connect, approve the site in Livesov, and the credentials fill in automatically. No copy-paste.</p>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="lvx_connect_start">
            <?php wp_nonce_field('lvx_connect_start'); ?>
            <table class="form-table">
                <tr><th>Livesov URL</th><td><input type="url" name="livesov_url" value="<?php echo esc_attr($s['livesov_url']); ?>" class="regular-text" placeholder="https://livesov.com"><p class="description">Change only if you self-host Livesov.</p></td></tr>
            </table>
            <?php submit_button($connected ? 'Reconnect with Livesov' : 'Connect with Livesov', 'primary'); ?>
        </form>

        <hr style="margin:26px 0;">

        <h2>Connect manually</h2>
        <p>Or paste the values from your Livesov dashboard (Fix Engine → Connections → Connector).</p>
        <form method="post" action="options.php">
            <?php settings_fields('lvx_conn_group'); ?>
            <table class="form-table">
                <tr><th>Pull URL</th><td><input type="url" name="<?php echo LVX_CONN_OPT; ?>[pull_url]" value="<?php echo esc_attr($s['pull_url']); ?>" class="regular-text" placeholder="https://livesov.com/api/connector/instructions"></td></tr>
                <tr><th>Token</th><td><input type="text" name="<?php echo LVX_CONN_OPT; ?>[token]" value="<?php echo esc_attr($s['token']); ?>" class="regular-text"></td></tr>
                <tr><th>Signing secret</th><td><input type="text" name="<?php echo LVX_CONN_OPT; ?>[secret]" value="<?php echo esc_attr($s['secret']); ?>" class="regular-text"></td></tr>
                <input type="hidden" name="<?php echo LVX_CONN_OPT; ?>[livesov_url]" value="<?php echo esc_attr($s['livesov_url']); ?>">
            </table>
            <?php submit_button('Save settings'); ?>
        </form>
        <form method="post">
            <?php wp_nonce_field('lvx_poll_now'); ?>
            <input type="submit" name="lvx_poll_now" class="button button-secondary" value="Poll now">
        </form>
        <?php $st = get_option(LVX_CONN_STATUS_OPT); if (is_array($st)) : ?>
            <p style="margin-top:14px;color:#555;">
                <strong>Last poll:</strong> <?php echo esc_html($st['msg']); ?>
                <em>(<?php echo esc_html(human_time_diff($st['at'], time())); ?> ago)</em>
            </p>
        <?php endif; ?>
        <p style="color:#888;">Plugin v<?php echo esc_html(LVX_CONN_VERSION); ?> · polls every 5 minutes.</p>
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

/* ─────────────── One-click connect handshake ─────────────── */

/** Start: persist the Livesov URL, mint a state nonce, bounce to consent. */
add_action('admin_post_lvx_connect_start', function () {
    if (!current_user_can('manage_options')) { wp_die('Forbidden'); }
    check_admin_referer('lvx_connect_start');

    $livesov = esc_url_raw(trim($_POST['livesov_url'] ?? 'https://livesov.com'));
    if (empty($livesov)) { $livesov = 'https://livesov.com'; }
    $s = lvx_conn_settings();
    $s['livesov_url'] = $livesov;
    update_option(LVX_CONN_OPT, $s);

    $state = wp_generate_password(32, false);
    set_transient('lvx_conn_state', $state, 15 * MINUTE_IN_SECONDS);

    $callback = admin_url('admin-post.php?action=lvx_connect_callback');
    $authorize = trailingslashit($livesov) . 'connect/connector?' . http_build_query(array(
        'site'     => home_url('/'),
        'callback' => $callback,
        'state'    => $state,
    ));
    wp_redirect($authorize);
    exit;
});

/** Callback: verify state, exchange the one-time code for credentials. */
add_action('admin_post_lvx_connect_callback', function () {
    if (!current_user_can('manage_options')) { wp_die('Forbidden'); }

    $code  = isset($_GET['code']) ? sanitize_text_field($_GET['code']) : '';
    $state = isset($_GET['state']) ? sanitize_text_field($_GET['state']) : '';
    $saved = get_transient('lvx_conn_state');
    delete_transient('lvx_conn_state');

    $settings_url = admin_url('options-general.php?page=livesov-connector');
    if ($code === '' || $state === '' || !is_string($saved) || !hash_equals($saved, $state)) {
        wp_redirect(add_query_arg('lvx_connect', 'badstate', $settings_url));
        exit;
    }

    $s = lvx_conn_settings();
    $exchange = trailingslashit($s['livesov_url']) . 'api/connect/connector/exchange';
    $resp = wp_remote_post($exchange, array(
        'headers' => array('Content-Type' => 'application/json', 'User-Agent' => lvx_conn_ua()),
        'timeout' => 20,
        'body'    => wp_json_encode(array('code' => $code)),
    ));
    if (is_wp_error($resp) || wp_remote_retrieve_response_code($resp) !== 200) {
        wp_redirect(add_query_arg('lvx_connect', 'exchangefail', $settings_url));
        exit;
    }
    $body = json_decode(wp_remote_retrieve_body($resp), true);
    if (empty($body['token']) || empty($body['pullUrl'])) {
        wp_redirect(add_query_arg('lvx_connect', 'exchangefail', $settings_url));
        exit;
    }

    $s['pull_url'] = esc_url_raw((string) $body['pullUrl']);
    $s['token']    = sanitize_text_field((string) $body['token']);
    $s['secret']   = sanitize_text_field((string) ($body['hmacSecret'] ?? ''));
    update_option(LVX_CONN_OPT, $s);

    // Apply anything already pending right away.
    lvx_conn_poll();
    wp_redirect(add_query_arg('lvx_connect', 'ok', $settings_url));
    exit;
});

// Surface the handshake result on the settings page.
add_action('admin_notices', function () {
    if (empty($_GET['page']) || $_GET['page'] !== 'livesov-connector' || empty($_GET['lvx_connect'])) { return; }
    $map = array(
        'ok'           => array('success', 'Connected to Livesov — credentials saved and the first sync ran.'),
        'badstate'     => array('error', 'Connect failed: the request expired or didn’t match. Please try again.'),
        'exchangefail' => array('error', 'Connect failed: could not exchange the authorization code with Livesov.'),
    );
    $k = sanitize_text_field($_GET['lvx_connect']);
    if (!isset($map[$k])) { return; }
    echo '<div class="notice notice-' . esc_attr($map[$k][0]) . ' is-dismissible"><p>' . esc_html($map[$k][1]) . '</p></div>';
});

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
        'headers' => array('Authorization' => 'Bearer ' . $s['token'], 'User-Agent' => lvx_conn_ua()),
        'timeout' => 20,
    ));
    if (is_wp_error($resp)) { return lvx_conn_status('pull error: ' . $resp->get_error_message()); }
    $code = wp_remote_retrieve_response_code($resp);
    if ($code !== 200) { return lvx_conn_status('pull HTTP ' . $code); }

    $body = json_decode(wp_remote_retrieve_body($resp), true);
    $instructions = isset($body['instructions']) && is_array($body['instructions']) ? $body['instructions'] : array();
    if (empty($instructions)) { return lvx_conn_status('connected · no pending instructions'); }

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

        $res = lvx_conn_apply($op, $payload);
        if ($res['err'] === '') { lvx_conn_ack($s, $id, true, null, $res['detail']); $applied++; }
        else { lvx_conn_ack($s, $id, false, $res['err'], array()); $failed++; }
    }
    return lvx_conn_status("applied $applied, failed $failed");
}

/** Persist + return the last-poll status string for the settings page. */
function lvx_conn_status($msg) {
    update_option(LVX_CONN_STATUS_OPT, array('msg' => $msg, 'at' => time()));
    return $msg;
}

/**
 * Apply one instruction. Returns array('err' => '' on success or an error
 * string, 'detail' => extra data for the ack, e.g. a preview URL).
 */
function lvx_conn_apply($op, $payload) {
    $ok = array('err' => '', 'detail' => array());
    switch ($op) {
        case 'write_file':
            $path = isset($payload['path']) ? $payload['path'] : '';
            if (!lvx_conn_path_allowed($path)) { return array('err' => 'path not allowed: ' . $path, 'detail' => array()); }
            $content = isset($payload['content']) ? (string) $payload['content'] : '';
            $full = rtrim(ABSPATH, '/') . '/' . ltrim($path, '/');
            $w = @file_put_contents($full, $content);
            return ($w === false) ? array('err' => 'could not write ' . $path, 'detail' => array()) : $ok;

        case 'set_header_block':
            // Stored and echoed on wp_head (we never edit theme files).
            update_option(LVX_CONN_HEAD_OPT, (string) ($payload['content'] ?? ''));
            return $ok;

        case 'patch_robots':
            // Appended via the robots_txt filter (works with WP's virtual robots.txt).
            update_option(LVX_CONN_ROBOTS_OPT, (string) ($payload['content'] ?? ''));
            return $ok;

        case 'stage_content':
            // Ship-as-draft: save the change as a DRAFT revision + preview
            // link, WITHOUT touching the live page.
            return lvx_conn_stage_content($payload);

        case 'publish_content':
            // Promote the staged draft to live.
            return lvx_conn_publish_content($payload);

        default:
            return array('err' => 'unknown op: ' . $op, 'detail' => array());
    }
}

/* ─────────────── Ship-as-draft (stage / publish) ─────────────── */

/** Resolve a payload URL to a local post id, or 0. */
function lvx_conn_resolve_post($payload) {
    $url = isset($payload['url']) ? (string) $payload['url'] : '';
    if ($url === '') { return 0; }
    $pid = url_to_postid($url);
    return $pid ? (int) $pid : 0;
}

/**
 * Compute the new post_content from a patch + the current content, so both
 * staging (preview) and publishing apply the body change identically.
 */
function lvx_conn_patched_content($current, $patch) {
    $content = (string) $current;
    if (isset($patch['bodyHtml'])) {
        $content = (string) $patch['bodyHtml'];
    }
    if (isset($patch['bodyReplace']) && is_array($patch['bodyReplace'])
        && isset($patch['bodyReplace']['find'])) {
        $find = (string) $patch['bodyReplace']['find'];
        $repl = isset($patch['bodyReplace']['replace']) ? (string) $patch['bodyReplace']['replace'] : '';
        if ($find !== '' && strpos($content, $find) !== false) {
            $pos = strpos($content, $find);
            $content = substr($content, 0, $pos) . $repl . substr($content, $pos + strlen($find));
        }
    }
    if (isset($patch['bodyAppend'])) {
        $content .= "\n\n" . (string) $patch['bodyAppend'];
    }
    return $content;
}

/** Write the SEO meta fields a patch carries (Yoast + Rank Math). */
function lvx_conn_apply_meta($post_id, $patch) {
    if (isset($patch['title'])) {
        update_post_meta($post_id, '_yoast_wpseo_title', (string) $patch['title']);
        update_post_meta($post_id, 'rank_math_title', (string) $patch['title']);
    }
    if (isset($patch['metaDescription'])) {
        update_post_meta($post_id, '_yoast_wpseo_metadesc', (string) $patch['metaDescription']);
        update_post_meta($post_id, 'rank_math_description', (string) $patch['metaDescription']);
    }
    if (isset($patch['canonical'])) {
        update_post_meta($post_id, '_yoast_wpseo_canonical', (string) $patch['canonical']);
        update_post_meta($post_id, 'rank_math_canonical_url', (string) $patch['canonical']);
    }
    if (isset($patch['indexable']) && $patch['indexable']) {
        update_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', '0');
        update_post_meta($post_id, 'rank_math_robots', array('index', 'follow'));
    }
}

function lvx_conn_stage_content($payload) {
    $pid = lvx_conn_resolve_post($payload);
    if (!$pid) { return array('err' => 'page not found on this site', 'detail' => array()); }
    $patch = isset($payload['patch']) && is_array($payload['patch']) ? $payload['patch'] : array();
    $post  = get_post($pid);
    if (!$post) { return array('err' => 'post load failed', 'detail' => array()); }

    // Persist the pending patch so publish can re-apply it deterministically.
    $staged = get_option(LVX_CONN_STAGED_OPT, array());
    if (!is_array($staged)) { $staged = array(); }
    $staged[$pid] = array('patch' => $patch, 'at' => time());
    update_option(LVX_CONN_STAGED_OPT, $staged);

    // Create a preview-able draft revision (autosave) carrying the new
    // content/title — this NEVER changes the published page.
    $new_content = lvx_conn_patched_content($post->post_content, $patch);
    $new_title   = isset($patch['title']) ? (string) $patch['title'] : $post->post_title;
    if (function_exists('wp_create_post_autosave')) {
        wp_create_post_autosave(array(
            'post_ID'      => $pid,
            'post_title'   => $new_title,
            'post_content' => $new_content,
            'post_type'    => $post->post_type,
        ));
    } else {
        wp_save_post_revision($pid);
    }

    $preview = get_preview_post_link($pid);
    return array('err' => '', 'detail' => array('previewUrl' => $preview ? $preview : get_permalink($pid)));
}

function lvx_conn_publish_content($payload) {
    $pid = lvx_conn_resolve_post($payload);
    if (!$pid) { return array('err' => 'page not found on this site', 'detail' => array()); }
    $post = get_post($pid);
    if (!$post) { return array('err' => 'post load failed', 'detail' => array()); }

    // Prefer the patch saved at stage time; fall back to the one on the
    // publish payload (covers a publish without a prior stage on this host).
    $staged = get_option(LVX_CONN_STAGED_OPT, array());
    $patch  = (is_array($staged) && isset($staged[$pid]['patch']) && is_array($staged[$pid]['patch']))
        ? $staged[$pid]['patch']
        : (isset($payload['patch']) && is_array($payload['patch']) ? $payload['patch'] : array());

    // wp_update_post snapshots the prior content into a revision first, so
    // this is reversible from wp-admin → Revisions.
    $new_content = lvx_conn_patched_content($post->post_content, $patch);
    $update = array('ID' => $pid, 'post_content' => $new_content);
    if (isset($patch['title'])) { $update['post_title'] = (string) $patch['title']; }
    $r = wp_update_post($update, true);
    if (is_wp_error($r)) { return array('err' => 'publish failed: ' . $r->get_error_message(), 'detail' => array()); }
    lvx_conn_apply_meta($pid, $patch);

    // Clear the staged entry now that it's live.
    if (is_array($staged) && isset($staged[$pid])) { unset($staged[$pid]); update_option(LVX_CONN_STAGED_OPT, $staged); }
    return array('err' => '', 'detail' => array('url' => get_permalink($pid)));
}

function lvx_conn_ack($s, $id, $ok, $error, $detail = array()) {
    $url = rtrim($s['pull_url'], '/') . '/' . rawurlencode($id) . '/ack';
    $payload = $ok ? array('ok' => true, 'detail' => $detail) : array('ok' => false, 'error' => $error);
    wp_remote_post($url, array(
        'headers' => array('Authorization' => 'Bearer ' . $s['token'], 'Content-Type' => 'application/json', 'User-Agent' => lvx_conn_ua()),
        'timeout' => 15,
        'body'    => wp_json_encode($payload),
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
