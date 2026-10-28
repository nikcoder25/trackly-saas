<?php
/**
 * Lvx_Text — locating and replacing a passage of *visible text* inside markup
 * we did not author.
 *
 * Every builder stores content differently (raw HTML, Gutenberg blocks, Divi
 * shortcodes, Elementor JSON), but they all share one problem: Livesov sends
 * us a passage as it appeared in the *rendered* page, and we have to find it
 * in the *source*. A plain str_replace fails constantly, because the source
 * differs from the render in ways that don't change a single visible glyph:
 *
 *   - entities            "Bob&#8217;s"      renders as  "Bob's"
 *   - whitespace          "a\n\n    b"       renders as  "a b"
 *   - inline markup       "the <strong>fast</strong> way"  renders as "the fast way"
 *   - surrounding syntax  "[et_pb_text]Hi[/et_pb_text]"    renders as "Hi"
 *
 * So instead of matching raw bytes we build a normalized projection of the
 * source — visible text only, entities decoded, whitespace collapsed — while
 * remembering the exact source byte span each normalized byte came from. Match
 * against the projection, then map the hit back to source offsets and splice
 * there. The same primitive then works for every builder: HTML, shortcodes,
 * and individual string values plucked out of a JSON or serialized tree.
 *
 * The safety rule that matters: a match is only applied if the source span it
 * covers contains nothing but text and *inline* formatting tags. The moment a
 * match would swallow a shortcode, a block delimiter, or a structural tag, we
 * refuse and report why. Failing loudly is always better than silently
 * dismantling somebody's layout.
 */

if (!defined('ABSPATH')) { exit; }

class Lvx_Text {

    /**
     * Inline tags a replacement is allowed to swallow. These carry no layout
     * or builder semantics, so losing them costs formatting at worst — and
     * the replacement text supplies its own.
     */
    private static $inline_tags = array(
        'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del',
        'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small',
        'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
    );

    /**
     * Replace the first occurrence of $find with $replace inside $source.
     *
     * @param string $source      Markup to edit.
     * @param string $find        Passage to look for, as rendered.
     * @param string $replace     Replacement markup.
     * @param bool   $shortcodes  Treat [...] as non-text (shortcode builders).
     * @return array{ok:bool,result:string,error:string}
     */
    public static function replace($source, $find, $replace, $shortcodes = false) {
        $find = (string) $find;
        if ($find === '') {
            return self::fail($source, 'empty find string');
        }

        $map   = self::project((string) $source, $shortcodes);
        $rendered = $map['text'];
        $needle   = self::normalize_needle($find);

        if ($needle === '') {
            return self::fail($source, 'find string has no visible text');
        }

        $at = strpos($rendered, $needle);
        if ($at === false) {
            return self::fail($source, 'passage not found on the page (it may have been edited since Livesov crawled it)');
        }
        if (strpos($rendered, $needle, $at + 1) !== false) {
            return self::fail($source, 'passage appears more than once — too ambiguous to replace safely');
        }

        $pairs = $map['pairs'];
        $start = $pairs[$at][1];
        $end   = $pairs[$at + strlen($needle) - 1][2];

        $blocker = self::spans_unsafe_region($map['skips'], $start, $end);
        if ($blocker !== null) {
            return self::fail($source, "passage spans $blocker — replacing it would break the page structure");
        }

        return array(
            'ok'     => true,
            'result' => substr($source, 0, $start) . $replace . substr($source, $end),
            'error'  => '',
        );
    }

    /** Does $source visibly contain $find? Used to verify a change landed. */
    public static function contains($source, $find, $shortcodes = false) {
        $needle = self::normalize_needle((string) $find);
        if ($needle === '') { return false; }
        $map = self::project((string) $source, $shortcodes);
        return strpos($map['text'], $needle) !== false;
    }

    /** The visible text of $source, normalized. Useful for diagnostics. */
    public static function to_text($source, $shortcodes = false) {
        $map = self::project((string) $source, $shortcodes);
        return trim($map['text']);
    }

    /* ─────────────── internals ─────────────── */

    private static function fail($source, $why) {
        return array('ok' => false, 'result' => (string) $source, 'error' => $why);
    }

    /** Normalize a needle the same way the source projection is normalized. */
    private static function normalize_needle($find) {
        // Needles arrive from a crawl, so they may carry inline markup and
        // entities of their own. Project them with the same rules (minus
        // shortcodes, which never appear in rendered text) and trim.
        $map = self::project($find, false);
        return trim($map['text']);
    }

