
// ─── STATE ────────────────────────────────────────────────────────
// Tokens are kept in-memory only; httpOnly cookies handle persistence across reloads
let token = '';
let refreshToken = '';
let currentUser = null;
let brands = [];
let currentBrandId = localStorage.getItem('livesov_brand') || '';
// Session flag indicates we might be logged in (actual auth is via httpOnly cookie)
const _hasSession = localStorage.getItem('livesov_session') === '1';
let keyStatus = {};
let runningQueries = false;
let liveResults = [];     // Accumulates results during streaming
let liveRunTime = null;   // Timestamp of current live run

// ── API RESPONSE CACHE (client-side) ──────────────────────────────
const _apiCache = new Map();
const API_CACHE_TTL = 30000; // 30s default TTL

function cachedApi(method, url, body, ttlMs) {
  if (method !== 'GET') return api(method, url, body);
  const key = url;
  const cached = _apiCache.get(key);
  if (cached && Date.now() - cached.ts < (ttlMs || API_CACHE_TTL)) return Promise.resolve(cached.data);
  return api(method, url, body).then(data => {
    _apiCache.set(key, { data, ts: Date.now() });
    // Evict old entries if cache grows too large
    if (_apiCache.size > 100) {
      const oldest = _apiCache.keys().next().value;
      _apiCache.delete(oldest);
    }
    return data;
  });
}

function invalidateCache(urlPrefix) {
  for (const key of _apiCache.keys()) {
    if (key.startsWith(urlPrefix)) _apiCache.delete(key);
  }
}

