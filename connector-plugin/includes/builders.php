<?php
/**
 * Builder adapters.
 *
 * A WordPress page is only *sometimes* its post_content. Elementor renders a
 * JSON tree in postmeta and ignores post_content entirely; Beaver Builder
 * keeps a serialized node graph; Divi and WPBakery keep shortcodes in
 * post_content; Bricks and Oxygen each have their own meta key. Writing a fix
 * into post_content on an Elementor site is the classic failure: the update
 * "succeeds", the database changes, and the live page looks exactly the same.
 *
 * Each adapter therefore answers four questions for one builder:
 *
 *   detect()   is this builder in charge of this post?
 *   read()     where does its editable content actually live?
 *   replace()  how do I swap a passage without disturbing the structure?
 *   append()   how do I add a block it will actually render?
 *
 * Content is carried between those calls as a plain "state" array —
 * ['post_content' => string|null, 'meta' => [key => value]] — so staging,
 * previewing, backing up, and persisting are written once in the base class
 * rather than seven times.
 *
 * Where appending natively would mean guessing at a builder's internal node
 * shape, the adapter declines and the caller falls back to rendering the block
 * through a `the_content` filter instead. A block rendered slightly outside
 * the builder's own container is a cosmetic problem; a malformed node written
 * into someone's layout data is a broken site.
 */

if (!defined('ABSPATH')) { exit; }

/* ─────────────── Shared helpers ─────────────── */

class Lvx_Tree {

    /** Keys whose values are plumbing, never prose. Never edited. */
    private static $skip_keys = array(
        'id', '_id', 'elid', 'url', 'link', 'href', 'src', 'image', 'css',
        'class', 'classes', 'type', 'eltype', 'widgettype', 'name', 'parent',
        '_element_id', 'ct_id', 'ct_parent', 'template', 'slug',
    );

    /**
     * Replace a passage inside the first (and only) string value of a nested
     * array/object tree that visibly contains it.
     *
     * @return array{ok:bool,data:mixed,error:string}
     */
    public static function replace($data, $find, $replace) {
        $hits = array();
        self::collect($data, $find, array(), $hits);

        if (count($hits) === 0) {
            return array('ok' => false, 'data' => $data,
                'error' => 'passage not found in the builder content (it may have been edited since Livesov crawled it)');
        }
        if (count($hits) > 1) {
            return array('ok' => false, 'data' => $data,
                'error' => 'passage appears in ' . count($hits) . ' builder elements — too ambiguous to replace safely');
        }

        $applied = false;
        $data = self::apply($data, $hits[0], $find, $replace, array(), $applied);
        if (!$applied) {
            return array('ok' => false, 'data' => $data, 'error' => 'could not apply the replacement to the builder element');
        }
        return array('ok' => true, 'data' => $data, 'error' => '');
    }

    /** Walk the tree collecting the paths of string values containing $find. */
    private static function collect($node, $find, $path, &$hits) {
        if (is_string($node)) {
            if (Lvx_Text::contains($node, $find)) { $hits[] = $path; }
            return;
        }
        if (is_array($node)) {
            foreach ($node as $k => $v) {
                if (self::skippable($k)) { continue; }
                $p = $path; $p[] = $k;
                self::collect($v, $find, $p, $hits);
            }
            return;
        }
        if (is_object($node)) {
            foreach (get_object_vars($node) as $k => $v) {
                if (self::skippable($k)) { continue; }
                $p = $path; $p[] = $k;
                self::collect($v, $find, $p, $hits);
            }
        }
    }

    /** Rebuild the tree with the replacement applied at $target. */
    private static function apply($node, $target, $find, $replace, $path, &$applied) {
        if ($path === $target && is_string($node)) {
            $r = Lvx_Text::replace($node, $find, $replace, false);
            if ($r['ok']) { $applied = true; return $r['result']; }
            return $node;
        }
        if (is_array($node)) {
            foreach ($node as $k => $v) {
                $p = $path; $p[] = $k;
                if (!self::prefix_of($p, $target)) { continue; }
                $node[$k] = self::apply($v, $target, $find, $replace, $p, $applied);
            }
            return $node;
        }
        if (is_object($node)) {
            foreach (get_object_vars($node) as $k => $v) {
                $p = $path; $p[] = $k;
                if (!self::prefix_of($p, $target)) { continue; }
                $node->$k = self::apply($v, $target, $find, $replace, $p, $applied);
            }
            return $node;
        }
        return $node;
    }

