<?php
/**
 * Plugin Name: Livesov Connector
 * Description: Applies Livesov Fix Engine instructions (llms.txt, robots.txt, head schema) and page-content edits to your site — including pages built with Elementor, Divi, WPBakery, Beaver Builder, Bricks, or Oxygen. Pulls securely from your Livesov account; no inbound access to your server is required.
 * Version: 1.3.0
 * Author: Livesov
 * License: GPL-2.0-or-later
 *
 * Security model (mirrors docs/FIX-ENGINE.md):
 *   - Authenticates with a per-brand bearer token (paste from Livesov).
 *   - Verifies each instruction's HMAC signature with the paired secret.
 *   - write_file is restricted to a root-file allow-list (no traversal).
 *   - stage_content parks the change behind a preview token and never
 *     touches the live page; publish_content promotes it, after snapshotting
 *     the previous state so the change can be reverted.
 *   - Pull + apply + ack run on wp-cron every 5 minutes (or "Poll now").
 *
 * Page-builder support: content edits are applied through a builder adapter
 * (includes/builders.php) that knows where each builder actually keeps its
 * content, so a fix lands in the layout the visitor sees rather than in a
 * post_content field the builder ignores.
 */

if (!defined('ABSPATH')) { exit; }

define('LVX_CONN_VERSION', '1.3.0');
define('LVX_CONN_OPT', 'livesov_connector_settings');
define('LVX_CONN_HEAD_OPT', 'livesov_connector_head');     // set_header_block content
define('LVX_CONN_ROBOTS_OPT', 'livesov_connector_robots'); // patch_robots content
define('LVX_CONN_STATUS_OPT', 'livesov_connector_status'); // last poll result + time

require_once __DIR__ . '/includes/text.php';
require_once __DIR__ . '/includes/builders.php';
require_once __DIR__ . '/includes/patch.php';
require_once __DIR__ . '/includes/preview.php';

