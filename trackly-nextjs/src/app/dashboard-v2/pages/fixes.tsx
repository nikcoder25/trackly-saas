'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Fix Engine — neo-brutalist "Maximal" design (from Claude Design handoff),
// wired to the real Fix Engine API. Visuals are the .mx design system; all
// data/actions go through /api/brands/[id]/fixes/* and /connections,
// /seo-brain. The dashboard shell already provides the .lvx token root, so
// this only adds the .mx layer + scoped styles.

import * as React from 'react';
import { useBrandData } from '@/hooks/useBrandData';

// ── types mirrored from the API ──
interface CatalogItem {
  key: string; title: string; description: string;
  channel: 'A' | 'B'; trigger: string; minPlan: string; phase: number; available: boolean;
  cost: number; revertable: boolean; impact?: 1 | 2 | 3;
}
interface FixEvent { id: string; event: string; detail: any; userId: string | null; createdAt: string }
interface FixRow {
  id: string; moduleKey: string; channel: 'A' | 'B'; targetUrl: string | null;
  status: string; severity: string; summary: string;
  generated: any; scoreAfter: number | null; error: string | null; createdAt: string;
  detected?: any; beforeSnapshot?: any;
  aiBefore?: { sov?: number; at?: string } | null; aiAfter?: { sov?: number; at?: string } | null;
  note?: string | null; assignee?: string | null;
  shipMode?: 'live' | 'draft'; previewUrl?: string | null;
  shipResult?: { op?: string } | null;
  pageImpressions?: number;
  gscBefore?: { ctr?: number; impressions?: number } | null;
  gscAfter?: { ctr?: number; impressions?: number; unavailable?: boolean } | null;
}
interface PreviewBlock { kind: string; label: string; before?: string; after?: string; language?: string }
// Result of creating a targeted passage rewrite, returned to the
// Optimize-a-Passage card so it can show the before/after inline.
type PassageResult =
  | { ok: true; fix: FixRow; preview: PreviewBlock | null }
  | { ok: false; error: string };
interface Connection { id: string; provider: string; cmsType: string | null; siteUrl: string | null; status: string; lastSeenAt?: string | null; meta?: Record<string, unknown> }

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

// ── design system (scoped under .mx) ──
// Copy-paste endpoint templates for the "custom-coded site" connection.
// Full contract in docs/CUSTOM-SITE-CONNECT.md.
const CUSTOM_ENDPOINT_NODE = `// livesov-fix endpoint (Node/Express) — mount at https://yoursite.com/livesov-fix
// npm i express  ·  set LIVESOV_SECRET to the same secret you pasted in Livesov
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const SECRET = process.env.LIVESOV_SECRET;

router.post('/livesov-fix', express.raw({ type: '*/*' }), (req, res) => {
  const sig = (req.get('x-livesov-signature') || '').replace('sha256=', '');
  const want = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
  const authed = req.get('authorization') === 'Bearer ' + SECRET
    && sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  if (!authed) return res.status(401).json({ ok: false });
  const p = JSON.parse(req.body);
  if (Math.abs(Date.now() - p.ts) > 300000) return res.status(401).json({ ok: false });

  switch (p.op) {
    case 'ping':
      return res.json({ ok: true });
    case 'update_title':
      // TODO: save p.value as the <title> of the page at p.url in YOUR database, e.g.
      // await db.pages.update({ where: { url: p.url }, data: { title: p.value } });
      return res.json({ ok: true });
    case 'update_meta_description':
      // TODO: save p.value as the meta description of the page at p.url
      return res.json({ ok: true });
    // Optional, add as you go: update_body (p.value, p.mode), inject_schema (p.value),
    // update_canonical (p.value), create_page (p.page), set_indexable, replace_in_body (p.find, p.replace)
    default:
      return res.json({ ok: false, unsupported: true }); // Livesov hands these fixes to you instead of failing
  }
});
module.exports = router;
`;

const CUSTOM_ENDPOINT_PHP = `<?php
// livesov-fix.php — upload to your site, endpoint URL = https://yoursite.com/livesov-fix.php
$SECRET = 'PASTE_THE_SAME_SECRET_HERE';

$raw = file_get_contents('php://input');
$sig = str_replace('sha256=', '', $_SERVER['HTTP_X_LIVESOV_SIGNATURE'] ?? '');
$authed = ($_SERVER['HTTP_AUTHORIZATION'] ?? '') === "Bearer $SECRET"
  && hash_equals(hash_hmac('sha256', $raw, $SECRET), $sig);
header('Content-Type: application/json');
if (!$authed) { http_response_code(401); exit(json_encode(['ok' => false])); }
$p = json_decode($raw, true);
if (abs(round(microtime(true) * 1000) - ($p['ts'] ?? 0)) > 300000) { http_response_code(401); exit(json_encode(['ok' => false])); }

switch ($p['op']) {
  case 'ping':
    exit(json_encode(['ok' => true]));
  case 'update_title':
    // TODO: save $p['value'] as the <title> of the page at $p['url'] in YOUR database
    exit(json_encode(['ok' => true]));
  case 'update_meta_description':
    // TODO: save $p['value'] as the meta description of the page at $p['url']
    exit(json_encode(['ok' => true]));
  // Optional, add as you go: update_body, inject_schema, update_canonical, create_page, set_indexable, replace_in_body
  default:
    exit(json_encode(['ok' => false, 'unsupported' => true])); // Livesov hands these fixes to you instead of failing
}
`;

// Google Apps Script template for the Spreadsheet hand-off.
// Sheet → Extensions → Apps Script → paste → Deploy as Web app (Execute as Me, access: Anyone).
const SHEET_APPS_SCRIPT = `function doPost(e) {
  var SECRET = 'PASTE_THE_SAME_SECRET_HERE'; // must match the secret in Livesov
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return out({ ok: false, error: 'bad secret' });
    if (p.ping) return out({ ok: true });
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) sheet.appendRow(['Date', 'Fix', 'Details', 'Link']);
    sheet.appendRow([new Date(), p.title || '', p.description || '', p.link || '']);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
`;

const MX_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
@keyframes xspin { to { transform: rotate(360deg); } }
@keyframes xtoast { from { opacity: 0; transform: translate(-50%, 14px) rotate(-1deg); } to { opacity: 1; transform: translate(-50%, 0) rotate(-1deg); } }
.mx { --ink: var(--text); --xr: 16px; }
.mx, .mx button, .mx input, .mx textarea, .mx select { font-family: 'Inter', sans-serif; }
.mx .disp { font-family: 'Space Grotesk', sans-serif; }
.mx .nb { border: 2.5px solid var(--ink); border-radius: var(--xr); box-shadow: 5px 5px 0 var(--ink); background: var(--surface); }
.mx .nb-sm { border: 2px solid var(--ink); border-radius: 12px; box-shadow: 3px 3px 0 var(--ink); background: var(--surface); }
.mx .xlbl { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
.mx .chip { display: inline-flex; align-items: center; gap: 5px; border: 2px solid var(--ink); border-radius: 999px; padding: 3px 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; background: var(--surface); color: var(--text); white-space: nowrap; }
.mx .xbtn { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; background: var(--primary); color: #fff; border: 2.5px solid var(--ink); border-radius: 11px; padding: 9px 17px; box-shadow: 3px 3px 0 var(--ink); cursor: pointer; transition: transform .1s, box-shadow .1s; display: inline-flex; align-items: center; gap: 8px; }
.mx .xbtn:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--ink); }
.mx .xbtn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--ink); }
.mx .xbtn[disabled] { opacity: .4; box-shadow: 2px 2px 0 var(--ink); cursor: not-allowed; transform: none; }
.mx .gbtn { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; background: var(--surface); color: var(--text); border: 2.5px solid var(--ink); border-radius: 11px; padding: 9px 17px; box-shadow: 3px 3px 0 var(--ink); cursor: pointer; transition: transform .1s, box-shadow .1s; display:inline-flex; align-items:center; gap:7px; }
.mx .gbtn:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--ink); }
.mx .gbtn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--ink); }
.mx .gbtn[disabled] { opacity:.4; cursor:not-allowed; transform:none; }
.mx .tbtn { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13px; background: none; border: 0; color: var(--text-2); cursor: pointer; padding: 6px 2px; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; text-decoration-color: var(--line-3); }
.mx .tbtn:hover { color: var(--text); text-decoration-color: var(--primary); }
.mx .xin { width: 100%; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--text); background: var(--surface); border: 2.5px solid var(--ink); border-radius: 10px; padding: 10px 13px; outline: none; box-shadow: 3px 3px 0 var(--ink); }
.mx .xin:focus { border-color: var(--primary); }
.mx textarea.xin { resize: vertical; line-height: 1.6; }
.mx .stripes { background-image: repeating-linear-gradient(45deg, var(--ink) 0 2px, transparent 2px 9px); }
`;

// ── status / severity / grouping helpers ──
function statusMeta(s: string): { label: string; color: string; bg: string } {
  const m: Record<string, { label: string; color: string; bg: string }> = {
    detected: { label: 'DETECTED', color: 'var(--text-3)', bg: 'var(--surface-2)' },
    generating: { label: 'GENERATING', color: 'var(--primary)', bg: 'var(--primary-50)' },
    generated: { label: 'IN REVIEW', color: 'var(--primary)', bg: 'var(--primary-50)' },
    preview_ready: { label: 'IN REVIEW', color: 'var(--primary)', bg: 'var(--primary-50)' },
    approved: { label: 'APPROVED', color: 'var(--info)', bg: 'var(--info-50)' },
    shipping: { label: 'SHIPPING', color: 'var(--info)', bg: 'var(--info-50)' },
    staged: { label: 'STAGED DRAFT', color: 'var(--info)', bg: 'var(--info-50)' },
    shipped: { label: 'SHIPPED', color: 'var(--success)', bg: 'var(--success-50)' },
    verified: { label: 'VERIFIED', color: 'var(--success)', bg: 'var(--success-50)' },
    failed: { label: 'ATTENTION', color: 'var(--danger)', bg: 'var(--danger-50)' },
    reverted: { label: 'REVERTED', color: 'var(--warn)', bg: 'var(--warn-50)' },
  };
  return m[s] || m.detected;
}
function sevMeta(s: string): { label: string; glyph: string; color: string; bg: string } {
  const m: Record<string, { label: string; glyph: string; color: string; bg: string }> = {
    critical: { label: 'CRITICAL', glyph: '✕', color: 'var(--danger)', bg: 'var(--danger-50)' },
    high: { label: 'HIGH', glyph: '▲', color: 'var(--warn)', bg: 'var(--warn-50)' },
    medium: { label: 'MEDIUM', glyph: '●', color: 'var(--info)', bg: 'var(--info-50)' },
    low: { label: 'LOW', glyph: '▽', color: 'var(--text-3)', bg: 'var(--surface-2)' },
  };
  return m[s] || m.medium;
}
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
function bucketOf(s: string): string {
  if (s === 'detected' || s === 'generating') return 'detected';
  if (s === 'generated' || s === 'preview_ready') return 'review';
  if (s === 'approved' || s === 'shipping' || s === 'staged') return 'approved';
  if (s === 'shipped' || s === 'verified') return 'shipped';
  if (s === 'failed' || s === 'reverted') return 'attention';
  return 'detected';
}
const TRIG_DOT: Record<string, string> = { crawl: 'var(--info)', gsc: 'var(--success)', manual: 'var(--warn)' };
const chanFill = (c: string) => c === 'A'
  ? { chBg: 'var(--primary-50)', chFg: 'var(--primary)' }
  : { chBg: 'var(--surface-2)', chFg: 'var(--text-2)' };

const MODULE_GROUP: Record<string, string> = {
  'schema-markup': 'Structured data & schema', 'faq-schema': 'Structured data & schema',
  'llms-txt': 'AI crawler access', 'robots-ai-access': 'AI crawler access',
  'title-rewrite': 'Content optimization', 'meta-rewrite': 'Content optimization',
  'geo-page-rewrite': 'Content optimization', 'passage-rewrite': 'Content optimization',
  'internal-linking': 'Content optimization', 'citable-passages': 'Content optimization',
  'content-freshness': 'Content optimization', 'keyword-opportunities': 'Content optimization',
  'image-alt': 'Technical & rankings',
  'external-citations': 'Authority & citations', 'comparison-pages': 'Authority & citations',
  'hallucination-correction': 'Accuracy & corrections',
  'striking-distance': 'Technical & rankings', 'ctr-rescue': 'Technical & rankings',
  'indexing-repair': 'Technical & rankings', 'canonical-fix': 'Technical & rankings',
  'noindex-removal': 'Technical & rankings', 'og-cards': 'Technical & rankings',
};
const GROUP_ORDER = ['Structured data & schema', 'AI crawler access', 'Content optimization', 'Authority & citations', 'Accuracy & corrections', 'Technical & rankings', 'Other'];
// Modules whose change can be staged as a Connector draft revision
// (mirrors the modules that implement contentPatch() server-side).
const STAGEABLE_MODULES = new Set(['title-rewrite', 'meta-rewrite', 'geo-page-rewrite', 'faq-schema', 'canonical-fix', 'passage-rewrite', 'citable-passages', 'content-freshness', 'keyword-opportunities']);
// Draft field a reviewer can edit inline before approving (mirrors each
// module's generated shape — only clean single-text drafts are editable).
const EDITABLE_FIELD: Record<string, string> = {
  'title-rewrite': 'title', 'meta-rewrite': 'description', 'ctr-rescue': 'title',
  'passage-rewrite': 'rewritten', 'content-freshness': 'update', 'llms-txt': 'content',
};

// The current ("before") value of a detected issue, read from the snapshot
// the module captured at detect time. Lets the card show what's live NOW —
// before you generate the rewrite — so the change is clear from the start.
// Returns { label, value, missing } for the text-style modules where a
// before/after makes sense; null when there's no meaningful current value.
function currentValue(fix: FixRow): { label: string; value: string; missing: boolean } | null {
  const b = (fix.beforeSnapshot || {}) as Record<string, any>;
  const d = (fix.detected || {}) as Record<string, any>;
  const mk = (label: string, raw: unknown, emptyAs = ''): { label: string; value: string; missing: boolean } => {
    const value = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw) : '';
    return { label, value: value || emptyAs, missing: !value };
  };
  switch (fix.moduleKey) {
    case 'title-rewrite': return mk('Current title', b.title ?? d.currentTitle, '(no title — currently missing)');
    case 'meta-rewrite': return mk('Current meta description', b.description, '(no meta description — currently missing)');
    case 'ctr-rescue': return mk('Current title', b.title);
    case 'passage-rewrite': return mk('Current passage', b.passage ?? d.passage);
    case 'canonical-fix': return mk('Current canonical', b.googleCanonical, '(none set)');
    case 'noindex-removal': return mk('Current robots directive', b.metaRobots, 'noindex');
    case 'content-freshness': return mk('Currently', typeof b.lastModified === 'string' && b.lastModified ? `Last updated ${String(b.lastModified).slice(0, 10)}` : d.daysOld != null ? `Last updated ~${d.daysOld} days ago` : '');
    default: return null;
  }
}

// Rotating chevron used in every collapsible section header (points down
// when open, rotates to point right when collapsed — a drop-down / drop-up
// affordance). Matches the existing Connections header.
function Chevron({ open, dark }: { open: boolean; dark?: boolean }) {
  return (
    <span className="disp" aria-hidden style={{ fontSize: 15, fontWeight: 700, display: 'inline-block', transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)', color: dark ? 'var(--bg)' : 'inherit' }}>▾</span>
  );
}

// Collapsible section header: the title (+ chevron) is a button that
// toggles the body; optional `right` holds controls that must stay
// independently clickable (so they're kept outside the toggle button to
// avoid nesting interactive elements). `dark` styles it for the dark
// header bar used across the page.
function SectionHeader({ title, open, onToggle, right, dark, bg }: {
  title: string; open: boolean; onToggle: () => void;
  right?: React.ReactNode; dark?: boolean; bg?: string;
}) {
  const fg = dark ? 'var(--bg)' : '#fff';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: bg || 'var(--text)', color: fg, flexWrap: 'wrap', gap: 10 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        title={open ? `Hide ${title}` : `Show ${title}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0, color: 'inherit', font: 'inherit' }}
      >
        <Chevron open={open} dark={dark} />
        <span className="disp" style={{ fontSize: 17, fontWeight: 700, color: fg }}>{title}</span>
      </button>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{right}</div>}
    </div>
  );
}