    /** Is $path on the way to (or exactly) $target? Prunes the rebuild walk. */
    private static function prefix_of($path, $target) {
        if (count($path) > count($target)) { return false; }
        foreach ($path as $i => $seg) {
            if (!isset($target[$i]) || (string) $target[$i] !== (string) $seg) { return false; }
        }
        return true;
    }

    private static function skippable($key) {
        return in_array(strtolower((string) $key), self::$skip_keys, true);
    }

    /** Elementor and Bricks both want short random element ids. */
    public static function element_id() {
        $hex = '';
        for ($i = 0; $i < 8; $i++) { $hex .= dechex(random_int(0, 15)); }
        return $hex;
    }
}

/* ─────────────── Base adapter ─────────────── */

abstract class Lvx_Builder {

    abstract public function slug();
    abstract public function label();
    abstract public function detect($post);
    abstract public function read($post);
    abstract public function replace($state, $find, $replace);

    /**
     * Append $html natively. Adapters that cannot do so safely return
     * ok=false with native=false, and the caller renders the block through
     * the content filter instead.
     */
    public function append($state, $html) {
        return array('ok' => false, 'state' => $state, 'native' => false,
            'error' => 'this builder has no safe native append');
    }

    /** Persist a state array to the database. */
    public function persist($post_id, $state) {
        foreach ($this->meta_of($state) as $key => $value) {
            update_post_meta($post_id, $key, $this->slash_meta($key, $value));
        }
    }

    /** Meta values need builder-specific slashing (Elementor stores JSON). */
    protected function slash_meta($key, $value) { return $value; }

    /** Clear whatever the builder caches about this post. */
    public function clear_cache($post_id) {}

    /**
     * Does this builder's front end actually run `the_content`?
     *
     * It matters because that filter is the fallback for appending a block
     * when no native node can be synthesised. Builders that render through a
     * template of their own (Oxygen, Bricks) never call it, so a block handed
     * to the fallback there would be accepted, acknowledged, and then never
     * appear — the exact silent failure this whole adapter layer exists to
     * stop. Those builders return false so the append is refused out loud.
     */
    public function renders_the_content() { return true; }

    protected function meta_of($state) {
        return (isset($state['meta']) && is_array($state['meta'])) ? $state['meta'] : array();
    }

    protected function state($post_content, $meta = array()) {
        return array('post_content' => $post_content, 'meta' => $meta);
    }
}

/* ─────────────── post_content builders ─────────────── */

class Lvx_Builder_Classic extends Lvx_Builder {

    public function slug()  { return 'classic'; }
    public function label() { return 'Classic editor'; }

    /** The fallback: claims any post nothing else claimed. */
    public function detect($post) { return true; }

    public function read($post) {
        return $this->state((string) $post->post_content);
    }

    public function replace($state, $find, $replace) {
        $r = Lvx_Text::replace((string) $state['post_content'], $find, $replace, $this->shortcodes());
        $state['post_content'] = $r['result'];
        return array('ok' => $r['ok'], 'state' => $state, 'error' => $r['error']);
    }

    public function append($state, $html) {
        $state['post_content'] = rtrim((string) $state['post_content']) . "\n\n" . $html;
        return array('ok' => true, 'state' => $state, 'native' => true, 'error' => '');
    }

    protected function shortcodes() { return false; }
}

class Lvx_Builder_Gutenberg extends Lvx_Builder_Classic {

    public function slug()  { return 'gutenberg'; }
    public function label() { return 'Block editor (Gutenberg)'; }

    public function detect($post) {
        return strpos((string) $post->post_content, '<!-- wp:') !== false;
    }

    /**
     * Wrap the block so the editor keeps treating the document as valid block
     * markup — raw HTML dropped between blocks shows up as an "unexpected
     * content" recovery prompt the next time someone opens the page.
     */
    public function append($state, $html) {
        $state['post_content'] = rtrim((string) $state['post_content'])
            . "\n\n<!-- wp:html -->\n" . $html . "\n<!-- /wp:html -->";
        return array('ok' => true, 'state' => $state, 'native' => true, 'error' => '');
    }
}

