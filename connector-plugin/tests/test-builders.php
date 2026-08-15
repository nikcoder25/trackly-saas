<?php
/**
 * Tests for the builder adapters, against fixtures shaped like what each
 * builder actually stores.
 */

T::group('builders');

function lvx_test_post($id, $content = '', $meta = array()) {
    $GLOBALS['lvx_test_meta'][$id] = $meta;
    $p = new stdClass();
    $p->ID = $id;
    $p->post_content = $content;
    $p->post_title = 'Test page';
    $p->post_type = 'page';
    return $p;
}

/* ── detection picks the builder in charge, not just "there is post_content" ── */

$post = lvx_test_post(1, 'Fallback text Elementor left behind', array(
    '_elementor_edit_mode' => 'builder',
    '_elementor_data'      => '[{"id":"a1","elType":"section","elements":[]}]',
));
T::same('elementor', Lvx_Builders::for_post($post)->slug(), 'Elementor wins over post_content');

$post = lvx_test_post(2, '[et_pb_section][et_pb_text]hi[/et_pb_text][/et_pb_section]', array('_et_pb_use_builder' => 'on'));
T::same('divi', Lvx_Builders::for_post($post)->slug(), 'Divi detected from its meta flag');

$post = lvx_test_post(3, '[vc_row][vc_column][vc_column_text]hi[/vc_column_text][/vc_column][/vc_row]');
T::same('wpbakery', Lvx_Builders::for_post($post)->slug(), 'WPBakery detected from shortcodes');

$post = lvx_test_post(4, '', array('_fl_builder_enabled' => 1, '_fl_builder_data' => array()));
T::same('beaver', Lvx_Builders::for_post($post)->slug(), 'Beaver Builder detected');

$post = lvx_test_post(5, '', array('_bricks_page_content_2' => array(array('id' => 'x'))));
T::same('bricks', Lvx_Builders::for_post($post)->slug(), 'Bricks detected');

$post = lvx_test_post(6, '', array('ct_builder_shortcodes' => '[ct_section][ct_text_block]hi[/ct_text_block][/ct_section]'));
T::same('oxygen', Lvx_Builders::for_post($post)->slug(), 'Oxygen detected');

$post = lvx_test_post(7, "<!-- wp:paragraph -->\n<p>hi</p>\n<!-- /wp:paragraph -->");
T::same('gutenberg', Lvx_Builders::for_post($post)->slug(), 'Gutenberg detected from block markup');

$post = lvx_test_post(8, '<p>just html</p>');
T::same('classic', Lvx_Builders::for_post($post)->slug(), 'Classic is the fallback');

/* ── Elementor: replace reaches into the JSON tree ── */

$tree = array(array(
    'id' => 's1', 'elType' => 'section',
    'elements' => array(array(
        'id' => 'c1', 'elType' => 'column',
        'elements' => array(
            array('id' => 'w1', 'elType' => 'widget', 'widgetType' => 'heading',
                  'settings' => array('title' => 'We service Tulsa homes')),
            array('id' => 'w2', 'elType' => 'widget', 'widgetType' => 'text-editor',
                  'settings' => array('editor' => '<p>Our team arrives in under 2 hours.</p>')),
        ),
    )),
));
$post = lvx_test_post(10, 'ignored', array(
    '_elementor_edit_mode' => 'builder',
    '_elementor_data'      => json_encode($tree),
));
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);

$r = $b->replace($state, 'Our team arrives in under 2 hours.', 'Our team arrives in under 60 minutes.');
T::ok($r['ok'], 'Elementor replace succeeds');
$out = json_decode($r['state']['meta']['_elementor_data'], true);
T::same('<p>Our team arrives in under 60 minutes.</p>',
    $out[0]['elements'][0]['elements'][1]['settings']['editor'], 'Elementor replace hit the right widget');
T::same('We service Tulsa homes',
    $out[0]['elements'][0]['elements'][0]['settings']['title'], 'Elementor replace left siblings alone');

$r = $b->replace($state, 'nowhere on this page', 'x');
T::ok(!$r['ok'], 'Elementor replace fails cleanly when absent');
T::contains($r['error'], 'not found', 'Elementor absent-passage error is useful');

/* ── Elementor: append adds a renderable html widget ── */

