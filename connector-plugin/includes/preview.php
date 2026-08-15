<?php
/**
 * Staging, preview, and the append fallback.
 *
 * Ship-as-draft has to work the same way on every builder, and WordPress
 * gives us no single mechanism that does. Post revisions only carry
 * post_content, so an Elementor or Bricks change staged as a revision
 * previews as the *old* page. Autosaves have the same blind spot and also
 * require the viewer to be logged into wp-admin — which the person reviewing
 * the fix in Livesov generally is not.
 *
 * So staging is done our way: the fully-computed new state is parked in
 * postmeta, and a tokenised preview URL swaps it in at render time for that
 * one request. Nothing about the published page changes until publish runs.
 * One mechanism, every builder, and a preview link that can be opened by
 * someone who has never seen this site's wp-admin.
 */

if (!defined('ABSPATH')) { exit; }

define('LVX_STAGED_META',   '_lvx_staged');    // pending change + preview token
define('LVX_BACKUP_META',   '_lvx_backup');    // pre-publish snapshot, for revert
define('LVX_APPENDED_META', '_lvx_appended');  // blocks rendered via the_content

/** How long a preview link stays live. Long enough to review, not forever. */
define('LVX_PREVIEW_TTL', 14 * DAY_IN_SECONDS);

class Lvx_Preview {

    /** Post id being previewed this request, or 0. */
    private static $active = 0;
    /** Re-entrancy guard: our meta filter calls get_post_meta itself. */
    private static $inside = false;

    public static function boot() {
        add_action('wp', array(__CLASS__, 'detect'));
        add_filter('the_content', array(__CLASS__, 'append_blocks'), 20);
    }

    /* ─────────────── Staging ─────────────── */

    /**
     * Park a computed state as the pending change and return a preview URL.
     *
     * @param int    $post_id
     * @param array  $record  builder slug, state, title, seo, appended blocks
     * @return string preview URL
     */
    public static function stage($post_id, $record) {
        $record['token']   = bin2hex(random_bytes(16));
        $record['expires'] = time() + LVX_PREVIEW_TTL;
        $record['at']      = time();
        update_post_meta($post_id, LVX_STAGED_META, $record);

        return add_query_arg('lvx_preview', $record['token'], get_permalink($post_id));
    }

    public static function staged($post_id) {
        $r = get_post_meta($post_id, LVX_STAGED_META, true);
        return is_array($r) ? $r : null;
    }

    public static function clear_staged($post_id) {
        delete_post_meta($post_id, LVX_STAGED_META);
    }

    /* ─────────────── Preview rendering ─────────────── */

    /**
     * Decide whether this request is a valid preview, and if so hook the
     * filters that swap the staged content in.
     */
    public static function detect() {
        if (empty($_GET['lvx_preview']) || !is_singular()) { return; }

        $post = get_queried_object();
        if (!$post || empty($post->ID)) { return; }

        $staged = self::staged($post->ID);
        if (!$staged || empty($staged['token'])) { return; }
        if (!hash_equals((string) $staged['token'], sanitize_text_field(wp_unslash($_GET['lvx_preview'])))) { return; }
        if (!empty($staged['expires']) && time() > (int) $staged['expires']) { return; }

        self::$active = (int) $post->ID;

        add_filter('get_post_metadata', array(__CLASS__, 'filter_meta'), 10, 4);
        add_filter('the_content', array(__CLASS__, 'filter_content'), 1);
        add_filter('the_title', array(__CLASS__, 'filter_title'), 10, 2);

        // A preview is a temporary copy of a page that also exists at its real
        // URL. Letting it be indexed would create a duplicate of the very page
        // we are trying to help rank.
        add_filter('wp_robots', array(__CLASS__, 'noindex'));
        add_action('wp_head', array(__CLASS__, 'noindex_tag'), 1);
        add_action('wp_head', array(__CLASS__, 'notice_style'));
        add_action('wp_body_open', array(__CLASS__, 'notice'));
    }

    public static function filter_meta($value, $object_id, $meta_key, $single) {
        if ($object_id !== self::$active || self::$inside) { return $value; }

        self::$inside = true;
        $staged = self::staged($object_id);
        self::$inside = false;

        if (!$staged || empty($staged['state']['meta']) || !isset($staged['state']['meta'][$meta_key])) {
            return $value;
        }
        $staged_value = $staged['state']['meta'][$meta_key];

        // get_post_metadata short-circuits on a non-null return, and callers
        // with $single = false expect an array of values.
        return $single ? $staged_value : array($staged_value);
    }

    public static function filter_content($content) {
        if (!self::$active) { return $content; }
        $staged = self::staged(self::$active);
        if (!$staged) { return $content; }

        if (isset($staged['state']['post_content']) && $staged['state']['post_content'] !== null) {
            return $staged['state']['post_content'];
        }
        return $content;
    }

    public static function filter_title($title, $post_id = 0) {
        if (!self::$active || (int) $post_id !== self::$active) { return $title; }
        $staged = self::staged(self::$active);
        return (!empty($staged['title'])) ? $staged['title'] : $title;
    }

    public static function noindex($robots) {
        $robots['noindex'] = true;
        $robots['nofollow'] = true;
        return $robots;
    }

    public static function noindex_tag() {
        echo '<meta name="robots" content="noindex, nofollow">' . "\n";
    }

    public static function notice_style() {
        echo '<style>.lvx-preview-bar{position:sticky;top:0;z-index:99999;background:#111;color:#fff;'
            . 'font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;text-align:center}</style>' . "\n";
    }

    public static function notice() {
        echo '<div class="lvx-preview-bar">Livesov preview — this change is not published. '
            . 'The live page is unchanged.</div>';
    }

    /* ─────────────── Append fallback ─────────────── */

    /**
     * Render blocks that could not be appended into the builder's own data.
     *
     * Keyed by instruction id so re-delivering the same fix replaces its
     * block instead of stacking a second copy on the page.
     */
    public static function append_blocks($content) {
        if (!is_singular() || !in_the_loop() || !is_main_query()) { return $content; }

        $post_id = get_the_ID();
        if (!$post_id) { return $content; }

        $blocks = get_post_meta($post_id, LVX_APPENDED_META, true);
        $blocks = is_array($blocks) ? $blocks : array();

        if (self::$active === (int) $post_id) {
            $staged = self::staged($post_id);
            if ($staged && !empty($staged['appended']) && is_array($staged['appended'])) {
                $blocks = array_merge($blocks, $staged['appended']);
            }
        }
        if (empty($blocks)) { return $content; }

        return $content . "\n" . implode("\n", array_values($blocks));
    }

    public static function record_appended($post_id, $instruction_id, $html) {
        $blocks = get_post_meta($post_id, LVX_APPENDED_META, true);
        if (!is_array($blocks)) { $blocks = array(); }
        $blocks[$instruction_id] = $html;
        update_post_meta($post_id, LVX_APPENDED_META, $blocks);
    }
}