    /**
     * Build the normalized projection of $source.
     *
     * @return array{text:string,pairs:array<int,array{0:string,1:int,2:int}>,skips:array<int,array>}
     *         `pairs[i]` is [byte, srcStart, srcEnd) for normalized byte i.
     *         `skips` records every non-text region so a match span can be
     *         checked for anything it must not cross.
     */
    private static function project($source, $shortcodes) {
        $len   = strlen($source);
        $pairs = array();
        $skips = array();
        $i     = 0;
        $pending_ws = -1; // start offset of a whitespace run awaiting emit

        while ($i < $len) {
            $c = $source[$i];

            // ── HTML comment (also Gutenberg block delimiters) ──
            if ($c === '<' && substr($source, $i, 4) === '<!--') {
                $close = strpos($source, '-->', $i);
                $end   = ($close === false) ? $len : $close + 3;
                $inner = substr($source, $i + 4, max(0, $end - $i - 7));
                $kind  = (strpos(ltrim($inner), 'wp:') === 0 || strpos(ltrim($inner), '/wp:') === 0)
                    ? 'block delimiter' : 'comment';
                $skips[] = array('start' => $i, 'end' => $end, 'kind' => $kind, 'name' => '');
                if ($pending_ws < 0) { $pending_ws = $i; }
                $i = $end;
                continue;
            }

            // ── HTML tag ──
            if ($c === '<') {
                $close = strpos($source, '>', $i);
                $end   = ($close === false) ? $len : $close + 1;
                $raw   = substr($source, $i, $end - $i);
                $name  = '';
                if (preg_match('#^</?\s*([a-zA-Z][a-zA-Z0-9:-]*)#', $raw, $m)) {
                    $name = strtolower($m[1]);
                }
                $inline = in_array($name, self::$inline_tags, true);
                $skips[] = array(
                    'start' => $i,
                    'end'   => $end,
                    'kind'  => $inline ? 'inline' : 'block tag',
                    'name'  => $name,
                );
                // A block boundary renders as a word break even with no
                // whitespace in the source ("</p><p>" reads as "a b"), so the
                // projection has to produce one or crawled passages that span
                // two blocks will never match. Inline tags produce none —
                // "<b>fast</b>est" is one word.
                if (!$inline && $pending_ws < 0) { $pending_ws = $i; }
                $i = $end;
                continue;
            }

            // ── Shortcode ──
            if ($shortcodes && $c === '[') {
                $close = strpos($source, ']', $i);
                $end   = ($close === false) ? $len : $close + 1;
                $skips[] = array('start' => $i, 'end' => $end, 'kind' => 'a shortcode', 'name' => '');
                if ($pending_ws < 0) { $pending_ws = $i; }
                $i = $end;
                continue;
            }

            // ── Whitespace run → single space ──
            if ($c === ' ' || $c === "\t" || $c === "\n" || $c === "\r" || $c === "\0" || $c === "\x0B") {
                if ($pending_ws < 0) { $pending_ws = $i; }
                $i++;
                continue;
            }

            if ($pending_ws >= 0) {
                // Leading whitespace produces no normalized byte; interior
                // whitespace collapses to exactly one space.
                if (!empty($pairs)) {
                    $pairs[] = array(' ', $pending_ws, $i);
                }
                $pending_ws = -1;
            }

            // ── Entity ──
            if ($c === '&' && preg_match('/^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,10});/', substr($source, $i, 16), $m)) {
                $entity  = $m[0];
                $decoded = html_entity_decode($entity, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $end     = $i + strlen($entity);
                if ($decoded !== $entity && $decoded !== '') {
                    // Entities that decode to whitespace collapse too. Note
                    // trim() alone misses &nbsp;, which decodes to U+00A0
                    // (two bytes) rather than an ASCII space.
                    if (trim($decoded, " \t\n\r\0\x0B\xC2\xA0") === '') {
                        if ($pending_ws < 0) { $pending_ws = $i; }
                        $i = $end;
                        continue;
                    }
                    $n = strlen($decoded);
                    for ($k = 0; $k < $n; $k++) {
                        $pairs[] = array($decoded[$k], $i, $end);
                    }
                    $i = $end;
                    continue;
                }
            }

            $pairs[] = array($c, $i, $i + 1);
            $i++;
        }

        $text = '';
        foreach ($pairs as $p) { $text .= $p[0]; }

        return array('text' => $text, 'pairs' => $pairs, 'skips' => $skips);
    }

    /**
     * Return a human description of the structural region a [start,end) span
     * crosses, or null when the span only crosses inline formatting.
     *
     * A span often crosses several regions at once; report the most
     * builder-significant one, because "spans a shortcode" tells the user far
     * more about why their Divi page was left alone than "spans <p>".
     */
    private static function spans_unsafe_region($skips, $start, $end) {
        $found = array();
        foreach ($skips as $s) {
            if ($s['end'] <= $start || $s['start'] >= $end) { continue; }
            if ($s['kind'] === 'inline') { continue; }
            $found[$s['kind']] = ($s['kind'] === 'block tag')
                ? '<' . ($s['name'] !== '' ? $s['name'] : '?') . '>'
                : $s['kind'];
        }
        if (empty($found)) { return null; }
        foreach (array('a shortcode', 'block delimiter', 'comment', 'block tag') as $kind) {
            if (isset($found[$kind])) { return $found[$kind]; }
        }
        return reset($found);
    }
}