Lvx_Preview::boot();

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
    if (isset($_POST['lvx_revert']) && check_admin_referer('lvx_revert')) {
        $res = lvx_conn_revert((int) $_POST['lvx_revert']);
        echo '<div class="notice notice-info"><p>Revert: ' . esc_html($res) . '</p></div>';
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
        <?php lvx_conn_render_page_changes(); ?>

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

/**
 * Pages the Connector has staged or published a change to, with a preview
 * link and a one-click undo. A site owner should never have to open Livesov
 * to find out what was changed on their own site, or to put it back.
 */
function lvx_conn_render_page_changes() {
    $staged = get_posts(array(
        'post_type'   => 'any',
        'numberposts' => 20,
        'meta_key'    => LVX_STAGED_META,
        'fields'      => 'ids',
    ));
    $published = get_posts(array(
        'post_type'   => 'any',
        'numberposts' => 20,
        'meta_key'    => LVX_BACKUP_META,
        'fields'      => 'ids',
    ));
    if (empty($staged) && empty($published)) { return; }
    ?>
    <hr style="margin:26px 0;">
    <h2>Page changes</h2>
    <table class="widefat striped" style="max-width:900px;">
        <thead><tr><th>Page</th><th>Builder</th><th>State</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($staged as $pid) :
            $rec = Lvx_Preview::staged($pid);
            if (!$rec) { continue; }
            $builder = Lvx_Builders::by_slug(isset($rec['builder']) ? $rec['builder'] : '');
            ?>
            <tr>
                <td><a href="<?php echo esc_url(get_permalink($pid)); ?>"><?php echo esc_html(get_the_title($pid)); ?></a></td>
                <td><?php echo esc_html($builder ? $builder->label() : '—'); ?></td>
                <td><span style="color:#b26a00;font-weight:600;">Staged (not live)</span></td>
                <td><a class="button button-secondary" target="_blank" rel="noopener"
                       href="<?php echo esc_url(add_query_arg('lvx_preview', $rec['token'], get_permalink($pid))); ?>">Preview</a></td>
            </tr>
        <?php endforeach; ?>
        <?php foreach ($published as $pid) :
            $backup = get_post_meta($pid, LVX_BACKUP_META, true);
            if (!is_array($backup)) { continue; }
            $builder = Lvx_Builders::by_slug(isset($backup['builder']) ? $backup['builder'] : '');
            ?>
            <tr>
                <td><a href="<?php echo esc_url(get_permalink($pid)); ?>"><?php echo esc_html(get_the_title($pid)); ?></a></td>
                <td><?php echo esc_html($builder ? $builder->label() : '—'); ?></td>
                <td><span style="color:#1e7e34;font-weight:600;">Published</span>
                    <?php if (!empty($backup['at'])) : ?>
                        <em>(<?php echo esc_html(human_time_diff($backup['at'], time())); ?> ago)</em>
                    <?php endif; ?>
                </td>
                <td>
                    <form method="post" style="margin:0;">
                        <?php wp_nonce_field('lvx_revert'); ?>
                        <button type="submit" name="lvx_revert" value="<?php echo esc_attr($pid); ?>"
                                class="button button-secondary">Undo this change</button>
                    </form>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
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
    // No secret configured → refuse. The signature is what stops a tampering
    // transport (or anyone holding just the bearer token) from injecting
    // arbitrary head markup or root files; skipping it would silently accept
    // unauthenticated instructions. Pairing always issues a secret — re-pair
    // if this install predates it.
    if ($secret === '' || (string) $sig === '') { return false; }
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
        if ($s['secret'] === '') {
            lvx_conn_ack($s, $id, false, 'signing secret missing — re-pair the connector and paste the secret'); $failed++; continue;
        }
        if (!lvx_conn_verify_sig($s['secret'], $id, $op, $content, $sig)) {
            lvx_conn_ack($s, $id, false, 'signature mismatch'); $failed++; continue;
        }

        $res = lvx_conn_apply($op, $payload, $id);
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
function lvx_conn_apply($op, $payload, $instruction_id = '') {
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
            // Ship-as-draft: compute the change and park it behind a preview
            // token, WITHOUT touching the live page.
            return lvx_conn_stage_content($payload, $instruction_id);

        case 'publish_content':
            // Promote the staged change to live.
            return lvx_conn_publish_content($payload, $instruction_id);

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
    if ($pid) { return (int) $pid; }

    // url_to_postid() is strict about the exact permalink. A brand configured
    // as https://example.com and a site running https://www.example.com/ (or
    // vice versa, or without the trailing slash) would otherwise report every
    // page as missing, so retry against the site's own home_url shape.
    $path = wp_parse_url($url, PHP_URL_PATH);
    if (!$path) { return 0; }
    $pid = url_to_postid(home_url($path));
    if ($pid) { return (int) $pid; }

    $pid = url_to_postid(home_url(untrailingslashit($path)));
    return $pid ? (int) $pid : 0;
}

function lvx_conn_stage_content($payload, $instruction_id = '') {
    $pid = lvx_conn_resolve_post($payload);
    if (!$pid) { return array('err' => 'page not found on this site', 'detail' => array()); }
    $post = get_post($pid);
    if (!$post) { return array('err' => 'post load failed', 'detail' => array()); }

    $patch = isset($payload['patch']) && is_array($payload['patch']) ? $payload['patch'] : array();
    $built = Lvx_Patch::build($post, $patch);
    if ($built['err'] !== '') { return array('err' => $built['err'], 'detail' => array()); }

    $preview = Lvx_Preview::stage($pid, array(
        'builder'  => $built['builder']->slug(),
        'state'    => $built['state'],
        'title'    => isset($patch['title']) ? (string) $patch['title'] : '',
        'patch'    => $patch,
        'appended' => $built['appended'],
        'fix'      => (string) $instruction_id,
    ));

    return array('err' => '', 'detail' => array(
        'previewUrl'   => $preview,
        'builder'      => $built['builder']->slug(),
        'builderLabel' => $built['builder']->label(),
        'nativeAppend' => $built['native'],
    ));
}

function lvx_conn_publish_content($payload, $instruction_id = '') {
    $pid = lvx_conn_resolve_post($payload);
    if (!$pid) { return array('err' => 'page not found on this site', 'detail' => array()); }
    $post = get_post($pid);
    if (!$post) { return array('err' => 'post load failed', 'detail' => array()); }

    // Prefer the state computed at stage time — it is exactly what the user
    // previewed and approved. Recompute only when publishing without a prior
    // stage on this host.
    $staged = Lvx_Preview::staged($pid);
    if ($staged && !empty($staged['state'])) {
        $state    = $staged['state'];
        $appended = isset($staged['appended']) ? $staged['appended'] : array();
        $patch    = isset($staged['patch']) && is_array($staged['patch']) ? $staged['patch'] : array();
        $builder  = Lvx_Builders::by_slug(isset($staged['builder']) ? $staged['builder'] : '');
        if (!$builder) { $builder = Lvx_Builders::for_post($post); }
    } else {
        $patch = isset($payload['patch']) && is_array($payload['patch']) ? $payload['patch'] : array();
        $built = Lvx_Patch::build($post, $patch);
        if ($built['err'] !== '') { return array('err' => $built['err'], 'detail' => array()); }
        $state    = $built['state'];
        $appended = $built['appended'];
        $builder  = $built['builder'];
    }

    // Snapshot before writing. Post revisions only carry post_content, so a
    // builder change is only reversible if we keep the previous meta too.
    lvx_conn_backup($post, $builder);
    wp_save_post_revision($pid);

    if (isset($state['post_content']) && $state['post_content'] !== null) {
        $update = array('ID' => $pid, 'post_content' => $state['post_content']);
        if (isset($patch['title'])) { $update['post_title'] = (string) $patch['title']; }
        $r = wp_update_post($update, true);
        if (is_wp_error($r)) {
            return array('err' => 'publish failed: ' . $r->get_error_message(), 'detail' => array());
        }
    } elseif (isset($patch['title'])) {
        wp_update_post(array('ID' => $pid, 'post_title' => (string) $patch['title']), true);
    }

    $builder->persist($pid, $state);

    foreach ($appended as $i => $html) {
        Lvx_Preview::record_appended($pid, ($instruction_id !== '' ? $instruction_id : 'lvx') . '-' . $i, $html);
    }

    lvx_conn_apply_meta($pid, $patch);
    $builder->clear_cache($pid);
    lvx_conn_purge_caches($pid);
    Lvx_Preview::clear_staged($pid);

    return array('err' => '', 'detail' => array(
        'url'     => get_permalink($pid),
        'builder' => $builder->slug(),
    ));
}

/** Keep the pre-publish state so a change can be undone. */
function lvx_conn_backup($post, $builder) {
    $current = $builder->read($post);
    update_post_meta($post->ID, LVX_BACKUP_META, array(
        'builder' => $builder->slug(),
        'state'   => $current,
        'title'   => $post->post_title,
        'at'      => time(),
    ));
}

/**
 * Restore the snapshot taken before the last publish. Exposed on the settings
 * page so a bad fix can be undone from WordPress without waiting on Livesov.
 */
function lvx_conn_revert($post_id) {
    $backup = get_post_meta($post_id, LVX_BACKUP_META, true);
    if (!is_array($backup) || empty($backup['state'])) { return 'nothing to revert'; }

    $builder = Lvx_Builders::by_slug(isset($backup['builder']) ? $backup['builder'] : '');
    if (!$builder) { return 'unknown builder in backup'; }

    if (isset($backup['state']['post_content']) && $backup['state']['post_content'] !== null) {
        wp_update_post(array(
            'ID'           => $post_id,
            'post_content' => $backup['state']['post_content'],
            'post_title'   => isset($backup['title']) ? $backup['title'] : get_the_title($post_id),
        ), true);
    }
    $builder->persist($post_id, $backup['state']);
    delete_post_meta($post_id, LVX_APPENDED_META);
    $builder->clear_cache($post_id);
    lvx_conn_purge_caches($post_id);
    delete_post_meta($post_id, LVX_BACKUP_META);

    return 'reverted';
}

/**
 * Nudge the page caches that would otherwise keep serving the old HTML.
 * All optional — each guard is a plugin that may simply not be installed.
 */
function lvx_conn_purge_caches($post_id) {
    if (function_exists('rocket_clean_post'))            { rocket_clean_post($post_id); }
    if (function_exists('w3tc_flush_post'))              { w3tc_flush_post($post_id); }
    if (function_exists('wp_cache_post_change'))         { wp_cache_post_change($post_id); }
    if (function_exists('sg_cachepress_purge_cache'))    { sg_cachepress_purge_cache(); }
    if (has_action('litespeed_purge_post'))              { do_action('litespeed_purge_post', $post_id); }
    if (class_exists('autoptimizeCache') && method_exists('autoptimizeCache', 'clearall')) {
        autoptimizeCache::clearall();
    }
    clean_post_cache($post_id);
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
