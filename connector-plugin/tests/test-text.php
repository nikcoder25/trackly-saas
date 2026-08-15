<?php
/** Tests for Lvx_Text — the find/replace primitive every adapter builds on. */

T::group('text');

/* ── exact, boring case ── */
$r = Lvx_Text::replace('<p>The old copy here.</p>', 'The old copy here.', 'The new copy.');
T::ok($r['ok'], 'plain replace succeeds');
T::same('<p>The new copy.</p>', $r['result'], 'plain replace result');

/* ── whitespace in the source that the render collapses ── */
$src = "<p>Call us\n\n     today for a quote</p>";
$r = Lvx_Text::replace($src, 'Call us today for a quote', 'Book online in 30 seconds');
T::ok($r['ok'], 'collapsed whitespace still matches');
T::same('<p>Book online in 30 seconds</p>', $r['result'], 'whitespace-normalized replace result');

/* ── entities: the needle comes back from a crawl already decoded ── */
$src = '<p>Bob&#8217;s Plumbing &amp; Heating</p>';
$r = Lvx_Text::replace($src, "Bob\xE2\x80\x99s Plumbing & Heating", 'Bob Plumbing Co.');
T::ok($r['ok'], 'entity-decoded needle matches encoded source');
T::same('<p>Bob Plumbing Co.</p>', $r['result'], 'entity replace result');

/* ── &nbsp; collapses like whitespace ── */
$r = Lvx_Text::replace('<p>fast&nbsp;service</p>', 'fast service', 'same-day service');
T::ok($r['ok'], 'nbsp treated as whitespace');
T::same('<p>same-day service</p>', $r['result'], 'nbsp replace result');

/* ── inline markup inside the match is allowed to be swallowed ── */
$src = '<p>the <strong>fastest</strong> option in town</p>';
$r = Lvx_Text::replace($src, 'the fastest option in town', 'the best-reviewed option in town');
T::ok($r['ok'], 'match spanning inline tags is allowed');
T::same('<p>the best-reviewed option in town</p>', $r['result'], 'inline-spanning replace result');

/* ── structural tags are NOT swallowed ── */
$src = '<p>first half</p><div class="cta"><p>second half</p></div>';
$r = Lvx_Text::replace($src, 'first half second half', 'merged');
T::ok(!$r['ok'], 'match spanning a block tag is refused');
T::contains($r['error'], '<p>', 'refusal names the offending tag');
T::same($src, $r['result'], 'refused replace leaves source untouched');

/* ── Gutenberg block delimiters are never crossed ── */
$src = "<!-- wp:paragraph -->\n<p>alpha</p>\n<!-- /wp:paragraph -->\n<!-- wp:paragraph -->\n<p>beta</p>\n<!-- /wp:paragraph -->";
$r = Lvx_Text::replace($src, 'alpha beta', 'gamma');
T::ok(!$r['ok'], 'match crossing a block delimiter is refused');
T::contains($r['error'], 'block delimiter', 'refusal names the block delimiter');

/* ── but a match inside one block is fine, delimiters intact ── */
$r = Lvx_Text::replace($src, 'alpha', 'alpha improved');
T::ok($r['ok'], 'in-block replace succeeds');
T::contains($r['result'], '<!-- wp:paragraph -->', 'block delimiters survive');
T::contains($r['result'], '<p>alpha improved</p>', 'in-block replace applied');

/* ── shortcode attributes must never be touched ── */
$src = '[et_pb_text admin_label="Hero copy"]We fix furnaces fast[/et_pb_text]';
$r = Lvx_Text::replace($src, 'We fix furnaces fast', 'We repair furnaces same-day', true);
T::ok($r['ok'], 'text between shortcodes is replaceable');
T::same('[et_pb_text admin_label="Hero copy"]We repair furnaces same-day[/et_pb_text]', $r['result'], 'shortcode wrapper preserved');

/* ── a needle that only matches inside a shortcode attribute is not a match ── */
$r = Lvx_Text::replace($src, 'Hero copy', 'Banner copy', true);
T::ok(!$r['ok'], 'shortcode attribute text is not visible text');

/* ── matches crossing a shortcode boundary are refused ── */
$src = '[et_pb_text]alpha[/et_pb_text][et_pb_text]beta[/et_pb_text]';
$r = Lvx_Text::replace($src, 'alpha beta', 'gamma', true);
T::ok(!$r['ok'], 'match crossing shortcodes is refused');
T::contains($r['error'], 'shortcode', 'refusal names the shortcode');

/* ── ambiguity is refused rather than guessed at ── */
$src = '<p>Contact us</p><p>Contact us</p>';
$r = Lvx_Text::replace($src, 'Contact us', 'Call us');
T::ok(!$r['ok'], 'ambiguous match is refused');
T::contains($r['error'], 'more than once', 'refusal explains the ambiguity');

/* ── missing passage reports a useful reason ── */
$r = Lvx_Text::replace('<p>hello</p>', 'nothing like this', 'x');
T::ok(!$r['ok'], 'absent passage fails');
T::contains($r['error'], 'not found', 'refusal says the passage is missing');

/* ── needle carrying its own markup still matches ── */
$r = Lvx_Text::replace('<p>the fastest option</p>', 'the <b>fastest</b> option', 'the cheapest option');
T::ok($r['ok'], 'needle containing markup is normalized too');
T::same('<p>the cheapest option</p>', $r['result'], 'marked-up needle replace result');

/* ── helpers ── */
T::ok(Lvx_Text::contains('<p>Bob&amp;Sons</p>', 'Bob&Sons'), 'contains() normalizes');
T::same('alpha beta', Lvx_Text::to_text("<p>alpha</p>\n<p>beta</p>"), 'to_text() renders visible text');
T::ok(!Lvx_Text::replace('<p>x</p>', '', 'y')['ok'], 'empty needle refused');

/* ── multibyte survives a round trip ── */
$src = '<p>Café Münster serves crème brûlée</p>';
$r = Lvx_Text::replace($src, 'Café Münster serves crème brûlée', 'Café Münster serves gelato');
T::ok($r['ok'], 'multibyte passage matches');
T::same('<p>Café Münster serves gelato</p>', $r['result'], 'multibyte replace result');