/* ─────────────── Shortcode builders ─────────────── */

abstract class Lvx_Builder_Shortcode extends Lvx_Builder_Classic {

    protected function shortcodes() { return true; }

    /** Shortcodes that wrap an appended HTML block into a valid section. */
    abstract protected function wrap($html);

    public function append($state, $html) {
        $state['post_content'] = rtrim((string) $state['post_content']) . "\n\n" . $this->wrap($html);
        return array('ok' => true, 'state' => $state, 'native' => true, 'error' => '');
    }
}

class Lvx_Builder_Divi extends Lvx_Builder_Shortcode {

    public function slug()  { return 'divi'; }
    public function label() { return 'Divi Builder'; }

    public function detect($post) {
        return get_post_meta($post->ID, '_et_pb_use_builder', true) === 'on';
    }

    protected function wrap($html) {
        return '[et_pb_section admin_label="Livesov"][et_pb_row][et_pb_column type="4_4"]'
            . '[et_pb_text]' . $html . '[/et_pb_text]'
            . '[/et_pb_column][/et_pb_row][/et_pb_section]';
    }
}

class Lvx_Builder_WPBakery extends Lvx_Builder_Shortcode {

    public function slug()  { return 'wpbakery'; }
    public function label() { return 'WPBakery Page Builder'; }

    public function detect($post) {
        if (get_post_meta($post->ID, '_wpb_vc_js_status', true) === 'true') { return true; }
        return strpos((string) $post->post_content, '[vc_row') !== false;
    }

    protected function wrap($html) {
        return '[vc_row][vc_column][vc_column_text]' . $html . '[/vc_column_text][/vc_column][/vc_row]';
    }
}

/**
 * Oxygen stores its element tree as JSON in `ct_builder_json` (3.6+), with an
 * older shortcode representation in `ct_builder_shortcodes` still present on
 * many installs. Prefer the JSON — walking a tree finds prose wherever the
 * schema puts it, whereas the shortcode form hides some element text inside
 * a `ct_options` attribute where it is not visible text at all.
 *
 * Oxygen renders through its own template rather than `the_content`, so the
 * append fallback would never show. Appends are refused instead.
 */
class Lvx_Builder_Oxygen extends Lvx_Builder {

    const JSON_META  = 'ct_builder_json';
    const SHORT_META = 'ct_builder_shortcodes';

    public function slug()  { return 'oxygen'; }
    public function label() { return 'Oxygen Builder'; }

    public function renders_the_content() { return false; }

    public function detect($post) {
        return (string) get_post_meta($post->ID, self::JSON_META, true) !== ''
            || (string) get_post_meta($post->ID, self::SHORT_META, true) !== '';
    }

    public function read($post) {
        $meta = array();
        $json = (string) get_post_meta($post->ID, self::JSON_META, true);
        if ($json !== '') { $meta[self::JSON_META] = $json; }
        $short = (string) get_post_meta($post->ID, self::SHORT_META, true);
        if ($short !== '') { $meta[self::SHORT_META] = $short; }
        return $this->state(null, $meta);
    }

    public function replace($state, $find, $replace) {
        if (!empty($state['meta'][self::JSON_META])) {
            return $this->replace_json($state, $find, $replace);
        }
        if (!empty($state['meta'][self::SHORT_META])) {
            $r = Lvx_Text::replace((string) $state['meta'][self::SHORT_META], $find, $replace, true);
            $state['meta'][self::SHORT_META] = $r['result'];
            return array('ok' => $r['ok'], 'state' => $state, 'error' => $r['error']);
        }
        return array('ok' => false, 'state' => $state, 'error' => 'no Oxygen content found on this page');
    }

    private function replace_json($state, $find, $replace) {
        $depth = 0;
        $tree = self::decode_json((string) $state['meta'][self::JSON_META], $depth);
        if ($tree === null) {
            return array('ok' => false, 'state' => $state, 'error' => 'Oxygen JSON is unreadable');
        }
        $r = Lvx_Tree::replace($tree, $find, $replace);
        if (!$r['ok']) { return array('ok' => false, 'state' => $state, 'error' => $r['error']); }

        // Re-apply exactly the slashing the value arrived with, so a payload
        // that was double-escaped in the database stays double-escaped.
        $encoded = wp_json_encode($r['data']);
        for ($i = 0; $i < $depth; $i++) { $encoded = addslashes($encoded); }
        $state['meta'][self::JSON_META] = $encoded;

        // The shortcode copy is now stale. Dropping it from the state means
        // persist() leaves the stored value alone rather than writing back
        // content that no longer matches the JSON Oxygen actually renders.
        unset($state['meta'][self::SHORT_META]);

        return array('ok' => true, 'state' => $state, 'error' => '');
    }

