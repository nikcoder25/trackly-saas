<?php
/**
 * Tests for Lvx_Patch — the seam where a Livesov patch meets a real builder,
 * and where the refusals live.
 */

T::group('patch');

/* ── bodyReplace on a plain page ── */

$post = lvx_test_post(100, '<p>We serve the whole metro.</p>');
$r = Lvx_Patch::build($post, array('bodyReplace' => array(
    'find' => 'We serve the whole metro.', 'replace' => 'We serve all of Green Country.')));
T::same('', $r['err'], 'classic bodyReplace succeeds');
T::same('<p>We serve all of Green Country.</p>', $r['state']['post_content'], 'classic bodyReplace applied');
T::same('classic', $r['builder']->slug(), 'classic builder reported');

/* ── bodyReplace routed into Elementor's tree ── */

$tree = array(array('id' => 'w1', 'elType' => 'widget', 'widgetType' => 'text-editor',
    'settings' => array('editor' => '<p>Serving Tulsa since 1998.</p>')));
$post = lvx_test_post(101, 'stale post_content nobody sees', array(
    '_elementor_edit_mode' => 'builder', '_elementor_data' => json_encode($tree)));
$r = Lvx_Patch::build($post, array('bodyReplace' => array(
    'find' => 'Serving Tulsa since 1998.', 'replace' => 'Serving Tulsa since 1998 — over 12,000 jobs completed.')));
T::same('', $r['err'], 'Elementor bodyReplace succeeds');
T::same('elementor', $r['builder']->slug(), 'Elementor builder reported');
T::contains($r['state']['meta']['_elementor_data'], '12,000 jobs completed', 'Elementor content updated');
T::same(null, $r['state']['post_content'], 'Elementor state leaves post_content alone');

/* ── a failed replace surfaces the builder name, so the error is actionable ── */

$r = Lvx_Patch::build($post, array('bodyReplace' => array('find' => 'text that is not there', 'replace' => 'x')));
T::ok($r['err'] !== '', 'absent passage fails the patch');
T::contains($r['err'], 'Elementor', 'error names the builder');
T::contains($r['err'], 'not found', 'error explains the cause');

/* ── bodyHtml is refused where the body is not the page ── */

$r = Lvx_Patch::build($post, array('bodyHtml' => '<p>everything replaced</p>'));
T::ok($r['err'] !== '', 'bodyHtml refused on Elementor');
T::contains($r['err'], 'would destroy it', 'bodyHtml refusal explains the risk');

/* ── ...but allowed where it is ── */

$post = lvx_test_post(102, '<p>old</p>');
$r = Lvx_Patch::build($post, array('bodyHtml' => '<p>new</p>'));
T::same('', $r['err'], 'bodyHtml allowed on a classic page');
T::same('<p>new</p>', $r['state']['post_content'], 'bodyHtml applied');

/* ── bodyAppend goes native where the builder supports it ── */

$post = lvx_test_post(103, 'x', array('_et_pb_use_builder' => 'on'));
$r = Lvx_Patch::build($post, array('bodyAppend' => '<h2>FAQ</h2>'));
T::same('', $r['err'], 'Divi append succeeds');
T::ok($r['native'], 'Divi append is native');
T::same(array(), $r['appended'], 'native append leaves nothing for the content filter');
T::contains($r['state']['post_content'], '[et_pb_text]<h2>FAQ</h2>[/et_pb_text]', 'Divi append wrapped');

/* ── ...and falls back where it does not ── */

$post = lvx_test_post(104, '', array('_fl_builder_enabled' => 1, '_fl_builder_data' => array()));
$r = Lvx_Patch::build($post, array('bodyAppend' => '<h2>FAQ</h2>'));
T::same('', $r['err'], 'Beaver append does not fail the patch');
T::ok(!$r['native'], 'Beaver append is reported as non-native');
T::same(array('<h2>FAQ</h2>'), $r['appended'], 'block handed to the content filter instead');

/* ── a patch combining replace + append applies both ── */

$post = lvx_test_post(105, "<!-- wp:paragraph -->\n<p>Same day service.</p>\n<!-- /wp:paragraph -->");
$r = Lvx_Patch::build($post, array(
    'bodyReplace' => array('find' => 'Same day service.', 'replace' => 'Same day service, 7 days a week.'),
    'bodyAppend'  => '<h2>Areas we cover</h2>',
));
T::same('', $r['err'], 'combined patch succeeds');
T::contains($r['state']['post_content'], '7 days a week', 'combined patch replaced');
T::contains($r['state']['post_content'], '<!-- wp:html -->', 'combined patch appended as a block');

/* ── an empty patch is a no-op, not an error ── */

$post = lvx_test_post(106, '<p>untouched</p>');
$r = Lvx_Patch::build($post, array());
T::same('', $r['err'], 'empty patch succeeds');
T::same('<p>untouched</p>', $r['state']['post_content'], 'empty patch changes nothing');

/* ── a replace that would break structure is refused, page left intact ── */

$post = lvx_test_post(107, '<p>one</p><div><p>two</p></div>');
$r = Lvx_Patch::build($post, array('bodyReplace' => array('find' => 'one two', 'replace' => 'merged')));
T::ok($r['err'] !== '', 'structure-breaking replace refused');
T::contains($r['err'], 'break the page structure', 'refusal explains the risk');
