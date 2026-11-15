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

/* ── an append that could never render is refused, not silently accepted ── */

$post = lvx_test_post(108, '', array('ct_builder_json' => '[{"name":"ct_text_block","options":{"content":"hi"}}]'));
$r = Lvx_Patch::build($post, array('bodyAppend' => '<h2>FAQ</h2>'));
T::ok($r['err'] !== '', 'Oxygen append is refused rather than dropped into a filter that never runs');
T::contains($r['err'], 'renders its own template', 'refusal explains why');
T::same(array(), $r['appended'], 'nothing is queued for a filter that would not fire');

/* ── Bricks appends natively, so the same patch succeeds there ── */

$post = lvx_test_post(109, '', array('_bricks_page_content_2' => array(
    array('id' => 'e1', 'name' => 'heading', 'parent' => 0, 'children' => array(), 'settings' => array('text' => 'hi')))));
$r = Lvx_Patch::build($post, array('bodyAppend' => '<h2>FAQ</h2>'));
T::same('', $r['err'], 'Bricks append succeeds');
T::ok($r['native'], 'Bricks append is native');

/* ── Beaver Builder does run the_content, so its fallback is still allowed ── */

$post = lvx_test_post(110, '', array('_fl_builder_enabled' => 1, '_fl_builder_data' => array()));
$r = Lvx_Patch::build($post, array('bodyAppend' => '<h2>FAQ</h2>'));
T::same('', $r['err'], 'Beaver append still falls back cleanly');
T::same(array('<h2>FAQ</h2>'), $r['appended'], 'Beaver block queued for the content filter');

/* ── re-delivering the same publish never stacks a second appended block ── */

// Each delivery rebuilds the page from the patch, so the second build must
// recognise the block the first one wrote (by its fix-id marker) and replace
// it in place.
function lvx_test_redeliver($id, $content, $meta, $patch, $fix) {
    $post = lvx_test_post($id, $content, $meta);
    $first = Lvx_Patch::build($post, $patch, $fix);
    $post->post_content = $first['state']['post_content'] === null ? '' : $first['state']['post_content'];
    $GLOBALS['lvx_test_meta'][$id] = array_merge($meta, $first['state']['meta']);
    $second = Lvx_Patch::build($post, $patch, $fix);
    return array($first, $second);
}

$fix = 'f1a2b3c4-0000-4000-8000-000000000001';

list($a, $b) = lvx_test_redeliver(120, '<p>Intro</p>', array(), array('bodyAppend' => '<h2>FAQ</h2>'), $fix);
T::contains($a['state']['post_content'], '<!-- lvx-append:' . $fix . ' -->', 'classic append is marked with the fix id');
T::same($a['state']['post_content'], $b['state']['post_content'], 'classic re-delivery leaves the page unchanged');
T::same(1, substr_count($b['state']['post_content'], '<h2>FAQ</h2>'), 'classic page holds one copy of the block');

list($a, $b) = lvx_test_redeliver(121, "<!-- wp:paragraph -->\n<p>hi</p>\n<!-- /wp:paragraph -->", array(),
    array('bodyAppend' => '<h2>FAQ</h2>'), $fix);
T::same(1, substr_count($b['state']['post_content'], '<h2>FAQ</h2>'), 'Gutenberg re-delivery keeps one block');
T::same(1, substr_count($b['state']['post_content'], '<!-- wp:html -->'), 'Gutenberg re-delivery adds no wrapper');

list($a, $b) = lvx_test_redeliver(122, 'x', array('_et_pb_use_builder' => 'on'), array('bodyAppend' => '<h2>FAQ</h2>'), $fix);
T::same(1, substr_count($b['state']['post_content'], '[et_pb_section'), 'Divi re-delivery keeps one section');

$tree = array(array('id' => 's1', 'elType' => 'section', 'elements' => array()));
list($a, $b) = lvx_test_redeliver(123, '', array('_elementor_edit_mode' => 'builder', '_elementor_data' => json_encode($tree)),
    array('bodyAppend' => '<h2>FAQ</h2>'), $fix);
T::same(2, count(json_decode($b['state']['meta']['_elementor_data'], true)), 'Elementor re-delivery keeps one appended section');

list($a, $b) = lvx_test_redeliver(124, '', array('_bricks_page_content_2' => array(
    array('id' => 'e1', 'name' => 'heading', 'parent' => 0, 'children' => array(), 'settings' => array('text' => 'hi')))),
    array('bodyAppend' => '<h2>FAQ</h2>'), $fix);
T::same(2, count($b['state']['meta']['_bricks_page_content_2']), 'Bricks re-delivery keeps one appended element');

// An updated block for the same fix replaces the old one rather than joining it.
$post = lvx_test_post(125, '<p>Intro</p>');
$a = Lvx_Patch::build($post, array('bodyAppend' => '<h2>Old FAQ</h2>'), $fix);
$post->post_content = $a['state']['post_content'];
$b = Lvx_Patch::build($post, array('bodyAppend' => '<h2>New FAQ</h2>'), $fix);
T::ok(strpos($b['state']['post_content'], 'Old FAQ') === false, 'changed block replaces the earlier one');
T::contains($b['state']['post_content'], '<h2>New FAQ</h2>', 'changed block is present');

// A different fix still appends its own block.
$c = Lvx_Patch::build($post, array('bodyAppend' => '<h2>Other</h2>'), 'other-fix');
T::contains($c['state']['post_content'], '<h2>Old FAQ</h2>', 'other fix keeps the first block');
T::contains($c['state']['post_content'], '<h2>Other</h2>', 'other fix appends its own block');