    /**
     * Oxygen's stored JSON is routinely mangled — a UTF-8 BOM in front, and
     * one to three rounds of WordPress slashing baked in. Peel the layers off
     * until it parses, recording how many so the write can put them back.
     */
    public static function decode_json($raw, &$depth) {
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', (string) $raw);
        for ($depth = 0; $depth <= 3; $depth++) {
            $candidate = $raw;
            for ($i = 0; $i < $depth; $i++) { $candidate = stripslashes($candidate); }
            $decoded = json_decode($candidate, true);
            if (is_array($decoded)) { return $decoded; }
        }
        $depth = 0;
        return null;
    }
}

/* ─────────────── Tree builders ─────────────── */

class Lvx_Builder_Elementor extends Lvx_Builder {

    const META = '_elementor_data';

    public function slug()  { return 'elementor'; }
    public function label() { return 'Elementor'; }

    public function detect($post) {
        return get_post_meta($post->ID, '_elementor_edit_mode', true) === 'builder'
            && (string) get_post_meta($post->ID, self::META, true) !== '';
    }

    public function read($post) {
        return $this->state(null, array(self::META => (string) get_post_meta($post->ID, self::META, true)));
    }

    public function replace($state, $find, $replace) {
        $tree = $this->decode($state);
        if ($tree === null) {
            return array('ok' => false, 'state' => $state, 'error' => 'Elementor data is not valid JSON');
        }
        $r = Lvx_Tree::replace($tree, $find, $replace);
        if (!$r['ok']) { return array('ok' => false, 'state' => $state, 'error' => $r['error']); }

        $state['meta'][self::META] = wp_json_encode($r['data']);
        return array('ok' => true, 'state' => $state, 'error' => '');
    }

    public function append($state, $html) {
        $tree = $this->decode($state);
        if (!is_array($tree)) {
            return array('ok' => false, 'state' => $state, 'native' => false,
                'error' => 'Elementor data is not valid JSON');
        }
        $tree[] = array(
            'id'       => Lvx_Tree::element_id(),
            'elType'   => 'section',
            'settings' => new stdClass(),
            'elements' => array(array(
                'id'       => Lvx_Tree::element_id(),
                'elType'   => 'column',
                'settings' => array('_column_size' => 100, '_inline_size' => null),
                'elements' => array(array(
                    'id'         => Lvx_Tree::element_id(),
                    'elType'     => 'widget',
                    'widgetType' => 'html',
                    'settings'   => array('html' => $html),
                    'elements'   => array(),
                )),
            )),
        );
        $state['meta'][self::META] = wp_json_encode($tree);
        return array('ok' => true, 'state' => $state, 'native' => true, 'error' => '');
    }

    /**
     * Elementor stores its JSON slash-escaped, and expects it back that way —
     * writing an unslashed value corrupts every quote in the layout.
     */
    protected function slash_meta($key, $value) {
        return ($key === self::META) ? wp_slash($value) : $value;
    }

    public function clear_cache($post_id) {
        if (class_exists('\Elementor\Plugin')) {
            $p = \Elementor\Plugin::$instance;
            if (isset($p->files_manager)) { $p->files_manager->clear_cache(); }
        }
    }

    private function decode($state) {
        $raw = isset($state['meta'][self::META]) ? (string) $state['meta'][self::META] : '';
        if ($raw === '') { return null; }
        // No unslashing here. update_post_meta() unslashes on the way in,
        // which is the whole reason slash_meta() slashes on the way out — so
        // what get_post_meta() hands back is already clean JSON. Stripping
        // slashes again would eat the backslash in every \" and \\ inside the
        // layout's own strings and leave the JSON undecodable.
        $tree = json_decode($raw, true);
        return is_array($tree) ? $tree : null;
    }
}

class Lvx_Builder_Beaver extends Lvx_Builder {

    const META = '_fl_builder_data';

