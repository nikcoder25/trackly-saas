<?php
/**
 * Lvx_Seo — the per-page SEO fields.
 *
 * This layer shipped as a call to a function that was never written, so
 * publish_content fatalled on every run. These cover the behaviour that was
 * missing, including the reporting that keeps an absent SEO plugin from
 * looking like a successful write.
 */

T::group('seo');

/** Reset the in-memory postmeta between cases. */
function lvx_seo_reset() {
    $GLOBALS['lvx_test_meta'] = array();
}

$patch = array(
    'title'           => 'Emergency AC Repair in Tulsa',
    'metaDescription' => 'Same-day AC repair across Tulsa. Call now.',
    'canonical'       => 'https://example.com/ac-repair/',
);

/* ── Yoast ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast');
$r = Lvx_Seo::apply(11, $patch);

T::same(array('yoast'), $r['seo'], 'reports the plugin it wrote to');
T::same('Emergency AC Repair in Tulsa', get_post_meta(11, '_yoast_wpseo_title', true), 'yoast title');
T::same('Same-day AC repair across Tulsa. Call now.', get_post_meta(11, '_yoast_wpseo_metadesc', true), 'yoast meta description');
T::same('https://example.com/ac-repair/', get_post_meta(11, '_yoast_wpseo_canonical', true), 'yoast canonical');
T::ok(in_array('description', $r['seoFields'], true), 'reports the description as written');

/* ── Rank Math ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('rankmath');
Lvx_Seo::apply(12, $patch);

T::same('Emergency AC Repair in Tulsa', get_post_meta(12, 'rank_math_title', true), 'rank math title');
T::same('Same-day AC repair across Tulsa. Call now.', get_post_meta(12, 'rank_math_description', true), 'rank math meta description');
T::same('https://example.com/ac-repair/', get_post_meta(12, 'rank_math_canonical_url', true), 'rank math canonical');
T::same('', get_post_meta(12, '_yoast_wpseo_metadesc', true), 'does not write yoast fields when yoast is inactive');

/* ── Both active: the docs promise both get written ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast', 'rankmath');
$r = Lvx_Seo::apply(13, $patch);

T::same(array('yoast', 'rankmath'), $r['seo'], 'reports both plugins');
T::same('Same-day AC repair across Tulsa. Call now.', get_post_meta(13, '_yoast_wpseo_metadesc', true), 'both: yoast written');
T::same('Same-day AC repair across Tulsa. Call now.', get_post_meta(13, 'rank_math_description', true), 'both: rank math written');

/* ── Neither active: nowhere to put it, and that is reported ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array();
$r = Lvx_Seo::apply(14, $patch);

T::same(array(), $r['seo'], 'no SEO plugin is reported as none, not as success');
T::same(array(), $r['seoFields'], 'no fields claimed as written');
T::same('', get_post_meta(14, '_yoast_wpseo_metadesc', true), 'writes nothing when no SEO plugin is active');

/* ── Partial patches only touch what they carry ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast');
$r = Lvx_Seo::apply(15, array('metaDescription' => 'Just the description.'));

T::same('Just the description.', get_post_meta(15, '_yoast_wpseo_metadesc', true), 'partial: description written');
T::same('', get_post_meta(15, '_yoast_wpseo_title', true), 'partial: absent title not written');
T::same('', get_post_meta(15, '_yoast_wpseo_canonical', true), 'partial: absent canonical not written');
T::same(array('description'), $r['seoFields'], 'partial: only the description reported');

// An empty string is not a value to ship — it would blank a good tag.
lvx_seo_reset();
Lvx_Seo::apply(16, array('metaDescription' => '', 'canonical' => ''));
T::same(array(), Lvx_Seo::apply(16, array('metaDescription' => ''))['seoFields'], 'empty values are skipped');

/* ── indexable clears a noindex explicitly ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast', 'rankmath');
$r = Lvx_Seo::apply(17, array('indexable' => true));

T::same('2', get_post_meta(17, '_yoast_wpseo_meta-robots-noindex', true), 'yoast set to explicit index');
T::same(array('index'), get_post_meta(17, 'rank_math_robots', true), 'rank math set to explicit index');
T::ok(in_array('indexable', $r['seoFields'], true), 'reports indexable as applied');

// Not requested → left alone, so we never silently flip a deliberate noindex.
lvx_seo_reset();
Lvx_Seo::apply(18, array('metaDescription' => 'x'));
T::same('', get_post_meta(18, '_yoast_wpseo_meta-robots-noindex', true), 'robots untouched when indexable is absent');

/* ── Slashing: update_post_meta() unslashes, so values must arrive slashed ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast');
Lvx_Seo::apply(19, array('metaDescription' => 'Backslash \\ and "quotes" survive'));
T::same(
    wp_slash('Backslash \\ and "quotes" survive'),
    get_post_meta(19, '_yoast_wpseo_metadesc', true),
    'value is slashed on the way into postmeta'
);

/* ── Robustness ── */

lvx_seo_reset();
Lvx_Seo::$force_active = array('yoast');
T::same(array(), Lvx_Seo::apply(20, array())['seoFields'], 'empty patch writes nothing');
T::same(array(), Lvx_Seo::apply(21, 'not an array')['seoFields'], 'non-array patch is survivable');

Lvx_Seo::$force_active = null;
