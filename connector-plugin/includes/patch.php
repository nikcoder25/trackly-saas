<?php
/**
 * Lvx_Patch — turning a Livesov ContentPatch into a new builder state.
 *
 * This is the seam between what Livesov asks for (three body operations, in
 * terms of the *rendered* page) and what a builder can actually accept. It
 * owns the decisions about what is safe to attempt and what has to be refused
 * outright, and it is deliberately free of WordPress globals so those
 * decisions can be tested directly.
 */

if (!defined('ABSPATH')) { exit; }

class Lvx_Patch {

    /**
     * @param object $post  WP_Post (needs ->ID and ->post_content)
     * @param array  $patch Livesov ContentPatch
     * @return array{err:string,state:array,appended:array,native:bool,builder:Lvx_Builder}
     */
    public static function build($post, $patch) {
        $builder  = Lvx_Builders::for_post($post);
        $state    = $builder->read($post);
        $appended = array();
        $native   = true;

        if (isset($patch['bodyHtml'])) {
            // Overwriting the body is only meaningful where the body *is* the
            // page. On Elementor or Bricks the visitor sees the builder's own
            // tree, so replacing post_content would leave the page looking
            // identical while quietly discarding the real content — and
            // replacing the tree with raw HTML would erase the layout. Refuse
            // both and say why.
            if ($state['post_content'] === null) {
                return self::fail($builder, $state,
                    'this page is built with ' . $builder->label()
                    . ', which stores its layout outside the post body — a full-body replacement would destroy it');
            }
            $state['post_content'] = (string) $patch['bodyHtml'];
        }

        if (isset($patch['bodyReplace']) && is_array($patch['bodyReplace']) && isset($patch['bodyReplace']['find'])) {
            $find    = (string) $patch['bodyReplace']['find'];
            $replace = isset($patch['bodyReplace']['replace']) ? (string) $patch['bodyReplace']['replace'] : '';
            $r = $builder->replace($state, $find, $replace);
            if (!$r['ok']) {
                return self::fail($builder, $state, $builder->label() . ': ' . $r['error']);
            }
            $state = $r['state'];
        }

        if (isset($patch['bodyAppend'])) {
            $html = (string) $patch['bodyAppend'];
            $r = $builder->append($state, $html);
            if ($r['ok']) {
                $state = $r['state'];
            } elseif ($builder->renders_the_content()) {
                // The builder declined to synthesise a node of its own, but its
                // front end does run the_content — so render the block there.
                // It lands after the builder's output rather than inside it,
                // which is a layout compromise rather than a corrupted layout.
                $appended[] = $html;
                $native = false;
            } else {
                // Nowhere safe to put it: no native node, and this builder
                // renders through its own template, so a the_content fallback
                // would be accepted and then never appear. Refusing is the
                // whole point — a fix that reports success and changes nothing
                // is worse than one that fails.
                return self::fail($builder, $state,
                    $builder->label() . ' renders its own template, so a new block can only be added in the builder — '
                    . 'Livesov cannot place this one automatically'
                    . ($r['error'] !== '' ? ' (' . $r['error'] . ')' : ''));
            }
        }

        return array('err' => '', 'state' => $state, 'appended' => $appended,
            'native' => $native, 'builder' => $builder);
    }

    private static function fail($builder, $state, $why) {
        return array('err' => $why, 'state' => $state, 'appended' => array(),
            'native' => true, 'builder' => $builder);
    }
}
