/**
 * Self-Serve Connect — the client snippet (`/c.js`) and its render logic.
 *
 * The browser functions below (esc, applyOverride, appendBlock, …) are the
 * SINGLE SOURCE OF TRUTH: they are unit-tested directly against jsdom AND
 * serialized verbatim (via `.toString()`) into the `/c.js` bundle, exactly like
 * the edge Worker serializes its renderers. Crucially they reuse the SAME block
 * renderers the edge Worker uses (relatedLinksNav / citationsNav /
 * citableSection / faqSection / freshnessSection), so a snippet-fronted site and
 * an edge-fronted site inject byte-identical blocks.
 *
 * Pure string/DOM logic — no server imports — so it is safe to serialize.
 */

import {
  relatedLinksNav,
  citationsNav,
  citableSection,
  faqSection,
  freshnessSection,
} from '@/lib/fix-engine/edge-worker';
import type { PublicOverride } from './overrides';

/** Minimal document surface the render functions touch (kept dependency-free so
 *  the functions serialize cleanly; a real `Document` satisfies it). */
type DomLike = Document;

/** The same html-escaper the edge Worker defines inline (& < > "). Exported so
 *  tests pass the exact escaper the renderers receive at the edge. */
export const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Create the `<meta name>` if absent, then set its content. */
export function upsertMeta(doc: DomLike, name: string, content: string): void {
  let el = doc.querySelector('meta[name="' + name + '"]');
  if (!el) { el = doc.createElement('meta'); el.setAttribute('name', name); doc.head.appendChild(el); }
  el.setAttribute('content', content);
}

/** Create the `<link rel="canonical">` if absent, then set its href. */
export function upsertCanonical(doc: DomLike, href: string): void {
  let el = doc.querySelector('link[rel="canonical"]');
  if (!el) { el = doc.createElement('link'); el.setAttribute('rel', 'canonical'); doc.head.appendChild(el); }
  el.setAttribute('href', href);
}

/** Inject a JSON-LD script into <head>, once (guarded by data-livesov="schema"). */
export function injectJsonLd(doc: DomLike, jsonLd: string): void {
  if (doc.querySelector('script[data-livesov="schema"]')) return;
  const s = doc.createElement('script');
  s.setAttribute('type', 'application/ld+json');
  s.setAttribute('data-livesov', 'schema');
  s.textContent = jsonLd;
  doc.head.appendChild(s);
}

/**
 * Append a rendered block into the first semantic container (article → main →
 * [itemprop=articleBody] → body), once. `marker` is the block's data-livesov
 * value; if an element with it already exists we skip — the single-inject guard,
 * mirroring the edge Worker's appender.
 */
export function appendBlock(doc: DomLike, html: string, marker: string): void {
  if (!html || doc.querySelector('[data-livesov="' + marker + '"]')) return;
  const host = doc.querySelector('article') || doc.querySelector('main')
    || doc.querySelector('[itemprop="articleBody"]') || doc.body;
  if (!host) return;
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  host.appendChild(tpl.content);
}

/**
 * Apply a public per-path override to the live document: set title, upsert meta
 * description + canonical, inject JSON-LD, then append the citations / links /
 * citable / faq / freshness blocks using the shared edge renderers. Every step
 * is single-inject-guarded, so re-running is idempotent.
 */
export function applyOverride(doc: DomLike, o: PublicOverride, escFn: (s: string) => string): void {
  if (!o) return;
  if (o.title) doc.title = o.title;
  if (o.metaDescription) upsertMeta(doc, 'description', o.metaDescription);
  if (o.canonical) upsertCanonical(doc, o.canonical);
  if (o.jsonLd) injectJsonLd(doc, o.jsonLd);
  if (o.links && o.links.length) appendBlock(doc, relatedLinksNav(o.links, escFn), 'internal-links');
  if (o.citations && o.citations.length) appendBlock(doc, citationsNav(o.citations, escFn), 'citations');
  if (o.citable) appendBlock(doc, citableSection(o.citable, escFn), 'citable');
  if (o.faq && o.faq.faqs && o.faq.faqs.length) appendBlock(doc, faqSection(o.faq, escFn), 'faq');
  if (o.freshness && o.freshness.update) appendBlock(doc, freshnessSection(o.freshness, escFn), 'freshness');
}

/** The base URL the snippet + `/c.js` are served from (absolute — the snippet
 *  runs on the customer's domain, so it must call Livesov absolutely). */
export function connectBaseUrl(): string {
  return process.env.APP_URL || 'https://livesov.com';
}

/** The exact one-liner a customer pastes into their site's <head> or footer. */
export function snippetTag(publicKey: string, base = connectBaseUrl()): string {
  return `<script async src="${base}/c.js" data-livesov="${publicKey}"></script>`;
}

/**
 * Build the `/c.js` bundle: a tiny, dependency-free IIFE that reads its own
 * data-livesov key + the current path, fetches the public override, applies it
 * to the DOM (reusing the serialized render functions above), then pings the
 * heartbeat. All helper functions are serialized verbatim so what the tests
 * exercise is exactly what ships.
 */
export function buildConnectSnippet(base: string): string {
  return `(function(){\n`
    + `try {\n`
    + `  var s = document.currentScript || document.querySelector('script[data-livesov]');\n`
    + `  if (!s) return;\n`
    + `  var key = s.getAttribute('data-livesov');\n`
    + `  if (!key) return;\n`
    + `  var BASE = ${JSON.stringify(base)};\n`
    + `  var esc = ${esc.toString()};\n`
    + `  var relatedLinksNav = ${relatedLinksNav.toString()};\n`
    + `  var citationsNav = ${citationsNav.toString()};\n`
    + `  var citableSection = ${citableSection.toString()};\n`
    + `  var faqSection = ${faqSection.toString()};\n`
    + `  var freshnessSection = ${freshnessSection.toString()};\n`
    + `  var upsertMeta = ${upsertMeta.toString()};\n`
    + `  var upsertCanonical = ${upsertCanonical.toString()};\n`
    + `  var injectJsonLd = ${injectJsonLd.toString()};\n`
    + `  var appendBlock = ${appendBlock.toString()};\n`
    + `  var applyOverride = ${applyOverride.toString()};\n`
    + `  var path = location.pathname;\n`
    + `  function heartbeat(){ try { var u = BASE + '/api/connect/' + encodeURIComponent(key) + '/heartbeat'; if (navigator.sendBeacon) navigator.sendBeacon(u); else fetch(u, { method: 'POST', mode: 'no-cors', keepalive: true }); } catch (e) {} }\n`
    + `  fetch(BASE + '/api/connect/serve?key=' + encodeURIComponent(key) + '&path=' + encodeURIComponent(path), { credentials: 'omit' })\n`
    + `    .then(function(r){ return r.ok ? r.json() : null; })\n`
    + `    .then(function(d){ if (d && d.override) { try { applyOverride(document, d.override, esc); } catch (e) {} } heartbeat(); })\n`
    + `    .catch(function(){ heartbeat(); });\n`
    + `} catch (e) {}\n`
    + `})();\n`;
}