$r = $b->append($state, '<h2>FAQ</h2>');
T::ok($r['ok'] && $r['native'], 'Elementor append is native');
$out = json_decode($r['state']['meta']['_elementor_data'], true);
T::same(2, count($out), 'Elementor append added a top-level section');
$w = $out[1]['elements'][0]['elements'][0];
T::same('html', $w['widgetType'], 'appended Elementor widget is an html widget');
T::same('<h2>FAQ</h2>', $w['settings']['html'], 'appended Elementor html preserved');

/* ── Elementor: ambiguity across two widgets is refused ── */

$dupe = array(
    array('id' => 'a', 'elType' => 'widget', 'settings' => array('editor' => 'Call today')),
    array('id' => 'b', 'elType' => 'widget', 'settings' => array('editor' => 'Call today')),
);
$post = lvx_test_post(11, '', array('_elementor_edit_mode' => 'builder', '_elementor_data' => json_encode($dupe)));
$b = Lvx_Builders::for_post($post);
$r = $b->replace($b->read($post), 'Call today', 'Call now');
T::ok(!$r['ok'], 'Elementor ambiguous match refused');
T::contains($r['error'], 'ambiguous', 'Elementor ambiguity error explains itself');

/* ── Elementor: ids and structural keys are never edited ── */

$idish = array(array('id' => 'Call today', 'elType' => 'widget', 'settings' => array('editor' => 'Call today')));
$post = lvx_test_post(12, '', array('_elementor_edit_mode' => 'builder', '_elementor_data' => json_encode($idish)));
$b = Lvx_Builders::for_post($post);
$r = $b->replace($b->read($post), 'Call today', 'Call now');
T::ok($r['ok'], 'id field colliding with the passage does not cause ambiguity');
$out = json_decode($r['state']['meta']['_elementor_data'], true);
T::same('Call today', $out[0]['id'], 'element id untouched');
T::same('Call now', $out[0]['settings']['editor'], 'only the content field changed');

/* ── Divi: replace inside shortcodes, append wraps in a section ── */

$divi = '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text admin_label="Body"]'
      . '<p>We repair furnaces across Tulsa.</p>[/et_pb_text][/et_pb_column][/et_pb_row][/et_pb_section]';
$post = lvx_test_post(20, $divi, array('_et_pb_use_builder' => 'on'));
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);

$r = $b->replace($state, 'We repair furnaces across Tulsa.', 'We repair furnaces across Green Country.');
T::ok($r['ok'], 'Divi replace succeeds');
T::contains($r['state']['post_content'], 'Green Country', 'Divi replacement applied');
T::contains($r['state']['post_content'], '[et_pb_text admin_label="Body"]', 'Divi shortcode attributes intact');

$r = $b->append($state, '<h2>Service areas</h2>');
T::ok($r['ok'] && $r['native'], 'Divi append is native');
T::contains($r['state']['post_content'], '[et_pb_section admin_label="Livesov"]', 'Divi append wraps in a section');
T::contains($r['state']['post_content'], '<h2>Service areas</h2>', 'Divi appended html present');

/* ── WPBakery ── */

$vc = '[vc_row][vc_column][vc_column_text]<p>Same day service, every day.</p>[/vc_column_text][/vc_column][/vc_row]';
$post = lvx_test_post(21, $vc);
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);
$r = $b->replace($state, 'Same day service, every day.', 'Same day service, seven days a week.');
T::ok($r['ok'], 'WPBakery replace succeeds');
T::contains($r['state']['post_content'], 'seven days a week', 'WPBakery replacement applied');
$r = $b->append($state, '<h2>Reviews</h2>');
T::contains($r['state']['post_content'], '[vc_column_text]<h2>Reviews</h2>[/vc_column_text]', 'WPBakery append wraps correctly');

/* ── Oxygen: replace in meta, append declines to native ── */

$ox = '[ct_section][ct_text_block]Licensed and insured in Oklahoma[/ct_text_block][/ct_section]';
$post = lvx_test_post(22, '', array('ct_builder_shortcodes' => $ox));
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);
$r = $b->replace($state, 'Licensed and insured in Oklahoma', 'Licensed, bonded and insured in Oklahoma');
T::ok($r['ok'], 'Oxygen replace succeeds');
T::contains($r['state']['meta']['ct_builder_shortcodes'], 'bonded', 'Oxygen replacement applied');
$r = $b->append($state, '<h2>x</h2>');
T::ok(!$r['ok'] && $r['native'] === false, 'Oxygen append declines rather than guessing');