    public function slug()  { return 'beaver'; }
    public function label() { return 'Beaver Builder'; }

    public function detect($post) {
        return (bool) get_post_meta($post->ID, '_fl_builder_enabled', true);
    }

    public function read($post) {
        return $this->state(null, array(self::META => get_post_meta($post->ID, self::META, true)));
    }

    public function replace($state, $find, $replace) {
        $data = maybe_unserialize($state['meta'][self::META]);
        if (!is_array($data)) {
            return array('ok' => false, 'state' => $state, 'error' => 'Beaver Builder layout data is unreadable');
        }
        $r = Lvx_Tree::replace($data, $find, $replace);
        if (!$r['ok']) { return array('ok' => false, 'state' => $state, 'error' => $r['error']); }

        $state['meta'][self::META] = $r['data'];
        return array('ok' => true, 'state' => $state, 'error' => '');
    }

    public function clear_cache($post_id) {
        if (class_exists('FLBuilderModel') && method_exists('FLBuilderModel', 'delete_asset_cache')) {
            FLBuilderModel::delete_asset_cache($post_id);
        }
    }
}

class Lvx_Builder_Bricks extends Lvx_Builder {

    const META = '_bricks_page_content_2';

    public function slug()  { return 'bricks'; }
    public function label() { return 'Bricks Builder'; }

    /** Bricks renders through its own template, never `the_content`. */
    public function renders_the_content() { return false; }

    public function detect($post) {
        $d = get_post_meta($post->ID, self::META, true);
        if (is_array($d) && !empty($d)) { return true; }
        return get_post_meta($post->ID, '_bricks_editor_mode', true) === 'bricks';
    }

    public function read($post) {
        return $this->state(null, array(self::META => get_post_meta($post->ID, self::META, true)));
    }

    public function replace($state, $find, $replace) {
        $data = $state['meta'][self::META];
        if (!is_array($data)) {
            return array('ok' => false, 'state' => $state, 'error' => 'Bricks layout data is unreadable');
        }
        $r = Lvx_Tree::replace($data, $find, $replace);
        if (!$r['ok']) { return array('ok' => false, 'state' => $state, 'error' => $r['error']); }

        $state['meta'][self::META] = $r['data'];
        return array('ok' => true, 'state' => $state, 'error' => '');
    }

    /**
     * Bricks elements are a flat list linked by parent/children ids, so a new
     * root-level text element is a well-defined addition rather than a guess.
     * It has to be native: Bricks never runs `the_content`, so the fallback
     * would render nowhere.
     */
    public function append($state, $html) {
        $data = $state['meta'][self::META];
        if (!is_array($data)) {
            return array('ok' => false, 'state' => $state, 'native' => false,
                'error' => 'Bricks layout data is unreadable');
        }
        $data[] = array(
            'id'       => Lvx_Tree::element_id(),
            'name'     => 'text-basic',
            'parent'   => 0,
            'children' => array(),
            'settings' => array('text' => $html),
        );
        $state['meta'][self::META] = $data;
        return array('ok' => true, 'state' => $state, 'native' => true, 'error' => '');
    }
}

/* ─────────────── Registry ─────────────── */

class Lvx_Builders {

    /**
     * Most specific first. Divi, Elementor and friends all leave post_content
     * populated (often with a plain-text fallback), so checking the classic
     * adapter early would match nearly every page on a builder site.
     */
    public static function all() {
        static $list = null;
        if ($list === null) {
            $list = array(
                new Lvx_Builder_Elementor(),
                new Lvx_Builder_Divi(),
                new Lvx_Builder_Beaver(),
                new Lvx_Builder_Bricks(),
                new Lvx_Builder_Oxygen(),
                new Lvx_Builder_WPBakery(),
                new Lvx_Builder_Gutenberg(),
                new Lvx_Builder_Classic(),
            );
        }
        return $list;
    }

    /** The adapter that owns this post. Never null — Classic is the floor. */
    public static function for_post($post) {
        foreach (self::all() as $builder) {
            if ($builder->detect($post)) { return $builder; }
        }
        return new Lvx_Builder_Classic();
    }

    public static function by_slug($slug) {
        foreach (self::all() as $builder) {
            if ($builder->slug() === $slug) { return $builder; }
        }
        return null;
    }
}