export function PageFixes() {
  const { brand, loading: brandLoading } = useBrandData({ fullData: true });
  const brandId = (brand as any)?.id as string | undefined;
  const brandName = (brand as any)?.name || 'this brand';

  const [fixes, setFixes] = React.useState<FixRow[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  const [plan, setPlan] = React.useState<string>('');
  const [attention, setAttention] = React.useState<{ failed: number; stuckConnector: number; regressed?: number } | null>(null);
  const [aiVis, setAiVis] = React.useState<{ sov: number; at: string } | null>(null);
  const [health, setHealth] = React.useState<{ score: number; openIssues: number } | null>(null);
  const [activity, setActivity] = React.useState<{ id: string; event: string; detail: any; createdAt: string }[]>([]);
  const [wizSite, setWizSite] = React.useState('');
  const [wizDetected, setWizDetected] = React.useState<{ cms: string; confidence: string; hasAdapter: boolean } | null>(null);
  const [wizBusy, setWizBusy] = React.useState(false);
  const [wizDismissed, setWizDismissed] = React.useState(false);
  // Lets the wizard (or the "connect this way" hints) open the Connections
  // CMS form with a specific platform preselected. Bumping `nonce` re-fires
  // even if the same platform is requested twice.
  const [connectRequest, setConnectRequest] = React.useState<{ platform: string; nonce: number } | null>(null);
  const requestConnect = React.useCallback((platform: string) => setConnectRequest((r) => ({ platform, nonce: (r?.nonce ?? 0) + 1 })), []);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  // Section-level collapse for the two inline cards (the component sections
  // manage their own). All default open; toggling keeps the page scannable.
  const [modulesOpen, setModulesOpen] = React.useState(true);
  const [fixesOpen, setFixesOpen] = React.useState(true);
  // Cards start collapsed (one line each) so long queues stay scannable;
  // clicking a row opens the full card. Expand/collapse-all lives in the
  // queue toolbar.
  const [openCards, setOpenCards] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [armed, setArmed] = React.useState<Record<string, boolean>>({});
  const [previews, setPreviews] = React.useState<Record<string, PreviewBlock | null>>({});
  const [scanning, setScanning] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [events, setEvents] = React.useState<Record<string, FixEvent[]>>({});
  const [quickWins, setQuickWins] = React.useState(false);
  const [groupByPage, setGroupByPage] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [supportedCms, setSupportedCms] = React.useState<string[]>([]);
  const [toast, setToast] = React.useState<string | null>(null);
  const [brain, setBrain] = React.useState<{ content: string; isCustom: boolean; base: string; presets: { key: string; title: string; description: string; content: string }[]; maxChars?: number } | null>(null);
  const [pairing, setPairing] = React.useState<{ token: string; hmacSecret: string; pullUrl: string } | null>(null);
  const [automation, setAutomation] = React.useState<any>(null);

  const saveAutomation = async (patch: any) => {
    if (!brandId) return; setError(null);
    try { const d = await api(`/api/brands/${brandId}/automation`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); setAutomation(d.automation); flash('Automation updated'); }
    catch (e) { setError((e as Error).message); }
  };

  const flash = React.useCallback((msg: string) => { setToast(msg); }, []);
  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const load = React.useCallback(async (id: string) => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/api/brands/${id}/fixes`);
      setFixes(d.fixes || []);
      setCatalog(d.catalog || []);
      setEnabled(!!d.enabled);
      setPlan(d.plan || '');
      setAttention(d.attention || null);
      setAiVis(d.aiVisibility || null);
      setHealth(d.health || null);
      setSelected(new Set((d.catalog || []).filter((c: CatalogItem) => c.available).map((c: CatalogItem) => c.key)));
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    try { const c = await api(`/api/brands/${id}/connections`); setConnections(c.connections || []); setSupportedCms(c.supportedCms || []); } catch { /* non-fatal */ }
    try { const b = await api(`/api/brands/${id}/seo-brain`); setBrain(b); } catch { /* non-fatal */ }
    try { const a = await api(`/api/brands/${id}/automation`); setAutomation(a.automation); setActivity(a.activity || []); } catch { /* non-fatal */ }
  }, []);

  React.useEffect(() => { if (!brandId) { setFixes([]); setCatalog([]); return; } load(brandId); }, [brandId, load]);

  // Surface the GSC OAuth round-trip result (?gsc=connected|denied|error).
  React.useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('gsc');
    if (!g) return;
    const msg: Record<string, string> = {
      connected: 'Google Search Console connected', denied: 'GSC connection denied',
      invalid: 'Connection link expired — retry', error: 'GSC connection failed — retry',
    };
    if (msg[g]) setToast(msg[g]);
    const u = new URL(window.location.href); u.searchParams.delete('gsc'); window.history.replaceState({}, '', u.toString());
  }, []);

  // Surface the one-click Google Sheet OAuth round-trip result (?sheet=...).
  React.useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('sheet');
    if (!s) return;
    const msg: Record<string, string> = {
      connected: 'Google Sheet created & connected', denied: 'Google connection denied',
      invalid: 'Connection link expired — retry', error: 'Could not create the sheet — retry',
    };
    if (msg[s]) setToast(msg[s]);
    if (s === 'connected' && brandId) load(brandId);
    const u = new URL(window.location.href); u.searchParams.delete('sheet'); window.history.replaceState({}, '', u.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // Surface the no-plugin WordPress connect result (?wp=connected|rejected|…).
  React.useEffect(() => {
    const w = new URLSearchParams(window.location.search).get('wp');
    if (!w) return;
    const msg: Record<string, string> = {
      connected: 'WordPress connected — no plugin needed', rejected: 'WordPress connection was declined',
      invalid: 'Connection link expired — retry', verifyfailed: 'Could not verify the WordPress credentials — retry',
      error: 'WordPress connection failed — retry',
    };
    if (msg[w]) setToast(msg[w]);
    const u = new URL(window.location.href); u.searchParams.delete('wp'); window.history.replaceState({}, '', u.toString());
  }, []);

  // Auto-load previews for fixes that already have generated content.
  React.useEffect(() => {
    fixes.forEach((f) => { if (f.generated && previews[f.id] === undefined) loadPreview(f.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixes]);

  const gscConn = connections.find((c) => c.provider === 'gsc' && c.status === 'active');
  const cmsConn = connections.find((c) => c.provider === 'cms' && c.status === 'active');
  const connectorConn = connections.find((c) => c.provider === 'connector' && c.status === 'active');
  const linearConn = connections.find((c) => c.provider === 'linear' && c.status === 'active');
  const sheetConn = connections.find((c) => c.provider === 'sheet' && c.status === 'active');
  const jiraConn = connections.find((c) => c.provider === 'jira' && c.status === 'active');
  const kweConn = connections.find((c) => c.provider === 'kwe' && c.status === 'active');
  const canShip = !!cmsConn || !!connectorConn;
  const hasConnector = !!connectorConn;
  const hasTracker = !!linearConn || !!jiraConn || !!sheetConn;

  // ── actions (real API) ──
  const pollBatch = React.useCallback(async (id: string, batchId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const d = await api(`/api/brands/${id}/fixes/batches/${batchId}`);
        const b = d.batch;
        setToast(`Scanning… ${b.received} found (${b.status})`);
        if (b.status === 'done' || b.status === 'failed') {
          setToast(b.status === 'failed' ? `Scan failed: ${b.error || 'unknown'}` : `Scan complete — ${b.received} found`);
          return;
        }
      } catch { /* keep polling */ }
    }
  }, []);

  const runScan = async () => {
    if (!brandId) return;
    setScanning(true); setToast('Scan started…');
    try {
      const d = await api(`/api/brands/${brandId}/fixes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modules: Array.from(selected) }) });
      await pollBatch(brandId, d.batchId);
      await load(brandId);
    } catch (e) { setError((e as Error).message); } finally { setScanning(false); }
  };

  const act = async (fixId: string, action: 'generate' | 'approve' | 'ship' | 'stage' | 'publish' | 'recheck' | 'revert' | 'ticket' | 'request-review') => {
    if (!brandId) return;
    setBusy((b) => ({ ...b, [fixId]: true }));
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}/${action}`, { method: 'POST' });
      if (d.fix) setFixes((rows) => rows.map((r) => (r.id === fixId ? { ...r, ...d.fix } : r)));
      if (action === 'generate') { await loadPreview(fixId); flash('Fix ready to review'); }
      if (action === 'approve') flash('Approved — ready to ship');
      if (action === 'ship') { if (d.ok === false) setError(d.error || 'Ship failed'); else flash('Shipped to live site'); }
      if (action === 'stage') { if (d.ok === false) setError(d.error || 'Staging failed'); else flash('Staged as a draft — the Connector will create a preview shortly'); }
      if (action === 'publish') flash('Publishing the staged draft…');
      if (action === 'recheck') flash('Re-check complete');
      if (action === 'revert') { if (d.ok === false) setError(d.error || 'Revert failed'); else flash('Reverted'); }
      if (action === 'ticket') flash(d.url ? `Ticket created in ${d.channel}` : `Sent to ${d.channel}`);
      if (action === 'request-review') flash(d.notified ? 'Review requested — reviewer notified' : 'Review requested');
    } catch (e) { setError((e as Error).message); } finally { setBusy((b) => ({ ...b, [fixId]: false })); }
  };
  const shipConfirm = async (fixId: string) => {
    if (!canShip) { flash('Connect a CMS or the Connector first'); return; }
    setArmed((a) => ({ ...a, [fixId]: false }));
    await act(fixId, 'ship');
  };

  const loadPreview = async (fixId: string) => {
    if (!brandId) return;
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}`);
      setPreviews((p) => ({ ...p, [fixId]: d.preview || null }));
      if (d.events) setEvents((e) => ({ ...e, [fixId]: d.events }));
    } catch { setPreviews((p) => ({ ...p, [fixId]: null })); }
  };

  // Bulk: run an action over the picked fixes that are eligible for it.
  const eligibleFor = (f: FixRow, action: 'generate' | 'approve' | 'ship'): boolean => {
    if (action === 'generate') return f.status === 'detected' || f.status === 'failed';
    if (action === 'approve') return f.status === 'generated' || f.status === 'preview_ready';
    if (action === 'ship') return f.status === 'approved';
    return false;
  };
  const runBulk = async (action: 'generate' | 'approve' | 'ship') => {
    if (!brandId || picked.size === 0) return;
    if (action === 'ship' && !canShip) { flash('Connect a CMS or the Connector first'); return; }
    const ids = fixes.filter((f) => picked.has(f.id) && eligibleFor(f, action)).map((f) => f.id);
    if (ids.length === 0) { flash(`No picked fixes are ready to ${action}`); return; }
    setBulkBusy(true); flash(`${action[0].toUpperCase()}${action.slice(1)}ing ${ids.length}…`);
    for (const id of ids) { await act(id, action); } // sequential = safe ordering + clear progress
    setBulkBusy(false); setPicked(new Set());
  };
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // One-click bulk over a module group ("47 pages missing meta → Ship all").
  const runGroupBulk = async (list: FixRow[], action: 'generate' | 'approve' | 'ship') => {
    if (!brandId) return;
    if (action === 'ship' && !canShip) { flash('Connect a CMS or the Connector first'); return; }
    const ids = list.filter((f) => eligibleFor(f, action)).map((f) => f.id);
    if (ids.length === 0) { flash(`No fixes in this group are ready to ${action}`); return; }
    setBulkBusy(true); flash(`${action[0].toUpperCase()}${action.slice(1)}ing ${ids.length} in group…`);
    for (const id of ids) { await act(id, action); }
    setBulkBusy(false);
  };

  // "Safe" = deterministic, no-LLM fixes (cost 0) that aren't live yet — the
  // ones auto-pilot would ship. One button drives each from wherever it is
  // (detected → generate → approve → ship). These are low-risk standard SEO
  // best practices (canonical alignment, AI-crawler allow, noindex cleanup).
  const safeFixes = React.useMemo(() =>
    fixes.filter((f) => (catalog.find((c) => c.key === f.moduleKey)?.cost ?? 1) === 0 && !['shipped', 'verified', 'staged'].includes(f.status)),
    [fixes, catalog]);
  const applyAllSafe = async () => {
    if (!brandId) return;
    if (!canShip) { flash('Connect a CMS or the Connector first'); return; }
    if (safeFixes.length === 0) { flash('No safe fixes ready to apply'); return; }
    setBulkBusy(true);
    flash(`Applying ${safeFixes.length} safe fix${safeFixes.length === 1 ? '' : 'es'}…`);
    const post = (id: string, action: string) => api(`/api/brands/${brandId}/fixes/${id}/${action}`, { method: 'POST' });
    let ok = 0, fail = 0;
    // Advance each fix from wherever it actually is — only call the steps it
    // needs, so an already-approved fix doesn't hit a spurious error.
    for (const f of safeFixes) {
      try {
        let status = f.status;
        if (status === 'detected' || status === 'failed') { await post(f.id, 'generate'); status = 'generated'; }
        if (status === 'generated' || status === 'preview_ready') { await post(f.id, 'approve'); status = 'approved'; }
        if (status === 'approved') {
          const d = await post(f.id, 'ship');
          d.ok === false ? fail++ : ok++;
        }
      } catch { fail++; }
    }
    setBulkBusy(false);
    await load(brandId);
    flash(`Applied ${ok} fix${ok === 1 ? '' : 'es'}${fail ? ` · ${fail} need attention` : ''}`);
  };
  const toggleAutofix = async () => {
    const next = !automation?.autopilotShipDeterministic;
    await saveAutomation({ autopilotShipDeterministic: next, ...(next && !automation?.scanEnabled ? { scanEnabled: true } : {}) });
  };

  const exportCsv = () => {
    if (!brandId) return;
    const qs = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
    window.open(`/api/brands/${brandId}/fixes/export${qs}`, '_blank');
  };
  const pdfReport = () => { if (brandId) window.open(`/api/brands/${brandId}/fixes/report`, '_blank'); };
  const notify = async () => {
    if (!brandId) return;
    try { await api(`/api/brands/${brandId}/fixes/notify`, { method: 'POST' }); flash('Summary sent to webhook'); }
    catch (e) { setError((e as Error).message); }
  };
  // Inline draft editing: merge an edited text field into the draft, then
  // refresh the card + preview (server re-applies brand rules).
  const editDraft = async (fixId: string, field: string, value: string) => {
    if (!brandId) return;
    setBusy((b) => ({ ...b, [fixId]: true }));
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generated: { [field]: value } }) });
      if (d.fix) setFixes((rows) => rows.map((r) => (r.id === fixId ? { ...r, ...d.fix } : r)));
      await loadPreview(fixId);
      flash('Draft updated');
    } catch (e) { setError((e as Error).message); } finally { setBusy((b) => ({ ...b, [fixId]: false })); }
  };

  const saveMeta = async (fixId: string, patch: { note?: string; assignee?: string }) => {
    if (!brandId) return;
    try {
      const d = await api(`/api/brands/${brandId}/fixes/${fixId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (d.fix) setFixes((rows) => rows.map((r) => (r.id === fixId ? { ...r, ...d.fix } : r)));
      flash('Saved');
    } catch (e) { setError((e as Error).message); }
  };

  const toggleModule = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const availableKeys = catalog.filter((c) => c.available).map((c) => c.key);
  const allSelected = availableKeys.length > 0 && availableKeys.every((k) => selected.has(k));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(availableKeys));

  const saveBrain = async (content: string) => {
    if (!brandId) return; setError(null);
    try { const b = await api(`/api/brands/${brandId}/seo-brain`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }); setBrain((prev) => (prev ? { ...prev, ...b } : b)); flash('SEO brain saved'); }
    catch (e) { setError((e as Error).message); }
  };
  const resetBrain = async () => {
    if (!brandId) return; setError(null);
    try { const b = await api(`/api/brands/${brandId}/seo-brain`, { method: 'DELETE' }); setBrain((prev) => (prev ? { ...prev, ...b } : b)); flash('SEO brain reset'); }
    catch (e) { setError((e as Error).message); }
  };
  const connectGsc = async () => { if (!brandId) return; try { const d = await api(`/api/brands/${brandId}/connections/gsc/start`); window.location.href = d.url; } catch (e) { setError((e as Error).message); } };
  // One-click Google Sheet: link Google (if needed) → we auto-create the sheet
  // in the OAuth callback. Falls back to a clear error if the server has no
  // Google credentials, so the manual Apps Script flow stays usable.
  const createSheetAuto = async () => { if (!brandId) { flash('Select a brand first'); return; } try { const d = await api(`/api/brands/${brandId}/connections/sheet/start`); window.location.href = d.url; } catch (e) { setError((e as Error).message); } };
  const connectCms = async (form: { cmsType: string; siteUrl: string; username: string; appPassword: string }) => {
    if (!brandId) return; setError(null);
    try { await api(`/api/brands/${brandId}/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'cms', cmsType: form.cmsType, siteUrl: form.siteUrl, creds: { username: form.username, appPassword: form.appPassword } }) }); flash('CMS connected'); await load(brandId); }
    catch (e) { setError((e as Error).message); }
  };
  // No-plugin one-click WordPress connect (WP core Application Passwords).
  const connectWp = async (site: string) => {
    if (!brandId) return; setError(null);
    try { const d = await api(`/api/brands/${brandId}/connections/cms/wp-authorize/start${site ? `?site=${encodeURIComponent(site)}` : ''}`); window.location.href = d.url; }
    catch (e) { setError((e as Error).message); }
  };
  // Generic CMS connect (Shopify / Ghost / Webflow) + platform detection.
  const connectCmsGeneric = async (cmsType: string, siteUrl: string, creds: Record<string, string>) => {
    if (!brandId) return; setError(null);
    try { await api(`/api/brands/${brandId}/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'cms', cmsType, siteUrl, creds }) }); flash(`${cmsType} connected`); await load(brandId); }
    catch (e) { setError((e as Error).message); }
  };
  const detectCms = async (site: string): Promise<{ cms: string; confidence: string; hasAdapter: boolean } | null> => {
    if (!brandId || !site) return null;
    try { const d = await api(`/api/brands/${brandId}/connections/cms/detect?site=${encodeURIComponent(site)}`); return d.detection; }
    catch { return null; }
  };
  const pairConnector = async () => { if (!brandId) return; try { const d = await api(`/api/brands/${brandId}/connections/connector/pair`, { method: 'POST' }); setPairing({ token: d.token, hmacSecret: d.hmacSecret, pullUrl: d.pullUrl }); await load(brandId); flash('Connector paired'); } catch (e) { setError((e as Error).message); } };
  const revokeConnector = async () => { if (!brandId) return; try { await api(`/api/brands/${brandId}/connections/connector/revoke`, { method: 'POST' }); setPairing(null); await load(brandId); flash('Connector token revoked'); } catch (e) { setError((e as Error).message); } };
  const connectTracker = async (provider: 'linear' | 'jira' | 'sheet', creds: Record<string, string>) => {
    if (!brandId) return; setError(null);
    try { await api(`/api/brands/${brandId}/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, creds }) }); flash(`${provider === 'linear' ? 'Linear' : provider === 'jira' ? 'Jira' : 'Spreadsheet'} connected`); await load(brandId); }
    catch (e) { setError((e as Error).message); }
  };
  const connectKwe = async (apiKey: string) => {
    if (!brandId) return; setError(null);
    try { await api(`/api/brands/${brandId}/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'kwe', creds: { apiKey } }) }); flash('Keywords Everywhere connected'); await load(brandId); }
    catch (e) { setError((e as Error).message); }
  };
  // Create + generate a targeted passage rewrite and return the produced
  // draft so the Optimize-a-Passage card can show the before/after result
  // inline — otherwise the rewrite only appears far down in THE FIXES queue
  // and the click looks like it did nothing.
  const createTargeted = async (
    form: { url: string; passage: string; instruction: string },
  ): Promise<PassageResult> => {
    if (!brandId) return { ok: false, error: 'Pick a brand first' };
    setError(null);
    try {
      const d = await api(`/api/brands/${brandId}/fixes/targeted`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      let fix = d.fix as FixRow | undefined;
      if (!fix?.id) throw new Error('Could not create the fix');
      // Generate the rewrite so we have something to show immediately.
      const g = await api(`/api/brands/${brandId}/fixes/${fix.id}/generate`, { method: 'POST' });
      if (g.fix) fix = { ...fix, ...g.fix } as FixRow;
      // Pull the before/after preview for the inline result panel.
      let preview: PreviewBlock | null = null;
      try {
        const p = await api(`/api/brands/${brandId}/fixes/${fix.id}`);
        preview = p.preview || null;
        setPreviews((prev) => ({ ...prev, [fix!.id]: preview }));
      } catch { /* preview is best-effort */ }
      // Reflect it in the main queue too, then refresh from the server.
      const created = fix;
      setFixes((rows) => (rows.some((r) => r.id === created.id) ? rows.map((r) => (r.id === created.id ? { ...r, ...created } : r)) : [created, ...rows]));
      await load(brandId);
      flash('Rewrite ready — added to The Fixes below');
      return { ok: true, fix: created, preview };
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      return { ok: false, error: msg };
    }
  };

  // ── derived ──
  const counts = React.useMemo(() => { const c: Record<string, number> = {}; for (const f of fixes) c[bucketOf(f.status)] = (c[bucketOf(f.status)] || 0) + 1; return c; }, [fixes]);
  const sevCount = React.useMemo(() => { const c: Record<string, number> = {}; for (const f of fixes) c[f.severity] = (c[f.severity] || 0) + 1; return c; }, [fixes]);
  const statusCount = React.useMemo(() => { const c: Record<string, number> = {}; for (const f of fixes) c[f.status] = (c[f.status] || 0) + 1; return c; }, [fixes]);
  const moduleMeta = React.useCallback((k: string) => catalog.find((c) => c.key === k), [catalog]);
  const moduleTitle = (k: string) => moduleMeta(k)?.title || k;
  const scanCost = React.useMemo(() => catalog.filter((c) => selected.has(c.key)).reduce((s, c) => s + (c.cost || 0), 0), [catalog, selected]);

  const shown = React.useMemo(() => {
    let list = filter === 'all' ? fixes : fixes.filter((f) => bucketOf(f.status) === filter);
    if (quickWins) list = list.filter((f) => (moduleMeta(f.moduleKey)?.cost ?? 1) === 0 || f.severity === 'critical' || f.severity === 'high');
    // Rank by severity, then by estimated value: module impact weighted by
    // the target page's real 28-day GSC impressions (log-scaled so a huge
    // page doesn't drown everything). Falls back to impact alone.
    const value = (f: FixRow) => (moduleMeta(f.moduleKey)?.impact ?? 2) * Math.log10((f.pageImpressions ?? 0) + 10);
    return [...list].sort((a, b) => {
      const sev = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
      if (sev !== 0) return sev;
      return value(b) - value(a);
    });
  }, [fixes, filter, quickWins, moduleMeta]);

  // Group the shown fixes by target URL for the "by page" view.
  const groupedByPage = React.useMemo(() => {
    const by = new Map<string, FixRow[]>();
    for (const f of shown) { const k = f.targetUrl || '(site-wide)'; (by.get(k) || by.set(k, []).get(k))!.push(f); }
    return Array.from(by.entries());
  }, [shown]);

  const moduleGroups = React.useMemo(() => {
    const by: Record<string, CatalogItem[]> = {};
    for (const m of catalog) { const g = MODULE_GROUP[m.key] || 'Other'; (by[g] ||= []).push(m); }
    return GROUP_ORDER.filter((g) => by[g]?.length).map((g) => ({ name: g, items: by[g] }));
  }, [catalog]);

  const Style = <style>{MX_CSS}</style>;
  const wrap = (children: React.ReactNode) => (
    <div className="mx" style={{ fontFamily: "'Inter',sans-serif" }}>{Style}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 0 90px', display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
    </div>
  );

  if (brandLoading) return wrap(<div className="nb disp" style={{ padding: 48, textAlign: 'center', fontWeight: 700, color: 'var(--text-2)' }}>LOADING…</div>);
  if (!brandId) return wrap(
    <div className="nb" style={{ padding: 64, textAlign: 'center' }}>
      <div className="disp" style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)' }}>PICK A BRAND ☝</div>
      <p style={{ margin: '12px auto 0', fontSize: 14, color: 'var(--text-2)', maxWidth: '42ch', lineHeight: 1.6, fontWeight: 500 }}>Fixes are scoped to a brand&apos;s site, CMS &amp; tracked answers.</p>
    </div>,
  );

  const kpis = [
    { value: health ? String(health.score) : '—', label: 'GEO health', bg: health && health.score < 50 ? 'var(--danger-50)' : 'var(--success-50)', fg: health && health.score < 50 ? 'var(--danger)' : 'var(--success)' },
    { value: aiVis ? `${Math.round(aiVis.sov)}%` : '—', label: aiVis ? `AI visibility · ${aiVis.at}` : 'AI visibility', bg: 'var(--text)', fg: 'var(--bg)' },
    { value: String(counts.detected || 0), label: 'Detected', bg: 'var(--primary-50)', fg: 'var(--primary)' },
    { value: String(counts.review || 0), label: 'In review', bg: 'var(--primary-50)', fg: 'var(--primary)' },
    { value: String(counts.approved || 0), label: 'Approved', bg: 'var(--info-50)', fg: 'var(--info)' },
    { value: String(counts.shipped || 0), label: 'Live', bg: 'var(--success-50)', fg: 'var(--success)' },
    { value: String(counts.attention || 0), label: 'Attention', bg: 'var(--danger-50)', fg: 'var(--danger)' },
  ];
  const pipeline = [
    { n: '1', label: 'detect', color: 'var(--text-2)', bg: 'var(--surface)' },
    { n: '2', label: 'generate', color: 'var(--primary)', bg: 'var(--primary-50)' },
    { n: '3', label: 'preview', color: 'var(--primary)', bg: 'var(--primary-50)' },
    { n: '4', label: 'approve', color: 'var(--info)', bg: 'var(--info-50)' },
    { n: '5', label: 'ship', color: 'var(--success)', bg: 'var(--success-50)' },
    { n: '6', label: 're-check', color: 'var(--info)', bg: 'var(--info-50)' },
  ];
  const filterDefs = [
    { key: 'all', label: 'ALL', count: fixes.length },
    { key: 'detected', label: 'DETECTED', count: counts.detected || 0 },
    { key: 'review', label: 'REVIEW', count: counts.review || 0 },
    { key: 'approved', label: 'APPROVED', count: counts.approved || 0 },
    { key: 'shipped', label: 'LIVE', count: counts.shipped || 0 },
    { key: 'attention', label: 'ATTENTION', count: counts.attention || 0 },
  ];

  return wrap(<>
    {/* HERO */}
    <header className="nb" style={{ position: 'relative', overflow: 'hidden', background: 'var(--primary-50)', padding: '32px 30px' }}>
      <div className="stripes" style={{ position: 'absolute', top: 0, right: 0, width: 180, height: '100%', opacity: 0.08 }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: '32ch' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="chip" style={{ background: 'var(--primary)', color: '#fff' }}>⚡ FIX ENGINE</span>
            <span className="chip">v2</span>
          </div>
          <h1 className="disp" style={{ margin: '16px 0 0', fontSize: 42, lineHeight: 0.98, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>FIND IT.<br />FIX IT.<br /><span style={{ color: 'var(--primary)', WebkitTextStroke: '1.5px var(--ink)' }}>SHIP IT.</span></h1>
          <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)', fontWeight: 500 }}>What&apos;s hurting <b style={{ color: 'var(--text)' }}>{brandName}</b> in AI answers — detected, drafted and shipped on your say-so.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="gbtn" onClick={() => load(brandId)} disabled={loading}>↻ Refresh</button>
            <button className="xbtn" onClick={runScan} disabled={scanning || !enabled || selected.size === 0}>{scanning ? 'SCANNING…' : '▶ RUN SCAN'}</button>
          </div>
          <div className="nb-sm disp" style={{ background: 'var(--text)', color: 'var(--bg)', padding: '14px 18px', textAlign: 'right', transform: 'rotate(1.5deg)' }}>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{catalog.length || 19}</div>
            <div className="xlbl" style={{ marginTop: 4, color: 'var(--bg)', opacity: 0.7 }}>fix modules</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 24, display: 'flex', alignItems: 'center', flexWrap: 'wrap', border: '2.5px solid var(--ink)', borderRadius: 11, overflow: 'hidden', background: 'var(--surface)' }}>
        {pipeline.map((st) => (
          <div key={st.n} className="disp" style={{ flex: 1, minWidth: 90, padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 12, color: st.color, background: st.bg, borderRight: '2px solid var(--ink)', textTransform: 'uppercase' }}>{st.n} {st.label}</div>
        ))}
      </div>
    </header>

    {!enabled && (
      <div className="nb" style={{ padding: 24, background: 'var(--warn-50)', borderColor: 'var(--warn)', boxShadow: '5px 5px 0 var(--warn)' }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700, color: 'var(--warn)' }}>UPGRADE REQUIRED</div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>The Fix Engine is available on Starter plans and above{plan ? ` (your plan: ${plan})` : ''}.</p>
      </div>
    )}
    {error && (
      <div className="nb-sm" style={{ padding: '14px 18px', background: 'var(--danger-50)', borderColor: 'var(--danger)', boxShadow: '3px 3px 0 var(--danger)', display: 'flex', gap: 11, alignItems: 'center' }}>
        <span className="disp" style={{ color: 'var(--danger)', fontSize: 16, fontWeight: 700 }}>✕</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{error}</span>
        <button className="tbtn" onClick={() => setError(null)}>Dismiss</button>
      </div>
    )}

    {attention && (attention.failed > 0 || attention.stuckConnector > 0 || (attention.regressed || 0) > 0) && (
      <div className="nb-sm" style={{ padding: '12px 18px', background: 'var(--warn-50)', borderColor: 'var(--warn)', boxShadow: '3px 3px 0 var(--warn)', display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="disp" style={{ color: 'var(--warn)', fontSize: 16, fontWeight: 700 }}>⚠</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Needs attention:
          {[
            attention.failed > 0 ? `${attention.failed} failed fix${attention.failed === 1 ? '' : 'es'}` : null,
            attention.stuckConnector > 0 ? `${attention.stuckConnector} not applied by your site yet (connector offline?)` : null,
            (attention.regressed || 0) > 0 ? `${attention.regressed} fix${attention.regressed === 1 ? '' : 'es'} regressed (overwritten on your site — re-ship)` : null,
          ].filter(Boolean).join(' · ')}
        </span>
        {attention.failed > 0 && <button className="tbtn" onClick={() => setFilter('attention')}>View</button>}
      </div>
    )}

    {/* FIRST-RUN WIZARD */}
    {enabled && !wizDismissed && !cmsConn && !gscConn && !connectorConn && (
      <section className="nb" style={{ padding: 0, overflow: 'hidden', boxShadow: '6px 6px 0 var(--primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', background: 'var(--primary)', color: '#fff' }}>
          <div className="disp" style={{ fontSize: 17, fontWeight: 700 }}>GET STARTED — 3 STEPS</div>
          <button className="tbtn" onClick={() => setWizDismissed(true)} style={{ color: '#fff', textDecorationColor: '#fff' }}>Dismiss</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <span className="disp nb-sm" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'var(--surface-2)', flexShrink: 0 }}>1</span>
            <div style={{ flex: 1, minWidth: 200 }}><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Your site</div><input className="xin" value={wizSite || (brand as any)?.website || ''} onChange={(e) => setWizSite(e.target.value)} placeholder="https://acme.com" /></div>
            <button className="gbtn" onClick={async () => { const s = wizSite || (brand as any)?.website || ''; setWizSite(s); setWizBusy(true); setWizDetected(await detectCms(s)); setWizBusy(false); }} disabled={wizBusy} style={{ padding: '9px 14px' }}>{wizBusy ? 'Detecting…' : 'Detect platform'}</button>
          </div>
          {(() => {
            // What did detection find, and where should we steer them?
            //   wordpress          → one-click WP (no plugin)
            //   shopify/ghost/webflow → open Connections with that platform
            //   anything else / unknown → custom-coded endpoint path
            const d = wizDetected;
            const isWp = d?.cms === 'wordpress';
            const adapterPlatform = d && d.hasAdapter && d.cms !== 'wordpress' && d.cms !== 'unknown' ? d.cms : null;
            const isCustom = !!d && !isWp && !adapterPlatform;
            const site = wizSite || (brand as any)?.website || '';
            return (<>
              {d && (
                <span className="nb-sm" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', padding: '9px 13px', boxShadow: 'none', background: isWp ? 'var(--success-50)' : 'var(--warn-50)', borderColor: isWp ? 'var(--success)' : 'var(--warn)', marginLeft: 46, display: 'block' }}>
                  {isWp ? '✓ Detected WordPress — use the one-click connect below.'
                    : adapterPlatform ? `✓ Detected ${adapterPlatform}. Click “Connect ${adapterPlatform}” below to enter your API token.`
                    : `This looks like a custom-coded site (no CMS we recognize). No problem — connect it with a small endpoint your developer drops in once. Click “Connect custom-coded site” below.`}
                </span>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="disp nb-sm" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'var(--surface-2)', flexShrink: 0 }}>2</span>
                {isCustom ? (
                  <button className="xbtn" onClick={() => { setWizSite(site); requestConnect('custom'); }} style={{ background: 'var(--warn)' }}>CONNECT CUSTOM-CODED SITE →</button>
                ) : adapterPlatform ? (
                  <button className="xbtn" onClick={() => { setWizSite(site); requestConnect(adapterPlatform); }} style={{ background: 'var(--primary)' }}>CONNECT {adapterPlatform.toUpperCase()} →</button>
                ) : (
                  <button className="xbtn" onClick={() => connectWp(site)} disabled={!site} style={{ background: 'var(--primary)' }}>CONNECT WORDPRESS — ONE CLICK →</button>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>
                  {isCustom ? 'Any stack (React, Next.js, PHP, Django…). Ticket hand-off & scan work with zero setup too.'
                    : 'No plugin. Not WordPress? Hit Detect platform, or use Connections below.'}
                </span>
              </div>
            </>);
          })()}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="disp nb-sm" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'var(--surface-2)', flexShrink: 0 }}>3</span>
            <button className="xbtn" onClick={runScan} disabled={scanning || selected.size === 0} style={{ background: 'var(--text)' }}>{scanning ? 'SCANNING…' : '▶ RUN YOUR FIRST SCAN'}</button>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Scans {selected.size} checks against your site — you can do this before connecting.</span>
          </div>
        </div>
      </section>
    )}

    {/* KPI TILES */}
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
      {kpis.map((k) => (
        <div key={k.label} className="nb-sm" style={{ padding: 16, background: k.bg }}>
          <div className="disp" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: k.fg }}>{k.value}</div>
          <div className="xlbl" style={{ marginTop: 10, color: 'var(--text-2)' }}>{k.label}</div>
        </div>
      ))}
    </section>

    {/* CONNECTIONS */}
    <ConnectionsSection
      cms={!!cmsConn} cmsMeta={cmsConn ? `${cmsConn.cmsType} · ${cmsConn.siteUrl}` : 'Required to ship on-site fixes'}
      gsc={!!gscConn} gscSite={gscConn?.siteUrl ?? null}
      connector={!!connectorConn} connectorLastSeen={connectorConn?.lastSeenAt ?? null} pairing={pairing}
      supportedCms={supportedCms} defaultSite={(brand as any)?.website || ''} disabled={!enabled}
      linear={!!linearConn} jira={!!jiraConn} sheet={!!sheetConn} kwe={!!kweConn} onConnectTracker={connectTracker} onConnectKwe={connectKwe}
      sheetUrl={(sheetConn?.meta as { spreadsheetUrl?: string } | undefined)?.spreadsheetUrl ?? null}
      onConnectCms={connectCms} onConnectWp={connectWp} onConnectCmsGeneric={connectCmsGeneric} onDetectCms={detectCms}
      onConnectGsc={connectGsc} onCreateSheet={createSheetAuto} onPairConnector={pairConnector} onRevokeConnector={revokeConnector} onCopy={(label) => flash(`${label} copied`)}
      openRequest={connectRequest}
    />

    {/* SEO BRAIN */}
    <SeoBrainSection brain={brain} disabled={!enabled} onSave={saveBrain} onReset={resetBrain} />

    {/* AUTOMATION */}
    <AutomationSection automation={automation} activity={activity} canShip={canShip} disabled={!enabled} onSave={saveAutomation} />

    {/* MODULES + PASSAGE */}
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>
      <section className="nb" style={{ padding: 0, overflow: 'hidden' }}>
        <SectionHeader
          title="SCAN MODULES" dark open={modulesOpen} onToggle={() => setModulesOpen((o) => !o)}
          right={<>
            <span className="chip" style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--bg)' }}>{selected.size} SELECTED</span>
            <button className="tbtn" onClick={toggleSelectAll} style={{ color: 'var(--bg)', textDecorationColor: 'var(--bg)' }}>{allSelected ? 'Clear all' : 'Select all'}</button>
          </>}
        />
        {modulesOpen && (
        <div style={{ padding: '6px 20px 16px' }}>
          {moduleGroups.map((grp) => (
            <div key={grp.name}>
              <div className="xlbl" style={{ padding: '16px 0 4px', color: 'var(--primary)' }}>▸ {grp.name}</div>
              {grp.items.map((m) => {
                const cf = chanFill(m.channel);
                return (
                  <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '2px dashed var(--line)', cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.5 }}>
                    <input type="checkbox" checked={selected.has(m.key)} disabled={!m.available} onChange={() => m.available && toggleModule(m.key)} style={{ accentColor: 'var(--primary)', width: 16, height: 16, flexShrink: 0 }} />
                    <span className="disp" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'JetBrains Mono',monospace" }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: TRIG_DOT[m.trigger] || 'var(--text-3)' }} />{m.trigger}</span>
                    <span className="chip" style={{ background: cf.chBg, color: cf.chFg, borderColor: cf.chFg }}>CH {m.channel}</span>
                    <span className="chip" title="generation cost" style={{ color: m.cost === 0 ? 'var(--success)' : 'var(--text-2)', borderColor: m.cost === 0 ? 'var(--success)' : 'var(--ink)' }}>{m.cost === 0 ? 'FREE' : `${m.cost}c`}</span>
                    {!m.available && <span className="chip" style={{ background: 'var(--warn-50)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>{m.minPlan.toUpperCase()}</span>}
                  </label>
                );
              })}
            </div>
          ))}
          {catalog.length === 0 && !loading && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>No modules available.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
            <span className="xlbl" style={{ color: 'var(--text-2)' }}>{selected.size}/{catalog.length || 19} selected · est {scanCost} credits</span>
            <button className="xbtn" onClick={runScan} disabled={scanning || !enabled || selected.size === 0}>▶ RUN ON SELECTION</button>
          </div>
        </div>
        )}
      </section>

      <PassageSection disabled={!enabled} onSubmit={createTargeted} />
    </div>

    {/* FIXES */}
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
        <button onClick={() => setFixesOpen((o) => !o)} aria-expanded={fixesOpen} title={fixesOpen ? 'Hide the fixes' : 'Show the fixes'} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0, color: 'var(--text)' }}>
          <span className="disp" aria-hidden style={{ fontSize: 22, fontWeight: 700, display: 'inline-block', transition: 'transform .15s', transform: fixesOpen ? 'none' : 'rotate(-90deg)' }}>▾</span>
          <h2 className="disp" style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>THE FIXES</h2>
        </button>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          {filterDefs.map((d) => {
            const on = filter === d.key;
            return <button key={d.key} className="chip" onClick={() => setFilter(d.key)} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px', background: on ? 'var(--text)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--text-2)', boxShadow: on ? '3px 3px 0 var(--primary)' : 'none' }}>{d.label} · {d.count}</button>;
          })}
        </div>
      </div>
      {fixesOpen && (<>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className="chip" onClick={() => { setOpenCards(new Set(shown.map((f) => f.id))); setExpandedGroups(new Set(shown.map((f) => f.moduleKey))); }} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}>▾ EXPAND ALL</button>
        <button className="chip" onClick={() => { setOpenCards(new Set()); setExpandedGroups(new Set()); }} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}>▴ COLLAPSE ALL</button>
        <button className="chip" onClick={() => setQuickWins((q) => !q)} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px', background: quickWins ? 'var(--success-50)' : 'var(--surface)', color: quickWins ? 'var(--success)' : 'var(--text-2)', borderColor: quickWins ? 'var(--success)' : 'var(--ink)' }}>⚡ QUICK WINS</button>
        <button className="chip" onClick={() => setGroupByPage((g) => !g)} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px', background: groupByPage ? 'var(--text)' : 'var(--surface)', color: groupByPage ? 'var(--bg)' : 'var(--text-2)' }}>▦ BY PAGE</button>
        <button className="chip" onClick={exportCsv} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}>⤓ EXPORT CSV</button>
        <button className="chip" onClick={pdfReport} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}>📄 PDF REPORT</button>
        <button className="chip" onClick={notify} style={{ cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}>🔔 NOTIFY</button>
      </div>

      {(safeFixes.length > 0 || automation) && (
        <div className="nb-sm" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', marginBottom: 16, background: 'var(--success-50)', borderColor: 'var(--success)', boxShadow: '4px 4px 0 var(--success)', flexWrap: 'wrap' }}>
          <span className="disp" style={{ fontSize: 20 }}>✨</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="disp" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{safeFixes.length > 0 ? `${safeFixes.length} safe fix${safeFixes.length === 1 ? '' : 'es'} ready` : 'No safe fixes pending'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Deterministic, no-AI technical fixes (canonical, AI-crawler access, accidental-noindex) — safe, standard SEO best practices, applied in one click.</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!automation?.autopilotShipDeterministic} onChange={toggleAutofix} disabled={!canShip} style={{ accentColor: 'var(--success)', width: 15, height: 15 }} />
            Autofix on
          </label>
          <button className="xbtn" onClick={applyAllSafe} disabled={bulkBusy || safeFixes.length === 0 || !canShip} style={{ background: 'var(--success)' }}>{bulkBusy ? 'APPLYING…' : `APPLY ${safeFixes.length} SAFE FIX${safeFixes.length === 1 ? '' : 'ES'}`}</button>
        </div>
      )}

      {picked.size > 0 && (
        <div className="nb-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16, background: 'var(--primary-50)', boxShadow: '3px 3px 0 var(--primary)', flexWrap: 'wrap' }}>
          <span className="disp" style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{picked.size} selected</span>
          <span style={{ flex: 1 }} />
          <button className="gbtn" style={{ padding: '7px 13px', fontSize: 12 }} disabled={bulkBusy} onClick={() => runBulk('generate')}>✦ Generate</button>
          <button className="xbtn" style={{ padding: '7px 13px', fontSize: 12, background: 'var(--success)' }} disabled={bulkBusy} onClick={() => runBulk('approve')}>✓ Approve</button>
          <button className="xbtn" style={{ padding: '7px 13px', fontSize: 12, background: 'var(--success)' }} disabled={bulkBusy || !canShip} onClick={() => runBulk('ship')}>⬢ Ship</button>
          <button className="tbtn" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      {enabled && !canShip && (
        <div className="nb-sm" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 16, background: 'var(--warn-50)', borderColor: 'var(--warn)', boxShadow: '4px 4px 0 var(--warn)' }}>
          <span className="disp" style={{ fontSize: 22 }}>⚠</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Connect a CMS or the Connector to <b className="disp">SHIP</b> — detect, generate &amp; preview all work without it.</span>
        </div>
      )}

      {loading && fixes.length === 0 && (
        <div style={{ display: 'grid', gap: 16 }}>{[1, 2, 3].map((s) => (
          <div key={s} className="nb" style={{ padding: 22, display: 'grid', gap: 14 }}>
            <div className="stripes" style={{ width: 200, height: 22, borderRadius: 6, opacity: 0.12 }} />
            <div className="stripes" style={{ width: '100%', height: 48, borderRadius: 6, opacity: 0.08 }} />
          </div>
        ))}</div>
      )}

      {!loading && shown.length === 0 && (
        <div className="nb" style={{ padding: 56, textAlign: 'center', background: 'var(--primary-50)' }}>
          <div className="disp" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>NOTHING TO FIX… YET</div>
          <p style={{ margin: '12px auto 22px', fontSize: 14, color: 'var(--text-2)', maxWidth: '44ch', lineHeight: 1.6, fontWeight: 500 }}>Run a scan to check {brandName} against {selected.size} modules, ranked by severity.</p>
          <button className="xbtn" onClick={runScan} disabled={scanning || !enabled || selected.size === 0} style={{ margin: '0 auto' }}>▶ RUN SCAN</button>
        </div>
      )}

      {shown.length > 0 && (() => {
        const renderCard = (f: FixRow) => (
          <FixCard
            key={f.id} fix={f} title={moduleTitle(f.moduleKey)} preview={previews[f.id]}
            open={openCards.has(f.id)}
            onToggleOpen={() => setOpenCards((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
            cost={moduleMeta(f.moduleKey)?.cost ?? 1} revertable={!!moduleMeta(f.moduleKey)?.revertable} impact={moduleMeta(f.moduleKey)?.impact ?? 2}
            events={events[f.id]} busy={!!busy[f.id]} armed={!!armed[f.id]} canShip={canShip}
            picked={picked.has(f.id)} onTogglePick={() => togglePick(f.id)}
            onGenerate={() => act(f.id, 'generate')} onApprove={() => act(f.id, 'approve')}
            onArm={() => setArmed((a) => ({ ...a, [f.id]: true }))} onCancelArm={() => setArmed((a) => ({ ...a, [f.id]: false }))}
            onShipConfirm={() => shipConfirm(f.id)} onRecheck={() => act(f.id, 'recheck')} onRetry={() => act(f.id, 'generate')}
            onRevert={() => act(f.id, 'revert')} onLoadHistory={() => loadPreview(f.id)}
            onSaveMeta={(patch) => saveMeta(f.id, patch)}
            hasConnector={hasConnector} hasTracker={hasTracker}
            onStage={() => act(f.id, 'stage')} onPublish={() => act(f.id, 'publish')} onTicket={() => act(f.id, 'ticket')}
            onRequestReview={() => act(f.id, 'request-review')}
            editableField={EDITABLE_FIELD[f.moduleKey]}
            onEditDraft={(field, value) => editDraft(f.id, field, value)}
            downloadHref={f.channel === 'B' ? `/api/brands/${brandId}/fixes/${f.id}/file` : undefined}
          />
        );
        return groupByPage ? (
          <div style={{ display: 'grid', gap: 26 }}>
            {groupedByPage.map(([url, list]) => (
              <div key={url}>
                <div className="xlbl" style={{ color: 'var(--primary)', marginBottom: 10, wordBreak: 'break-all' }}>▸ {url.replace(/^https?:\/\//, '')} · {list.length}</div>
                <div style={{ display: 'grid', gap: 18 }}>{list.map(renderCard)}</div>
              </div>
            ))}
          </div>
        ) : (
          // Group runs of ≥4 same-module fixes into one bulk card so large
          // sites (e.g. "meta missing on 47 pages") stay manageable.
          <div style={{ display: 'grid', gap: 18 }}>
            {(() => {
              const byModule = new Map<string, FixRow[]>();
              for (const f of shown) (byModule.get(f.moduleKey) || byModule.set(f.moduleKey, []).get(f.moduleKey))!.push(f);
              const out: React.ReactNode[] = [];
              const groupedKeys = new Set([...byModule.entries()].filter(([, l]) => l.length >= 4).map(([k]) => k));
              const rendered = new Set<string>();
              for (const f of shown) {
                if (!groupedKeys.has(f.moduleKey)) { out.push(renderCard(f)); continue; }
                if (rendered.has(f.moduleKey)) continue;
                rendered.add(f.moduleKey);
                const list = byModule.get(f.moduleKey)!;
                out.push(
                  <GroupCard
                    key={`grp-${f.moduleKey}`} moduleKey={f.moduleKey} title={moduleTitle(f.moduleKey)}
                    fixes={list} expanded={expandedGroups.has(f.moduleKey)} busy={bulkBusy} canShip={canShip}
                    onToggle={() => setExpandedGroups((s) => { const n = new Set(s); n.has(f.moduleKey) ? n.delete(f.moduleKey) : n.add(f.moduleKey); return n; })}
                    onBulk={(action) => runGroupBulk(list, action)}
                    renderCard={renderCard}
                  />,
                );
              }
              return out;
            })()}
          </div>
        );
      })()}
      {/* keep lint happy about unused maps */}
      <span style={{ display: 'none' }}>{sevCount.low}{statusCount.detected}</span>
      </>)}
    </section>

    {toast && (
      <div className="nb-sm disp" style={{ position: 'fixed', left: '50%', bottom: 30, transform: 'translateX(-50%) rotate(-1deg)', zIndex: 9000, padding: '13px 20px', background: 'var(--text)', color: 'var(--bg)', fontWeight: 700, fontSize: 13.5, boxShadow: '5px 5px 0 var(--primary)', animation: 'xtoast .2s ease' }}>{toast}</div>
    )}
  </>);
}

// ── Connections ──
function ConnectionsSection({ cms, cmsMeta, gsc, gscSite, connector, connectorLastSeen, pairing, supportedCms, defaultSite, disabled, linear, jira, sheet, kwe, sheetUrl, onConnectTracker, onConnectKwe, onConnectCms, onConnectWp, onConnectCmsGeneric, onDetectCms, onConnectGsc, onCreateSheet, onPairConnector, onRevokeConnector, onCopy, openRequest }: {
  cms: boolean; cmsMeta: string; gsc: boolean; gscSite: string | null; connector: boolean; connectorLastSeen: string | null;
  pairing: { token: string; hmacSecret: string; pullUrl: string } | null;
  supportedCms: string[]; defaultSite: string; disabled: boolean;
  linear: boolean; jira: boolean; sheet: boolean; kwe: boolean; sheetUrl: string | null;
  onConnectTracker: (provider: 'linear' | 'jira' | 'sheet', creds: Record<string, string>) => void;
  onConnectKwe: (apiKey: string) => void;
  onConnectCms: (f: { cmsType: string; siteUrl: string; username: string; appPassword: string }) => void;
  onConnectWp: (site: string) => void;
  onConnectCmsGeneric: (cmsType: string, siteUrl: string, creds: Record<string, string>) => void;
  onDetectCms: (site: string) => Promise<{ cms: string; confidence: string; hasAdapter: boolean } | null>;
  onConnectGsc: () => void; onCreateSheet: () => void; onPairConnector: () => void; onRevokeConnector: () => void; onCopy: (label: string) => void;
  openRequest?: { platform: string; nonce: number } | null;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  // Reveal toggle for the custom-connect "Shared secret" field so it can be
  // read and copied into the developer's endpoint (it renders masked).
  const [secretShown, setSecretShown] = React.useState(false);
  const [cmsType, setCmsType] = React.useState('wordpress');
  const [siteUrl, setSiteUrl] = React.useState(defaultSite);
  const [username, setUsername] = React.useState('');
  const [appPassword, setAppPassword] = React.useState('');
  const [cc, setCc] = React.useState<Record<string, string>>({}); // generic CMS creds
  const ccSet = (k: string, v: string) => setCc((p) => ({ ...p, [k]: v }));
  const [detected, setDetected] = React.useState<{ cms: string; confidence: string; hasAdapter: boolean } | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const runDetect = async () => { if (!siteUrl) return; setDetecting(true); const d = await onDetectCms(siteUrl); setDetected(d); if (d?.hasAdapter && d.cms !== 'unknown') setCmsType(d.cms); else if (d && (d.cms === 'unknown' || !d.hasAdapter)) setCmsType('custom'); setDetecting(false); };
  const [tracker, setTracker] = React.useState<'' | 'linear' | 'jira' | 'sheet'>('');
  const [tk, setTk] = React.useState<Record<string, string>>({});
  const [kweOpen, setKweOpen] = React.useState(false);
  const [kweKey, setKweKey] = React.useState('');
  const tkSet = (k: string, v: string) => setTk((p) => ({ ...p, [k]: v }));
  React.useEffect(() => { if (defaultSite && !siteUrl) setSiteUrl(defaultSite); }, [defaultSite, siteUrl]);
  // A "connect this way" request from the wizard: expand the panel, open the
  // CMS form with the requested platform preselected, and scroll it into view.
  React.useEffect(() => {
    if (!openRequest) return;
    setCollapsed(false);
    setCmsType(openRequest.platform);
    setShowForm(true);
    const t = setTimeout(() => document.getElementById('fix-connections')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [openRequest]);
  const connectedCount = (cms ? 1 : 0) + (gsc ? 1 : 0) + (connector ? 1 : 0);
  const copy = (text: string, label: string) => { try { navigator.clipboard?.writeText(text); } catch { /* ignore */ } onCopy(label); };

  const Row = ({ badge, title, meta, children }: { badge: React.ReactNode; title: string; meta: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '2px dashed var(--line-2)' }}>
      <span className="disp nb-sm" style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, background: 'var(--surface-2)', flexShrink: 0 }}>{badge}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="disp" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontWeight: 500 }}>{meta}</div>
      </div>
      {children}
    </div>
  );
  const okChip = (label: string) => <span className="chip" style={{ background: 'var(--success-50)', color: 'var(--success)', borderColor: 'var(--success)' }}>● {label}</span>;
  const offChip = <span className="chip" style={{ color: 'var(--text-3)' }}>○ NOT CONNECTED</span>;

  return (
    <section id="fix-connections" className="nb" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show connections' : 'Hide connections'}
        style={{ width: '100%', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 22px', background: 'var(--text)', color: 'var(--bg)', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="disp" aria-hidden style={{ fontSize: 15, fontWeight: 700, transition: 'transform .15s', transform: collapsed ? 'rotate(-90deg)' : 'none' }}>▾</span>
          <span className="disp" style={{ fontSize: 18, fontWeight: 700 }}>CONNECTIONS</span>
        </div>
        <span className="chip" style={{ background: 'var(--bg)', color: 'var(--text)' }}>{connectedCount} OF 3{collapsed ? ' · SHOW' : ''}</span>
      </button>
      {!collapsed && (
      <div style={{ padding: '8px 22px 18px' }}>
        <Row badge="CMS" title="WordPress" meta={cmsMeta}>
          {cms ? okChip('CONNECTED') : offChip}
          <button className={cms ? 'tbtn' : 'xbtn'} onClick={() => setShowForm((s) => !s)} disabled={disabled}>{cms ? 'Reconnect' : 'CONNECT'}</button>
        </Row>
        {showForm && (
          <div className="nb-sm" style={{ padding: 18, margin: '6px 0 14px', background: 'var(--surface-2)', display: 'grid', gap: 16 }}>
            {/* Platform picker + auto-detect */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Site URL</div><input className="xin" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://acme.com" /></div>
              <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Platform</div>
                <select className="xin" style={{ width: 'auto' }} value={cmsType} onChange={(e) => setCmsType(e.target.value)}>
                  {['wordpress', 'shopify', 'ghost', 'webflow', 'custom'].filter((c) => supportedCms.includes(c) || c === 'wordpress').map((c) => <option key={c} value={c}>{c === 'wordpress' ? c : c === 'custom' ? 'custom-coded site (any stack)' : `${c} (beta)`}</option>)}
                </select>
              </div>
              <button className="gbtn" onClick={runDetect} disabled={!siteUrl || detecting} style={{ padding: '9px 13px' }}>{detecting ? 'Detecting…' : 'Detect'}</button>
            </div>
            {detected && (
              <span style={{ fontSize: 12, fontWeight: 600, color: detected.hasAdapter && detected.cms !== 'unknown' ? 'var(--success)' : 'var(--warn)' }}>
                {detected.cms === 'unknown' || !detected.hasAdapter
                  ? '↓ Looks like a custom-coded site — we selected “custom-coded site (any stack)” for you below. Your developer adds one ~40-line endpoint (template provided) and every fix ships automatically.'
                  : `✓ Detected ${detected.cms} — selected below.`}
              </span>
            )}

            {/* WordPress: one-click (no plugin) + manual app password */}
            {cmsType === 'wordpress' && (<>
              <div style={{ display: 'grid', gap: 8 }}>
                <button className="xbtn" onClick={() => onConnectWp(siteUrl)} disabled={!siteUrl} style={{ background: 'var(--primary)', justifySelf: 'start' }}>CONNECT WORDPRESS — ONE CLICK →</button>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Approve once in your WP admin (Application Passwords — built into WP, no plugin). You&apos;ll come straight back, connected.</span>
              </div>
              <div style={{ borderTop: '2px dashed var(--line-2)', paddingTop: 14, display: 'grid', gap: 12 }}>
                <div className="disp" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Or enter an Application Password manually</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>WP username</div><input className="xin" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
                  <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Application password</div><input className="xin" type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx" /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="gbtn" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="xbtn" onClick={() => onConnectCms({ cmsType, siteUrl, username, appPassword })} disabled={!siteUrl || !username || !appPassword}>CONNECT WP</button>
                </div>
              </div>
            </>)}

            {/* Shopify / Ghost / Webflow / custom: token creds */}
            {cmsType !== 'wordpress' && (() => {
              const fields: Record<string, Array<{ k: string; label: string; ph?: string; pw?: boolean }>> = {
                shopify: [{ k: 'shop', label: 'Store domain', ph: 'acme.myshopify.com' }, { k: 'accessToken', label: 'Admin API access token', ph: 'shpat_…', pw: true }],
                ghost: [{ k: 'adminApiUrl', label: 'Ghost URL', ph: 'https://blog.acme.com' }, { k: 'adminApiKey', label: 'Admin API key', ph: 'id:secret', pw: true }],
                webflow: [{ k: 'apiToken', label: 'API token', ph: '…', pw: true }, { k: 'siteId', label: 'Site ID', ph: '…' }],
                custom: [{ k: 'endpoint', label: 'Your fix endpoint URL', ph: 'https://yoursite.com/livesov-fix' }, { k: 'secret', label: 'Shared secret (16+ chars)', ph: 'paste, or click Generate →', pw: true }],
              };
              const fs = fields[cmsType] || [];
              const ready = fs.every((f) => (cc[f.k] || '').trim().length > 0);
              const genSecret = () => { const b = new Uint8Array(24); crypto.getRandomValues(b); ccSet('secret', Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')); };
              return (
                <div style={{ display: 'grid', gap: 12 }}>
                  {cmsType === 'custom' && (<>
                    {/* Which path is fastest — two clear choices, ranked by effort. */}
                    <div className="nb-sm" style={{ padding: '12px 15px', boxShadow: 'none', background: 'var(--success-50)', borderColor: 'var(--success)', display: 'grid', gap: 5 }}>
                      <div className="disp" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>⚡ FASTEST — NO CODE, START NOW</div>
                      <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', fontWeight: 500 }}>
                        You can skip this form entirely. <b>Run a scan</b> to see every fix, then hand them to your team as a to-do list via <b>Spreadsheet</b>, <b>Linear</b> or <b>Jira</b> (rows below). Nothing to install.
                      </span>
                    </div>
                    <div className="nb-sm" style={{ padding: '12px 15px', boxShadow: 'none', background: 'var(--info-50)', borderColor: 'var(--info)', display: 'grid', gap: 9 }}>
                      <div className="disp" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--info)' }}>🔧 FULL AUTOPILOT — ONE-TIME ~10-MIN DEV SETUP</div>
                      <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', fontWeight: 500 }}>Want fixes applied to your live site automatically? Your developer adds one small endpoint, <b>once</b> — then every approved fix ships itself. Three steps:</span>
                      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)', fontWeight: 500, display: 'grid', gap: 2 }}>
                        <li><b>Copy</b> a template below → send it to your developer to add to the site.</li>
                        <li><b>Generate</b> a secret (button on the “Shared secret” field) → put the same one in the endpoint.</li>
                        <li><b>Paste</b> the endpoint URL + secret below → Connect. Done.</li>
                      </ol>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="gbtn" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => copy(CUSTOM_ENDPOINT_NODE, 'Node/Express template')}>⧉ Copy Node/Express template</button>
                        <button className="gbtn" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => copy(CUSTOM_ENDPOINT_PHP, 'PHP template')}>⧉ Copy PHP template</button>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Tip: start with just <b>update_title</b> + <b>update_meta_description</b> — that alone unlocks the highest-impact fixes. Any fix your endpoint can’t handle yet is handed off to you, never failed.</span>
                    </div>
                  </>)}
                  {fs.map((f) => (
                    <div key={f.k}>
                      <div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>{f.label}</div>
                      {f.k === 'secret' ? (
                        <>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input className="xin" style={{ flex: 1, minWidth: 0 }} type={f.pw && !secretShown ? 'password' : 'text'} value={cc[f.k] || ''} placeholder={f.ph} onChange={(e) => ccSet(f.k, e.target.value)} />
                            <button className="gbtn" type="button" onClick={() => setSecretShown((s) => !s)} title={secretShown ? 'Hide secret' : 'Reveal secret'} aria-label={secretShown ? 'Hide secret' : 'Reveal secret'} style={{ padding: '9px 13px', whiteSpace: 'nowrap', flexShrink: 0 }}>{secretShown ? '🙈 Hide' : '👁 Reveal'}</button>
                            <button className="gbtn" type="button" onClick={() => copy(cc[f.k] || '', 'Shared secret')} disabled={!(cc[f.k] || '').trim()} title="Copy secret to clipboard" aria-label="Copy secret to clipboard" style={{ padding: '9px 13px', whiteSpace: 'nowrap', flexShrink: 0 }}>⧉ Copy</button>
                            <button className="gbtn" type="button" onClick={genSecret} title="Generate a secure 48-character secret" style={{ padding: '9px 13px', whiteSpace: 'nowrap', flexShrink: 0 }}>⚄ Generate</button>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 5, fontWeight: 500 }}>Paste the <b>same</b> secret into your endpoint&rsquo;s <code>LIVESOV_SECRET</code>. Reveal or Copy to grab the exact value.</div>
                        </>
                      ) : (
                        <input className="xin" type={f.pw ? 'password' : 'text'} value={cc[f.k] || ''} placeholder={f.ph} onChange={(e) => ccSet(f.k, e.target.value)} />
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--warning, #b45309)', fontWeight: 600 }}>
                      {cmsType === 'custom'
                        ? 'Connect verifies with a signed ping to your endpoint; the secret is encrypted at rest. Ship your first fix to a low-traffic page and re-check.'
                        : 'BETA — verified against your store, then encrypted at rest. Ship your first fix to a low-traffic page and re-check before turning on autopilot.'}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="gbtn" onClick={() => setShowForm(false)}>Cancel</button>
                      <button className="xbtn" onClick={() => onConnectCmsGeneric(cmsType, siteUrl, cc)} disabled={!ready}>CONNECT {cmsType.toUpperCase()}</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <Row badge="GSC" title="Google Search Console" meta={gsc ? `${gscSite} · powers crawl & query triggers` : 'Powers striking-distance, CTR & indexing fixes'}>
          {gsc ? okChip('CONNECTED') : offChip}
          <button className={gsc ? 'tbtn' : 'xbtn'} onClick={onConnectGsc} disabled={disabled}>{gsc ? 'Re-sync' : 'CONNECT'}</button>
        </Row>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0' }}>
          <span className="disp nb-sm" style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, background: 'var(--primary)', color: '#fff', flexShrink: 0 }}>⤓</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="disp" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Connector plugin</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontWeight: 500 }}>
            {(() => {
              if (!connector) return 'Easiest: install the plugin & click “Connect with Livesov” (one-click, no copy-paste). Or Pair here for manual setup.';
              if (!connectorLastSeen) return 'Paired · waiting for the plugin’s first poll (within 5 min)…';
              const online = Date.now() - Date.parse(connectorLastSeen) <= 12 * 60_000;
              const mins = Math.max(0, Math.round((Date.now() - Date.parse(connectorLastSeen)) / 60_000));
              return online ? `● Online · last polled ${mins}m ago` : `○ Offline · last seen ${mins}m ago (check the plugin)`;
            })()}
          </div>
          </div>
          {connector
            ? (connectorLastSeen && Date.now() - Date.parse(connectorLastSeen) <= 12 * 60_000
                ? okChip('ONLINE')
                : <span className="chip" style={{ background: 'var(--warn-50)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>{connectorLastSeen ? '○ OFFLINE' : '● PAIRED'}</span>)
            : <span className="chip" style={{ color: 'var(--text-3)' }}>○ NOT PAIRED</span>}
          <button className="gbtn" onClick={() => { onPairConnector(); setReveal(true); }} disabled={disabled} style={{ padding: '7px 13px', fontSize: 12 }}>{connector ? 'Re-pair' : 'Pair'}</button>
          {connector && <button className="tbtn" onClick={onRevokeConnector} disabled={disabled} style={{ color: 'var(--danger)', textDecorationColor: 'var(--danger)' }}>Revoke</button>}
        </div>

        {pairing && reveal && (
          <div className="nb-sm" style={{ padding: 18, background: 'var(--warn-50)', borderColor: 'var(--warn)', boxShadow: '4px 4px 0 var(--warn)', display: 'grid', gap: 12 }}>
            <div className="disp" style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)', display: 'flex', gap: 8, alignItems: 'center' }}>⚠ SHOWN ONCE — COPY &amp; STORE THE SECRET NOW</div>
            {[{ k: 'Pull URL', v: pairing.pullUrl }, { k: 'Token', v: pairing.token }, { k: 'Secret', v: pairing.hmacSecret }].map((r) => (
              <div key={r.k} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12, alignItems: 'center' }}>
                <span className="xlbl" style={{ color: 'var(--text-2)' }}>{r.k}</span>
                <code className="xin" style={{ boxShadow: 'none', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.v}</code>
                <button className="gbtn" onClick={() => copy(r.v, r.k)} style={{ padding: '7px 12px' }} aria-label={`Copy ${r.k}`}>⧉</button>
              </div>
            ))}
            {(() => {
              const edgeBase = pairing.pullUrl.replace(/\/api\/connector\/instructions\/?$/, '/api/edge/serve');
              const worker = `// Cloudflare Worker — serves /llms.txt and appends AI rules to /robots.txt.\n`
                + `// No WordPress plugin required. Route it to your zone, then it stays in sync.\n`
                + `const T = ${JSON.stringify(pairing.token)};\n`
                + `const BASE = ${JSON.stringify(edgeBase)};\n`
                + `const H = { headers: { Authorization: 'Bearer ' + T } };\n`
                + `export default {\n`
                + `  async fetch(req) {\n`
                + `    const p = new URL(req.url).pathname;\n`
                + `    if (p === '/llms.txt') return fetch(BASE + '?file=llms.txt', H);\n`
                + `    if (p === '/robots.txt') {\n`
                + `      const [base, add] = await Promise.all([\n`
                + `        fetch(req).then(r => r.text()).catch(() => ''),\n`
                + `        fetch(BASE + '?file=robots.txt', H).then(r => r.ok ? r.text() : '').catch(() => ''),\n`
                + `      ]);\n`
                + `      return new Response((base + '\\n' + add).trim() + '\\n', { headers: { 'content-type': 'text/plain' } });\n`
                + `    }\n`
                + `    return fetch(req);\n`
                + `  }\n`
                + `};\n`;
              return (
                <details style={{ borderTop: '2px dashed var(--warn)', paddingTop: 10 }}>
                  <summary className="disp" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>No WordPress plugin? Serve at the edge (Cloudflare) →</summary>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, margin: '8px 0' }}>Paste this into a Cloudflare Worker on your zone. It serves your latest <code>/llms.txt</code> and appends AI-crawler rules to <code>/robots.txt</code> — and stays in sync automatically as you ship new fixes.</p>
                  <pre className="mono nb-sm" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, padding: 12, background: 'var(--surface-3)', boxShadow: 'none', overflow: 'auto', maxHeight: 200, color: 'var(--text)', whiteSpace: 'pre' }}>{worker}</pre>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="gbtn" onClick={() => copy(worker, 'Cloudflare Worker')} style={{ padding: '7px 12px' }}>Copy Worker</button>
                  </div>
                </details>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="gbtn" onClick={() => setReveal(false)} style={{ padding: '7px 13px' }}>I&apos;ve stored these — hide</button>
            </div>
          </div>
        )}

        {/* Issue trackers — turn fixes into native Linear/Jira tickets */}
        <Row badge="↗" title="Linear" meta={linear ? 'Connected · hand fixes off as Linear issues' : 'Turn a fix into a Linear issue (API key)'}>
          {linear ? okChip('CONNECTED') : offChip}
          <button className={linear ? 'tbtn' : 'xbtn'} onClick={() => setTracker((t) => (t === 'linear' ? '' : 'linear'))} disabled={disabled}>{linear ? 'Reconnect' : 'CONNECT'}</button>
        </Row>
        {tracker === 'linear' && (
          <div className="nb-sm" style={{ padding: 18, margin: '6px 0 14px', background: 'var(--surface-2)', display: 'grid', gap: 14 }}>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>API key</div><input className="xin" type="password" placeholder="lin_api_…" onChange={(e) => tkSet('apiKey', e.target.value)} /></div>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Team ID</div><input className="xin" placeholder="Linear team UUID" onChange={(e) => tkSet('teamId', e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Personal API key from Linear → Settings → API. Verified, then encrypted.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="gbtn" onClick={() => setTracker('')}>Cancel</button>
                <button className="xbtn" onClick={() => onConnectTracker('linear', tk)} disabled={!tk.apiKey || !tk.teamId}>CONNECT LINEAR</button>
              </div>
            </div>
          </div>
        )}
        <Row badge="↗" title="Jira" meta={jira ? 'Connected · hand fixes off as Jira issues' : 'Turn a fix into a Jira issue (API token)'}>
          {jira ? okChip('CONNECTED') : offChip}
          <button className={jira ? 'tbtn' : 'xbtn'} onClick={() => setTracker((t) => (t === 'jira' ? '' : 'jira'))} disabled={disabled}>{jira ? 'Reconnect' : 'CONNECT'}</button>
        </Row>
        {tracker === 'jira' && (
          <div className="nb-sm" style={{ padding: 18, margin: '6px 0 14px', background: 'var(--surface-2)', display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Account email</div><input className="xin" placeholder="you@acme.com" onChange={(e) => tkSet('email', e.target.value)} /></div>
              <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Site domain</div><input className="xin" placeholder="acme (→ acme.atlassian.net)" onChange={(e) => tkSet('domain', e.target.value)} /></div>
            </div>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>API token</div><input className="xin" type="password" placeholder="Atlassian API token" onChange={(e) => tkSet('apiToken', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Project key</div><input className="xin" placeholder="SEO" onChange={(e) => tkSet('projectKey', e.target.value)} /></div>
              <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Issue type</div><input className="xin" placeholder="Task" onChange={(e) => tkSet('issueType', e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>API token from id.atlassian.com → Security. Verified, then encrypted.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="gbtn" onClick={() => setTracker('')}>Cancel</button>
                <button className="xbtn" onClick={() => onConnectTracker('jira', tk)} disabled={!tk.email || !tk.apiToken || !tk.domain || !tk.projectKey}>CONNECT JIRA</button>
              </div>
            </div>
          </div>
        )}

        <Row badge="▤" title="Spreadsheet" meta={sheet ? 'Connected · handed-off fixes append rows to your sheet' : 'No Jira/Linear? Hand fixes off as rows in a Google Sheet'}>
          {sheet ? okChip('CONNECTED') : offChip}
          {sheet && sheetUrl && <a className="tbtn" href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Open sheet ↗</a>}
          <button className={sheet ? 'tbtn' : 'xbtn'} onClick={() => setTracker((t) => (t === 'sheet' ? '' : 'sheet'))} disabled={disabled}>{sheet ? 'Reconnect' : 'CONNECT'}</button>
        </Row>
        {tracker === 'sheet' && (
          <div className="nb-sm" style={{ padding: 18, margin: '6px 0 14px', background: 'var(--surface-2)', display: 'grid', gap: 14 }}>
            {/* Fastest path: one click — we create the sheet on the user's Drive. */}
            <div className="nb-sm" style={{ padding: '12px 15px', boxShadow: 'none', background: 'var(--success-50)', borderColor: 'var(--success)', display: 'grid', gap: 8 }}>
              <div className="disp" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>⚡ FASTEST — ONE CLICK, WE CREATE THE SHEET</div>
              <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', fontWeight: 500 }}>Connect your Google account and Livesov creates a new spreadsheet for you automatically — handed-off fixes append as rows, no script to paste. We only get access to the one sheet we create.</span>
              <div>
                <button className="xbtn" onClick={onCreateSheet} disabled={disabled} style={{ background: 'var(--success)' }}>⚡ Create &amp; connect Google Sheet →</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>If Google isn&rsquo;t linked yet, you&rsquo;ll be asked to sign in and approve first.</span>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.04em', textAlign: 'center' }}>— OR SET UP MANUALLY (NO GOOGLE LOGIN) —</div>
            <div className="nb-sm" style={{ padding: '11px 14px', boxShadow: 'none', background: 'var(--info-50)', borderColor: 'var(--info)', display: 'grid', gap: 7 }}>
              <div className="disp" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--info)' }}>2-MINUTE SETUP, NO API KEY NEEDED</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)', fontWeight: 500, display: 'grid', gap: 3 }}>
                <li>Open (or create) your Google Sheet → Extensions → <b>Apps Script</b>.</li>
                <li>Paste the script (copy below), set the secret inside it, then <b>Deploy → New deployment → Web app</b> — Execute as <b>Me</b>, access <b>Anyone</b>.</li>
                <li>Paste the deployment&apos;s <code>/exec</code> URL and the same secret here.</li>
              </ol>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="gbtn" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => copy(SHEET_APPS_SCRIPT, 'Apps Script template')}>⧉ Copy Apps Script</button>
                <button className="gbtn" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => { const b = new Uint8Array(16); crypto.getRandomValues(b); tkSet('secret', Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')); }}>⚄ Generate secret</button>
              </div>
            </div>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Web app URL</div><input className="xin" placeholder="https://script.google.com/macros/s/…/exec" value={tk.url || ''} onChange={(e) => tkSet('url', e.target.value)} /></div>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>Secret (same as in the script)</div><input className="xin" type="password" value={tk.secret || ''} placeholder="8+ characters" onChange={(e) => tkSet('secret', e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>Verified with a test ping, then encrypted. Each handed-off fix appends one row: date · fix · details · link. Zapier/Make webhooks work too.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="gbtn" onClick={() => setTracker('')}>Cancel</button>
                <button className="xbtn" onClick={() => onConnectTracker('sheet', tk)} disabled={!(tk.url || '').startsWith('https://') || (tk.secret || '').length < 8}>CONNECT SHEET</button>
              </div>
            </div>
          </div>
        )}

        {/* Keyword data — powers the keyword-opportunities module */}
        <Row badge="KW" title="Keywords Everywhere" meta={kwe ? 'Connected · powers low-competition keyword targeting' : 'Search volume + competition for keyword targeting (API key)'}>
          {kwe ? okChip('CONNECTED') : offChip}
          <button className={kwe ? 'tbtn' : 'xbtn'} onClick={() => setKweOpen((o) => !o)} disabled={disabled}>{kwe ? 'Reconnect' : 'CONNECT'}</button>
        </Row>
        {kweOpen && (
          <div className="nb-sm" style={{ padding: 18, margin: '6px 0 14px', background: 'var(--surface-2)', display: 'grid', gap: 14 }}>
            <div><div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>API key</div><input className="xin" type="password" value={kweKey} placeholder="Keywords Everywhere API key" onChange={(e) => setKweKey(e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>From keywordseverywhere.com → API. Verified (uses 1 credit), then encrypted. Volume lookups are cached 7 days to save credits.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="gbtn" onClick={() => setKweOpen(false)}>Cancel</button>
                <button className="xbtn" onClick={() => { onConnectKwe(kweKey.trim()); setKweOpen(false); }} disabled={!kweKey.trim()}>CONNECT</button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}

// ── SEO brain ──
function SeoBrainSection({ brain, disabled, onSave, onReset }: {
  brain: { content: string; isCustom: boolean; base: string; presets: { key: string; title: string; description: string; content: string }[]; maxChars?: number } | null;
  disabled: boolean; onSave: (content: string) => void; onReset: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [preset, setPreset] = React.useState('');
  React.useEffect(() => { if (brain && !text) setText(brain.content); }, [brain, text]);
  const presets = brain?.presets ?? [];
  return (
    <section className="nb" style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeader
        title="SEO BRAIN" dark open={expanded} onToggle={() => setExpanded((e) => !e)}
        right={<>
          <span className="chip" style={{ background: brain?.isCustom ? 'var(--success-50)' : 'var(--bg)', color: brain?.isCustom ? 'var(--success)' : 'var(--text)', borderColor: brain?.isCustom ? 'var(--success)' : 'var(--bg)' }}>{brain?.isCustom ? 'CUSTOM' : 'DEFAULT'}</span>
          {expanded && <button className="tbtn" onClick={() => setOpen((o) => !o)} disabled={disabled} style={{ color: 'var(--bg)', textDecorationColor: 'var(--bg)' }}>{open ? 'Close' : 'Edit'}</button>}
        </>}
      />
      {expanded && (
      <div style={{ padding: '14px 20px 18px' }}>
        {!open ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)', fontWeight: 500 }}>
            The playbook every fix is generated to. {brain?.isCustom ? 'Using your custom brain.' : 'Using the default — Edit to paste your own (e.g. Growth Atlas) or load the Matt Diggity preset.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="xlbl" style={{ color: 'var(--text-2)' }}>Load preset</span>
              <select className="xin" style={{ width: 'auto', boxShadow: 'none' }} value={preset} onChange={(e) => { const p = presets.find((x) => x.key === e.target.value); setPreset(e.target.value); if (p) setText(p.content); }}>
                <option value="">— choose —</option>
                {presets.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
              </select>
              {preset && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{presets.find((p) => p.key === preset)?.description}</span>}
            </div>
            <textarea className="xin" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your SEO/GEO playbook (Growth Atlas brain, agency methodology, brand voice, linking & citation rules…)" />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="xbtn" onClick={() => onSave(text)} disabled={!text.trim()}>✓ SAVE BRAIN</button>
              {brain?.isCustom && <button className="gbtn" onClick={onReset}>Reset to default</button>}
              <span className="xlbl" style={{ color: 'var(--text-2)', marginLeft: 'auto' }}>{text.length}{brain?.maxChars ? ` / ${brain.maxChars}` : ''}</span>
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}

// ── Automation (scheduled scans + auto-pilot) ──
function AutomationSection({ automation, activity, canShip, disabled, onSave }: {
  automation: any; activity: { id: string; event: string; detail: any; createdAt: string }[];
  canShip: boolean; disabled: boolean; onSave: (patch: any) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [showRules, setShowRules] = React.useState(false);
  const [rules, setRules] = React.useState<{ titleSuffix: string; titleMaxLen: string; metaMaxLen: string; bannedPhrases: string }>({ titleSuffix: '', titleMaxLen: '', metaMaxLen: '', bannedPhrases: '' });
  React.useEffect(() => {
    const r = automation?.rules || {};
    setRules({
      titleSuffix: r.titleSuffix || '', titleMaxLen: r.titleMaxLen ? String(r.titleMaxLen) : '',
      metaMaxLen: r.metaMaxLen ? String(r.metaMaxLen) : '', bannedPhrases: (r.bannedPhrases || []).join(', '),
    });
  }, [automation?.rules]);
  const saveRules = () => onSave({
    rules: {
      titleSuffix: rules.titleSuffix || undefined,
      titleMaxLen: rules.titleMaxLen ? Number(rules.titleMaxLen) : undefined,
      metaMaxLen: rules.metaMaxLen ? Number(rules.metaMaxLen) : undefined,
      bannedPhrases: rules.bannedPhrases.split(',').map((p) => p.trim()).filter(Boolean),
    },
  });
  const EVENT_LABEL: Record<string, string> = {
    'scan.done': 'Scan finished', generated: 'Draft generated', approved: 'Approved', shipped: 'Shipped',
    rechecked: 'Re-checked', 'rules.applied': 'Guardrails applied', 'regression.detected': 'Regression detected',
    'outcome.measured': 'Outcome measured', 'trigger.new_pages': 'New pages detected', 'approval.requested': 'Review requested',
    'connector.applied': 'Applied by your site', 'connector.stuck': 'Delivery stuck', 'ticket.created': 'Ticket created',
  };
  const a = automation || {};
  const Toggle = ({ on, onClick, children, dim }: { on: boolean; onClick: () => void; children: React.ReactNode; dim?: boolean }) => (
    <button className="chip" onClick={onClick} disabled={disabled || dim} style={{ cursor: disabled || dim ? 'not-allowed' : 'pointer', fontSize: 11, padding: '6px 12px', opacity: dim ? 0.5 : 1, background: on ? 'var(--success-50)' : 'var(--surface)', color: on ? 'var(--success)' : 'var(--text-2)', borderColor: on ? 'var(--success)' : 'var(--ink)' }}>{on ? '● ' : '○ '}{children}</button>
  );
  const nextRun = a.scanEnabled && a.nextScanAt ? new Date(a.nextScanAt).toLocaleString() : null;
  return (
    <section className="nb" style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeader
        title="AUTOMATION" dark open={expanded} onToggle={() => setExpanded((e) => !e)}
        right={a.scanEnabled ? <span className="chip" style={{ background: 'var(--success-50)', color: 'var(--success)', borderColor: 'var(--success)' }}>SCHEDULED</span> : undefined}
      />
      {expanded && (
      <div style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong className="disp" style={{ fontSize: 14, minWidth: 150 }}>Scheduled scans</strong>
          <Toggle on={!!a.scanEnabled} onClick={() => onSave({ scanEnabled: !a.scanEnabled })}>{a.scanEnabled ? 'ON' : 'OFF'}</Toggle>
          {a.scanEnabled && (
            <select className="xin" style={{ width: 'auto', boxShadow: 'none', padding: '6px 10px' }} value={a.scanFrequency || 'weekly'} onChange={(e) => onSave({ scanFrequency: e.target.value })} disabled={disabled}>
              <option value="weekly">Weekly</option><option value="daily">Daily</option>
            </select>
          )}
          {nextRun && <span className="quiet mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>next: {nextRun}</span>}
          <span className="quiet" style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>Re-scan this brand automatically.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 12, borderTop: '2px dashed var(--line)' }}>
          <strong className="disp" style={{ fontSize: 14, minWidth: 150 }}>Auto-pilot</strong>
          <Toggle on={!!a.autopilotGenerate} onClick={() => onSave({ autopilotGenerate: !a.autopilotGenerate })} dim={!a.scanEnabled}>Auto-generate</Toggle>
          <Toggle on={!!a.autopilotShipDeterministic} onClick={() => onSave({ autopilotShipDeterministic: !a.autopilotShipDeterministic })} dim={!a.scanEnabled || !canShip}>Auto-ship safe fixes</Toggle>
          <Toggle on={!!a.measuredRevert} onClick={() => onSave({ measuredRevert: !a.measuredRevert })}>Measured mode</Toggle>
          <span className="quiet" style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>
            After each scheduled scan, draft fixes{a.autopilotShipDeterministic ? ' and auto-ship the deterministic (FREE) ones' : ''}. LLM-written content always waits for your approval.
            {a.measuredRevert ? ' Measured mode: a title/meta fix whose CTR drops ≥20% over 28 days (300+ impressions both windows) is auto-undone.' : ''}
          </span>
        </div>
        {!canShip && a.autopilotShipDeterministic && <p className="quiet" style={{ margin: 0, fontSize: 11, color: 'var(--warn)' }}>Connect a CMS or the Connector to enable auto-ship.</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 12, borderTop: '2px dashed var(--line)' }}>
          <strong className="disp" style={{ fontSize: 14, minWidth: 150 }}>Digest</strong>
          <Toggle on={!!a.notifyOnScan} onClick={() => onSave({ notifyOnScan: !a.notifyOnScan })} dim={!a.scanEnabled}>Notify me after each scan</Toggle>
          <span className="quiet" style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>
            Sends a summary to your connected Linear/Jira or webhook (Slack) — no need to log in to see progress.
          </span>
        </div>

        {/* Brand rules — deterministic guardrails on every AI draft */}
        <div style={{ display: 'grid', gap: 10, paddingTop: 12, borderTop: '2px dashed var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong className="disp" style={{ fontSize: 14, minWidth: 150 }}>Brand rules</strong>
            <Toggle on={showRules} onClick={() => setShowRules((s) => !s)}>{showRules ? 'Editing' : 'Edit rules'}</Toggle>
            <span className="quiet" style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>
              Hard guardrails enforced on every AI draft: title suffix, length caps, banned phrases.
            </span>
          </div>
          {showRules && (
            <div className="nb-sm" style={{ padding: 14, background: 'var(--surface-2)', display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div><div className="xlbl" style={{ marginBottom: 6, color: 'var(--text-2)' }}>Title suffix</div><input className="xin" value={rules.titleSuffix} placeholder="| Acme" onChange={(e) => setRules((r) => ({ ...r, titleSuffix: e.target.value }))} /></div>
                <div><div className="xlbl" style={{ marginBottom: 6, color: 'var(--text-2)' }}>Title max</div><input className="xin" value={rules.titleMaxLen} placeholder="60" onChange={(e) => setRules((r) => ({ ...r, titleMaxLen: e.target.value.replace(/\D/g, '') }))} /></div>
                <div><div className="xlbl" style={{ marginBottom: 6, color: 'var(--text-2)' }}>Meta max</div><input className="xin" value={rules.metaMaxLen} placeholder="155" onChange={(e) => setRules((r) => ({ ...r, metaMaxLen: e.target.value.replace(/\D/g, '') }))} /></div>
              </div>
              <div><div className="xlbl" style={{ marginBottom: 6, color: 'var(--text-2)' }}>Banned phrases (comma-separated)</div><input className="xin" value={rules.bannedPhrases} placeholder="world-class, game-changing, revolutionary" onChange={(e) => setRules((r) => ({ ...r, bannedPhrases: e.target.value }))} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="xbtn" onClick={saveRules} disabled={disabled} style={{ padding: '8px 14px' }}>SAVE RULES</button></div>
            </div>
          )}
        </div>

        {/* Automation activity — what the engine did on its own */}
        {activity.length > 0 && (
          <div style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: '2px dashed var(--line)' }}>
            <strong className="disp" style={{ fontSize: 14 }}>Recent activity</strong>
            <div style={{ display: 'grid', gap: 5, maxHeight: 180, overflow: 'auto' }}>
              {activity.slice(0, 12).map((ev) => (
                <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12 }}>
                  <span className="mono quiet" style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: 10.5 }}>{new Date(ev.createdAt).toLocaleString()}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{EVENT_LABEL[ev.event] || ev.event}</span>
                  {ev.event === 'trigger.new_pages' && ev.detail?.count && <span className="quiet" style={{ color: 'var(--text-2)' }}>{ev.detail.count} new page{ev.detail.count === 1 ? '' : 's'}</span>}
                  {ev.event === 'outcome.measured' && typeof ev.detail?.ctrDelta === 'number' && <span style={{ color: ev.detail.ctrDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>CTR {ev.detail.ctrDelta >= 0 ? '+' : ''}{Math.round(ev.detail.ctrDelta * 100)}%</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}

// ── Passage rewrite ──
// Plain-language, self-contained tool: paste a paragraph, say what you want
// it to do, and get the AI rewrite back *inline* (before → after) so the
// result is visible right here — not only buried down in THE FIXES queue.
function PassageSection({ disabled, onSubmit }: { disabled: boolean; onSubmit: (f: { url: string; passage: string; instruction: string }) => Promise<PassageResult> }) {
  const [open, setOpen] = React.useState(true);
  const [url, setUrl] = React.useState('');
  const [passage, setPassage] = React.useState('');
  const [instruction, setInstruction] = React.useState('');
  // idle → working → done | error, plus the produced before/after.
  const [phase, setPhase] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [result, setResult] = React.useState<{ before: string; after: string; rationale?: string } | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  // Say WHY the button is disabled instead of leaving it silently grey.
  const need = Math.max(0, 12 - passage.trim().length);
  const missing = disabled ? 'Fix Engine is not enabled on your plan'
    : !url.trim() ? 'Add the page URL above to continue'
    : passage.trim().length < 12 ? `Paste a bit more of the paragraph — ${need} more character${need === 1 ? '' : 's'} needed`
    : null;

  const run = async () => {
    if (missing) return;
    setPhase('working'); setErrMsg(null); setResult(null);
    const r = await onSubmit({ url, passage, instruction });
    if (r.ok) {
      const gen = (r.fix?.generated || {}) as { rewritten?: string; original?: string; rationale?: string };
      const before = r.preview?.before ?? gen.original ?? passage;
      const after = r.preview?.after ?? gen.rewritten ?? '';
      if (!after.trim()) { setPhase('error'); setErrMsg('The rewrite came back empty — try again, or make the goal more specific.'); return; }
      setResult({ before, after, rationale: gen.rationale });
      setPhase('done');
    } else {
      setPhase('error'); setErrMsg(r.error);
    }
  };

  // Clear the paragraph/goal so the next rewrite starts fresh (keep the URL —
  // people often rewrite several passages on the same page).
  const startAnother = () => { setPhase('idle'); setResult(null); setErrMsg(null); setPassage(''); setInstruction(''); };

  const spinner = <span aria-hidden style={{ display: 'inline-block', width: 14, height: 14, border: '2.5px solid rgba(255,255,255,.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'xspin .7s linear infinite' }} />;
  const working = phase === 'working';

  return (
    <section className="nb" style={{ padding: 0, overflow: 'hidden', background: 'var(--info-50)' }}>
      <SectionHeader title="OPTIMIZE A PASSAGE" open={open} onToggle={() => setOpen((o) => !o)} bg="var(--info)" />
      {open && (
      <div style={{ padding: '18px 20px', display: 'grid', gap: 15 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, lineHeight: 1.55 }}>
          Got a paragraph that isn&apos;t getting picked up by AI answers or search? Paste it below and tell us the goal in plain words.
          We rewrite it to be clear and citable, show you the new version right here, then add it to <strong>The Fixes</strong> so you can ship it to your page in one click.
        </p>

        <div>
          <div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>1 · Which page is the paragraph on?</div>
          <input className="xin" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/pricing" disabled={working} />
        </div>
        <div>
          <div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>2 · Paste the exact paragraph to improve</div>
          <textarea className="xin" rows={3} value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="Copy the exact paragraph or lines straight from the page…" disabled={working} />
        </div>
        <div>
          <div className="xlbl" style={{ marginBottom: 7, color: 'var(--text-2)' }}>3 · What should it do? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: 'var(--text-3)' }}>(optional)</span></div>
          <input className="xin" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={'e.g. clearly answer "is Acme good for engineering teams?"'} disabled={working} />
        </div>

        <button
          className="xbtn"
          onClick={run}
          disabled={!!missing || working}
          style={{ background: 'var(--info)', justifyContent: 'center' }}
        >
          {working ? <>{spinner} Rewriting your passage…</> : phase === 'done' ? '✦ Rewrite this again' : '✦ Rewrite this passage'}
        </button>
        {!working && missing && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', textAlign: 'center' }}>{missing}</span>}
        {!working && !missing && phase === 'idle' && <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-3)', textAlign: 'center' }}>You&apos;ll see the rewritten version here before anything ships.</span>}

        {/* Error — shown right in the card so the click never looks dead. */}
        {phase === 'error' && errMsg && (
          <div className="nb-sm" style={{ padding: '12px 14px', background: 'var(--danger-50)', borderColor: 'var(--danger)', boxShadow: '3px 3px 0 var(--danger)' }}>
            <div className="disp" style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 3 }}>✕ Couldn&apos;t create the rewrite</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, lineHeight: 1.5 }}>{errMsg}</div>
          </div>
        )}

        {/* Inline result — the whole point: SEE what the fix produced. */}
        {phase === 'done' && result && (
          <div className="nb-sm" style={{ padding: 0, overflow: 'hidden', boxShadow: '4px 4px 0 var(--success)', borderColor: 'var(--success)' }}>
            <div className="disp" style={{ padding: '10px 14px', background: 'var(--success)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>✓ Here&apos;s your rewrite</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: 'var(--danger-50)', borderBottom: '2px solid var(--ink)' }}>
              <span className="disp" style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>− NOW</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--text-2)', textDecoration: 'line-through', textDecorationColor: 'var(--danger-200)', lineHeight: 1.5 }}>{result.before || '(empty)'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: 'var(--success-50)' }}>
              <span className="disp" style={{ color: 'var(--success)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>+ NEW</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{result.after}</span>
            </div>
            {result.rationale && (
              <div style={{ padding: '10px 14px', borderTop: '2px dashed var(--line)', background: 'var(--surface)' }}>
                <div className="xlbl" style={{ color: 'var(--text-3)', marginBottom: 4 }}>Why this is better</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, lineHeight: 1.5 }}>{result.rationale}</div>
              </div>
            )}
            <div style={{ padding: '11px 14px', borderTop: '2px solid var(--ink)', background: 'var(--surface)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flex: 1, minWidth: 160 }}>Saved to <strong>The Fixes</strong> below — review it there, then approve &amp; ship to your page.</span>
              <button className="gbtn" onClick={startAnother} style={{ padding: '7px 13px', fontSize: 12 }}>Rewrite another</button>
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}

// ── Grouped module card (bulk over N same-module fixes) ──
function GroupCard({ moduleKey, title, fixes, expanded, busy, canShip, onToggle, onBulk, renderCard }: {
  moduleKey: string; title: string; fixes: FixRow[]; expanded: boolean; busy: boolean; canShip: boolean;
  onToggle: () => void; onBulk: (action: 'generate' | 'approve' | 'ship') => void;
  renderCard: (f: FixRow) => React.ReactNode;
}) {
  const count = (s: (f: FixRow) => boolean) => fixes.filter(s).length;
  const detected = count((f) => f.status === 'detected' || f.status === 'failed');
  const review = count((f) => f.status === 'generated' || f.status === 'preview_ready');
  const approved = count((f) => f.status === 'approved');
  const live = count((f) => f.status === 'shipped' || f.status === 'verified');
  const hosts = [...new Set(fixes.map((f) => (f.targetUrl || '').replace(/^https?:\/\/[^/]+/, '') || '/'))].slice(0, 3);
  return (
    <article className="nb" style={{ padding: 0, overflow: 'hidden', boxShadow: '5px 5px 0 var(--primary)' }} data-group={moduleKey}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'var(--primary-50)', borderBottom: '2.5px solid var(--ink)', flexWrap: 'wrap' }}>
        <span className="disp nb-sm" style={{ padding: '4px 10px', fontWeight: 700, fontSize: 13, background: 'var(--primary)', color: '#fff' }}>{fixes.length}×</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="disp" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title} — {fixes.length} pages</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{hosts.join(' · ')}{fixes.length > hosts.length ? ' · …' : ''}</div>
        </div>
        <span className="chip" style={{ fontSize: 10.5 }}>{detected} to draft · {review} in review · {approved} ready · {live} live</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', flexWrap: 'wrap' }}>
        {detected > 0 && <button className="gbtn" disabled={busy} onClick={() => onBulk('generate')} style={{ padding: '7px 13px', fontSize: 12 }}>✦ Generate all ({detected})</button>}
        {review > 0 && <button className="xbtn" disabled={busy} onClick={() => onBulk('approve')} style={{ padding: '7px 13px', fontSize: 12, background: 'var(--success)' }}>✓ Approve all ({review})</button>}
        {approved > 0 && <button className="xbtn" disabled={busy || !canShip} onClick={() => onBulk('ship')} style={{ padding: '7px 13px', fontSize: 12, background: 'var(--success)' }}>⬢ Ship all ({approved})</button>}
        <span style={{ flex: 1 }} />
        <button className="tbtn" onClick={onToggle}>{expanded ? 'Collapse' : `Review individually (${fixes.length})`}</button>
      </div>
      {expanded && <div style={{ display: 'grid', gap: 18, padding: '0 18px 18px' }}>{fixes.map((f) => renderCard(f))}</div>}
    </article>
  );
}

// A Google-result-style snippet, used to preview how a title/meta change
// will actually look in search results and AI answers.
function SerpCard({ label, host, title, desc, color }: { label: string; host: string; title: string; desc: string; color: string }) {
  return (
    <div className="nb-sm" style={{ padding: '10px 12px', boxShadow: 'none', background: 'var(--surface)', borderColor: color }}>
      <div className="disp" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{host}</div>
      <div style={{ fontSize: 14, color: '#1a0dab', fontWeight: 600, lineHeight: 1.25, margin: '1px 0 3px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{desc}</div>
    </div>
  );
}

// ── Fix card ──
function FixCard({ fix, title, preview, cost, revertable, impact, events, busy, armed, canShip, picked, onTogglePick, onGenerate, onApprove, onArm, onCancelArm, onShipConfirm, onRecheck, onRetry, onRevert, onLoadHistory, onSaveMeta, hasConnector, hasTracker, onStage, onPublish, onTicket, onRequestReview, editableField, onEditDraft, downloadHref, open, onToggleOpen }: {
  fix: FixRow; title: string; preview: PreviewBlock | null | undefined; cost: number; revertable: boolean; impact?: 1 | 2 | 3;
  events: FixEvent[] | undefined; busy: boolean; armed: boolean; canShip: boolean; picked: boolean;
  onTogglePick: () => void; onGenerate: () => void; onApprove: () => void; onArm: () => void; onCancelArm: () => void;
  onShipConfirm: () => void; onRecheck: () => void; onRetry: () => void; onRevert: () => void; onLoadHistory: () => void;
  onSaveMeta: (patch: { note?: string; assignee?: string }) => void;
  hasConnector: boolean; hasTracker: boolean; onStage: () => void; onPublish: () => void; onTicket: () => void;
  onRequestReview: () => void;
  editableField?: string;
  onEditDraft: (field: string, value: string) => void;
  downloadHref?: string;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const [note, setNote] = React.useState(fix.note || '');
  const [assignee, setAssignee] = React.useState(fix.assignee || '');
  React.useEffect(() => { setNote(fix.note || ''); setAssignee(fix.assignee || ''); }, [fix.note, fix.assignee]);
  const s = fix.status;
  const sm = statusMeta(s); const sev = sevMeta(fix.severity); const cf = chanFill(fix.channel);
  const isDetected = s === 'detected';
  const isReview = s === 'generated' || s === 'preview_ready';
  const isApproved = s === 'approved';
  const isStaged = s === 'staged';
  const isLive = s === 'shipped' || s === 'verified';
  const isAttention = s === 'failed' || s === 'reverted';
  // Staging is offered only for fixes whose module can express a draft patch
  // (page-content edits) and only once the Connector is paired.
  const stageable = STAGEABLE_MODULES.has(fix.moduleKey);
  const url = fix.targetUrl || '';
  const host = url.replace(/^https?:\/\//, '');

  // Collapsed: one scannable line — severity, what & where, status — that
  // opens the full card on click. Keeps a 50-fix queue navigable.
  if (!open) {
    return (
      <article
        className="nb-sm"
        onClick={onToggleOpen}
        role="button"
        aria-expanded={false}
        title="Open this fix"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', boxShadow: `3px 3px 0 ${sev.color}`, background: 'var(--surface)' }}
      >
        <input type="checkbox" checked={picked} onClick={(e) => e.stopPropagation()} onChange={onTogglePick} aria-label="Select fix for bulk action" style={{ accentColor: 'var(--primary)', width: 15, height: 15, flexShrink: 0 }} />
        <span title={`${sev.label} severity`} style={{ width: 10, height: 10, borderRadius: '50%', background: sev.color, flexShrink: 0 }} />
        <span className="disp" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 60 }}>
          {fix.summary}{host ? ` · ${host}` : ''}
        </span>
        {busy && <span style={{ width: 13, height: 13, border: '2.5px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', flexShrink: 0, animation: 'xspin .7s linear infinite' }} />}
        <span className="chip" style={{ background: sm.bg, color: sm.color, borderColor: sm.color, flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color }} />{sm.label}</span>
        <span className="disp" aria-hidden style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>▾</span>
      </article>
    );
  }

  return (
    <article className="nb" style={{ padding: 0, overflow: 'hidden', boxShadow: `5px 5px 0 ${sev.color}` }}>
      <div onClick={onToggleOpen} role="button" aria-expanded title="Collapse this fix" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: sev.bg, borderBottom: '2.5px solid var(--ink)', cursor: 'pointer' }}>
        <input type="checkbox" checked={picked} onClick={(e) => e.stopPropagation()} onChange={onTogglePick} aria-label="Select fix for bulk action" style={{ accentColor: 'var(--primary)', width: 15, height: 15, flexShrink: 0 }} />
        <span className="disp" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: sev.color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{sev.glyph} {sev.label} SEVERITY</span>
        <span style={{ flex: 1 }} />
        {impact && (() => {
          const m = impact === 3 ? { l: 'HIGH IMPACT', c: 'var(--success)' } : impact === 1 ? { l: 'LOW IMPACT', c: 'var(--text-3)' } : { l: 'MED IMPACT', c: 'var(--info)' };
          return <span className="chip" title="Estimated SEO/GEO impact" style={{ color: m.c, borderColor: m.c }}>{'▲'.repeat(impact)} {m.l}</span>;
        })()}
        <span className="chip" style={{ background: sm.bg, color: sm.color, borderColor: sm.color }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color }} />{sm.label}</span>
        <span className="disp" aria-hidden style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>▴</span>
      </div>

      <div style={{ padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <h3 className="disp" style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text)' }}>{title}</h3>
            <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', fontWeight: 500 }}>{fix.summary}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className="chip" style={{ background: cf.chBg, color: cf.chFg, borderColor: cf.chFg }}>{fix.channel === 'A' ? 'CH A · ON-SITE' : 'CH B · OFF-SITE'}</span>
            {fix.assignee && <span className="chip" title="assignee">👤 {fix.assignee}</span>}
          </div>
        </div>

        {typeof (fix.generated as { rationale?: unknown } | null)?.rationale === 'string' && (fix.generated as { rationale: string }).rationale.trim() && (
          <div className="nb-sm" style={{ padding: '10px 13px', boxShadow: 'none', background: 'var(--info-50)', borderColor: 'var(--info)', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>💡</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', fontWeight: 500 }}><b className="disp" style={{ color: 'var(--info)' }}>Why this matters:</b> {(fix.generated as { rationale: string }).rationale}</span>
          </div>
        )}

        {(url || fix.aiBefore) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {url && <a href={url} target="_blank" rel="noreferrer" className="chip" style={{ cursor: 'pointer', fontSize: 11 }}>🌐 {host} ↗</a>}
            {(() => {
              const g = fix.generated as { serpQuery?: unknown; serpCompared?: unknown } | null;
              if (!g || typeof g.serpQuery !== 'string' || !g.serpQuery || !Number(g.serpCompared)) return null;
              return (
                <span className="chip" title={`Draft was written against the ${Number(g.serpCompared)} pages currently ranking for "${g.serpQuery}" — to win the click on the live SERP`} style={{ color: 'var(--warning, #b45309)', borderColor: 'var(--warning, #b45309)' }}>
                  ⚔ VS {Number(g.serpCompared)} RANKING RESULTS · “{g.serpQuery.length > 32 ? `${g.serpQuery.slice(0, 32)}…` : g.serpQuery}”
                </span>
              );
            })()}
            {(fix.pageImpressions ?? 0) > 0 && (
              <span className="chip" title="This page's Google impressions, last 28 days (GSC)" style={{ color: 'var(--info)', borderColor: 'var(--info)' }}>
                👁 {fix.pageImpressions! >= 1000 ? `${(fix.pageImpressions! / 1000).toFixed(1)}k` : fix.pageImpressions} impressions/28d
              </span>
            )}
            {fix.gscBefore && fix.gscAfter && !fix.gscAfter.unavailable && (() => {
              const b = Number(fix.gscBefore.ctr) || 0; const a = Number(fix.gscAfter.ctr) || 0;
              if (!(Number(fix.gscBefore.impressions) >= 100 && Number(fix.gscAfter.impressions) >= 100 && b > 0)) return null;
              const rel = Math.round(((a - b) / b) * 100);
              const tone = rel > 0 ? 'var(--success)' : rel < 0 ? 'var(--danger)' : 'var(--text-2)';
              return (
                <span className="chip" title="This page's Google CTR, 28 days before vs after this fix shipped" style={{ color: tone, borderColor: tone, background: rel > 0 ? 'var(--success-50)' : undefined }}>
                  📈 MEASURED: CTR {rel > 0 ? '+' : ''}{rel}%
                </span>
              );
            })()}
            {fix.scoreAfter != null && <span className="chip" style={{ background: 'var(--success-50)', color: 'var(--success)', borderColor: 'var(--success)' }}>SCORE {fix.scoreAfter}</span>}
            {(isLive) && fix.aiBefore?.sov != null && (() => {
              const before = fix.aiBefore!.sov!; const after = fix.aiAfter?.sov;
              const delta = after != null ? after - before : null;
              const tone = delta == null ? 'var(--text-2)' : delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-2)';
              return (
                <span className="chip" title="Brand AI Share-of-Voice at ship vs latest run (directional)" style={{ color: tone, borderColor: tone }}>
                  🤖 AI SOV {before}%{after != null ? ` → ${after}%` : ' → …'}{delta != null && delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}
                </span>
              );
            })()}
          </div>
        )}

        {(() => {
          const g = fix.generated as { serpQuery?: unknown; serpCompetitors?: { title?: string; description?: string; url?: string }[] } | null;
          const comps = Array.isArray(g?.serpCompetitors) ? g!.serpCompetitors!.filter((c) => c && c.title) : [];
          if (!comps.length) return null;
          return (
            <details className="nb-sm" style={{ padding: '8px 13px', boxShadow: 'none', background: 'var(--surface-2)' }}>
              <summary className="disp" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--text-2)' }}>
                THE SERP THIS DRAFT WAS WRITTEN TO BEAT{typeof g?.serpQuery === 'string' && g.serpQuery ? ` · “${g.serpQuery}”` : ''}
              </summary>
              <ol style={{ margin: '8px 0 2px', paddingLeft: 20, display: 'grid', gap: 7 }}>
                {comps.map((c, i) => (
                  <li key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.title}</span>
                    {c.url && <span style={{ color: 'var(--text-3)', fontSize: 11 }}> — {String(c.url).replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>}
                    {c.description && <div style={{ color: 'var(--text-2)', fontWeight: 500 }}>{String(c.description).slice(0, 180)}</div>}
                  </li>
                ))}
              </ol>
            </details>
          );
        })()}

        {/* preview / states */}
        {isDetected && !busy && (() => {
          // Show the current ("before") value at the detected stage so the
          // change is clear before you even generate. The "after" is filled
          // in once you generate the fix.
          const now = currentValue(fix);
          if (!now) return (
            <div className="nb-sm stripes" style={{ padding: 16, fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)', boxShadow: 'none' }}>Generate to preview the proposed fix →</div>
          );
          return (
            <div className="nb-sm" style={{ overflow: 'hidden', boxShadow: 'none' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: 'var(--danger-50)', borderBottom: '2px solid var(--ink)' }}>
                <span className="disp" style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>− NOW</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', fontStyle: now.missing ? 'italic' : 'normal', lineHeight: 1.5 }}>{now.value}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 14px', background: 'var(--surface-2)' }}>
                <span className="disp" style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>+ FIX</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, fontFamily: "'Space Grotesk'" }}>Generate the fix to see the proposed rewrite →</span>
              </div>
            </div>
          );
        })()}
        {busy && (
          <div className="nb-sm" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 11, fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13, color: 'var(--text)', boxShadow: 'none', background: 'var(--primary-50)' }}><span style={{ width: 15, height: 15, border: '2.5px solid var(--primary-200)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'xspin .7s linear infinite', display: 'inline-block' }} />WORKING…</div>
        )}
        {!busy && preview && preview.kind === 'text-diff' && (
          <div className="nb-sm" style={{ overflow: 'hidden', boxShadow: 'none' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: 'var(--danger-50)', borderBottom: '2px solid var(--ink)' }}><span className="disp" style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>− NOW</span><span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', textDecoration: 'line-through', textDecorationColor: 'var(--danger-200)', lineHeight: 1.5 }}>{preview.before || '(empty)'}</span></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: 'var(--success-50)' }}><span className="disp" style={{ color: 'var(--success)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>+ FIX</span><span className="mono" style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{preview.after}</span></div>
          </div>
        )}
        {!busy && preview && preview.kind === 'text-diff' && (fix.moduleKey === 'title-rewrite' || fix.moduleKey === 'meta-rewrite') && (() => {
          const isTitle = fix.moduleKey === 'title-rewrite';
          const gTitle = 'Your page title'; const gDesc = 'Your meta description appears here in Google results and AI answers.';
          const nowT = isTitle ? (preview.before || gTitle) : gTitle;
          const fixT = isTitle ? (preview.after || gTitle) : gTitle;
          const nowD = !isTitle ? (preview.before || gDesc) : gDesc;
          const fixD = !isTitle ? (preview.after || gDesc) : gDesc;
          return (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="xlbl" style={{ color: 'var(--primary)' }}>How it looks in search &amp; AI answers</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SerpCard label="NOW" host={host || 'your-site.com'} title={nowT} desc={nowD} color="var(--danger)" />
                <SerpCard label="AFTER" host={host || 'your-site.com'} title={fixT} desc={fixD} color="var(--success)" />
              </div>
            </div>
          );
        })()}
        {!busy && preview && preview.kind === 'code-block' && (
          <pre className="mono nb-sm" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, padding: 14, background: 'var(--surface-3)', boxShadow: 'none', overflow: 'auto', maxHeight: 220, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{preview.after}</pre>
        )}
        {!busy && preview && preview.kind === 'key-values' && (
          <div className="nb-sm" style={{ padding: '12px 14px', boxShadow: 'none' }}>
            <div className="xlbl" style={{ color: 'var(--primary)', marginBottom: 6 }}>{preview.label}</div>
            <pre className="mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{preview.after}</pre>
          </div>
        )}
        {isAttention && fix.error && (
          <div className="nb-sm" style={{ padding: '14px 16px', background: 'var(--danger-50)', borderColor: 'var(--danger)', boxShadow: 'none', display: 'flex', gap: 11, alignItems: 'flex-start' }}><span className="disp" style={{ color: 'var(--danger)', fontSize: 16, fontWeight: 700 }}>✕</span><span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', fontWeight: 500 }}><b className="disp" style={{ color: 'var(--danger)' }}>FAILED.</b> {fix.error}</span></div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 13, borderTop: '2.5px solid var(--ink)' }}>
          {isDetected && (<><button className="xbtn" onClick={onGenerate} disabled={busy}>✦ GENERATE FIX</button><span className="xlbl" style={{ color: cost === 0 ? 'var(--success)' : 'var(--text-2)' }}>{cost === 0 ? 'free · no LLM' : `${cost} credit${cost === 1 ? '' : 's'}`}</span></>)}
          {isReview && (<>
            <button className="xbtn" onClick={onApprove} disabled={busy} style={{ background: 'var(--success)' }}>✓ APPROVE</button>
            {editableField && typeof (fix.generated as Record<string, unknown> | null)?.[editableField] === 'string' && (
              <button className="gbtn" disabled={busy} onClick={() => { setEditText(String((fix.generated as Record<string, unknown>)[editableField])); setEditing((e) => !e); }}>✎ Edit</button>
            )}
            <button className="gbtn" onClick={onGenerate} disabled={busy}>↻ Regenerate</button>
            <button className="gbtn" onClick={onRequestReview} disabled={busy} title="Ping a teammate (assignee) to review this draft via Linear/Jira/Slack">✋ Request approval</button>
            {url && <a className="tbtn" href={url} target="_blank" rel="noreferrer">View source</a>}
          </>)}
          {isApproved && !armed && (<>
            <button className="xbtn" onClick={onArm} disabled={busy} style={{ background: 'var(--success)' }}>⬢ SHIP TO SITE</button>
            {stageable && (
              hasConnector
                ? <button className="gbtn" onClick={onStage} disabled={busy} style={{ padding: '7px 13px' }} title="Stage as a draft revision on your site and preview it before going live">⎘ Ship as draft</button>
                : <span className="xlbl" style={{ color: 'var(--text-3)' }}>pair the Connector to preview as a draft</span>
            )}
            <span className="xlbl" style={{ color: 'var(--text-2)' }}>approved · writes live</span>
          </>)}
          {isStaged && (() => {
            const publishing = fix.shipResult?.op === 'publish_content';
            return (<>
              <span className="chip" style={{ background: 'var(--info-50)', color: 'var(--info)', borderColor: 'var(--info)', fontSize: 11, padding: '6px 12px' }}>⎘ STAGED DRAFT</span>
              {fix.previewUrl
                ? <a className="xbtn" href={fix.previewUrl} target="_blank" rel="noreferrer" style={{ background: 'var(--info)' }}>↗ PREVIEW</a>
                : <span className="xlbl" style={{ color: 'var(--text-2)' }}>waiting for the Connector to build the preview…</span>}
              {publishing
                ? <span className="xlbl" style={{ color: 'var(--success)' }}>publishing… (your site applies it within ~5 min)</span>
                : <button className="xbtn" onClick={onPublish} disabled={busy} style={{ background: 'var(--success)' }}>⬢ PUBLISH LIVE</button>}
            </>);
          })()}
          {isApproved && armed && (
            <div className="nb-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%', padding: '13px 15px', background: 'var(--warn-50)', borderColor: 'var(--warn)', boxShadow: 'none' }}>
              <span className="disp" style={{ fontSize: 20 }}>⚠</span>
              <span style={{ flex: 1, minWidth: 170, fontSize: 12.5, lineHeight: 1.4, fontWeight: 500, color: 'var(--text)' }}>This publishes to your <b className="disp">LIVE</b> site and can&apos;t be auto-undone.</span>
              <button className="gbtn" onClick={onCancelArm} style={{ padding: '7px 13px' }}>Cancel</button>
              <button className="xbtn" onClick={onShipConfirm} disabled={busy || !canShip} style={{ background: 'var(--success)' }}>{canShip ? 'CONFIRM SHIP' : 'CONNECT CMS FIRST'}</button>
            </div>
          )}
          {isLive && (<>
            <span className="chip" style={{ background: 'var(--success-50)', color: 'var(--success)', borderColor: 'var(--success)', fontSize: 11, padding: '6px 12px' }}>✓ {s === 'verified' ? 'VERIFIED' : 'SHIPPED'}</span>
            <button className="gbtn" onClick={onRecheck} disabled={busy} style={{ padding: '7px 13px' }}>↻ Re-check</button>
            {revertable && <button className="gbtn" onClick={onRevert} disabled={busy} style={{ padding: '7px 13px' }}>⤺ Undo</button>}
            {url && <a className="tbtn" href={url} target="_blank" rel="noreferrer">View on site</a>}
          </>)}
          {s === 'reverted' && <span className="chip" style={{ background: 'var(--warn-50)', color: 'var(--warn)', borderColor: 'var(--warn)', fontSize: 11, padding: '6px 12px' }}>⤺ REVERTED</span>}
          {isAttention && (<button className="xbtn" onClick={onRetry} disabled={busy} style={{ background: 'var(--danger)' }}>↻ RETRY</button>)}
          {/* No-plugin fallback for site-root files (llms.txt / robots.txt). */}
          {downloadHref && !isDetected && !isReview && (
            <a className="gbtn" href={downloadHref} style={{ padding: '7px 13px' }} title="Download this file and drop it at your site root — no plugin needed">⬇ Download file</a>
          )}
          <span style={{ flex: 1 }} />
          <button className="tbtn" onClick={onTicket} disabled={busy} title={hasTracker ? 'Create a Linear/Jira issue for this fix' : 'Connect Linear or Jira (or a webhook) to hand this off'}>⊕ {hasTracker ? 'Ticket' : 'Hand off'}</button>
          <button className="tbtn" onClick={() => { if (!showHistory && !events) onLoadHistory(); setShowHistory((h) => !h); }}>{showHistory ? 'Hide history' : 'History'}</button>
        </div>

        {editing && isReview && editableField && (
          <div className="nb-sm" style={{ padding: 14, background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
            <div className="xlbl" style={{ color: 'var(--primary)' }}>Edit the draft ({editableField}) — your brand rules still apply on save</div>
            <textarea className="xin" rows={editText.length > 160 ? 5 : 2} value={editText} onChange={(e) => setEditText(e.target.value)} style={{ boxShadow: 'none', fontSize: 13, lineHeight: 1.5 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="gbtn" onClick={() => setEditing(false)} style={{ padding: '7px 13px' }}>Cancel</button>
              <button className="xbtn" disabled={busy || !editText.trim()} onClick={() => { onEditDraft(editableField, editText.trim()); setEditing(false); }} style={{ padding: '7px 13px' }}>SAVE DRAFT</button>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="nb-sm" style={{ padding: '12px 14px', boxShadow: 'none', background: 'var(--surface-2)' }}>
            <div className="xlbl" style={{ color: 'var(--primary)', marginBottom: 8 }}>Notes & assignee</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              <input className="xin" style={{ boxShadow: 'none', fontSize: 12 }} placeholder="Assignee (name or email)" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
              <textarea className="xin" style={{ boxShadow: 'none', fontSize: 12 }} rows={2} placeholder="Add a note for your team…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div><button className="gbtn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => onSaveMeta({ note, assignee })}>Save note</button></div>
            </div>
            <div className="xlbl" style={{ color: 'var(--primary)', marginBottom: 8 }}>Activity</div>
            {events && events.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {events.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
                    <span className="mono" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(ev.createdAt).toLocaleString()}</span>
                    <span className="disp" style={{ fontWeight: 600, color: 'var(--text)' }}>{ev.event}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>{events ? 'No activity recorded yet.' : 'Loading…'}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