// ─── UTILS ────────────────────────────────────────────────────────
function el(id){ return document.getElementById(id); }
function debounce(fn, ms) { let t; return function(...a){ clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
const debouncedFilterMentions = debounce(() => { mentionsPage=0; renderMentions(); }, 250);
const debouncedFilterAdmin = debounce(filterAdminUsers, 250);
function skeletonHTML(rows) {
  rows = rows || 3;
  let h = '<div class="skeleton-wrap">';
  for (let i = 0; i < rows; i++) {
    const w = 40 + Math.random() * 50;
    h += '<div class="skeleton-line" style="width:' + Math.round(w) + '%;"></div>';
  }
  return h + '</div>';
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// Safe brand update — avoids brands[-1] corruption when findIndex returns -1
function updateBrandInList(updatedBrand) {
  const idx = brands.findIndex(x => x.id === updatedBrand.id);
  if (idx !== -1) brands[idx] = updatedBrand;
}
function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function safeBtoa(s){ try { return btoa(s); } catch(e) { return btoa(encodeURIComponent(s).replace(/%[0-9A-F]{2}/g,'')); } }
function safeHref(url){ return /^https?:\/\//i.test(url) ? esc(url) : '#'; }
// Simple markdown to HTML for AI responses
// Regex patterns pre-compiled once — avoids recompilation on each of 640+ calls per run
const _mdRe = {
  headers: /^#{1,4}\s+(.+)$/gm,
  bold: /\*\*(.+?)\*\*/g,
  bold2: /__(.+?)__/g,
  italic: /(?<!\w)\*([^*\n]+?)\*(?!\w)/g,
  ul: /^[\s]*[-*]\s+(.+)$/gm,
  ol: /^[\s]*(\d+)\.\s+(.+)$/gm,
  dblnl: /\n\n/g,
  nl: /\n/g
};
function mdToHtml(s){
  if (!s) return '';
  let h = esc(s);
  h = h.replace(_mdRe.headers, '<div style="font-weight:700;margin:10px 0 4px;">$1</div>');
  h = h.replace(_mdRe.bold, '<strong>$1</strong>');
  h = h.replace(_mdRe.bold2, '<strong>$1</strong>');
  h = h.replace(_mdRe.italic, '<em>$1</em>');
  h = h.replace(_mdRe.ul, '<div style="padding-left:16px;margin:2px 0;">• $1</div>');
  h = h.replace(_mdRe.ol, '<div style="padding-left:16px;margin:2px 0;">$1. $2</div>');
  h = h.replace(_mdRe.dblnl, '<div style="margin:8px 0;"></div>');
  h = h.replace(_mdRe.nl, '<br>');
  return h;
}
// Persistent error storage (survives page reloads and brand data refreshes)
function storeRunError(entry) {
  try {
    const errors = JSON.parse(localStorage.getItem('livesov_run_errors') || '[]');
    errors.unshift(entry);
    // Keep last 20 errors
    localStorage.setItem('livesov_run_errors', JSON.stringify(errors.slice(0, 20)));
  } catch(_e) { console.warn('[Livesov]', _e.message || _e); }
}
function getStoredRunErrors() {
  try { return JSON.parse(localStorage.getItem('livesov_run_errors') || '[]'); } catch(_) { return []; }
}
function clearStoredRunErrors() {
  localStorage.removeItem('livesov_run_errors');
}
function copyLogError(btn, json) {
  navigator.clipboard.writeText(json).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.borderColor = ''; btn.style.color = ''; }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Error'; }, 1500);
  });
}

// SOV color helper (green >= 40%, amber > 0%, red = 0%)
function sovColor(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; }

// Format milliseconds to human-readable time
function fmtTime(ms) { const totalSec = Math.floor(ms/1000); return totalSec >= 60 ? Math.floor(totalSec/60) + 'm ' + (totalSec%60) + 's' : totalSec + 's'; }

// Friendly error message for display
function friendlyError(msg){
  if (!msg) return 'Unknown error';
  const msgLower = msg.toLowerCase();
  if (msgLower.includes('rate limit') || msgLower.includes('rate_limit') || msgLower.includes('too many requests'))
    return 'Rate limited — too many requests. Retried automatically but limit persists. Try again in a few minutes.';
  if (msgLower.includes('exceed') && msgLower.includes('rate'))
    return 'Rate limited — request limit exceeded. Try again in a few minutes.';
  if (msgLower.includes('credit') || msgLower.includes('billing') || msgLower.includes('quota') || msgLower.includes('insufficient'))
    return 'No credits / quota exceeded. Check your API billing.';
  if (msgLower.includes('invalid') && (msgLower.includes('key') || msgLower.includes('auth')))
    return 'Invalid API key. Check your key in Settings.';
  if (msgLower.includes('timeout'))
    return 'Request timed out. The API took too long to respond.';
  return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
}
function brandHighlightRe(b){
  // Build regex that matches brand name + all aliases
  // Uses adaptive boundaries: \b for alphanumeric-only terms,
  // lookahead/lookbehind for terms with special chars (e.g. C++, C#)
  const terms = [b.name];
  if (b.aliases && b.aliases.length) terms.push(...b.aliases);
  const filtered = terms.filter(t=>t&&t.length>=2);
  if (!filtered.length) return null;
  // Sort longest first so longer matches take priority
  filtered.sort((x,y) => y.length - x.length);
  const patterns = filtered.map(t => {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // If term is purely word characters, use \b for precise matching
    if (/^\w+$/.test(t)) return '\\b' + esc + '\\b';
    // For terms with special chars (C++, C#, .NET), use lookaround for whitespace/boundary
    return '(?<![\\w])' + esc + '(?![\\w])';
  });
  return new RegExp('('+patterns.join('|')+')', 'gi');
}
function toast(msg, type='ok'){
  const toastEl = el('toast');
  toastEl.textContent = msg; toastEl.className = type;
  toastEl.style.display = 'block';
  setTimeout(() => toastEl.style.display='none', 3000);
}
function show(id){ const elem=el(id); if(elem) elem.style.display='block'; }
function hide(id){ const elem=el(id); if(elem) elem.style.display='none'; }
// ─── MODAL FOCUS TRAP ─────────────────────────────────────────────
let _prevFocus = null;
const _focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function closeModal(id){
  const e = el(id);
  if(e) e.classList.remove('open');
  if(_prevFocus) { _prevFocus.focus(); _prevFocus = null; }
}

function openModal(id){
  const e = el(id);
  if(!e) return;
  _prevFocus = document.activeElement;
  e.classList.add('open');
  // Focus first focusable element inside the modal
  const inner = e.querySelector('.modal, .add-brand-box');
  if(inner) {
    const first = inner.querySelector(_focusableSelector);
    if(first) requestAnimationFrame(() => first.focus());
  }
}

// Trap Tab key inside open modals
document.addEventListener('keydown', e => {
  if(e.key !== 'Tab') return;
  const openOverlay = document.querySelector('.overlay.open');
  if(!openOverlay) return;
  const inner = openOverlay.querySelector('.modal, .add-brand-box');
  if(!inner) return;
  const focusable = [...inner.querySelectorAll(_focusableSelector)].filter(f => f.offsetParent !== null);
  if(!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if(e.shiftKey) {
    if(document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if(document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
function copyResponse(){
  const text = el('resp-modal-text').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el('copy-resp-btn');
    btn.textContent = 'COPIED!';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    setTimeout(() => { btn.textContent = 'COPY RESPONSE'; btn.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)'; }, 2000);
  }).catch(() => toast('Copy failed', 'err'));
}

function copyQuery(query, btnEl){
  function onSuccess() {
    btnEl.innerHTML = '&#10003;';
    btnEl.style.color = 'var(--green)';
    setTimeout(() => { btnEl.innerHTML = '&#x2398;'; btnEl.style.color = ''; }, 1500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(query).then(onSuccess).catch(() => {
      // Fallback for non-secure contexts (HTTP)
      copyFallback(query) ? onSuccess() : toast('Copy failed', 'err');
    });
  } else {
    copyFallback(query) ? onSuccess() : toast('Copy failed', 'err');
  }
}
function copyFallback(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const copySuccess = document.execCommand('copy');
    document.body.removeChild(ta);
    return copySuccess;
  } catch(_) { return false; }
}

function brand(){
  return brands.find(b => b.id === currentBrandId) || null;
}

function updatePasswordStrength(pw){
  const container = el('pw-strength');
  if (!pw) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['var(--danger,var(--red))', 'var(--danger,var(--red))', 'var(--warning,var(--amber))', 'var(--success,var(--green))', 'var(--success,var(--green))'];
  const labels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  for (let i = 1; i <= 4; i++) {
    el('pw-bar-' + i).style.background = i <= score ? colors[score] : 'var(--border)';
  }
  el('pw-strength-text').textContent = labels[score];
  el('pw-strength-text').style.color = colors[score];
}