/* ── Beaver Builder: serialized node objects ── */

$n1 = new stdClass(); $n1->node = 'aaa'; $n1->type = 'module';
$n1->settings = new stdClass(); $n1->settings->text = '<p>Trusted by 400 Tulsa families.</p>';
$post = lvx_test_post(23, '', array('_fl_builder_enabled' => 1, '_fl_builder_data' => array('aaa' => $n1)));
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);
$r = $b->replace($state, 'Trusted by 400 Tulsa families.', 'Trusted by 600 Tulsa families.');
T::ok($r['ok'], 'Beaver Builder replace succeeds');
$data = $r['state']['meta']['_fl_builder_data'];
T::same('<p>Trusted by 600 Tulsa families.</p>', $data['aaa']->settings->text, 'Beaver node text updated');
T::same('module', $data['aaa']->type, 'Beaver node type untouched');
$r = $b->append($state, '<h2>x</h2>');
T::ok(!$r['ok'] && $r['native'] === false, 'Beaver append declines rather than guessing');

/* ── Bricks: array tree ── */

$bricks = array(
    array('id' => 'e1', 'name' => 'heading', 'parent' => 0, 'children' => array(),
          'settings' => array('text' => 'Emergency HVAC repair')),
    array('id' => 'e2', 'name' => 'text-basic', 'parent' => 0, 'children' => array(),
          'settings' => array('text' => '<p>Available 24/7 in Tulsa.</p>')),
);
$post = lvx_test_post(24, '', array('_bricks_page_content_2' => $bricks));
$b = Lvx_Builders::for_post($post);
$state = $b->read($post);
$r = $b->replace($state, 'Available 24/7 in Tulsa.', 'Available around the clock in Tulsa.');
T::ok($r['ok'], 'Bricks replace succeeds');
$data = $r['state']['meta']['_bricks_page_content_2'];
T::same('<p>Available around the clock in Tulsa.</p>', $data[1]['settings']['text'], 'Bricks element text updated');
T::same('Emergency HVAC repair', $data[0]['settings']['text'], 'Bricks siblings untouched');

/* ── Gutenberg append keeps the document valid ── */

$post = lvx_test_post(25, "<!-- wp:paragraph -->\n<p>hi</p>\n<!-- /wp:paragraph -->");
$b = Lvx_Builders::for_post($post);
$r = $b->append($b->read($post), '<h2>FAQ</h2>');
T::contains($r['state']['post_content'], "<!-- wp:html -->\n<h2>FAQ</h2>\n<!-- /wp:html -->", 'Gutenberg append is a valid block');

/* ── persist writes meta through the builder's own slashing rules ── */

$post = lvx_test_post(30, '', array('_elementor_edit_mode' => 'builder', '_elementor_data' => '[]'));
$b = Lvx_Builders::for_post($post);
$b->persist(30, array('post_content' => null, 'meta' => array('_elementor_data' => '{"a":"say \"hi\""}')));
T::same(addslashes('{"a":"say \"hi\""}'), get_post_meta(30, '_elementor_data', true), 'Elementor meta is slashed on write');

/* ── Elementor JSON carrying quotes and slashes survives a round trip ── */

$quoted = array(array('id' => 'w9', 'elType' => 'widget',
    'settings' => array('editor' => '<a href="https://example.com/a/b">He said "hello" today</a>')));
$post = lvx_test_post(31, '', array(
    '_elementor_edit_mode' => 'builder', '_elementor_data' => json_encode($quoted)));
$b = Lvx_Builders::for_post($post);
$r = $b->replace($b->read($post), 'He said "hello" today', 'He said "welcome" today');
T::ok($r['ok'], 'Elementor replace works on JSON containing escaped quotes');
$out = json_decode($r['state']['meta']['_elementor_data'], true);
T::ok(is_array($out), 'Elementor JSON still decodes after the edit');
T::same('<a href="https://example.com/a/b">He said "welcome" today</a>',
    $out[0]['settings']['editor'], 'quotes and slashes preserved through the edit');
