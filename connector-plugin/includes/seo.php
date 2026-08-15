<?php
/**
 * Lvx_Seo — per-page SEO fields, written where the site's SEO plugin reads them.
 *
 * A ContentPatch carries `title`, `metaDescription`, `canonical` and
 * `indexable`. Only the title maps onto something WordPress core owns
 * (`post_title`, written by the publish path). A meta description, a per-page
 * canonical and a per-page robots directive are entirely an SEO plugin's
 * concept — core has nowhere to put them.
 *
 * So they are written into whichever of Yoast and Rank Math is actually
 * installed. That keeps the SEO plugin the single source of truth for the page
 * instead of fighting it: a description echoed from `wp_head` would either be
 * ignored or produce a second, contradictory tag.
 *
 * When neither plugin is active there is nowhere to put these fields. That is
 * reported rather than silently swallowed — `apply()` returns which plugins it
 * wrote to and which fields landed, `publish_content` forwards it in the ack,
 * and Livesov can tell the user the page edit shipped but the meta description
 * had nowhere to go. A fix that reports success and changes nothing is the
 * failure mode this plugin exists to avoid.
 */

if (!defined('ABSPATH')) { exit; }

class Lvx_Seo {

    /** postmeta keys, per supported SEO plugin. */
    const FIELDS = array(
        'yoast' => array(
            'title'       => '_yoast_wpseo_title',
            'description' => '_yoast_wpseo_metadesc',
            'canonical'   => '_yoast_wpseo_canonical',
        ),
        'rankmath' => array(
            'title'       => 'rank_math_title',
            'description' => 'rank_math_description',
            'canonical'   => 'rank_math_canonical_url',
        ),
    );

    /** ContentPatch key => the field name used in FIELDS. */
    const PATCH_KEYS = array(
        'title'           => 'title',
        'metaDescription' => 'description',
        'canonical'       => 'canonical',
    );

    /**
     * Test seam. Set to an array of slugs (e.g. array('yoast')) to bypass
     * detection; null restores real detection.
     */
    public static $force_active = null;

    /** Which supported SEO plugins are live on this site. */
    public static function active() {
        if (is_array(self::$force_active)) { return self::$force_active; }
        $active = array();
        if (defined('WPSEO_VERSION') || class_exists('WPSEO_Options')) { $active[] = 'yoast'; }
        if (defined('RANK_MATH_VERSION') || class_exists('RankMath')) { $active[] = 'rankmath'; }
        return $active;
    }

    /**
     * Write a patch's SEO fields for every active plugin.
     *
     * @return array{seo:string[],seoFields:string[]} plugins written to, and
     *         which fields actually had a value to write.
     */
    public static function apply($post_id, $patch) {
        if (!is_array($patch)) { $patch = array(); }
        $targets = self::active();
        $written = array();

        foreach ($targets as $slug) {
            if (!isset(self::FIELDS[$slug])) { continue; }
            $map = self::FIELDS[$slug];

            foreach (self::PATCH_KEYS as $patch_key => $field) {
                if (!isset($map[$field]) || !isset($patch[$patch_key])) { continue; }
                $value = (string) $patch[$patch_key];
                if ($value === '') { continue; }
                // update_post_meta() unslashes on the way in, so a value
                // arriving from JSON has to be slashed or every backslash in
                // it is eaten.
                update_post_meta($post_id, $map[$field], wp_slash($value));
                $written[$field] = true;
            }

            if (!empty($patch['indexable']) && self::set_indexable($post_id, $slug)) {
                $written['indexable'] = true;
            }
        }

        return array('seo' => $targets, 'seoFields' => array_keys($written));
    }

    /**
     * Clear a noindex. Both plugins are set to *explicitly* index rather than
     * having the override deleted: deleting reverts to the site-wide default,
     * which may itself be noindex for this post type — leaving the page just
     * as invisible as before.
     */
    private static function set_indexable($post_id, $slug) {
        if ($slug === 'yoast') {
            // Yoast: '1' = noindex, '2' = index, '0'/'' = site default.
            update_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', '2');
            return true;
        }
        if ($slug === 'rankmath') {
            // Rank Math stores robots directives as an array of tokens.
            update_post_meta($post_id, 'rank_math_robots', array('index'));
            return true;
        }
        return false;
    }
}
