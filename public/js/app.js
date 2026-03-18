// ─── LAZY-LOAD CHART.JS ──────────────────────────────────────────
// Chart.js (~200KB) is only loaded when a chart view is first opened,
// saving bandwidth on initial page load for all users.
let _chartJsLoaded = false;
let _chartJsPromise = null;
function ensureChartJs() {
  if (_chartJsLoaded || typeof Chart != 'undefined') { _chartJsLoaded = true; return Promise.resolve(); }
  if (_chartJsPromise) return _chartJsPromise;
  _chartJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => { _chartJsLoaded = true; resolve(); };
    s.onerror = () => { _chartJsPromise = null; reject(new Error('Failed to load Chart.js')); };
    document.head.appendChild(s);
  });
  return _chartJsPromise;
}

// ─── PAUSE ANIMATIONS WHEN TAB HIDDEN ────────────────────────────
// CSS animations and transitions keep burning GPU/CPU even when the tab
// is in the background. Pause them via a class on <body>.
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('tab-hidden', document.hidden);
});

// ─── LANDING / AUTH NAVIGATION ────────────────────────────────────
function showAuth(tab){
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('landing-page').style.display = 'none';
  el('auth-page').style.display = 'flex';
  el('app').style.display = 'none';
  authTab(tab || 'login');
  // Lazily load Google Sign-In when auth page is shown
  if (!googleClientId) initGoogleSignIn();
}
function showLanding(){
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('landing-page').style.display = 'block';
  el('auth-page').style.display = 'none';
  el('app').style.display = 'none';
}
function toggleLandingMenu(){
  var menu = el('land-nav-menu');
  if(menu) menu.classList.toggle('open');
}
function closeLandingMenu(){
  var menu = el('land-nav-menu');
  if(menu) menu.classList.remove('open');
}

// ─── CONSTANTS ────────────────────────────────────────────────────
const API = '';  // relative URLs - same server
const PLATS = ['ChatGPT','Perplexity','Claude','Gemini','Grok','Google AIO','DeepSeek'];
const PLAT_THEME = {
  'ChatGPT':    {bg:'rgba(25,195,125,.06)',color:'#19c37d',logo:'⬡'},
  'Perplexity': {bg:'rgba(155,114,255,.06)',color:'#9b72ff',logo:'◎'},
  'Claude':     {bg:'rgba(217,119,6,.06)',color:'#d97706',logo:'◈'},
  'Gemini':     {bg:'rgba(66,133,244,.06)',color:'#4285f4',logo:'✦'},
  'Grok':       {bg:'rgba(29,155,240,.06)',color:'#1d9bf0',logo:'⚡'},
  'Google AIO': {bg:'rgba(52,168,83,.06)',color:'#34a853',logo:'⬤'},
  'DeepSeek':   {bg:'rgba(74,158,255,.06)',color:'#4a9eff',logo:'◇'},
};

// ─── STATE ────────────────────────────────────────────────────────
// Tokens are kept in-memory only; httpOnly cookies handle persistence across reloads
let token = '';
let refreshToken = '';
let currentUser = null;
let brands = [];
let currentBrandId = localStorage.getItem('trackly_brand') || '';
// Session flag indicates we might be logged in (actual auth is via httpOnly cookie)
const _hasSession = localStorage.getItem('trackly_session') === '1';
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
    const errors = JSON.parse(localStorage.getItem('trackly_run_errors') || '[]');
    errors.unshift(entry);
    // Keep last 20 errors
    localStorage.setItem('trackly_run_errors', JSON.stringify(errors.slice(0, 20)));
  } catch(_e) { console.warn('[Trackly]', _e.message || _e); }
}
function getStoredRunErrors() {
  try { return JSON.parse(localStorage.getItem('trackly_run_errors') || '[]'); } catch(_) { return []; }
}
function clearStoredRunErrors() {
  localStorage.removeItem('trackly_run_errors');
}

// Friendly error message for display
function friendlyError(msg){
  if (!msg) return 'Unknown error';
  const m = msg.toLowerCase();
  if (m.includes('rate limit') || m.includes('rate_limit') || m.includes('too many requests'))
    return 'Rate limited — too many requests. Retried automatically but limit persists. Try again in a few minutes.';
  if (m.includes('exceed') && m.includes('rate'))
    return 'Rate limited — request limit exceeded. Try again in a few minutes.';
  if (m.includes('credit') || m.includes('billing') || m.includes('quota') || m.includes('insufficient'))
    return 'No credits / quota exceeded. Check your API billing.';
  if (m.includes('invalid') && (m.includes('key') || m.includes('auth')))
    return 'Invalid API key. Check your key in Settings.';
  if (m.includes('timeout'))
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
  const t = el('toast');
  t.textContent = msg; t.className = type;
  t.style.display = 'block';
  setTimeout(() => t.style.display='none', 3000);
}
function show(id){ const e=el(id); if(e) e.style.display='block'; }
function hide(id){ const e=el(id); if(e) e.style.display='none'; }
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
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
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

// Token refresh lock — prevents multiple simultaneous refresh attempts
let _refreshPromise = null;

async function api(method, path, data){
  // Longer timeout for run endpoints (5 min), default 30s for other calls
  const timeoutMs = path.includes('/run') ? 300000 : 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    signal: controller.signal,
    credentials: 'include'
  };
  if (data) opts.body = JSON.stringify(data);
  let res;
  try { res = await fetch(API + path, opts); } catch(e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw new Error('Unable to connect to the server. Please check your connection and try again.');
  }
  clearTimeout(timeoutId);
  // Auto-refresh token on 401 (not for auth endpoints themselves). Don't check in-memory refreshToken — httpOnly cookie handles it on page reload.
  if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register' && path !== '/api/auth/refresh') {
    try {
      // Use shared promise to prevent concurrent refresh attempts
      if (!_refreshPromise) {
        _refreshPromise = fetch(API + '/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          credentials: 'include'
        }).then(async (refreshRes) => {
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            token = refreshData.token;
            refreshToken = refreshData.refreshToken;
            return true;
          }
          return false;
        }).catch(() => false).finally(() => { _refreshPromise = null; });
      }
      const refreshOk = await _refreshPromise;
      if (refreshOk) {
        // Retry original request with new token
        opts.headers['Authorization'] = 'Bearer ' + token;
        res = await fetch(API + path, opts);
      } else {
        doLogout();
        throw new Error('Session expired. Please log in again.');
      }
    } catch(e) {
      doLogout();
      throw new Error('Session expired. Please log in again.');
    }
  }
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      doLogout();
      throw new Error('Session expired. Please log in again.');
    }
    // Auto-show upgrade modal on plan limit errors
    if (json.planLimit) {
      showUpgradeModal(json.error);
    }
    // Rate limit — include retry info in error message
    if (res.status === 429 && json.retryAfter) {
      throw new Error(`Rate limited — please wait ${json.retryAfter} seconds before retrying.`);
    }
    throw new Error(json.error || 'Request failed');
  }
  return json;
}

// ─── PASSWORD VISIBILITY TOGGLE ──────────────────────────────────
function togglePasswordVisibility(inputId, btn) {
  const input = el(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  const open = btn.querySelector('.pw-eye-open');
  const closed = btn.querySelector('.pw-eye-closed');
  if (open) open.style.display = isPassword ? 'none' : 'block';
  if (closed) closed.style.display = isPassword ? 'block' : 'none';
}

// ─── GOOGLE SIGN-IN ──────────────────────────────────────────────
let googleClientId = null;

async function initGoogleSignIn() {
  try {
    // Use already-fetched config if available
    if (window.__GOOGLE_CLIENT_ID) {
      googleClientId = window.__GOOGLE_CLIENT_ID;
    } else {
      const config = await fetch('/api/config').then(r => r.json());
      if (!config.googleClientId) return;
      googleClientId = config.googleClientId;
    }

    // Load Google Identity Services script lazily
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {};
    document.head.appendChild(script);
  } catch(e) {
    // Google Sign-In not available — silently skip
  }
}

async function triggerGoogleSignIn() {
  if (!googleClientId && !window.__GOOGLE_CLIENT_ID) {
    el('auth-err').textContent = 'Google Sign-In is not configured. Please use email and password to sign in.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (!window.google) {
    el('auth-err').textContent = 'Google Sign-In is loading. Please try again in a moment.';
    el('auth-err').style.display = 'block';
    loadGoogleScript();
    return;
  }

  google.accounts.id.initialize({
    client_id: googleClientId || window.__GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential
  });
  google.accounts.id.prompt();
}

async function handleGoogleCredential(response) {
  if (!response.credential) return;
  el('auth-err').style.display = 'none';
  try {
    const data = await api('POST', '/api/auth/google', { credential: response.credential });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('trackly_session', '1');
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────
function authTab(tab){
  document.querySelectorAll('.auth-tab').forEach((t,i) => {
    t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register'));
  });
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + tab);
  if (panel) panel.classList.add('active');
  el('auth-err').style.display = 'none';
  // Google buttons are always visible in HTML — they show a helpful message if not configured
}

async function doLogin(){
  const email = el('login-email').value.trim();
  const password = el('login-pass').value;
  const totpInput = el('login-totp');
  const totpCode = totpInput ? totpInput.value.trim() : '';
  el('auth-err').style.display = 'none';
  const btn = document.querySelector('#panel-login .btn-primary');
  if (!email || !password) {
    el('auth-err').textContent = 'Email/username and password are required.';
    el('auth-err').style.display = 'block';
    return;
  }
  btn.disabled = true; btn.textContent = 'LOGGING IN...';
  try {
    const body = { email, password };
    if (totpCode) body.totpCode = totpCode;
    const data = await api('POST', '/api/auth/login', body);
    // Handle 2FA challenge — server returns requires2FA when TOTP is needed
    if (data.requires2FA) {
      const wrap = el('login-2fa-wrap');
      if (wrap) { wrap.style.display = 'block'; }
      if (totpInput) { totpInput.focus(); }
      btn.disabled = false; btn.textContent = 'VERIFY & LOG IN';
      return;
    }
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('trackly_session', '1');
    // Reset 2FA UI on successful login
    const wrap = el('login-2fa-wrap');
    if (wrap) wrap.style.display = 'none';
    if (totpInput) totpInput.value = '';
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = el('login-2fa-wrap')?.style.display === 'none' ? 'LOG IN' : 'VERIFY & LOG IN';
  }
}

async function doRegister(){
  const name = el('reg-name').value.trim();
  const username = el('reg-username').value.trim();
  const email = el('reg-email').value.trim();
  const password = el('reg-pass').value;
  el('auth-err').style.display = 'none';
  if (!email || !password) {
    el('auth-err').textContent = 'Email and password are required.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    el('auth-err').textContent = 'Please enter a valid email address.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (password.length < 8) {
    el('auth-err').textContent = 'Password must be at least 8 characters.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    el('auth-err').textContent = 'Password should contain at least one uppercase letter and one number.';
    el('auth-err').style.display = 'block';
    return;
  }
  const btn = document.querySelector('#panel-register .btn-primary');
  btn.disabled = true; btn.textContent = 'CREATING ACCOUNT...';
  try {
    const data = await api('POST', '/api/auth/register', { name, username: username || undefined, email, password });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('trackly_session', '1');
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  }
}

function showForgotPassword(){
  authTab('forgot');
}

async function doForgotPassword(){
  const email = el('forgot-email').value.trim();
  const msgEl = el('forgot-msg');
  if (!email) { msgEl.textContent = 'Please enter your email.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const btn = document.querySelector('#panel-forgot .btn-primary');
  btn.disabled = true; btn.textContent = 'SENDING...';
  try {
    const data = await api('POST', '/api/auth/forgot-password', { email });
    msgEl.textContent = data.message || 'Reset link sent. Check your email.';
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.background = 'var(--success-light,rgba(255,97,84,.05))';
    msgEl.style.display = 'block';
  } catch(e) {
    msgEl.textContent = e.message; msgEl.style.borderColor = 'var(--danger,var(--red))'; msgEl.style.color = 'var(--danger,var(--red))'; msgEl.style.background = 'var(--danger-light,rgba(255,68,85,.05))';
    msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'SEND RESET LINK';
  }
}

async function doResetPassword(){
  const pw = el('reset-pass').value;
  const pw2 = el('reset-pass-confirm').value;
  const msgEl = el('reset-msg');
  if (!pw || pw.length < 8) { msgEl.textContent = 'Password must be at least 8 characters.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  if (pw !== pw2) { msgEl.textContent = 'Passwords do not match.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  if (!resetToken || resetToken.length < 32) { msgEl.textContent = 'Invalid or malformed reset link.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const btn = document.querySelector('#panel-reset .btn-primary');
  btn.disabled = true; btn.textContent = 'RESETTING...';
  try {
    const data = await api('POST', '/api/auth/reset-password', { token: resetToken, newPassword: pw });
    msgEl.textContent = data.message || 'Password reset! You can now log in.';
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.display = 'block';
    setTimeout(() => { window.location.href = '/'; }, 2000);
  } catch(e) {
    msgEl.textContent = e.message; msgEl.style.borderColor = 'var(--danger,var(--red))'; msgEl.style.color = 'var(--danger,var(--red))'; msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'RESET PASSWORD';
  }
}

// ─── PASSWORD VISIBILITY TOGGLE ──────────────────────────────────
function togglePwVis(btn){
  const inp = btn.parentElement.querySelector('input');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

// ─── GOOGLE SIGN-IN ─────────────────────────────────────────────
let _googleScriptLoaded = false;
function loadGoogleScript(){
  if (_googleScriptLoaded) return;
  _googleScriptLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}
// Load Google script when auth page is shown
const _origShowAuth = showAuth;
showAuth = function(tab){
  _origShowAuth(tab);
  loadGoogleScript();
};

async function doGoogleLogin(){
  el('auth-err').style.display = 'none';

  try {
    // Wait for Google script to load
    if (typeof google === 'undefined' || !google.accounts) {
      loadGoogleScript();
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const check = setInterval(() => {
          attempts++;
          if (typeof google !== 'undefined' && google.accounts) { clearInterval(check); resolve(); }
          else if (attempts > 50) { clearInterval(check); reject(new Error('Google Sign-In failed to load. Please try again.')); }
        }, 100);
      });
    }

    // Use Google One Tap / popup
    const credential = await new Promise((resolve, reject) => {
      google.accounts.id.initialize({
        client_id: window.__GOOGLE_CLIENT_ID || googleClientId || '',
        callback: (response) => {
          if (response.credential) resolve(response.credential);
          else reject(new Error('Google sign-in was cancelled.'));
        },
        auto_select: false,
        cancel_on_tap_outside: false
      });
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: use the button flow with popup
          google.accounts.oauth2 ? reject(new Error('Google popup blocked. Allow popups and try again.')) : reject(new Error('Google Sign-In not available. Check your browser settings.'));
        }
      });
    });

    const data = await api('POST', '/api/auth/google', { credential });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('trackly_session', '1');
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message || 'Google sign-in failed. Please try again.';
    el('auth-err').style.display = 'block';
  }
}

function doLogout(){
  // Clear httpOnly cookies via server endpoint (best-effort)
  if (token || _hasSession) {
    fetch(API + '/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
  }
  token = '';
  refreshToken = '';
  currentUser = null;
  brands = [];
  currentBrandId = '';
  localStorage.removeItem('trackly_session');
  localStorage.removeItem('trackly_brand');
  // Close all open overlays/modals
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('app').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('landing-page').style.display = 'block';
      history.replaceState(null, '', '/');
}

// ─── APP INIT ─────────────────────────────────────────────────────
async function initApp(){
  el('landing-page').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('app').style.display = 'grid';
      if (window.location.pathname !== '/dashboard') history.replaceState(null, '', '/dashboard');

  // Update topbar
  el('user-email-badge').textContent = currentUser.email;
  const pb = el('plan-badge');
  pb.textContent = (currentUser.plan||'free').toUpperCase();
  pb.className = 'plan-badge ' + (currentUser.plan||'free');

  // Show admin nav if user is admin, or "Become Admin" button if no admin exists yet
  const adminNav = el('nav-admin');
  const becomeAdminNav = el('nav-become-admin');
  // Show/hide Run Queries button based on role
  const runBtn = el('run-btn');
  if (runBtn) runBtn.style.display = '';

  // Show Team nav for agency+ plans
  const teamNav = el('nav-team');
  if (teamNav) teamNav.style.display = (['agency', 'enterprise', 'owner'].includes(currentUser.plan) || currentUser.role === 'admin') ? 'block' : 'none';

  if (currentUser.role === 'admin') {
    if (adminNav) adminNav.style.display = 'block';
    if (becomeAdminNav) becomeAdminNav.style.display = 'none';
  } else {
    if (adminNav) adminNav.style.display = 'none';
    // Check if any admin exists — if not, show the "Become Admin" button
    if (becomeAdminNav) {
      try {
        const resp = await api('GET', '/api/admin/check-admin');
        becomeAdminNav.style.display = resp.hasAdmin ? 'none' : 'block';
      } catch(e) { becomeAdminNav.style.display = 'block'; }
    }
  }

  // Load brands
  const data = await cachedApi('GET', '/api/brands', null, 15000);
  brands = data.brands || [];

  // Load notifications
  initNotifications();

  // Load key status
  try {
    const ks = await api('GET', '/api/keys/status');
    keyStatus = ks;
  } catch(e) {}

  // Populate brand select
  renderBrandSelect();

  if (brands.length === 0) {
    // Show add brand modal
    openModal('add-brand-modal');
  } else {
    if (!currentBrandId || !brands.find(b => b.id === currentBrandId)) {
      currentBrandId = brands[0].id;
    }
    el('brand-select').value = currentBrandId;
    closeModal('add-brand-modal');
    renderAll();
  }

  // Check if there's a query run still active on the server (e.g. user closed tab and reopened)
  checkActiveRun();
}

function renderBrandSelect(){
  const sel = el('brand-select');
  sel.innerHTML = '<option value="">-- Select brand --</option>';
  brands.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.name;
    sel.appendChild(opt);
  });
  sel.value = currentBrandId;
}

function switchBrand(id){
  currentBrandId = id;
  localStorage.setItem('trackly_brand', id);
  // Clear live results to prevent mixing data from different brands
  if (!runningQueries) {
    liveResults = [];
  }
  const b = brand();
  if (b) renderAll();
}

// ─── NAVIGATION ───────────────────────────────────────────────────
let currentView = 'overview';
function toggleMobileMenu(){
  const sidebar = document.querySelector('.sidebar');
  const overlay = el('mobile-overlay');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('active');
}
function closeMobileMenu(){
  document.querySelector('.sidebar').classList.remove('mobile-open');
  el('mobile-overlay').classList.remove('active');
}
function go(view){
  // Clean up chart instances when leaving views to prevent memory leaks
  if (currentView === 'trends') {
    if (sovChartInstance) { sovChartInstance.destroy(); sovChartInstance = null; }
    if (platSovChartInstance) { platSovChartInstance.destroy(); platSovChartInstance = null; }
  }
  if (currentView === 'overview' && window._ovMiniChart) {
    window._ovMiniChart.destroy(); window._ovMiniChart = null;
  }
  if (currentView === 'promptdetails') {
    if (_pdVisChart) { _pdVisChart.destroy(); _pdVisChart = null; }
    if (_pdCompChart) { _pdCompChart.destroy(); _pdCompChart = null; }
  }
  // Clear run age timer when leaving overview to prevent memory leak
  if (currentView === 'overview' && _runAgeTimer) {
    clearInterval(_runAgeTimer);
    _runAgeTimer = null;
  }
  currentView = view;
  closeMobileMenu();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const v = el('view-'+view);
  if (v) v.classList.add('active');
  // Scroll main content to top when switching tabs
  const mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') === "go('"+view+"')") n.classList.add('active');
  });
  renderView(view);
}

function switchActivityTab(btn, tabId) {
  document.querySelectorAll('.al-tab').forEach(b => b.classList.remove('al-tab-active'));
  document.querySelectorAll('.al-tab-content').forEach(t => t.style.display = 'none');
  btn.classList.add('al-tab-active');
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display = 'block';
}

function renderView(view){
  const b = brand();
  if (view==='account') { renderAccount(); loadModelSettings(); load2FAStatus(); return; }
  if (view==='admin')   { renderAdmin(); return; }
  if (view==='activitylog') { renderActivityLog(); renderApiLogs(); renderApiKeyStatus(); return; }
  // Redirect old standalone notifications/apilogs to merged views
  if (view==='notifications') { go('alerts'); return; }
  if (view==='apilogs') { go('activitylog'); return; }
  if (view==='team') { renderTeamMembers(); return; }
  if (!b) {
    // Show global empty state when no brand exists or is selected
    const noBrands = !brands.length;
    // Hide all view sections to avoid blank space
    document.querySelectorAll('.view').forEach(v => {
      if (v.style) v.style.display = 'none';
    });
    // Show or create the global empty state
    let emptyEl = document.getElementById('global-no-brand');
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.id = 'global-no-brand';
      emptyEl.className = 'global-empty-state';
      const mainContent = document.querySelector('.main');
      if (mainContent) mainContent.appendChild(emptyEl);
    }
    emptyEl.style.display = 'flex';
    if (noBrands) {
      emptyEl.innerHTML = '<div class=\"global-empty-icon\">🚀</div>' +
        '<h2 class=\"global-empty-title\">Welcome to Trackly!</h2>' +
        '<p class=\"global-empty-desc\">Start by adding your first brand to track how AI platforms mention your business across ChatGPT, Perplexity, Claude, Gemini, and more.</p>' +
        '<button class=\"global-empty-btn\" onclick=\"openAddBrand()\">+ Add Your First Brand</button>';
    } else {
      emptyEl.innerHTML = '<div class=\"global-empty-icon\">📋</div>' +
        '<h2 class=\"global-empty-title\">Select a Brand</h2>' +
        '<p class=\"global-empty-desc\">Choose a brand from the dropdown above to view your AI visibility dashboard.</p>';
    }
    return;
  }
  // Remove no-brand messages and global empty state when brand is available
  document.querySelectorAll('.no-brand-msg').forEach(m => m.remove());
  const _globalEmpty = document.getElementById('global-no-brand');
  if (_globalEmpty) _globalEmpty.style.display = 'none';
  // Restore view sections visibility
  document.querySelectorAll('.view').forEach(v => {
    v.style.display = '';
  });
  if (view==='overview') {
    renderOverview();
    if (runningQueries) setupLiveFeed();
    else hideLiveFeed();
  }
  if (view==='mentions') {
    if (runningQueries) setupLiveMentions();
    else renderMentions();
  }
  if (view==='proof') {
    if (runningQueries) setupLiveProof();
    else renderProof();
  }
  if (view==='platforms')   renderPlatformStatus();
  if (view==='qperf')       renderQPerf();
  if (view==='trends')      renderTrends();
  if (view==='competitors') renderCompetitors();
  if (view==='setup')       renderSetup();
  if (view==='alerts')          { renderAlerts(); renderNotificationPrefs(); }
  if (view==='promptdetails')   renderPromptDetails();
  if (view==='recommendations') renderRecommendations();
  if (view==='accuracy')        renderAccuracyMonitor();
  if (view==='citations')       renderCitationAnalysis();
  if (view==='copilot')         { /* copilot is interactive, no auto-render */ }
  if (view==='billing')         renderBilling();
}

// ─── ACCOUNT & PLAN ──────────────────────────────────────────────
function getUserLimits() {
  return (currentUser && currentUser.limits) || { brands: 1, prompts: 3, queries: 3, competitors: 0, platforms: 2, sentiment: false };
}

function renderAccount(){
  if (!currentUser) return;
  el('acct-email').textContent = currentUser.email;
  // Username
  const usernameEl = el('acct-username');
  if (usernameEl) usernameEl.textContent = currentUser.username ? '@' + currentUser.username : '—';
  // Email verification status
  const verifyEl = el('acct-email-verify');
  if (verifyEl) {
    if (currentUser.emailVerified) {
      verifyEl.innerHTML = '<span class="badge pos">VERIFIED</span>';
    } else {
      verifyEl.innerHTML = '<span class="badge neg">UNVERIFIED</span> <button onclick="resendVerification()" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--amber);color:var(--amber);padding:3px 8px;cursor:pointer;border-radius:var(--radius-xs);">RESEND VERIFICATION</button>';
    }
  }
  const planEl = el('acct-plan');
  planEl.textContent = currentUser.plan || 'free';
  planEl.style.color = currentUser.plan === 'agency' ? 'var(--purple)' : currentUser.plan === 'pro' ? 'var(--green)' : 'var(--muted)';
  el('acct-since').textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';


  // Usage stats
  const limits = getUserLimits();
  const brandCount = brands.length;
  const b = brand();
  const queryCount = b ? (b.queries || []).length : 0;
  const compCount = b ? (b.competitors || []).length : 0;
  const today = new Date().toISOString().split('T')[0];
  const todayRuns = b ? (b.runs || []).filter(r => (r.date || '').startsWith(today)).length : 0;

  const usageHtml = `
    <div style="display:grid;gap:12px;margin-top:8px;">
      ${usageBar('Brands', brandCount, limits.brands)}
      ${usageBar('Total prompts', brands.reduce((s,br)=>s+(br.queries||[]).length,0), limits.prompts)}
      ${usageBar('Platforms', limits.platforms, 7)}
      ${usageBar('Competitors', compCount, limits.competitors)}
    </div>
  `;
  el('acct-usage').innerHTML = usageHtml;

  // Plan cards
  const planData = [
          { id: 'free', name: 'Free', price: '$0', features: '1 brand, 2 platforms, 50 prompts/month' },
                { id: 'pro', name: 'Pro', price: '$35/mo', features: '5 brands, 7 platforms, 500 prompts/month, competitors, sentiment' },
                      { id: 'agency', name: 'Agency', price: '$89/mo', features: '20 brands, 7 platforms, 2000 prompts/month, 20 competitors, sentiment' }
  ];
  const current = currentUser.plan || 'free';
  el('acct-plans').innerHTML = planData.map(p => `
    <div class="upgrade-plan-card ${p.id === current ? 'active' : ''}" data-plan="${p.id}">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;${p.id==='pro'?'color:var(--green);':p.id==='agency'?'color:var(--purple);':''}">${p.name}</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:8px;">${p.price}</div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--muted);line-height:1.7;">${p.features}</div>
      <button class="btn-upgrade ${p.id === current ? 'current' : ''}" onclick="doUpgrade('${p.id}')" ${p.id === current ? 'disabled' : ''}>${p.id === current ? 'CURRENT PLAN' : 'SWITCH TO ' + p.name.toUpperCase()}</button>
    </div>
  `).join('');
}

// ── Model Settings ────────────────────────────────────
let platformModels = null;

async function loadModelSettings() {
  const container = el('model-settings');
  if (!container) return;
  try {
    // Load available models
    if (!platformModels) {
      const resp = await cachedApi('GET', '/api/models', null, 60000);
      platformModels = resp.models || {};
    }
    // Load current user settings
    const settingsResp = await api('GET', '/api/settings');
    const currentModels = (settingsResp.settings && settingsResp.settings.models) || {};
    const enabledPlatforms = (settingsResp.settings && settingsResp.settings.enabledPlatforms) || {};

    const platformIcons = {
      'ChatGPT': '<span style="color:#74aa9c;">&#9675;</span>',
      'Claude': '<span style="color:#d97706;">&#9670;</span>',
      'Gemini': '<span style="color:#4285f4;">&#9733;</span>',
      'Grok': '<span style="color:#1da1f2;">&#9889;</span>',
      'Perplexity': '<span style="color:#20b2aa;">&#9678;</span>',
      'DeepSeek': '<span style="color:#6366f1;">&#9673;</span>',
      'Google AIO': '<span style="color:#ea4335;">&#9733;</span>'
    };

    let html = '<div style="display:grid;gap:10px;">';
    for (const [platform, models] of Object.entries(platformModels)) {
      const currentModel = currentModels[platform] || models.find(m => m.default)?.id || models[0]?.id;
      const icon = platformIcons[platform] || '';
      // Default to enabled if not explicitly set
      const isEnabled = enabledPlatforms[platform] !== false;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border);border-radius:var(--radius);${isEnabled?'':'opacity:0.5;'}">
        <label class="toggle-switch" style="flex-shrink:0;">
          <input type="checkbox" class="platform-toggle" data-platform="${platform}" ${isEnabled?'checked':''} onchange="togglePlatformRow(this)">
          <span class="toggle-slider"></span>
        </label>
        <div style="font-family:var(--mono);font-size:11px;font-weight:700;min-width:90px;">${icon} ${platform}</div>
        <select class="finput model-select" data-platform="${platform}" style="margin:0;flex:1;font-size:11px;padding:4px 8px;height:28px;" ${isEnabled?'':'disabled'}>
          ${models.map(m => `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </div>`;
    }
    html += '</div>';
    html += '<div id="gemini-aio-warning" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:var(--radius);font-size:11px;font-family:var(--mono);color:#eab308;">Note: Gemini and Google AIO use the same API — enabling both doubles your Gemini API costs.</div>';
    container.innerHTML = html;
    checkGeminiAioOverlap();
  } catch(e) {
    container.innerHTML = '<div style="color:var(--muted);font-family:var(--mono);font-size:10px;">Failed to load model settings</div>';
  }
}

function checkGeminiAioOverlap() {
  const toggles = document.querySelectorAll('.platform-toggle');
  let geminiOn = false, aioOn = false;
  toggles.forEach(t => {
    if (t.dataset.platform === 'Gemini' && t.checked) geminiOn = true;
    if (t.dataset.platform === 'Google AIO' && t.checked) aioOn = true;
  });
  const warning = document.getElementById('gemini-aio-warning');
  if (warning) warning.style.display = (geminiOn && aioOn) ? 'block' : 'none';
}

function togglePlatformRow(cb) {
  let rowDiv = cb.parentElement;
  while (rowDiv && !rowDiv.querySelector('.model-select')) rowDiv = rowDiv.parentElement;
  if (!rowDiv) return;
  const sel = rowDiv.querySelector('.model-select');
  if (cb.checked) {
    rowDiv.style.opacity = '1';
    if (sel) sel.disabled = false;
  } else {
    rowDiv.style.opacity = '0.5';
    if (sel) sel.disabled = true;
  }
  checkGeminiAioOverlap();
}

async function saveModelSettings() {
  const btn = el('btn-save-models');
  const status = el('model-save-status');
  btn.disabled = true;
  btn.textContent = 'SAVING...';
  status.style.display = 'none';
  try {
    const models = {};
    const enabledPlatforms = {};
    document.querySelectorAll('.model-select').forEach(sel => {
      models[sel.dataset.platform] = sel.value;
    });
    document.querySelectorAll('.platform-toggle').forEach(cb => {
      enabledPlatforms[cb.dataset.platform] = cb.checked;
    });
    await api('PUT', '/api/settings', { settings: { models, enabledPlatforms } });
    status.textContent = 'SAVED';
    status.style.color = 'var(--green)';
    status.style.display = 'inline';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  } catch(e) {
    status.textContent = 'FAILED';
    status.style.color = 'var(--red)';
    status.style.display = 'inline';
  } finally {
    btn.disabled = false;
    btn.textContent = 'SAVE MODEL SETTINGS';
  }
}

async function changePassword() {
  const cur = el('pw-current').value;
  const nw = el('pw-new').value;
  const confirm = el('pw-confirm').value;
  if (!cur || !nw) { toast('Fill in all password fields', 'err'); return; }
  if (nw.length < 8) { toast('New password must be at least 8 characters', 'err'); return; }
  if (nw !== confirm) { toast('New passwords do not match', 'err'); return; }
  try {
    await api('POST', '/api/auth/change-password', { currentPassword: cur, newPassword: nw });
    el('pw-current').value = '';
    el('pw-new').value = '';
    el('pw-confirm').value = '';
    toast('Password updated successfully', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function promptSetUsername(){
  const current = currentUser.username || '';
  const newUsername = prompt('Enter your username (letters, numbers, dots, dashes, underscores):', current);
  if (newUsername === null) return;
  const trimmed = newUsername.trim().toLowerCase();
  if (trimmed && trimmed.length < 3) { toast('Username must be at least 3 characters', 'err'); return; }
  try {
    const data = await api('PUT', '/api/auth/username', { username: trimmed || null });
    currentUser.username = data.username;
    el('acct-username').textContent = data.username ? '@' + data.username : '—';
    toast(data.username ? 'Username set to @' + data.username : 'Username removed', 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

async function deleteAccount() {
  const pw = prompt('Type your password to confirm account deletion:');
  if (!pw) return;
  if (!confirm('Are you sure? This will permanently delete your account and all brands. This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/auth/account', { password: pw });
    localStorage.removeItem('trackly_session');
    location.reload();
  } catch(e) { toast(e.message, 'err'); }
}


// ── Data Export ────────────────────────────────────────
async function _downloadViaFetch(url, filename) {
  try {
    const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!resp.ok) throw new Error('Download failed');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch(e) {
    toast('Export failed: ' + e.message, 'err');
  }
}
function exportAllData() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  _downloadViaFetch(API + '/api/export/brand/' + b.id, `trackly-${b.name || 'brand'}-export.json`);
}
function exportAllBrandsData() {
  _downloadViaFetch(API + '/api/export/all', 'trackly-full-export.json');
}
function exportBrandCSV() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  _downloadViaFetch(API + '/api/export/brand/' + b.id + '/csv', `trackly-${b.name || 'brand'}-data.csv`);
}

// ── Brand Import ──────────────────────────────────────
async function importBrandConfig(fileInput){
  const file = fileInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // Support both single brand export and full export format
    const brandData = data.brand || data;
    if (!brandData.name) { toast('Invalid brand file — missing name', 'err'); return; }
    const payload = {
      name: brandData.name,
      industry: brandData.industry || '',
      website: brandData.website || '',
      city: brandData.city || '',
      competitors: brandData.competitors || [],
      queries: brandData.queries || [],
      aliases: brandData.aliases || []
    };
    const result = await api('POST', '/api/brands', payload);
    invalidateCache('/api/brands');
    brands.push(result.brand);
    currentBrandId = result.brand.id;
    localStorage.setItem('trackly_brand', currentBrandId);
    renderBrandSelect();
    el('brand-select').value = currentBrandId;
    renderAll();
    toast('Brand "' + payload.name + '" imported successfully', 'ok');
  } catch(e) {
    toast('Import failed: ' + e.message, 'err');
  }
  fileInput.value = '';
}

// ── Email Verification ────────────────────────────────
async function resendVerification() {
  try {
    const data = await api('POST', '/api/auth/resend-verification');
    toast(data.message || 'Verification email sent', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// ── Notifications ─────────────────────────────────────
let notifOpen = false;
async function loadNotifications() {
  try {
    const data = await api('GET', '/api/notifications');
    const badge = el('notif-badge');
    if (data.unread > 0) {
      badge.textContent = data.unread > 9 ? '9+' : data.unread;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
    return data;
  } catch(e) { return { notifications: [], unread: 0 }; }
}
async function toggleNotifications() {
  const dd = el('notif-dropdown');
  notifOpen = !notifOpen;
  if (!notifOpen) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = '<div style="padding:12px;font-family:var(--mono);font-size:10px;color:var(--muted);">Loading...</div>';
  const data = await loadNotifications();
  const notifs = data.notifications || [];
  if (!notifs.length) {
    dd.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);">No notifications</div>';
    return;
  }
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);"><span style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px;">NOTIFICATIONS</span><button onclick="markAllRead()" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--border);color:var(--green);padding:3px 8px;cursor:pointer;border-radius:var(--radius-xs);">MARK ALL READ</button></div>';
  notifs.slice(0, 20).forEach(n => {
    const time = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    html += `<div style="padding:10px 12px;border-bottom:1px solid var(--border);${n.read?'opacity:0.6;':''}">
      <div style="font-size:12px;font-weight:${n.read?'400':'700'};margin-bottom:2px;">${esc(n.title)}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);">${esc(n.message||'')} &middot; ${time}</div>
    </div>`;
  });
  dd.innerHTML = html;
}
async function markAllRead() {
  try {
    await api('POST', '/api/notifications/read');
    el('notif-badge').style.display = 'none';
    toggleNotifications(); // refresh
    notifOpen = true; // re-open
    toggleNotifications();
  } catch(e) {}
}
// Load notification count on init
function initNotifications() { loadNotifications(); }

// ── Activity Log ──────────────────────────────────────
async function renderActivityLog() {
  const container = el('activitylog-content');
  container.innerHTML = '<div style="padding:8px 0;">Loading activity...</div>';
  try {
    const data = await api('GET', '/api/activity-logs?limit=50');
    const logs = data.logs || [];
    if (!logs.length) {
      container.innerHTML = '<div style="padding:8px 0;">No activity logged yet.</div>';
      return;
    }
    const actionIcons = {login:'&#x1F511;',register:'&#x1F4DD;',create_brand:'&#x2795;',delete_brand:'&#x1F5D1;',run_queries:'&#x25B6;',update_brand:'&#x270F;',change_plan:'&#x2B50;',export_data:'&#x1F4E5;',change_password:'&#x1F512;',admin_edit_user:'&#x1F6E0;','2fa_enabled':'&#x1F510;','2fa_disabled':'&#x1F513;',team_invite:'&#x1F465;',team_remove:'&#x274C;',team_role_update:'&#x1F504;'};
    let html = '<div style="max-height:600px;overflow-y:auto;">';
    logs.forEach(log => {
      const dt = new Date(log.created_at);
      const timeStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      const icon = actionIcons[log.action] || '&#x25CF;';
      const details = log.details || {};
      let detailStr = '';
      if (details.brand) detailStr = ' — ' + esc(details.brand);
      if (details.plan) detailStr = ' — plan: ' + esc(details.plan);
      if (details.email) detailStr = ' — ' + esc(details.email);
      if (details.role) detailStr += ' (role: ' + esc(details.role) + ')';
      html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span style="font-size:16px;flex-shrink:0;width:24px;text-align:center;">${icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-weight:600;color:var(--text);text-transform:capitalize;">${esc(log.action.replace(/_/g,' '))}</span>
            <span style="color:var(--muted);font-family:var(--mono);font-size:10px;">${esc(timeStr)}</span>
          </div>
          ${detailStr ? `<div style="color:var(--muted);font-size:11px;margin-top:2px;">${detailStr}</div>` : ''}
          ${log.ip ? `<div style="color:var(--muted);font-family:var(--mono);font-size:9px;margin-top:2px;">IP: ${esc(log.ip)}</div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="color:var(--red);">Failed to load activity: ${esc(e.message)}</div>`;
  }
}

// ── 2FA Management ────────────────────────────────────
async function load2FAStatus() {
  const statusEl = el('twofa-status');
  const actionsEl = el('twofa-actions');
  try {
    const data = await api('GET', '/api/auth/2fa/status');
    if (data.enabled) {
      statusEl.innerHTML = `<span style="color:var(--green);font-weight:700;">ENABLED</span> <span style="color:var(--muted);">&mdash; ${data.backupCodesRemaining} backup code${data.backupCodesRemaining !== 1 ? 's' : ''} remaining</span>`;
      actionsEl.innerHTML = '<button class="btn" onclick="el(\'twofa-disable-form\').style.display=el(\'twofa-disable-form\').style.display===\'none\'?\'block\':\'none\'" style="font-size:11px;">DISABLE 2FA</button>';
      el('twofa-setup-form').style.display = 'none';
    } else {
      statusEl.innerHTML = '<span style="color:var(--muted);">Not enabled.</span> <span style="font-size:11px;color:var(--muted);">Add an extra layer of security to your account with an authenticator app.</span>';
      actionsEl.innerHTML = '<button class="btn-primary" onclick="setup2FA()" style="font-size:11px;">ENABLE 2FA</button>';
      el('twofa-disable-form').style.display = 'none';
    }
  } catch(e) {
    statusEl.innerHTML = '<span style="color:var(--red);">Failed to load 2FA status.</span>';
    actionsEl.innerHTML = '';
  }
}

async function setup2FA() {
  try {
    const data = await api('POST', '/api/auth/2fa/setup');
    const qrArea = el('twofa-qr-area');
    qrArea.innerHTML = `
      <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-bottom:8px;">
        Scan this URL in your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code below to verify.
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border);padding:10px;border-radius:var(--radius-xs);margin-bottom:8px;word-break:break-all;font-family:var(--mono);font-size:10px;color:var(--text);">
        ${esc(data.otpauthUrl)}
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);">
        Manual entry key: <strong style="color:var(--primary);letter-spacing:2px;">${esc(data.secret)}</strong>
      </div>`;
    el('twofa-setup-form').style.display = 'block';
    el('twofa-verify-code').value = '';
    el('twofa-verify-code').focus();
  } catch(e) {
    toast(e.message || 'Failed to start 2FA setup', 'err');
  }
}

async function verify2FA() {
  const code = el('twofa-verify-code').value.trim();
  if (!code) return toast('Enter the 6-digit code', 'err');
  try {
    const data = await api('POST', '/api/auth/2fa/verify', { code });
    el('twofa-setup-form').style.display = 'none';
    toast('Two-factor authentication enabled!', 'ok');
    // Show backup codes
    if (data.backupCodes && data.backupCodes.length) {
      const codesEl = el('twofa-backup-codes');
      codesEl.style.display = 'block';
      codesEl.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--amber);padding:16px;border-radius:var(--radius-xs);">
          <div style="font-weight:700;color:var(--amber);margin-bottom:8px;font-size:12px;">SAVE YOUR BACKUP CODES</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:12px;">
            Store these codes in a safe place. Each can be used once if you lose access to your authenticator.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
            ${data.backupCodes.map(c => `<div style="background:var(--bg3);padding:6px 10px;border-radius:var(--radius-xs);font-family:var(--mono);font-size:12px;letter-spacing:1px;text-align:center;">${esc(c)}</div>`).join('')}
          </div>
          <button class="btn" onclick="navigator.clipboard.writeText('${data.backupCodes.join('\\n')}');toast('Backup codes copied!','ok');" style="font-size:10px;">COPY ALL CODES</button>
        </div>`;
    }
    load2FAStatus();
  } catch(e) {
    toast(e.message || 'Invalid code', 'err');
  }
}

async function disable2FA() {
  const pw = el('twofa-disable-pw').value;
  if (!pw) return toast('Enter your password', 'err');
  try {
    await api('POST', '/api/auth/2fa/disable', { password: pw });
    el('twofa-disable-form').style.display = 'none';
    el('twofa-disable-pw').value = '';
    el('twofa-backup-codes').style.display = 'none';
    toast('Two-factor authentication disabled', 'ok');
    load2FAStatus();
  } catch(e) {
    toast(e.message || 'Failed to disable 2FA', 'err');
  }
}

// ── Notification Preferences ──────────────────────────
async function renderNotificationPrefs() {
  // Load report schedule
  try {
    const data = await api('GET', '/api/report-settings');
    const freq = data.reportSchedule?.frequency || 'off';
    el('notif-report-freq').value = freq;
  } catch(e) {
    el('notif-report-freq').value = 'off';
  }

  // Render notification type toggles
  const types = [
    { key: 'visibility_drop', label: 'Visibility Drop Alerts', desc: 'When your brand visibility drops significantly' },
    { key: 'sov_below', label: 'SOV Below Threshold', desc: 'When share of voice falls below your target' },
    { key: 'brand_disappeared', label: 'Brand Disappeared', desc: 'When your brand is no longer mentioned' },
    { key: 'negative_sentiment', label: 'Negative Sentiment', desc: 'When negative sentiment spikes' },
    { key: 'new_competitor', label: 'New Competitor Detected', desc: 'When a new competitor appears in responses' },
    { key: 'team_invite', label: 'Team Invitations', desc: 'When you are added to a team' }
  ];
  const togglesEl = el('notif-type-toggles');
  let togglesHtml = '';
  types.forEach(t => {
    togglesHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:12px;font-weight:600;">${esc(t.label)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted);">${esc(t.desc)}</div>
      </div>
      <span style="font-family:var(--mono);font-size:10px;color:var(--green);">Active</span>
    </div>`;
  });
  togglesEl.innerHTML = togglesHtml;

  // Load recent notifications
  try {
    const data = await api('GET', '/api/notifications');
    const notifs = data.notifications || [];
    const histEl = el('notif-history');
    if (!notifs.length) {
      histEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:8px 0;">No notifications yet.</div>';
      return;
    }
    let html = '';
    notifs.forEach(n => {
      const time = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);${n.read?'opacity:0.5;':''}">
        <div style="width:8px;height:8px;border-radius:50%;background:${n.read?'var(--border)':'var(--primary)'};margin-top:5px;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:${n.read?'400':'700'};">${esc(n.title)}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px;">${esc(n.message||'')} &middot; ${time}</div>
        </div>
      </div>`;
    });
    histEl.innerHTML = html;
  } catch(e) {
    el('notif-history').innerHTML = '<div style="color:var(--red);font-size:11px;">Failed to load notifications.</div>';
  }
}

async function saveReportSchedule() {
  const freq = el('notif-report-freq').value;
  try {
    await api('PUT', '/api/report-settings', { frequency: freq });
    const status = el('notif-report-status');
    status.style.display = 'inline';
    setTimeout(() => { status.style.display = 'none'; }, 2000);
    toast('Report schedule saved', 'ok');
  } catch(e) {
    toast(e.message || 'Failed to save', 'err');
  }
}

// ── Team Management ───────────────────────────────────
function toggleTeamInvite() {
  const form = el('team-invite-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') el('team-invite-email').focus();
}

async function renderTeamMembers() {
  const listEl = el('team-members-list');
  listEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:8px 0;">Loading...</div>';
  try {
    const data = await api('GET', '/api/team');
    const members = data.members || [];
    if (!members.length) {
      listEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:16px 0;text-align:center;">No team members yet. Invite someone to get started.</div>';
      return;
    }
    let html = '<div style="display:flex;flex-direction:column;gap:2px;">';
    members.forEach(m => {
      const joined = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const roleColor = m.role === 'editor' ? 'var(--amber)' : 'var(--muted)';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-xs);">
        <div>
          <div style="font-size:12px;font-weight:600;">${esc(m.email || m.name || 'Unknown')}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px;">Joined ${joined}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select class="finput" style="margin:0;width:100px;font-size:10px;padding:4px 6px;" onchange="updateTeamRole('${esc(m.user_id)}',this.value)">
            <option value="viewer" ${m.role==='viewer'?'selected':''}>Viewer</option>
            <option value="editor" ${m.role==='editor'?'selected':''}>Editor</option>
          </select>
          <button onclick="removeTeamMember('${esc(m.user_id)}')" style="background:none;border:1px solid var(--red);color:var(--red);font-family:var(--mono);font-size:9px;padding:4px 8px;cursor:pointer;border-radius:var(--radius-xs);">REMOVE</button>
        </div>
      </div>`;
    });
    html += '</div>';
    listEl.innerHTML = html;
  } catch(e) {
    listEl.innerHTML = `<div style="color:var(--red);font-size:11px;">Failed to load team: ${esc(e.message)}</div>`;
  }
}

async function sendTeamInvite() {
  const email = el('team-invite-email').value.trim();
  const role = el('team-invite-role').value;
  if (!email) return toast('Enter an email address', 'err');
  try {
    await api('POST', '/api/team/invite', { email, role });
    toast('Team member added!', 'ok');
    el('team-invite-email').value = '';
    el('team-invite-form').style.display = 'none';
    renderTeamMembers();
  } catch(e) {
    toast(e.message || 'Failed to invite', 'err');
  }
}

async function updateTeamRole(memberId, role) {
  try {
    await api('PUT', '/api/team/' + memberId, { role });
    toast('Role updated', 'ok');
  } catch(e) {
    toast(e.message || 'Failed to update role', 'err');
    renderTeamMembers();
  }
}

async function removeTeamMember(memberId) {
  if (!confirm('Remove this team member?')) return;
  try {
    await api('DELETE', '/api/team/' + memberId);
    toast('Team member removed', 'ok');
    renderTeamMembers();
  } catch(e) {
    toast(e.message || 'Failed to remove', 'err');
  }
}

function usageBar(label, current, max) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber,#f59e0b)' : 'var(--green)';
  return `<div>
    <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:var(--muted);">
      <span>${label}</span>
      <span style="color:${color};font-weight:700;">${current}/${max}</span>
    </div>
    <div class="plan-limit-bar"><div class="plan-limit-fill" style="width:${pct}%;background:${color};"></div></div>
  </div>`;
}

function showUpgradeModal(reason) {
  const reasonEl = el('upgrade-reason');
  if (reason) {
    reasonEl.textContent = reason;
    reasonEl.style.display = 'block';
  } else {
    reasonEl.style.display = 'none';
  }
  // Highlight current plan
  const current = (currentUser && currentUser.plan) || 'free';
  document.querySelectorAll('#upgrade-plans .upgrade-plan-card').forEach(card => {
    const plan = card.dataset.plan;
    card.classList.toggle('active', plan === current);
    const btn = card.querySelector('.btn-upgrade');
    if (plan === current) {
      btn.textContent = 'CURRENT PLAN';
      btn.classList.add('current');
      btn.disabled = true;
    } else {
      btn.textContent = 'SWITCH TO ' + plan.toUpperCase();
      btn.classList.remove('current');
      btn.disabled = false;
    }
  });
  openModal('upgrade-modal');
}

async function doUpgrade(plan) {
  const current = (currentUser && currentUser.plan) || 'free';
  if (plan === current) return;
  const tiers = {free:0, pro:1, agency:2, enterprise:3};
  const action = tiers[plan] > tiers[current] ? 'upgrade' : tiers[plan] < tiers[current] ? 'downgrade' : 'switch';
  if (!confirm(`${action === 'downgrade' ? 'Downgrade' : 'Upgrade'} to ${plan.toUpperCase()} plan?`)) return;
  try {
    const data = await api('POST', '/api/upgrade', { plan });
    // Handle payment required response
    if (data.requiresPayment) {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl + '?price=' + data.priceId, '_blank');
      } else {
        toast('Payment integration coming soon. Contact support to upgrade.', 'warn');
      }
      return;
    }
    currentUser = data.user;
    const pb = el('plan-badge');
    pb.textContent = plan.toUpperCase();
    pb.className = 'plan-badge ' + plan;
    closeModal('upgrade-modal');
    toast('Plan updated to ' + plan.toUpperCase(), 'ok');
    if (currentView === 'account') renderAccount();
  } catch(e) {
    toast(e.message, 'err');
  }
}

function renderAll(){
  renderView(currentView);
}

// ─── LIVE RESULT NOTIFICATIONS ────────────────────────────────────
const _NOTIF_MAX = 5;       // max visible at once
const _NOTIF_DURATION = 3500; // ms before auto-dismiss
const _notifSeen = new Set();
// Notification queue — batch DOM writes to reduce layout thrashing
let _notifQueue = [];
let _notifFlushTimer = null;

function showLiveNotif(result) {
  // Dedup — don't show same platform+query combo twice in one run
  const dedupKey = (result.platform || '') + '||' + (result.query || '');
  if (_notifSeen.has(dedupKey)) return;
  _notifSeen.add(dedupKey);

  // Queue the notification and flush in batches (max every 200ms)
  _notifQueue.push(result);
  if (!_notifFlushTimer) {
    _notifFlushTimer = setTimeout(_flushNotifQueue, 200);
  }
}

function _flushNotifQueue() {
  _notifFlushTimer = null;
  const cont = el('live-notifs');
  if (!cont || !_notifQueue.length) { _notifQueue = []; return; }

  // Only show the last _NOTIF_MAX notifications from the queue
  const batch = _notifQueue.slice(-_NOTIF_MAX);
  _notifQueue = [];

  // Build all notification elements in a document fragment (single reflow)
  const frag = document.createDocumentFragment();
  for (const result of batch) {
    const t = PLAT_THEME[result.platform] || {};
    const isErr = result.error;
    const isMentioned = result.mentioned;
    let statusCls, statusText;
    if (isErr) { statusCls = 'error'; statusText = 'Error'; }
    else if (isMentioned) { statusCls = 'found'; statusText = 'Found'; }
    else { statusCls = 'notfound'; statusText = 'Not Found'; }
    const queryShort = (result.query || '').length > 45 ? result.query.substring(0, 45) + '...' : (result.query || '');

    const notif = document.createElement('div');
    notif.className = 'live-notif';
    notif.innerHTML = `
      <div class="live-notif-icon" style="background:${t.bg || 'var(--bg3)'};color:${t.color || 'var(--muted)'};">${t.logo || '?'}</div>
      <div class="live-notif-body">
        <div class="live-notif-title">${esc(result.platform)} · ${esc(result.model || '')}</div>
        <div class="live-notif-sub">${esc(queryShort)}</div>
      </div>
      <div class="live-notif-status ${statusCls}">${statusText}</div>`;

    notif.onclick = () => {
      notif.remove();
      try {
        const b = brand();
        const t2 = PLAT_THEME[result.platform]||{};
        const head = el('resp-modal-head');
        const titleEl = el('resp-modal-title');
        const queryEl = el('resp-modal-query');
        const textEl = el('resp-modal-text');
        if (!head || !titleEl || !queryEl || !textEl) return;
        head.style.background = t2.bg||'var(--bg2)';
        head.style.borderBottom = '1px solid '+(t2.color||'var(--border)');
        titleEl.innerHTML = (t2.logo||'') + ' ' + esc(result.platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : result.error ? ' <span style="color:var(--amber);font-size:11px;">— ERROR</span>' : ' <span style="color:var(--red);font-size:11px;">— NOT FOUND</span>');
        queryEl.innerHTML = esc(result.query||'') + (result.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(result.model)+'</div>' : '');
        textEl.style.whiteSpace = 'normal';
        const raw = result.error ? (result.error) : (result.raw || result.context || '[No response text]');
        const rawHtml = mdToHtml(raw);
        const hre = b ? brandHighlightRe(b) : null;
        textEl.innerHTML = hre ? rawHtml.replace(hre, (m) => '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">'+esc(m)+'</mark>') : rawHtml;
        const cc = el('resp-modal-cites');
        const cites = result.citations||[];
        if (cc) {
          if (cites.length) {
            cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
              + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
          } else cc.innerHTML = '';
        }
        openModal('resp-modal');
      } catch(e) { console.error('live notif click error:', e); }
    };
    frag.appendChild(notif);

    // Auto-dismiss with single timer per notification
    setTimeout(() => {
      if (notif.parentNode) {
        notif.classList.add('notif-exit');
        setTimeout(() => notif.remove(), 300);
      }
    }, _NOTIF_DURATION);
  }

  // Single DOM write: append all at once
  cont.appendChild(frag);

  // Cap visible notifications — remove oldest in one pass
  while (cont.children.length > _NOTIF_MAX) {
    cont.removeChild(cont.children[0]);
  }
}

function clearLiveNotifs() {
  const cont = el('live-notifs');
  if (cont) cont.innerHTML = '';
  _notifSeen.clear();
  _notifQueue = [];
  if (_notifFlushTimer) { clearTimeout(_notifFlushTimer); _notifFlushTimer = null; }
}

// ─── LIVE UPDATE DURING STREAMING ──────────────────────────────────
// Called on every new result during streaming — updates whichever view is active
// Throttle heavy DOM updates to prevent UI freezing during rapid SSE events
let _liveUpdateTimer = null;
let _liveUpdatePending = null;

// Incremental counters updated O(1) per result — avoids re-filtering liveResults array
let _liveCounters = { platCounts: {}, platMentions: {}, posCount: 0, negCount: 0, neuCount: 0, recCount: 0, locRelevant: 0, locTotal: 0, activePlats: new Set() };
function _resetLiveCounters() { _liveCounters = { platCounts: {}, platMentions: {}, posCount: 0, negCount: 0, neuCount: 0, recCount: 0, locRelevant: 0, locTotal: 0, activePlats: new Set() }; }
function _updateLiveCounters(r) {
  const p = r.platform;
  _liveCounters.activePlats.add(p);
  if (!r.error) {
    if (!_liveCounters.platCounts[p]) _liveCounters.platCounts[p] = 0;
    _liveCounters.platCounts[p]++;
    if (r.mentioned) {
      if (!_liveCounters.platMentions[p]) _liveCounters.platMentions[p] = 0;
      _liveCounters.platMentions[p]++;
      if (r.sentiment === 'positive') _liveCounters.posCount++;
      else if (r.sentiment === 'negative') _liveCounters.negCount++;
      else _liveCounters.neuCount++;
      if (r.locationRelevant !== undefined) { _liveCounters.locTotal++; if (r.locationRelevant) _liveCounters.locRelevant++; }
    }
    if (r.recommended) _liveCounters.recCount++;
  }
}

// Queue for batching live card DOM appends via requestAnimationFrame
let _liveCardQueue = [];
let _liveCardRaf = null;
function _flushLiveCards() {
  _liveCardRaf = null;
  if (!_liveCardQueue.length) return;
  const batch = _liveCardQueue;
  _liveCardQueue = [];

  if (currentView === 'overview') {
    for (const r of batch) appendLiveFeedRow(r);
  }
  if (currentView === 'mentions') {
    const cardsEl = el('live-cards');
    if (cardsEl) {
      const runTimeStr = liveRunTime ? liveRunTime.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + liveRunTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '';
      let html = '';
      for (const r of batch) {
        html += buildMentionCard(r, runTimeStr).replace('class="mention-card ','class="mention-card mention-card-live ');
      }
      cardsEl.insertAdjacentHTML('beforeend', html);
    }
  }
  if (currentView === 'proof') {
    for (const r of batch) appendLiveProofCard(r);
  }
}

function onLiveResult(result, received, totalExpected, liveFound, liveErrors) {
  liveResults.push(result);
  _updateLiveCounters(result);

  // Show bottom-right notification popup (lightweight — no throttle needed)
  showLiveNotif(result);

  // Throttle heavy view updates: batch DOM writes to at most every 500ms
  _liveUpdatePending = { received, totalExpected, liveFound, liveErrors, result };
  if (!_liveUpdateTimer) {
    _liveUpdateTimer = setTimeout(() => {
      _liveUpdateTimer = null;
      const p = _liveUpdatePending;
      if (!p) return;
      _liveUpdatePending = null;
      _flushLiveUpdate(p.received, p.totalExpected, p.liveFound, p.liveErrors);
    }, 500);
  }

  // Queue card appends and flush via requestAnimationFrame to avoid blocking the main thread
  _liveCardQueue.push(result);
  if (!_liveCardRaf) {
    _liveCardRaf = requestAnimationFrame(_flushLiveCards);
  }
}

function _flushLiveUpdate(received, totalExpected, liveFound, liveErrors) {
  // Update overview if visible (recalculate all stats from liveResults)
  if (currentView === 'overview') {
    renderOverviewLive(received, totalExpected, liveFound, liveErrors);
  }
}

// Set up live mentions view with backfilled results
function setupLiveMentions() {
  const cont = el('mentions-container');
  if (!cont) return;
  const found = liveResults.filter(r=>r.mentioned).length;
  const errs = liveResults.filter(r=>r.error).length;
  const ok = liveResults.length - errs;
  const sov = ok > 0 ? Math.round(found / ok * 100) : 0;
  const runTimeStr = liveRunTime ? liveRunTime.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + liveRunTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '';

  // Live score cards
  const kpis = el('mentions-kpis');
  if (kpis) {
    kpis.innerHTML = `<div class="mt-scores ov-card-updating">
      <div class="mt-score">
        <div class="mt-score-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.91" fill="none" stroke="var(--border)" stroke-width="3"/><circle cx="18" cy="18" r="15.91" fill="none" stroke="var(--green)" stroke-width="3" stroke-dasharray="${sov} ${100-sov}" stroke-dashoffset="25" stroke-linecap="round"/></svg><span class="mt-score-pct">${sov}%</span></div>
        <div><div class="mt-score-title">Share of Voice</div><div class="mt-score-detail"><span style="color:var(--green);font-weight:700;">${found}</span> of ${ok} · streaming...</div></div>
      </div>
      <div class="mt-score">
        <div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE</div>
        <div><div class="mt-score-title">Results Received</div><div class="mt-score-detail" style="font-size:20px;font-weight:800;color:var(--text);">${liveResults.length}</div></div>
      </div>
    </div>`;
  }
  const platFilters = el('mentions-plat-filters');
  if (platFilters) platFilters.innerHTML = '';

  cont.innerHTML = `<div id="live-cards" class="mention-cards"></div>`;
  const cardsEl = el('live-cards');
  if (cardsEl) {
    liveResults.forEach(r => {
      cardsEl.insertAdjacentHTML('beforeend', buildMentionCard(r, runTimeStr));
    });
  }
}

// Set up live proof view with backfilled results
function setupLiveProof() {
  const cont = el('proof-container');
  if (!cont) return;
  const summaryEl = el('proof-summary-strip');
  if (summaryEl) {
    summaryEl.innerHTML = `<div class="proof-summary">
      <div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE</div>
      <div class="proof-stat-sep"></div>
      <div class="proof-stat" style="color:var(--green);border-color:rgba(16,185,129,.25);"><span class="proof-stat-dot" style="background:var(--green);"></span><span id="live-proof-found">${liveResults.filter(r=>r.mentioned).length}</span> found</div>
      <div class="proof-stat"><span class="proof-stat-dot" style="background:var(--blue);"></span><span id="live-proof-total">${liveResults.length}</span> results streaming</div>
    </div>`;
  }
  cont.innerHTML = '<div id="live-proof-cards" class="proof-grid"></div>';
  const cardsEl = el('live-proof-cards');
  if (cardsEl) {
    liveResults.forEach(r => appendLiveProofCard(r));
  }
}

// Live overview — recalculate everything from accumulated liveResults
function renderOverviewLive(received, totalExpected, liveFound, liveErrors) {
  const b = brand();
  if (!b) return;

  // Use pre-computed counters instead of filtering liveResults (O(1) vs O(n))
  const totalResults = received;
  const validCount = received - liveErrors;
  const mentions = liveFound;
  const sov = validCount > 0 ? Math.round(mentions / validCount * 100) : 0;

  // Live progress badge in header
  const actionsEl = el('ov-header-actions');
  if (actionsEl) {
    const pct = totalExpected > 0 ? Math.round(received / totalExpected * 100) : 0;
    actionsEl.innerHTML = `<div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE ${pct}%</div>`;
  }

  // Update SOV ring
  const sovColor = sov >= 70 ? 'var(--green)' : sov >= 40 ? 'var(--amber)' : sov > 0 ? 'var(--red)' : 'var(--muted)';
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (sov / 100) * circumference;
  const circle = document.getElementById('ov-sov-circle');
  if (circle) {
    circle.style.stroke = sovColor;
    circle.style.strokeDashoffset = offset;
  }
  const sovEl = el('ov-sov');
  if (sovEl) { sovEl.textContent = sov + '%'; sovEl.style.color = sovColor; }

  // Update hero stats using incremental counters (O(1) instead of O(n))
  const mEl = el('ov-mentions');
  if (mEl) mEl.textContent = mentions + ' / ' + totalResults;
  const pEl = el('ov-platforms');
  if (pEl) pEl.textContent = _liveCounters.activePlats.size + ' / ' + PLATS.length;
  const lrEl = el('ov-last-run-age');
  if (lrEl) { lrEl.textContent = 'NOW'; lrEl.style.color = 'var(--green)'; }

  // Use incremental counters instead of re-filtering liveResults array
  const c = _liveCounters;

  // Update GEO scores row (only every 5 results to reduce DOM writes)
  const scoresRow = el('ov-scores-row');
  if (scoresRow && validCount > 0 && (received % 5 === 0 || received >= totalExpected)) {
    const mentionRate = validCount > 0 ? mentions / validCount : 0;
    const recommendRate = validCount > 0 ? c.recCount / validCount : 0;
    const locationRate = c.locTotal > 0 ? c.locRelevant / c.locTotal : 0;
    const geoScore = Math.round((mentionRate * 40 + recommendRate * 35 + locationRate * 25));
    const geoColor = geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : 'var(--red)';
    const geoLabel = geoScore >= 70 ? 'Strong' : geoScore >= 40 ? 'Growing' : geoScore > 0 ? 'Weak' : 'Not Visible';

    const mentionedTotal = c.posCount + c.negCount + c.neuCount;
    const posCount = c.posCount;
    const negCount = c.negCount;
    const neuCount = c.neuCount;
    const sentimentScore = mentionedTotal > 0 ? Math.round(((posCount * 100 + neuCount * 50) / mentionedTotal)) : 0;
    const sentColor = sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : sentimentScore > 0 ? 'var(--red)' : 'var(--muted)';

    const recPct = validCount > 0 ? Math.round(recommendRate * 100) : 0;
    const recColor = recPct >= 40 ? 'var(--green)' : recPct > 0 ? 'var(--amber)' : 'var(--muted)';

    scoresRow.innerHTML = `
      <div class="ov-score-card ov-card-updating">
        <div class="ov-score-body">
          <div class="ov-score-val" style="color:${geoColor};">${geoScore}</div>
          <div class="ov-score-label">GEO Score</div>
          <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${geoScore}%;background:${geoColor};"></div></div>
          <div class="ov-score-tag" style="color:${geoColor};">${geoLabel}</div>
        </div>
      </div>
      <div class="ov-score-card ov-card-updating">
        <div class="ov-score-body">
          <div class="ov-score-val" style="color:${sentColor};">${sentimentScore}</div>
          <div class="ov-score-label">AI Sentiment</div>
          <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${sentimentScore}%;background:${sentColor};"></div></div>
          <div class="ov-score-breakdown"><span style="color:var(--green);">+${posCount}</span> <span style="color:var(--muted);">~${neuCount}</span> <span style="color:var(--red);">-${negCount}</span></div>
        </div>
      </div>
      <div class="ov-score-card ov-card-updating">
        <div class="ov-score-body">
          <div class="ov-score-val" style="color:${recColor};">${recPct}<span class="ov-score-unit">%</span></div>
          <div class="ov-score-label">AI Recommends You</div>
          <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${recPct}%;background:${recColor};"></div></div>
          <div class="ov-score-tag" style="color:${recColor};">${recPct >= 50 ? 'Strong endorsement' : recPct > 0 ? 'Moderate' : 'Not yet'}</div>
        </div>
      </div>
    `;
  }

  // Update platform cards — use incremental counters instead of re-iterating liveResults
  const pg = el('ov-plat-grid');
  if (pg) {
    const platSOV = {};
    const platCounts = {};
    for (const p of Object.keys(c.platCounts)) {
      platCounts[p] = { total: c.platCounts[p], found: c.platMentions[p] || 0 };
      platSOV[p] = c.platCounts[p] > 0 ? Math.round((c.platMentions[p] || 0) / c.platCounts[p] * 100) : 0;
    }

    pg.innerHTML = '';
    PLATS.forEach(plat => {
      const t = PLAT_THEME[plat]||{};
      const pSov = platSOV[plat]||0;
      const keyId = plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai').replace('googleaio','gemini');
      const active = keyStatus[keyId];
      const hasResults = !!platCounts[plat];
      const barColor = pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--border)';
      const div = document.createElement('div');
      div.className = 'ov-plat-card' + (hasResults ? ' ov-plat-card-flash' : '');
      div.innerHTML = `<div class="ov-plat-name" style="color:${t.color||'var(--text)'}">${plat}</div>
        <div class="ov-plat-status" style="color:${hasResults ? 'var(--green)' : active ? 'var(--green)' : 'var(--muted)'}">${hasResults ? '● STREAMING' : active ? '● ACTIVE' : '○ INACTIVE'}</div>
        <div class="ov-plat-bar"><div class="ov-plat-bar-fill" style="width:${pSov}%;background:${barColor};"></div></div>
        <div class="ov-plat-sov" style="color:${pSov > 0 ? t.color || 'var(--green)' : 'var(--muted)'}">${pSov}%</div>`;
      pg.appendChild(div);
    });
  }

  // Update API health banner using counters
  const healthEl = el('ov-api-health');
  if (healthEl && received > 0) {
    const errs = liveErrors;
    const okCount = validCount;
    const healthyPlats = Object.keys(c.platCounts).length;
    const totalPlats = c.activePlats.size;
    const dotColor = errs === 0 ? 'var(--green)' : errs <= 3 ? 'var(--amber)' : 'var(--red)';
    healthEl.innerHTML = `<div class="ov-health ov-card-updating">
      <div class="ov-health-dot" style="background:${dotColor};"></div>
      <div class="ov-health-text"><strong>${healthyPlats}/${totalPlats}</strong> platforms healthy · <strong>${okCount}</strong> ok · <span style="color:${errs > 0 ? 'var(--red)' : 'inherit'}">${errs} error${errs !== 1 ? 's' : ''}</span></div>
      <div class="ov-live-badge"><span class="ov-live-dot"></span>${received}/${totalExpected}</div>
    </div>`;
  }

  // Category SOV — computed from incremental counters
  const catRow = el('ov-category-row');
  if (catRow && validCount > 0) {
    const chatAI = ['ChatGPT', 'Claude', 'Grok', 'DeepSeek'];
    const searchAI = ['Perplexity', 'Google AIO', 'Gemini'];
    let chatTotal = 0, chatFound = 0, searchTotal = 0, searchFound = 0;
    for (const p of chatAI) { chatTotal += c.platCounts[p] || 0; chatFound += c.platMentions[p] || 0; }
    for (const p of searchAI) { searchTotal += c.platCounts[p] || 0; searchFound += c.platMentions[p] || 0; }
    const chatSOV = chatTotal > 0 ? Math.round(chatFound / chatTotal * 100) : null;
    const searchSOV = searchTotal > 0 ? Math.round(searchFound / searchTotal * 100) : null;
    function cc(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; }
    let ch = '';
    if (chatSOV !== null) ch += `<div class="ov-cat-card" style="border-top:2px solid ${cc(chatSOV)};"><div class="ov-cat-label">💬 Chat AI</div><div class="ov-cat-val" style="color:${cc(chatSOV)};">${chatSOV}%</div><div class="ov-cat-detail">Mentioned in ${chatFound} of ${chatTotal} responses</div><div class="ov-cat-sub">ChatGPT · Claude · Grok · DeepSeek</div></div>`;
    if (searchSOV !== null) ch += `<div class="ov-cat-card" style="border-top:2px solid ${cc(searchSOV)};"><div class="ov-cat-label">🔍 Search AI</div><div class="ov-cat-val" style="color:${cc(searchSOV)};">${searchSOV}%</div><div class="ov-cat-detail">Mentioned in ${searchFound} of ${searchTotal} responses</div><div class="ov-cat-sub">Perplexity · Google AIO · Gemini</div></div>`;
    catRow.innerHTML = ch;
    catRow.style.gridTemplateColumns = `repeat(${[chatSOV !== null, searchSOV !== null].filter(Boolean).length}, 1fr)`;
    const catSec = el('ov-category-section');
    if (catSec) catSec.style.display = '';
  }
}

// Set up live feed on overview — shows each result as it streams in
let _liveFeedCount = 0;
function setupLiveFeed() {
  const feed = el('ov-live-feed');
  if (!feed) return;
  // If feed already exists and is up to date, skip rebuild
  const existingList = el('ov-feed-list');
  if (existingList && feed.style.display !== 'none' && _liveFeedCount === liveResults.length) return;
  feed.style.display = '';
  _liveFeedCount = 0;
  feed.innerHTML = `<div class="ov-card" style="padding:0;overflow:hidden;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE</div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">Results Feed</span>
      </div>
      <span id="ov-feed-count" style="font-family:var(--mono);font-size:11px;color:var(--muted);">0 results</span>
    </div>
    <div id="ov-feed-list" style="max-height:400px;overflow-y:auto;"></div>
  </div>`;
  // Backfill any results already received
  for (const r of liveResults) appendLiveFeedRow(r);
}

function appendLiveFeedRow(result) {
  const list = el('ov-feed-list');
  if (!list) return;
  const t = PLAT_THEME[result.platform]||{};
  const isError = result.error;
  const isMentioned = result.mentioned;
  const statusIcon = isError ? '<span style="color:var(--amber);">⚠</span>'
    : isMentioned ? '<span style="color:var(--green);">✓</span>'
    : '<span style="color:var(--red);">✗</span>';
  const statusText = isError ? 'ERROR' : isMentioned ? 'FOUND' : 'NOT FOUND';
  const statusColor = isError ? 'var(--amber)' : isMentioned ? 'var(--green)' : 'var(--red)';
  const query = (result.query || '').length > 60 ? result.query.substring(0,57)+'...' : (result.query || '');

  const row = `<div class="live-feed-row" style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px;animation:fadeInUp .3s ease;">
    <span style="color:${t.color||'var(--muted)'};font-size:14px;width:20px;text-align:center;flex-shrink:0;">${t.logo||'?'}</span>
    <span style="color:var(--muted);font-family:var(--mono);font-size:10px;width:70px;flex-shrink:0;">${esc(result.platform)}</span>
    <span style="flex:1;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(query)}</span>
    <span style="font-family:var(--mono);font-size:10px;font-weight:700;color:${statusColor};flex-shrink:0;">${statusIcon} ${statusText}</span>
  </div>`;
  list.insertAdjacentHTML('afterbegin', row);
  _liveFeedCount++;

  // Update count
  const countEl = el('ov-feed-count');
  if (countEl) countEl.textContent = _liveFeedCount + ' results';
}

function hideLiveFeed() {
  const feed = el('ov-live-feed');
  if (feed) { feed.style.display = 'none'; feed.innerHTML = ''; }
  _liveFeedCount = 0;
}

// Cache the brand highlight regex for the duration of a run — avoids recompiling 80+ times
let _cachedHighlightRe = null;
let _cachedHighlightBrandId = null;

function _getCachedHighlightRe(b) {
  if (_cachedHighlightBrandId === b.id && _cachedHighlightRe !== null) return _cachedHighlightRe;
  _cachedHighlightRe = brandHighlightRe(b);
  _cachedHighlightBrandId = b.id;
  return _cachedHighlightRe;
}

// Append a live proof card during streaming
function appendLiveProofCard(result) {
  const b = brand();
  if (!b) return;
  let cont = el('live-proof-cards');
  if (!cont) {
    // Set up live proof container if not exists (only runs once per view switch)
    const proofCont = el('proof-container');
    if (!proofCont) return;
    const summaryEl = el('proof-summary-strip');
    if (summaryEl) {
      summaryEl.innerHTML = `<div class="proof-summary">
        <div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE</div>
        <div class="proof-stat-sep"></div>
        <div class="proof-stat"><span class="proof-stat-dot" style="background:var(--blue);"></span>Results appear as they arrive</div>
      </div>`;
    }
    proofCont.innerHTML = '<div id="live-proof-cards" class="proof-grid"></div>';
    cont = el('live-proof-cards');
  }
  if (!cont) return;

  const t = PLAT_THEME[result.platform]||{};
  const isError = result.error;
  const isMentioned = result.mentioned;
  const preview = isError ? friendlyError(result.errorMessage) : (result.context || '').replace(/[#*_~`]/g,'').substring(0, 300);
  const proofHre = _getCachedHighlightRe(b);
  const displayResp = proofHre && preview ? preview.replace(proofHre, (m) => '<mark>'+esc(m)+'</mark>') : preview;
  const statusBadge = isError
    ? `<div class="proof-card-badge" style="color:var(--amber);background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);font-weight:700;border-radius:var(--radius-full);">⚠ ERROR</div>`
    : isMentioned
    ? `<div class="proof-card-badge" style="color:var(--green);background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);font-weight:700;border-radius:var(--radius-full);">&#x2713; FOUND</div>`
    : `<div class="proof-card-badge" style="color:var(--red);background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);font-weight:700;border-radius:var(--radius-full);">&#x2717; NOT FOUND</div>`;
  const sentiment = result.sentiment || 'neutral';
  const sentBadge = sentiment==='positive'?'pos':sentiment==='negative'?'neg':'neu';
  const cardBorder = isMentioned ? (t.color||'var(--border)')+'40' : 'var(--border)';

  const card = `<div class="proof-card proof-card-live" style="border-color:${cardBorder};">
    <div class="proof-card-header" style="background:${t.bg||'var(--bg)'};border-bottom:1px solid ${cardBorder};">
      <div class="proof-card-logo" style="color:${t.color||'var(--muted)'}">${t.logo||'?'}</div>
      <div class="proof-card-name">${result.platform}</div>
      <div class="proof-card-badges">${statusBadge}</div>
    </div>
    <div class="proof-card-body">
      <div class="proof-card-query">"${esc(result.query)}"<button class="copy-query-btn" onclick="event.stopPropagation();copyQuery(${escAttr(JSON.stringify(result.query))},this)" title="Copy keyword">&#x2398;</button></div>
      ${isError
        ? `<div class="proof-not-found" style="color:var(--amber);"><div style="font-size:16px;margin-bottom:4px;">⚠</div>${esc(friendlyError(result.errorMessage))}</div>`
        : `<div class="proof-card-resp" style="max-height:180px;overflow:hidden;">${displayResp}${preview.length >= 300 ? '...' : ''}</div>`
      }
    </div>
    <div class="proof-card-footer">
      <div class="proof-card-meta">
        <span class="badge ${sentBadge}">${sentiment==='positive'?'Positive':sentiment==='negative'?'Negative':'Neutral'}</span>
        ${result.recommended?'<span class="badge pos">RECOMMENDED</span>':''}
        ${result.model?`<span class="proof-card-tag">${esc(result.model)}</span>`:''}
      </div>
    </div>
  </div>`;
  cont.insertAdjacentHTML('beforeend', card);
  // Update live counters
  const lfc = el('live-proof-found');
  const ltc = el('live-proof-total');
  if (lfc) lfc.textContent = liveResults.filter(r=>r.mentioned).length;
  if (ltc) ltc.textContent = liveResults.length;
}

// ─── OVERVIEW ─────────────────────────────────────────────────────

// Compare toggle state
let _compareMode = 'current';
function setCompareMode(mode) {
  _compareMode = mode;
  const btns = document.querySelectorAll('#ov-compare-toggle button');
  btns.forEach(btn => {
    btn.classList.toggle('active', (mode === 'current' && btn.textContent === 'Current') ||
      (mode === 'week' && btn.textContent === 'vs Last Week') ||
      (mode === 'month' && btn.textContent === 'vs Last Month'));
  });
  renderOverview();
}

// Live countdown helpers for "last run" age display
let _runAgeTimer = null;
function _fmtRunAge(lastRun) {
  if (!lastRun) return { text: 'Never', dot: '' };
  const runTime = new Date(lastRun.time || lastRun.date);
  const ageSec = Math.floor((Date.now() - runTime.getTime()) / 1000);
  if (ageSec < 60) return { text: ageSec + 's ago', dot: 'ok' };
  if (ageSec < 3600) {
    const m = Math.floor(ageSec / 60);
    const s = ageSec % 60;
    return { text: m + 'm ' + s + 's ago', dot: 'ok' };
  }
  const ageMins = Math.floor(ageSec / 60);
  if (ageMins < 1440) {
    const h = Math.floor(ageMins / 60);
    const m = ageMins % 60;
    return { text: h + 'h ' + m + 'm ago', dot: ageMins > 720 ? 'warn' : 'ok' };
  }
  const d = Math.floor(ageMins / 1440);
  return { text: d + 'd ago', dot: d > 3 ? 'bad' : 'warn' };
}
function _startRunAgeCountdown(lastRun) {
  if (_runAgeTimer) clearInterval(_runAgeTimer);
  if (!lastRun) return;
  const ageSec = Math.floor((Date.now() - new Date(lastRun.time || lastRun.date).getTime()) / 1000);
  // Tick every second for < 1 hour, every 30s for < 1 day, every 60s otherwise
  const interval = ageSec < 3600 ? 1000 : ageSec < 86400 ? 30000 : 60000;
  _runAgeTimer = setInterval(() => {
    const { text, dot } = _fmtRunAge(lastRun);
    // Update header age badge
    // Removed duplicate header status badge
    // if (ageEl) ageEl.innerHTML = `<span class="dot ${dot}"></span>${text}`;
    // Update stat card age
    const statEl = el('ov-last-run-age');
    if (statEl) {
      statEl.textContent = text;
      statEl.style.color = dot === 'bad' ? 'var(--red)' : dot === 'warn' ? 'var(--amber)' : '';
    }
  }, interval);
}

function renderOverview(){
  const b = brand();
  if (!b) return;

  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length-1] : null;
  const sov = lastRun ? lastRun.sov : 0;
  const mentions = lastRun ? (lastRun.mentions||[]).length : 0;
  const totalResults = lastRun ? (lastRun.allResults||[]).length : 0;
  const activePlats = lastRun ? Object.keys(lastRun.platforms||{}).length : 0;
  const queries = brands.reduce((s, br) => s + (br.queries||[]).length, 0);
  // Compare mode: pick comparison run based on toggle
  let compRun = null;
  if (_compareMode === 'current') {
    compRun = b.runs && b.runs.length > 1 ? b.runs[b.runs.length - 2] : null;
  } else {
    const now = Date.now();
    const target = _compareMode === 'week' ? 7 * 86400000 : 30 * 86400000;
    if (b.runs && b.runs.length > 1) {
      let best = null, bestDiff = Infinity;
      for (let i = b.runs.length - 2; i >= 0; i--) {
        const t = new Date(b.runs[i].time || b.runs[i].date).getTime();
        const d = Math.abs((now - t) - target);
        if (d < bestDiff) { bestDiff = d; best = b.runs[i]; }
      }
      compRun = best;
    }
  }
  const prevRun = compRun;
  const prevSOV = prevRun ? (prevRun.sov || 0) : null;
  const sovDiff = prevSOV !== null ? sov - prevSOV : null;

  // ─── Header ──────────────────────────────────────────────────
  const presetTitle = _activePreset && _presetMeta[_activePreset] ? _presetMeta[_activePreset].title : '';
  el('ov-brand-title').textContent = presetTitle ? (b.name || 'Overview') + ' — ' + presetTitle : (b.name || 'Overview');
  const baseSub = [b.industry, b.city].filter(Boolean).join(' · ') || 'Select a brand and run queries to see results.';
  el('ov-sub').textContent = baseSub;

  // Header actions: Run button + last run age (live countdown)
  const { text: runAgeText, dot: ageDotClass } = _fmtRunAge(lastRun);
  const actionsEl = el('ov-header-actions');
  if (runningQueries) {
    actionsEl.innerHTML = `<div class="ov-live-badge"><span class="ov-live-dot"></span>RUNNING</div>`;
  } else {
    actionsEl.innerHTML = (queries > 0 && currentUser && currentUser.role === 'admin') ? `<button onclick="runQueries()" class="ov-run-btn">▶ RUN NOW</button>` : '';
      // `<div class="ov-run-age"><span class="dot ${ageDotClass}"></span>${runAgeText}</div>`;
  }
  // Start live countdown ticker for the age displays
  _startRunAgeCountdown(lastRun);

  // ─── Next Run Badge ───────────────────────────────────────────
  const nextRunBadge = el('ov-next-run-badge');
  if (nextRunBadge) {
    if (lastRun && !runningQueries) {
      const runTime = new Date(lastRun.time || lastRun.date).getTime();
      // Assume 6-hour interval between runs
      const nextRunMs = runTime + 6 * 3600 * 1000;
      const diffMs = nextRunMs - Date.now();
      if (diffMs > 0) {
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        el('ov-next-run-text').textContent = 'Next run in ' + h + 'h ' + m + 'm';
        nextRunBadge.style.display = '';
      } else {
        el('ov-next-run-text').textContent = 'Run overdue';
        nextRunBadge.style.display = '';
      }
    } else {
      nextRunBadge.style.display = 'none';
    }
  }

  // ─── Compare Toggle ───────────────────────────────────────────
  // Toggle buttons are in the HTML; setCompareMode() handles clicks

  // ─── Alerts Strip ─────────────────────────────────────────────
  const alertsStripEl = el('ov-alerts-strip');
  if (alertsStripEl) {
    const alertChips = [];
    if (b.runs && b.runs.length >= 2) {
      const cur = b.runs[b.runs.length - 1];
      const prev = b.runs[b.runs.length - 2];
      const curSOV = cur.sov || 0;
      const prevSOV = prev.sov || 0;
      const runTimeStr = _fmtRunAge(cur).text;
      // Alert: SOV dropped significantly on any platform
      if (cur.platforms && prev.platforms) {
        for (const p of Object.keys(cur.platforms)) {
          const curPlatSOV = typeof cur.platforms[p] === 'number' ? cur.platforms[p] : 0;
          const prevPlatSOV = typeof prev.platforms[p] === 'number' ? prev.platforms[p] : 0;
          if (prevPlatSOV > 0 && curPlatSOV < prevPlatSOV && (prevPlatSOV - curPlatSOV) >= 10) {
            alertChips.push({ type: 'danger', text: 'SOV dropped below ' + curPlatSOV + '% on ' + p, time: runTimeStr });
          } else if (prevPlatSOV > 0 && curPlatSOV < prevPlatSOV && (prevPlatSOV - curPlatSOV) >= 5) {
            alertChips.push({ type: 'warn', text: 'Visibility down ' + (prevPlatSOV - curPlatSOV) + '% on ' + p, time: runTimeStr });
          }
        }
      }
      // Alert: overall SOV drop
      if (prevSOV > 0 && curSOV < prevSOV && (prevSOV - curSOV) >= 5 && alertChips.length === 0) {
        alertChips.push({ type: 'danger', text: 'Overall SOV dropped from ' + prevSOV + '% to ' + curSOV + '%', time: runTimeStr });
      }
      // Alert: new competitor detected (from competitorMentions field)
      if (cur.allResults && prev.allResults) {
        const prevComps = new Set((prev.allResults || []).flatMap(r => (r.competitorMentions || []).map(c => c.name || c)));
        const curComps = (cur.allResults || []).flatMap(r => (r.competitorMentions || []).map(c => c.name || c));
        const uniqueNew = [...new Set(curComps.filter(c => !prevComps.has(c)))];
        if (uniqueNew.length > 0) {
          alertChips.push({ type: 'info', text: 'New competitor "' + uniqueNew[0] + '" detected', time: runTimeStr });
        }
      }
      // Alert: SOV improved significantly (positive alert)
      if (prevSOV > 0 && curSOV > prevSOV && (curSOV - prevSOV) >= 5 && alertChips.length === 0) {
        alertChips.push({ type: 'info', text: 'SOV improved from ' + prevSOV + '% to ' + curSOV + '%', time: runTimeStr });
      }
    }
    const dotColors = { danger: 'var(--red)', warn: 'var(--amber)', info: 'var(--blue)' };
    alertsStripEl.innerHTML = alertChips.map(a =>
      `<div class="alert-chip ${a.type}"><div class="alert-dot" style="background:${dotColors[a.type] || 'var(--muted)'}"></div><div><div class="alert-text">${a.text}</div><div class="alert-time">${a.time}</div></div></div>`
    ).join('');
    alertsStripEl.style.display = alertChips.length ? '' : 'none';
  }

  // ─── SOV Hero ────────────────────────────────────────────────
  const sovColor = sov >= 70 ? 'var(--green)' : sov >= 40 ? 'var(--amber)' : sov > 0 ? 'var(--red)' : 'var(--muted)';
  const circumference = 2 * Math.PI * 52; // ~326.7
  const offset = circumference - (sov / 100) * circumference;
  const circle = document.getElementById('ov-sov-circle');
  if (circle) {
    circle.style.stroke = sovColor;
    circle.style.strokeDashoffset = offset;
    circle.style.transition = 'stroke-dashoffset 0.8s ease';
  }
  el('ov-sov').textContent = sov + '%';
  el('ov-sov').style.color = sovColor;
  const diffEl = el('ov-sov-diff');
  if (sovDiff !== null && sovDiff !== 0) {
    diffEl.textContent = (sovDiff > 0 ? '↑' : '↓') + Math.abs(sovDiff) + '%';
    diffEl.style.color = sovDiff > 0 ? 'var(--green)' : 'var(--red)';
  } else {
    diffEl.textContent = '';
  }

  // Customize hero stats based on active preset
  const heroStatsEl = document.querySelector('.ov-hero-stats');
  if (heroStatsEl && _activePreset === 'founder') {
    // Founder: Show high-level business metrics
    const mentionRate = totalResults > 0 ? Math.round(mentions / totalResults * 100) : 0;
    heroStatsEl.innerHTML = `
      <div class="ov-hero-stat"><div class="ov-hero-stat-val" style="color:${mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--amber)' : ''}">${mentionRate}%</div><div class="ov-hero-stat-lbl">Mention Rate</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${activePlats} / ${PLATS.length}</div><div class="ov-hero-stat-lbl">AI Platforms</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val" id="ov-last-run-age">${runAgeText}</div><div class="ov-hero-stat-lbl">Last Updated</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${queries}</div><div class="ov-hero-stat-lbl">Queries Tracking</div></div>`;
  } else if (heroStatsEl && _activePreset === 'seo_manager') {
    // SEO: Show technical diagnostic stats
    const qLimit = getUserLimits().queries;
    const durationMs = lastRun && lastRun.durationMs ? lastRun.durationMs : 0;
    const ds = Math.floor(durationMs / 1000);
    const dm = Math.floor(ds / 60);
    const dsec = ds % 60;
    const durText = durationMs ? (dm > 0 ? dm + 'm ' + dsec + 's' : dsec + 's') : '--';
    heroStatsEl.innerHTML = `
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${mentions} / ${totalResults}</div><div class="ov-hero-stat-lbl">Mentions / Responses</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${activePlats} / ${PLATS.length}</div><div class="ov-hero-stat-lbl">Platforms Active</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${queries} / ${qLimit}</div><div class="ov-hero-stat-lbl">Queries / Limit</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${durText}</div><div class="ov-hero-stat-lbl">Crawl Duration</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val" id="ov-last-run-age">${runAgeText}</div><div class="ov-hero-stat-lbl">Data Freshness</div></div>`;
  } else if (heroStatsEl && _activePreset === 'agency_manager') {
    // Agency: Show client-focused summary
    const healthStatus = activePlats >= PLATS.length ? 'Healthy' : activePlats > PLATS.length / 2 ? 'Partial' : activePlats > 0 ? 'Degraded' : 'Offline';
    const healthColor = activePlats >= PLATS.length ? 'var(--green)' : activePlats > PLATS.length / 2 ? 'var(--amber)' : 'var(--red)';
    heroStatsEl.innerHTML = `
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${mentions} / ${totalResults}</div><div class="ov-hero-stat-lbl">Mentions / Total</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val" style="color:${healthColor}">${healthStatus}</div><div class="ov-hero-stat-lbl">System Health</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${activePlats}</div><div class="ov-hero-stat-lbl">Active Platforms</div></div>
      <div class="ov-hero-stat"><div class="ov-hero-stat-val" id="ov-last-run-age">${runAgeText}</div><div class="ov-hero-stat-lbl">Last Run</div></div>`;
  } else {
    // Custom/default: original stats
    el('ov-mentions').textContent = mentions + ' / ' + totalResults;
    el('ov-platforms').textContent = activePlats + ' / ' + PLATS.length;
    const qLimit = getUserLimits().queries;
    el('ov-queries').textContent = queries + ' / ' + qLimit;
    el('ov-queries').style.color = queries >= qLimit ? 'var(--red)' : '';
    el('ov-last-run-age').textContent = runAgeText;
    el('ov-last-run-age').style.color = ageDotClass === 'bad' ? 'var(--red)' : ageDotClass === 'warn' ? 'var(--amber)' : '';

    // Run duration — show how long the last crawl took
    const durationEl = el('ov-run-duration');
    if (lastRun && lastRun.durationMs) {
      const ds = Math.floor(lastRun.durationMs / 1000);
      const dm = Math.floor(ds / 60);
      const dsec = ds % 60;
      durationEl.textContent = dm > 0 ? dm + 'm ' + dsec + 's' : dsec + 's';
    } else {
      durationEl.textContent = '--';
    }
  }

  // Update last-run-age color for all presets
  const runAgeEl = el('ov-last-run-age');
  if (runAgeEl) {
    runAgeEl.style.color = ageDotClass === 'bad' ? 'var(--red)' : ageDotClass === 'warn' ? 'var(--amber)' : '';
  }

  // ─── Single-pass aggregation over allResults ─────────────────
  // Compute all stats in ONE loop instead of 15+ separate .filter() calls.
  // For 80+ results, this avoids ~1,200+ redundant array iterations.
  let _ovValid = 0, _ovErrs = 0, _ovMentioned = 0, _ovRec = 0;
  let _ovPos = 0, _ovNeg = 0, _ovNeu = 0;
  let _ovLocTotal = 0, _ovLocRelevant = 0;
  const _ovHealthyPlats = new Set(), _ovAllPlats = new Set();
  const _ovChatAI = new Set(['ChatGPT', 'Claude', 'Grok', 'DeepSeek']);
  const _ovSearchAI = new Set(['Perplexity', 'Google AIO', 'Gemini']);
  let _ovChatTotal = 0, _ovChatMentioned = 0, _ovSearchTotal = 0, _ovSearchMentioned = 0;
  const _ovNegResults = [];
  const _ovPlatMentions = {};
  const _ovLocCounts = {};
  if (lastRun && lastRun.allResults) {
    for (const r of lastRun.allResults) {
      _ovAllPlats.add(r.platform);
      if (r.error) { _ovErrs++; continue; }
      _ovValid++;
      _ovHealthyPlats.add(r.platform);
      if (!_ovPlatMentions[r.platform]) _ovPlatMentions[r.platform] = { total: 0, found: 0 };
      _ovPlatMentions[r.platform].total++;
      if (_ovChatAI.has(r.platform)) { _ovChatTotal++; }
      if (_ovSearchAI.has(r.platform)) { _ovSearchTotal++; }
      if (r.mentioned) {
        _ovMentioned++;
        if (_ovPlatMentions[r.platform]) _ovPlatMentions[r.platform].found++;
        if (_ovChatAI.has(r.platform)) _ovChatMentioned++;
        if (_ovSearchAI.has(r.platform)) _ovSearchMentioned++;
        if (r.sentiment === 'positive') _ovPos++;
        else if (r.sentiment === 'negative') { _ovNeg++; _ovNegResults.push(r); }
        else _ovNeu++;
        if (r.locationRelevant !== undefined) { _ovLocTotal++; if (r.locationRelevant) _ovLocRelevant++; }
        if (r.matchedLocation) {
          const loc = r.matchedLocation.charAt(0).toUpperCase() + r.matchedLocation.slice(1);
          _ovLocCounts[loc] = (_ovLocCounts[loc] || 0) + 1;
        }
      }
      if (r.recommended) _ovRec++;
    }
  }

  // ─── API Health Banner ───────────────────────────────────────
  const healthEl = el('ov-api-health');
  if (lastRun && lastRun.allResults) {
    const dotColor = _ovErrs === 0 ? 'var(--green)' : _ovErrs <= 3 ? 'var(--amber)' : 'var(--red)';
    if (_activePreset === 'seo_manager') {
      // SEO Manager: Detailed diagnostic health banner
      const successRate = _ovValid > 0 ? Math.round(_ovValid / (_ovValid + _ovErrs) * 100) : 0;
      healthEl.innerHTML = `<div class="ov-health">
        <div class="ov-health-dot" style="background:${dotColor};"></div>
        <div class="ov-health-text">
          <strong>${_ovHealthyPlats.size}/${_ovAllPlats.size}</strong> platforms healthy ·
          <strong>${_ovValid}</strong> valid responses ·
          <strong>${successRate}%</strong> success rate ·
          <span style="color:${_ovErrs > 0 ? 'var(--red)' : 'inherit'}">${_ovErrs} error${_ovErrs !== 1 ? 's' : ''}</span>
        </div>
        ${_ovErrs > 0 ? `<a href="#" onclick="go('activitylog');return false;" style="font-family:var(--mono);font-size:10px;color:var(--red);text-decoration:none;margin-left:auto;">Diagnose Errors →</a>` : `<span style="font-family:var(--mono);font-size:10px;color:var(--green);margin-left:auto;">All Systems Go</span>`}
      </div>`;
    } else if (_activePreset === 'agency_manager') {
      // Agency Manager: Status-focused health strip
      const statusLabel = _ovErrs === 0 ? 'ALL CLEAR' : _ovErrs <= 3 ? 'MINOR ISSUES' : 'ATTENTION NEEDED';
      healthEl.innerHTML = `<div class="ov-health">
        <div class="ov-health-dot" style="background:${dotColor};"></div>
        <div class="ov-health-text"><strong style="letter-spacing:.5px;">${statusLabel}</strong> · ${_ovHealthyPlats.size}/${_ovAllPlats.size} platforms · ${_ovValid} responses · ${_ovErrs} error${_ovErrs !== 1 ? 's' : ''}</div>
        ${_ovErrs > 0 ? `<a href="#" onclick="go('activitylog');return false;" style="font-family:var(--mono);font-size:10px;color:var(--red);text-decoration:none;margin-left:auto;">View Logs →</a>` : ''}
      </div>`;
    } else {
      healthEl.innerHTML = `<div class="ov-health">
        <div class="ov-health-dot" style="background:${dotColor};"></div>
        <div class="ov-health-text"><strong>${_ovHealthyPlats.size}/${_ovAllPlats.size}</strong> platforms healthy · <strong>${_ovValid}</strong> ok · <span style="color:${_ovErrs > 0 ? 'var(--red)' : 'inherit'}">${_ovErrs} error${_ovErrs !== 1 ? 's' : ''}</span></div>
        ${_ovErrs > 0 ? `<a href="#" onclick="go('activitylog');return false;" style="font-family:var(--mono);font-size:10px;color:var(--red);text-decoration:none;margin-left:auto;">View Errors →</a>` : ''}
      </div>`;
    }
  } else {
    healthEl.innerHTML = '';
  }

  // ─── GEO & Sentiment Scores ──────────────────────────────────
  const scoresRow = el('ov-scores-row');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const mentionRate = _ovValid > 0 ? _ovMentioned / _ovValid : 0;
    const recommendRate = _ovValid > 0 ? _ovRec / _ovValid : 0;
    const locationRate = _ovLocTotal > 0 ? _ovLocRelevant / _ovLocTotal : 0;
    const geoScore = Math.round((mentionRate * 40 + recommendRate * 35 + locationRate * 25));
    const geoColor = geoScore >= 60 ? 'var(--green)' : geoScore >= 30 ? 'var(--amber)' : 'var(--red)';
    const geoLabel = geoScore >= 70 ? 'Strong' : geoScore >= 40 ? 'Growing' : geoScore > 0 ? 'Weak' : 'Not Visible';

    const mentionedTotal = _ovPos + _ovNeg + _ovNeu;
    const posCount = _ovPos, negCount = _ovNeg, neuCount = _ovNeu;
    const sentimentScore = mentionedTotal > 0 ? Math.round(((posCount * 100 + neuCount * 50) / mentionedTotal)) : 0;
    const sentColor = sentimentScore >= 70 ? 'var(--green)' : sentimentScore >= 40 ? 'var(--amber)' : sentimentScore > 0 ? 'var(--red)' : 'var(--muted)';

    const recPct = _ovValid > 0 ? Math.round(recommendRate * 100) : 0;
    const recColor = recPct >= 40 ? 'var(--green)' : recPct > 0 ? 'var(--amber)' : 'var(--muted)';

    if (_activePreset === 'founder') {
      // Founder view: Large centered score cards with progress bars
      scoresRow.innerHTML = `
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${geoColor};">${geoScore}</div>
            <div class="ov-score-label">GEO Score</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${geoScore}%;background:${geoColor};"></div></div>
            <div class="ov-score-tag" style="color:${geoColor};">${geoLabel}</div>
          </div>
        </div>
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${sentColor};">${sentimentScore}</div>
            <div class="ov-score-label">Brand Perception</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${sentimentScore}%;background:${sentColor};"></div></div>
            <div class="ov-score-breakdown"><span style="color:var(--green);">+${posCount} positive</span> <span style="color:var(--muted);">~${neuCount} neutral</span> <span style="color:var(--red);">-${negCount} negative</span></div>
          </div>
        </div>
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${recColor};">${recPct}<span class="ov-score-unit">%</span></div>
            <div class="ov-score-label">AI Recommends You</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${recPct}%;background:${recColor};"></div></div>
            <div class="ov-score-tag" style="color:${recColor};">${recPct >= 50 ? 'Strong endorsement rate' : recPct > 0 ? 'Room to grow' : 'Not yet recommended'}</div>
          </div>
        </div>
      `;
    } else {
      scoresRow.innerHTML = `
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${geoColor};">${geoScore}</div>
            <div class="ov-score-label">GEO Score</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${geoScore}%;background:${geoColor};"></div></div>
            <div class="ov-score-tag" style="color:${geoColor};">${geoLabel}</div>
          </div>
        </div>
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${sentColor};">${sentimentScore}</div>
            <div class="ov-score-label">AI Sentiment</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${sentimentScore}%;background:${sentColor};"></div></div>
            <div class="ov-score-breakdown"><span style="color:var(--green);">+${posCount} positive</span> <span style="color:var(--muted);">~${neuCount} neutral</span> <span style="color:var(--red);">-${negCount} negative</span></div>
          </div>
        </div>
        <div class="ov-score-card">
          <div class="ov-score-body">
            <div class="ov-score-val" style="color:${recColor};">${recPct}<span class="ov-score-unit">%</span></div>
            <div class="ov-score-label">AI Recommends You</div>
            <div class="ov-score-bar"><div class="ov-score-bar-fill" style="width:${recPct}%;background:${recColor};"></div></div>
            <div class="ov-score-tag" style="color:${recColor};">${recPct >= 50 ? 'Strong endorsement' : recPct > 0 ? 'Moderate endorsement' : 'Not yet'}</div>
          </div>
        </div>
      `;
    }
  } else {
    scoresRow.innerHTML = '';
  }

  // ─── Category SOV + Best/Worst Row ───────────────────────────
  const catRow = el('ov-category-row');
  const catSection = el('ov-category-section');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const chatSOV = _ovChatTotal > 0 ? Math.round(_ovChatMentioned / _ovChatTotal * 100) : 0;
    const searchSOV = _ovSearchTotal > 0 ? Math.round(_ovSearchMentioned / _ovSearchTotal * 100) : 0;

    const platEntries = Object.entries(lastRun.platforms || {});
    const best = platEntries.length ? platEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null;

    function catColor(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; }

    let catHtml = '';
    catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${catColor(chatSOV)};">
      <div class="ov-cat-label">💬 Chat AI SOV</div>
      <div class="ov-cat-val" style="color:${catColor(chatSOV)};">${chatSOV}%</div>
      <div class="ov-cat-detail">Mentioned in ${_ovChatMentioned} of ${_ovChatTotal} responses</div>
      <div class="ov-cat-sub">ChatGPT · Claude · Grok · DeepSeek</div>
    </div>`;
    catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${catColor(searchSOV)};">
      <div class="ov-cat-label">🔍 Search AI SOV</div>
      <div class="ov-cat-val" style="color:${catColor(searchSOV)};">${searchSOV}%</div>
      <div class="ov-cat-detail">Mentioned in ${_ovSearchMentioned} of ${_ovSearchTotal} responses</div>
      <div class="ov-cat-sub">Perplexity · Google AIO · Gemini</div>
    </div>`;
    if (best) {
      catHtml += `<div class="ov-cat-card" style="border-top:2px solid var(--green);">
        <div class="ov-cat-label">🏆 Best Platform</div>
        <div class="ov-cat-val" style="color:var(--green);">${esc(best[0])}</div>
        <div class="ov-cat-sub">${best[1]}% SOV — strongest visibility</div>
      </div>`;
    }
    catRow.innerHTML = catHtml;
    catRow.classList.add('ov-animate-stagger');
    catRow.style.gridTemplateColumns = `repeat(3, 1fr)`;
    if (catSection) catSection.style.display = '';
  } else {
    catRow.innerHTML = '';
    if (catSection) catSection.style.display = 'none';
  }

  // ─── Location Visibility ────────────────────────────────────
  const locViz = el('ov-location-viz');
  if (lastRun && lastRun.allResults && b.city) {
    const locRate = _ovLocTotal > 0 ? Math.round(_ovLocRelevant / _ovLocTotal * 100) : 0;
    const topLocs = Object.entries(_ovLocCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const nearbyAreas = b.nearbyAreas || [];

    let locHtml = `<div class="ov-card ov-loc-card">
      <div class="ov-card-head">
        <div class="ov-card-title">📍 Location Visibility</div>
        <div class="ov-card-sub">${esc(b.city)}${nearbyAreas.length ? ' + ' + nearbyAreas.length + ' nearby areas' : ''}</div>
      </div>
      <div class="ov-loc-grid">
        <div class="ov-loc-stat">
          <div class="ov-loc-stat-val" style="color:${locRate >= 50 ? 'var(--green)' : locRate > 0 ? 'var(--amber)' : 'var(--red)'};">${locRate}%</div>
          <div class="ov-loc-stat-lbl">City Match Rate</div>
          <div class="ov-loc-stat-sub">AI mentions your location</div>
        </div>
        <div class="ov-loc-areas">
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px;">AREAS WHERE AI FINDS YOU</div>`;
    if (topLocs.length > 0) {
      topLocs.forEach(([loc, count]) => {
        locHtml += `<div class="ov-loc-area-tag"><span>${esc(loc)}</span><span class="ov-loc-area-count">${count}×</span></div>`;
      });
    } else {
      locHtml += `<div style="font-size:11px;color:var(--muted);">No location matches found yet. Run more queries with location-specific terms.</div>`;
    }
    locHtml += `</div></div>`;
    if (locRate < 50 && locRate >= 0) {
      locHtml += `<div class="ov-loc-tip">💡 <strong>Tip:</strong> Include "${esc(b.city)}" in your queries (e.g., "best ${esc(b.industry || 'company')} in ${esc(b.city)}") to test local AI visibility.</div>`;
    }
    locHtml += `</div>`;
    locViz.innerHTML = locHtml;
    locViz.style.display = 'block';
  } else {
    locViz.style.display = 'none';
  }

  // ─── Actionable Insights ──────────────────────────────────────
  const insightsEl = el('ov-insights');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const tips = [];

    // Analyze platform gaps using pre-computed _ovPlatMentions
    const strongPlats = [];
    const weakPlats = [];
    const missingPlats = [];
    Object.entries(_ovPlatMentions).forEach(([p, s]) => {
      if (s.total === 0) return;
      const rate = s.found / s.total;
      if (rate >= 0.5) strongPlats.push(p);
      else if (rate > 0) weakPlats.push(p);
      else missingPlats.push(p);
    });

    if (strongPlats.length > 0 && missingPlats.length > 0) {
      tips.push({ type: 'gap', icon: '⚡', title: 'Platform Gap Detected', text: `Strong on <strong>${strongPlats.join(', ')}</strong> but invisible on <strong>${missingPlats.join(', ')}</strong>. Different AI platforms pull from different sources — diversify your online presence.`, color: 'var(--amber)' });
    }

    if (sov === 0 && _ovValid > 0) {
      tips.push({ type: 'zero', icon: '🎯', title: 'Getting Started with GEO', text: `AI platforms haven't picked up your brand yet. Focus on: <strong>structured data</strong> on your website, <strong>review profiles</strong> (Google, Yelp), and <strong>authoritative backlinks</strong>. These are what AI models reference.`, color: 'var(--blue)' });
    } else if (sov > 0 && sov < 30) {
      tips.push({ type: 'grow', icon: '📈', title: 'Growing Your AI Presence', text: `You're appearing in ${sov}% of queries. To boost this: create <strong>FAQ-style content</strong> that directly answers common questions, and ensure your <strong>Google Business Profile</strong> is fully optimized.`, color: 'var(--green)' });
    }

    // Sentiment insight using pre-computed _ovNegResults
    if (_ovNegResults.length > 0) {
      tips.push({ type: 'sentiment', icon: '⚠', title: 'Negative Sentiment Detected', text: `${_ovNegResults.length} AI response${_ovNegResults.length > 1 ? 's' : ''} show negative sentiment about your brand. Check <a href="#" onclick="go('mentions');return false;" style="color:var(--red);">All Results</a> to see what AI is saying and address underlying issues.`, color: 'var(--red)' });
    }

    // Recommendation tip using pre-computed _ovMentioned and _ovRec
    const recRate = _ovMentioned > 0 ? _ovRec / _ovMentioned : 0;
    if (_ovMentioned > 0 && recRate < 0.3) {
      tips.push({ type: 'rec', icon: '★', title: 'Low Recommendation Rate', text: `AI mentions you but rarely <strong>recommends</strong> you. Earn more positive reviews, add customer testimonials to your site, and build authority with case studies and awards.`, color: 'var(--amber)' });
    }

    // Location tip
    if (b.city && !b.nearbyAreas?.length) {
      tips.push({ type: 'nearby', icon: '📍', title: 'Add Nearby Areas', text: `You've set ${esc(b.city)} as your location but haven't added nearby areas. Go to <a href="#" onclick="go('setup');return false;" style="color:var(--green);">Brand Setup</a> and auto-fetch nearby cities to expand local tracking.`, color: 'var(--blue)' });
    }

    if (tips.length > 0) {
      const insTitle = _activePreset === 'founder' ? 'Executive Action Items' : 'Actionable Insights';
      const insSub = _activePreset === 'founder' ? `${tips.length} recommendation${tips.length !== 1 ? 's' : ''} for growth` : `${tips.length} tip${tips.length !== 1 ? 's' : ''}`;
      let insHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${insTitle}</div><div class="ov-card-sub">${insSub}</div></div>`;
      tips.forEach(t => {
        insHtml += `<div class="ov-insight" style="border-left-color:${t.color};">
          <div class="ov-insight-head"><span class="ov-insight-icon">${t.icon}</span><strong>${t.title}</strong></div>
          <div class="ov-insight-text">${t.text}</div>
        </div>`;
      });
      insHtml += `</div>`;
      insightsEl.innerHTML = insHtml;
      insightsEl.style.display = 'block';
    } else {
      insightsEl.style.display = 'none';
    }
  } else {
    insightsEl.style.display = 'none';
  }

  // ─── Platform Cards ──────────────────────────────────────────
  const pg = el('ov-plat-grid');
  pg.innerHTML = '';
  pg.classList.add('ov-animate-stagger');
  const platSOV = lastRun ? (lastRun.platforms||{}) : {};
  PLATS.forEach(plat => {
    const t = PLAT_THEME[plat]||{};
    const pSov = platSOV[plat]||0;
    const keyId = plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai').replace('googleaio','gemini');
    const active = keyStatus[keyId];
    const barColor = pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--border)';
    const div = document.createElement('div');
    div.className = 'ov-plat-card';
    div.innerHTML = `<div class="ov-plat-name" style="color:${t.color||'var(--text)'}">${plat}</div>
      <div class="ov-plat-status" style="color:${active ? 'var(--green)' : 'var(--muted)'}">${active ? '● ACTIVE' : '○ INACTIVE'}</div>
      <div class="ov-plat-bar"><div class="ov-plat-bar-fill" style="width:${pSov}%;background:${barColor};"></div></div>
      <div class="ov-plat-sov" style="color:${pSov > 0 ? t.color || 'var(--green)' : 'var(--muted)'}">${pSov}%</div>`;
    pg.appendChild(div);
  });

  // ─── Query Performance ────────────────────────────────────────
  const qpEl = el('ov-query-perf');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const queryStats = {};
    lastRun.allResults.filter(r => !r.error).forEach(r => {
      const q = r.query || 'Unknown';
      if (!queryStats[q]) queryStats[q] = { total: 0, found: 0 };
      queryStats[q].total++;
      if (r.mentioned) queryStats[q].found++;
    });
    const sorted = Object.entries(queryStats).map(([q, s]) => ({ query: q, ...s, rate: Math.round(s.found / s.total * 100) })).sort((a, b) => b.rate - a.rate);
    if (sorted.length > 0) {
      const qpTitle = _activePreset === 'seo_manager' ? 'Query Rankings & Performance' : 'Query Performance';
      const avgRate = Math.round(sorted.reduce((sum, s) => sum + s.rate, 0) / sorted.length);
      const qpSub = `${sorted.length} queries · Avg ${avgRate}%`;
      let qpHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${qpTitle}</div><div class="ov-card-sub">${qpSub}</div></div>`;
      const topSorted = sorted.slice(0, 6);
      topSorted.forEach((s, i) => {
        const barColor = s.rate >= 50 ? 'var(--green)' : s.rate > 0 ? 'var(--amber)' : 'var(--red)';
        if (_activePreset === 'seo_manager') {
          // SEO: Show rank number and found/total counts
          qpHtml += `<div class="ov-qp-bar">
            <span style="font-family:var(--mono);font-size:9px;color:var(--muted);width:20px;flex-shrink:0;">#${i+1}</span>
            <div class="ov-qp-query">${esc(s.query)}</div>
            <span style="font-family:var(--mono);font-size:10px;color:var(--muted);flex-shrink:0;">${s.found}/${s.total}</span>
            <div class="ov-qp-track"><div class="ov-qp-fill" style="width:${s.rate}%;background:${barColor};"></div></div>
            <div class="ov-qp-rate" style="color:${barColor};">${s.rate}%</div>
          </div>`;
        } else {
          qpHtml += `<div class="ov-qp-bar">
            <div class="ov-qp-query">${esc(s.query)}</div>
            <div class="ov-qp-track"><div class="ov-qp-fill" style="width:${s.rate}%;background:${barColor};"></div></div>
            <div class="ov-qp-rate" style="color:${barColor};">${s.rate}%</div>
          </div>`;
        }
      });
      qpHtml += `</div>`;
      qpEl.innerHTML = qpHtml;
    } else { qpEl.innerHTML = ''; }
  } else { qpEl.innerHTML = ''; }

  // ─── Top Competitors ─────────────────────────────────────────
  const compEl = el('ov-competitors');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const brandName = (b.name || '').toLowerCase();
    const competitors = {};
    lastRun.allResults.forEach(r => {
      if (!r.raw && !r.context) return;
      const text = (r.raw || r.context || '');
      const patterns = [
        /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9' &\-\.]+)\*?\*?/g,
        /(?:^|\n)\s*[-•]\s*\*?\*?([A-Z][A-Za-z0-9' &\-\.]+)\*?\*?/g
      ];
      patterns.forEach(pat => {
        let m;
        while ((m = pat.exec(text)) !== null) {
          const name = m[1].trim().replace(/\*+/g, '').replace(/\s*[-—:].*/,'').trim();
          if (name.length >= 3 && name.length <= 50 && name.toLowerCase() !== brandName && !/^(the|and|for|with|best|top|most|also|here|this|that|these|note)$/i.test(name)) {
            competitors[name] = (competitors[name] || 0) + 1;
          }
        }
      });
    });
    const topComp = Object.entries(competitors).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (topComp.length > 0) {
      const compTitle = _activePreset === 'founder' ? 'Competitive Landscape' : _activePreset === 'agency_manager' ? 'Competitor Tracking' : 'Competitors in AI';
      const compSub = _activePreset === 'founder' ? `${topComp.length} brands competing for AI mentions` : _activePreset === 'agency_manager' ? `${topComp.length} brands detected across platforms` : `${topComp.length} brands`;
      let compHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${compTitle}</div><div class="ov-card-sub">${compSub}</div></div>`;

      if (_activePreset === 'agency_manager') {
        // Agency: Show as a ranked list with position numbers
        compHtml += `<div style="display:flex;flex-direction:column;gap:6px;">`;
        topComp.forEach(([name, count], i) => {
          const barW = Math.round(count / topComp[0][1] * 100);
          compHtml += `<div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:var(--mono);font-size:10px;color:var(--muted);width:18px;text-align:right;">#${i+1}</span>
            <span style="font-size:12px;font-weight:600;width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
            <div style="flex:1;height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${barW}%;background:rgba(20,184,166,.5);border-radius:2px;"></div></div>
            <span style="font-family:var(--mono);font-size:11px;color:var(--muted);">${count}x</span>
          </div>`;
        });
        compHtml += `</div>`;
      } else {
        compHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
        topComp.forEach(([name, count]) => {
          compHtml += `<div class="ov-comp-chip"><span>${esc(name)}</span><span class="ov-comp-count">${count}x</span></div>`;
        });
        compHtml += `</div>`;
      }
      compHtml += `</div>`;
      compEl.innerHTML = compHtml;
    } else { compEl.innerHTML = ''; }
  } else { compEl.innerHTML = ''; }

  // ─── Citation Sources ─────────────────────────────────────────
  const citEl = el('ov-citations');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const allCites = [];
    lastRun.allResults.forEach(r => {
      const citeArr = r.citations || r.cites || [];
      if (citeArr.length) {
        citeArr.forEach(url => allCites.push(url));
      }
    });
    if (allCites.length > 0) {
      // Group by domain
      const domainCounts = {};
      allCites.forEach(url => {
        try {
          const domain = new URL(url).hostname.replace(/^www\./, '');
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        } catch(e) {}
      });
      const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const brandDomain = b.website ? b.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : '';

      const citTitle = _activePreset === 'seo_manager' ? 'Citation Analysis' : 'Citation Sources';
      const citSub = _activePreset === 'seo_manager' ? `${topDomains.length} domains · ${allCites.length} total citations` : 'Where AI pulls information from';
      let citHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${citTitle}</div><div class="ov-card-sub">${citSub}</div></div>`;
      citHtml += `<div class="ov-cit-list">`;
      topDomains.forEach(([domain, count]) => {
        const isOwn = brandDomain && domain.includes(brandDomain);
        citHtml += `<div class="ov-cit-item${isOwn ? ' ov-cit-own' : ''}">
          <span class="ov-cit-domain">${isOwn ? '★ ' : ''}${esc(domain)}</span>
          <span class="ov-cit-bar"><span class="ov-cit-bar-fill" style="width:${Math.round(count / topDomains[0][1] * 100)}%;"></span></span>
          <span class="ov-cit-count">${count}×</span>
        </div>`;
      });
      citHtml += `</div>`;
      if (!brandDomain) {
        citHtml += `<div class="ov-cit-tip">💡 Add your website in <a href="#" onclick="go('setup');return false;" style="color:var(--green);">Brand Setup</a> to see if AI cites your own site.</div>`;
      } else if (!topDomains.some(([d]) => d.includes(brandDomain))) {
        citHtml += `<div class="ov-cit-tip">⚠ Your website <strong>${esc(brandDomain)}</strong> is not being cited by AI. Focus on building authoritative, AI-crawlable content.</div>`;
      }
      citHtml += `</div>`;
      citEl.innerHTML = citHtml;
      citEl.style.display = 'block';
    } else {
      citEl.style.display = 'none';
    }
  } else {
    citEl.style.display = 'none';
  }

  // ─── Last Run Summary ────────────────────────────────────────
  const lrs = el('ov-last-run-summary');
  if (lastRun && lastRun.allResults && lastRun.allResults.length) {
    const errors = lastRun.allResults.filter(r => r.error);
    const found = lastRun.allResults.filter(r => r.mentioned);
    const runTime = new Date(lastRun.time || lastRun.date);
    const summaryTitle = _activePreset === 'agency_manager' ? 'Run Status Report' : _activePreset === 'founder' ? 'Latest Activity' : 'Last Run';
    const timeStr = `${runTime.toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${runTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`;
    let summaryHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${summaryTitle} — ${timeStr}</div></div>`;
    if (errors.length > 0) {
      summaryHtml += `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);padding:10px 14px;margin-bottom:12px;font-family:var(--mono);font-size:11px;border-radius:var(--radius-xs);">`;
      summaryHtml += `<span style="color:var(--red);font-weight:700;">${errors.length} API error${errors.length>1?'s':''}</span>`;
      summaryHtml += `<span style="color:var(--muted);margin-left:8px;">— Check API keys or <a href="#" onclick="go('activitylog');return false;" style="color:var(--red);text-decoration:none;">view logs</a></span>`;
      summaryHtml += `</div>`;
    }
    summaryHtml += `<div style="font-family:var(--mono);font-size:11px;color:var(--muted);">${found.length} found / ${lastRun.allResults.length} total responses · <a href="#" onclick="go('mentions');return false;" style="color:var(--green);text-decoration:none;">View All Results →</a></div>`;
    if (found.length === 0 && lastRun.allResults.length > 0 && errors.length === 0) {
      summaryHtml += `<div style="background:rgba(59,130,246,.05);border:1px solid rgba(59,130,246,.15);padding:12px 14px;margin-top:12px;font-size:12px;line-height:1.6;border-radius:var(--radius-xs);">
        <div style="color:var(--blue);font-weight:700;font-size:10px;font-family:var(--mono);letter-spacing:1px;margin-bottom:6px;">WHY 0% SOV?</div>
        <div style="color:var(--muted);">AI platforms don't yet recommend "${esc(b.name)}" for these queries. This is <strong style="color:var(--text);">normal for newer or local brands</strong>.</div>
        <div style="color:var(--muted);margin-top:6px;"><strong style="color:var(--text);">To improve:</strong> Get more reviews, create authoritative content, earn backlinks, and get listed on industry directories.</div>
        <div style="color:var(--muted);margin-top:6px;"><a href="#" onclick="go('proof');return false;" style="color:var(--green);text-decoration:none;">See Evidence & Proof →</a> to view what brands AI recommends instead.</div>
      </div>`;
    }
    summaryHtml += `</div>`;
    lrs.innerHTML = summaryHtml;
    lrs.style.display = 'block';
  } else if (lastRun) {
    lrs.innerHTML = `<div class="ov-card"><div class="ov-card-title">Last Run</div><div style="font-family:var(--mono);font-size:11px;color:var(--muted);">No results recorded. <a href="#" onclick="go('mentions');return false;" style="color:var(--green);text-decoration:none;">View Details →</a></div></div>`;
    lrs.style.display = 'block';
  } else {
    lrs.style.display = 'none';
  }

  // Queries list with count indicator
  const queryCount = (b.queries||[]).length;
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
  const qCountEl = el('ov-query-count');
  if (qCountEl) {
    const atLimit = totalPrompts >= promptLimit;
    qCountEl.textContent = totalPrompts + ' / ' + promptLimit + ' prompts';
    qCountEl.style.color = atLimit ? 'var(--amber)' : 'var(--muted)';
  }
  const limitMsg = el('ov-query-limit-msg');
  if (limitMsg) {
    if (totalPrompts >= promptLimit) {
      limitMsg.textContent = 'Prompt limit reached (' + totalPrompts + '/' + promptLimit + '). Remove a prompt or upgrade your plan for more.';
      limitMsg.style.display = 'block';
    } else {
      limitMsg.style.display = 'none';
    }
  }
  const ql = el('ov-query-list');
  ql.innerHTML = '';
  (b.queries||[]).forEach((q,i) => {
    const tag = document.createElement('span');
    tag.className = 'query-tag';
          if (_querySelectMode) {
                    tag.classList.add('query-tag-selectable');
                            if (_selectedQueryIndices.has(i)) tag.classList.add('query-tag-selected');
                                    tag.addEventListener('click', function(){ toggleQuerySelection(i); });
                                            const cb = document.createElement('input');
                                                    cb.type = 'checkbox';
                                                            cb.checked = _selectedQueryIndices.has(i);
                                                                    cb.className = 'query-select-cb';
                                                                            cb.addEventListener('click', function(e){ e.stopPropagation(); toggleQuerySelection(i); });
                                                                                    tag.insertBefore(cb, tag.firstChild);
                                                                                          }
    const qText = document.createTextNode(q + ' ');
    tag.appendChild(qText);
          if (!_querySelectMode) {
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', function(){ ovRemoveQuery(i); });
    tag.appendChild(btn);
          }
    ql.appendChild(tag);
  });

  // Mini SOV trend chart on overview (lazy-loads Chart.js)
  const miniTrend = el('ov-mini-trend');
  // Update chart section title per preset
  const trendTitle = miniTrend.querySelector('.ov-card-title');
  const trendSub = miniTrend.querySelector('.ov-card-sub');
  if (trendTitle) trendTitle.textContent = _activePreset === 'founder' ? 'Growth Trajectory' : 'SOV Trend';
  if (trendSub) trendSub.textContent = _activePreset === 'founder' ? 'Your AI visibility over time' : 'Last 14 runs';
  const history = b.sovHistory || [];
  if (history.length >= 2) {
    miniTrend.style.display = 'block';
    ensureChartJs().then(() => {
      const miniLabels = history.slice(-14).map(h => {
        const d = new Date(h.date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      const miniData = history.slice(-14).map(h => h.overall);
      if (window._ovMiniChart) { window._ovMiniChart.destroy(); window._ovMiniChart = null; }
      const canvas = el('ov-mini-chart');
      if (!canvas) return;
      const mCtx = canvas.getContext('2d');
      const chartColor = _activePreset === 'founder' ? '#818cf8' : '#FF6154';
      const chartBg = _activePreset === 'founder' ? 'rgba(129,140,248,0.6)' : 'rgba(255,97,84,0.6)';
      const chartBgHover = _activePreset === 'founder' ? 'rgba(129,140,248,0.85)' : 'rgba(255,97,84,0.85)';
      window._ovMiniChart = new Chart(mCtx, {
        type: 'bar',
        data: {
          labels: miniLabels,
          datasets: [{
            label: 'SOV %',
            data: miniData,
            backgroundColor: chartBg,
            hoverBackgroundColor: chartBgHover,
            borderColor: chartColor,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#7a8194', font: { size: 9 } }, grid: { display: false } },
            y: { min: 0, max: 100, ticks: { color: '#7a8194', font: { size: 9 }, callback: v => v + '%' }, grid: { color: '#1a1e25' } }
          }
        }
      });
    }).catch(() => {});
  } else {
    miniTrend.style.display = 'none';
  }
}

async function ovAddQuery(){
  const inp = el('ov-new-query');
  const q = inp.value.trim();
  if (!q) return;
  const b = brand();
  if (!b) return;
  // Total prompts check — count across all brands
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
  if (totalPrompts >= promptLimit) {
    toast('Prompt limit reached (' + totalPrompts + '/' + promptLimit + '). Upgrade your plan for more.', 'err');
    showUpgradeModal('Your plan allows ' + promptLimit + ' total prompts across all brands. You have ' + totalPrompts + '. Upgrade for more.');
    return;
  }
  // Duplicate check (case-insensitive)
  const existing = new Set((b.queries||[]).map(x => x.toLowerCase()));
  if (existing.has(q.toLowerCase())) {
    toast('Query already exists', 'err');
    return;
  }
  const queries = [...(b.queries||[]), q];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    inp.value = '';
    renderOverview();
    toast('Query added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

function toggleBulkAdd(){
  const box = el('bulk-query-box');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') {
    el('bulk-query-input').focus();
    el('bulk-query-input').oninput = function(){
      const lines = this.value.split('\n').filter(l => l.trim());
      el('bulk-count-hint').textContent = lines.length + ' quer' + (lines.length===1?'y':'ies') + ' detected';
    };
  }
}

async function bulkAddQueries(){
  const b = brand();
  if (!b) return;
  const raw = el('bulk-query-input').value;
  const newQs = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!newQs.length) { toast('No queries entered', 'err'); return; }
  // Deduplicate against existing
  const existing = new Set((b.queries||[]).map(q => q.toLowerCase()));
  const unique = newQs.filter(q => !existing.has(q.toLowerCase()));
  if (!unique.length) { toast('All queries already exist', 'err'); return; }
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
  if (totalPrompts + unique.length > promptLimit) {
    const allowed = promptLimit - totalPrompts;
    if (allowed <= 0) { toast('Prompt limit reached (' + totalPrompts + '/' + promptLimit + '). Upgrade your plan.', 'err'); return; }
    unique.splice(allowed);
    toast('Only ' + allowed + ' prompts added (plan limit: ' + promptLimit + ')', 'warn');
  }
  const queries = [...(b.queries||[]), ...unique];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    el('bulk-query-input').value = '';
    el('bulk-query-box').style.display = 'none';
    renderOverview();
    toast(unique.length + ' quer' + (unique.length===1?'y':'ies') + ' added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function ovRemoveQuery(i){
  const b = brand();
  const q = (b.queries||[])[i];
  if (!confirm('Remove query "' + (q || '') + '"?')) return;
  const queries = (b.queries||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    renderOverview();
    toast('Query removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function clearAllQueries(){
  const b = brand(); if (!b) return;
  if (!(b.queries||[]).length) { toast('No queries to clear', 'warn'); return; }
  if (!confirm('Clear all ' + b.queries.length + ' queries? This cannot be undone.')) return;
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries: [] });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    renderOverview();
    toast('All queries cleared', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// —— MULTI-SELECT QUERY MANAGEMENT ——————————————————
let _querySelectMode = false;
let _selectedQueryIndices = new Set();

function toggleSelectMode() {
  _querySelectMode = !_querySelectMode;
    _selectedQueryIndices.clear();
      const btn = el('ov-select-mode-btn');
        const delBtn = el('ov-delete-selected-btn');
          const selAllBtn = el('ov-select-all-btn');
            const deselAllBtn = el('ov-deselect-all-btn');
              if (btn) btn.textContent = _querySelectMode ? '✓ SELECTING' : '☐ SELECT';
                if (btn) btn.classList.toggle('ov-btn-active', _querySelectMode);
                  if (delBtn) delBtn.style.display = _querySelectMode ? '' : 'none';
                    if (selAllBtn) selAllBtn.style.display = _querySelectMode ? '' : 'none';
                      if (deselAllBtn) deselAllBtn.style.display = _querySelectMode ? '' : 'none';
                        updateSelectedCount();
                          renderOverview();
                          }

                          function toggleQuerySelection(i) {
                            if (_selectedQueryIndices.has(i)) {
                                _selectedQueryIndices.delete(i);
                                  } else {
                                      _selectedQueryIndices.add(i);
                                        }
                                          updateSelectedCount();
                                            renderOverview();
                                            }

                                            function selectAllQueries() {
                                              const b = brand();
                                                (b.queries||[]).forEach((_, i) => _selectedQueryIndices.add(i));
                                                  updateSelectedCount();
                                                    renderOverview();
                                                    }

                                                    function deselectAllQueries() {
                                                      _selectedQueryIndices.clear();
                                                        updateSelectedCount();
                                                          renderOverview();
                                                          }

                                                          function updateSelectedCount() {
                                                            const countEl = el('ov-selected-count');
                                                              if (countEl) countEl.textContent = _selectedQueryIndices.size;
                                                                const delBtn = el('ov-delete-selected-btn');
                                                                  if (delBtn) delBtn.disabled = _selectedQueryIndices.size === 0;
                                                                  }

                                                                  async function deleteSelectedQueries() {
                                                                    const b = brand(); if (!b) return;
                                                                      const count = _selectedQueryIndices.size;
                                                                        if (count === 0) { toast('No queries selected', 'warn'); return; }
                                                                          if (!confirm('Delete ' + count + ' selected quer' + (count===1?'y':'ies') + '? This cannot be undone.')) return;
                                                                            const queries = (b.queries||[]).filter((_, idx) => !_selectedQueryIndices.has(idx));
                                                                              try {
                                                                                  const data = await api('PUT', '/api/brands/'+b.id, { queries });
                                                                                      invalidateCache('/api/brands');
                                                                                      const idx = brands.findIndex(x => x.id === b.id);
                                                                                          brands[idx] = data.brand;
                                                                                              _selectedQueryIndices.clear();
                                                                                                  _querySelectMode = false;
                                                                                                      const btn = el('ov-select-mode-btn');
                                                                                                          const delBtn = el('ov-delete-selected-btn');
                                                                                                              const selAllBtn = el('ov-select-all-btn');
                                                                                                                  const deselAllBtn = el('ov-deselect-all-btn');
                                                                                                                      if (btn) { btn.textContent = '☐ SELECT'; btn.classList.remove('ov-btn-active'); }
                                                                                                                          if (delBtn) delBtn.style.display = 'none';
                                                                                                                              if (selAllBtn) selAllBtn.style.display = 'none';
                                                                                                                                  if (deselAllBtn) deselAllBtn.style.display = 'none';
                                                                                                                                      renderOverview();
                                                                                                                                          toast(count + ' quer' + (count===1?'y':'ies') + ' removed', 'ok');
                                                                                                                                            } catch(e) { toast(e.message, 'err'); }
                                                                                                                                            }

async function aiGenerateQueries(){
  const b = brand(); if (!b) return;
  if (!b.name) { toast('Set brand name first', 'err'); return; }
  if (!b.industry) { toast('Set industry in Brand Setup first', 'err'); return; }
  const btn = el('ai-gen-queries-btn');
  const origText = btn.textContent;
  btn.textContent = 'GENERATING...';
  btn.disabled = true;
  try {
    const data = await api('POST', '/api/ai-generate-queries', {
      brandName: b.name,
      industry: b.industry,
      city: b.city || '',
      existingQueries: b.queries || []
    });
    const suggestions = data.queries || [];
    if (!suggestions.length) { toast('AI could not generate queries. Try again.', 'warn'); return; }
    // Deduplicate
    const existing = new Set((b.queries||[]).map(q => q.toLowerCase()));
    let newQs = suggestions.filter(q => !existing.has(q.toLowerCase()));
    if (!newQs.length) { toast('All generated queries already exist!', 'ok'); return; }
    const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
    const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
    const remaining = promptLimit - totalPrompts;
    if (remaining <= 0) { toast('Prompt limit reached. Upgrade your plan.', 'err'); return; }
    if (newQs.length > remaining) newQs = newQs.slice(0, remaining);
    const pick = confirm('Add ' + newQs.length + ' AI-generated queries?\n\n' + newQs.join('\n'));
    if (!pick) return;
    const queries = [...(b.queries||[]), ...newQs];
    const result = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    updateBrandInList(result.brand);
    renderOverview();
    toast(newQs.length + ' AI-generated queries added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.textContent = origText; btn.disabled = false; }
}

// ─── MENTIONS / ALL RESULTS ───────────────────────────────────────
let mentionsPage = 0;
let MENTIONS_PER_PAGE = 15;

let mentionsPlatFilter = 'all';
let mentionsExpandedRow = null;

function exportMentionsCSV(){
  const b = brand();
  if (!b) return;
  const run = (b.runs||[]).find(r => r.id === el('mentions-run-sel').value);
  if (!run || !run.allResults) return;
  const rows = [['Platform','Model','Query','Status','Sentiment','Recommended','Response Preview']];
  run.allResults.forEach(r => {
    const preview = (r.raw || r.context || '').replace(/[#*_~`\n]/g,' ').substring(0,300);
    rows.push([r.platform, r.model||'', r.query, r.error?'ERROR':r.mentioned?'Mentioned':'Not Found', r.sentiment||'neutral', r.recommended?'Yes':'No', preview]);
  });
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `trackly-mentions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); toast('CSV exported');
}

function toggleMentionRow(idx){
  mentionsExpandedRow = mentionsExpandedRow === idx ? null : idx;
  renderMentions();
}

async function retryQuery(runId, platform, query, btnEl){
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="mt-retry-spin"></span> Retrying...'; }
  try {
    const b = brand();
    if (!b) throw new Error('No brand selected');
    const resp = await fetch(`/api/brands/${b.id}/retry-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ runId, platform, query })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Retry failed');
    // Update local brand data from server response
    const idx = brands.findIndex(x => x.id === b.id);
    if (idx !== -1 && data.brand) brands[idx] = data.brand;
    toast('Query retried successfully');
    mentionsExpandedRow = null;
    renderMentions();
  } catch(e) {
    toast(e.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '↻ Retry'; }
  }
}

async function recheckQuery(runId, platform, query, btnEl){
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="mt-retry-spin"></span> Rechecking...'; }
  try {
    const b = brand();
    if (!b) throw new Error('No brand selected');
    const resp = await fetch(`/api/brands/${b.id}/recheck-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ runId, platform, query })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Recheck failed');
    const idx = brands.findIndex(x => x.id === b.id);
    if (idx !== -1 && data.brand) brands[idx] = data.brand;
    const msg = data.statusChange === 'now_mentioned' ? 'Recheck complete — now mentioned!'
      : data.statusChange === 'no_longer_mentioned' ? 'Recheck complete — no longer mentioned'
      : 'Recheck complete — status unchanged';
    toast(msg);
    mentionsExpandedRow = null;
    renderMentions();
  } catch(e) {
    toast(e.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '⟳ Recheck'; }
  }
}

function renderMentions(){
  const b = brand();
  if (!b) return;
  const cont = el('mentions-container');
  const kpis = el('mentions-kpis');
  const platFilters = el('mentions-plat-filters');

  // Run selector
  const sel = el('mentions-run-sel');
  const curVal = sel.value;
  sel.innerHTML = '';
  const runs = (b.runs||[]).slice().reverse();
  if (!runs.length) {
    kpis.innerHTML = ''; platFilters.innerHTML = '';
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results yet — run queries to start tracking.</p></div>';
    return;
  }
  runs.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    const d = new Date(r.time || r.date || 0);
    const dateStr = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ', ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    opt.textContent = dateStr + '  ·  SOV ' + r.sov + '%';
    sel.appendChild(opt);
  });
  if (curVal && [...sel.options].some(o=>o.value===curVal)) sel.value = curVal;

  const run = (b.runs||[]).find(r => r.id === sel.value);
  if (!run) { kpis.innerHTML=''; platFilters.innerHTML=''; cont.innerHTML=''; return; }
  const all = run.allResults || [];
  if (!all.length) {
    kpis.innerHTML=''; platFilters.innerHTML='';
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results in this run.</p></div>';
    return;
  }
  const runId = sel.value;

  // ── Metrics ──
  const ok = all.filter(r => !r.error);
  const found = all.filter(r => r.mentioned);
  const notfound = ok.filter(r => !r.mentioned);
  const errs = all.filter(r => r.error);
  const pos = found.filter(r => r.sentiment === 'positive');
  const neg = found.filter(r => r.sentiment === 'negative');
  const rec = found.filter(r => r.recommended);
  const sovPct = ok.length ? Math.round(found.length / ok.length * 100) : 0;
  const recPct = ok.length ? Math.round(rec.length / ok.length * 100) : 0;

  // ── Platform counts ──
  const pc = {};
  all.forEach(r => { if (!pc[r.platform]) pc[r.platform]={t:0,f:0}; pc[r.platform].t++; if(r.mentioned)pc[r.platform].f++; });

  // ── KPI Cards (4 cards matching preview) ──
  kpis.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${sovPct}%</div><div class="score-label">Mention Rate</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;">${found.length}/${ok.length}</div><div class="score-label">Found / Total</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${Object.keys(pc).length}</div><div class="score-label">Platforms</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--purple);">${recPct}%</div><div class="score-label">Recommended</div></div>
  </div>`;
  let chips = `<span class="plat-filter ${mentionsPlatFilter==='all'?'active-filter':''}" onclick="mentionsPlatFilter='all';mentionsPage=0;mentionsExpandedRow=null;renderMentions()">All</span>`;
  Object.entries(pc).sort((a,b)=>b[1].f-a[1].f).forEach(([p,c])=>{
    const on=mentionsPlatFilter===p;
    chips+=`<span class="plat-filter ${on?'active-filter':''}" onclick="mentionsPlatFilter='${escAttr(p)}';mentionsPage=0;mentionsExpandedRow=null;renderMentions()">${esc(p)}</span>`;
  });
  platFilters.innerHTML = chips;

  // ── Filter + search ──
  const fv = el('mentions-filter-sel').value;
  const sq = (el('mentions-search').value||'').trim().toLowerCase();
  const filtered = all.filter(r => {
    if (mentionsPlatFilter!=='all' && r.platform!==mentionsPlatFilter) return false;
    if (fv==='mentioned' && !r.mentioned) return false;
    if (fv==='not-mentioned' && (r.mentioned||r.error)) return false;
    if (fv==='recommended' && !r.recommended) return false;
    if (fv==='errors' && !r.error) return false;
    if (sq && !((r.platform||'')+' '+(r.query||'')+' '+(r.raw||r.context||'')+' '+(r.model||'')).toLowerCase().includes(sq)) return false;
    return true;
  });

  if (!filtered.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:48px 0;"><p>No results match your filters.</p></div>';
    return;
  }

  const pages = Math.ceil(filtered.length / MENTIONS_PER_PAGE);
  if (mentionsPage >= pages) mentionsPage = pages - 1;
  if (mentionsPage < 0) mentionsPage = 0;
  const from = mentionsPage * MENTIONS_PER_PAGE;
  const slice = filtered.slice(from, from + MENTIONS_PER_PAGE);

  // ── Results table (preview design) ──
  let html = `<div class="card" style="padding:0;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:var(--bg3);"><th class="th">Platform</th><th class="th">Query</th><th class="th">Status</th><th class="th">Sentiment</th><th class="th">Position</th></tr></thead>
      <tbody>`;
  slice.forEach((r, i) => {
    const t = PLAT_THEME[r.platform]||{};
    const isErr = r.error;
    const sent = r.sentiment||'neutral';
    const statusHtml = isErr ? '<span style="color:var(--amber);font-family:var(--mono);font-size:10px;font-weight:700;">ERROR</span>'
      : r.mentioned ? '<span class="status-found">FOUND</span>'
      : '<span class="status-notfound">NOT FOUND</span>';
    const sentColor = sent==='positive' ? 'var(--green)' : sent==='negative' ? 'var(--red)' : 'var(--muted)';
    const sentLabel = isErr || !r.mentioned ? '—' : `<span style="color:${sentColor};">${sent.charAt(0).toUpperCase()+sent.slice(1)}</span>`;
    const posLabel = r.mentioned && r.listPosition ? '#'+r.listPosition : '—';
    html += `<tr class="trow" style="cursor:pointer;" onclick="toggleMentionRow(${from+i})">
      <td class="td"><span style="color:${t.color||'#888'};font-weight:700;">${esc(r.platform)}</span></td>
      <td class="td">${esc(r.query)}</td>
      <td class="td">${statusHtml}</td>
      <td class="td">${sentLabel}</td>
      <td class="td">${posLabel}</td>
    </tr>`;
    // Expanded detail row
    if (mentionsExpandedRow === from + i) {
      const full = isErr ? friendlyError(r.errorMessage) : (r.raw||r.context||'');
      const hre = brandHighlightRe(b);
      const hlHtml = hre ? mdToHtml(full).replace(hre, (m) => '<mark style="background:rgba(16,185,129,.12);color:var(--green);border-radius:3px;padding:1px 4px;">'+esc(m)+'</mark>') : mdToHtml(full);
      html += `<tr><td colspan="5" style="padding:16px;background:var(--bg);border-bottom:1px solid var(--bg3);">
        <div style="background:var(--bg3);padding:14px;border-radius:var(--radius-xs);font-size:12px;color:var(--text);line-height:1.7;border-left:3px solid ${r.mentioned?'var(--green)':'var(--red)'};">${hlHtml}</div>
        <div style="margin-top:8px;font-family:var(--mono);font-size:9px;color:var(--muted);">Model: ${esc(r.model||'—')} &middot; Position: ${posLabel} &middot; Sentiment: ${sent} &middot; Recommended: ${r.recommended?'Yes':'No'}</div>
      </td></tr>`;
    }
  });
  html += `</tbody></table></div>`;
  html += `<div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--muted);padding:8px;">Showing ${from+1}–${Math.min(from+MENTIONS_PER_PAGE,filtered.length)} of ${filtered.length} results</div>`;

  // Pagination
  if (pages > 1) {
    const ps = Math.max(0, Math.min(mentionsPage - 2, pages - 5));
    const pe = Math.min(pages - 1, ps + 4);
    html += `<div style="display:flex;justify-content:center;gap:4px;margin-top:8px;">`;
    if (mentionsPage > 0) html += `<button class="pbtn" onclick="mentionsPage--;mentionsExpandedRow=null;renderMentions()">‹</button>`;
    for (let p=ps;p<=pe;p++) html += `<button class="pbtn" style="${p===mentionsPage?'background:var(--primary);color:#fff;border-color:var(--primary);':''}" onclick="mentionsPage=${p};mentionsExpandedRow=null;renderMentions()">${p+1}</button>`;
    if (mentionsPage < pages-1) html += `<button class="pbtn" onclick="mentionsPage++;mentionsExpandedRow=null;renderMentions()">›</button>`;
    html += `</div>`;
  }

  cont.innerHTML = html;
}

function openResp(mentionId){
  try {
    const b = brand();
    if (!b) return;
    let m = null;
    // Search all runs
    (b.runs||[]).forEach(r => {
      (r.mentions||[]).forEach(x => { if(x.id===mentionId) m=x; });
    });
    if (!m) (b.mentions||[]).forEach(x => { if(x.id===mentionId) m=x; });
    if (!m) return;
    const t = PLAT_THEME[m.platform]||{};
    const head = el('resp-modal-head');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!head || !titleEl || !queryEl || !textEl) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(m.platform) + ' <span style="color:var(--green);font-size:11px;">— FOUND</span>';
    queryEl.innerHTML = esc(m.query) + (m.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(m.model)+' | Captured: '+new Date(m.time).toLocaleString()+'</div>' : '');
    textEl.style.whiteSpace = 'normal';
    const rawHtml = mdToHtml(m.raw || m.context || '');
    const hre = brandHighlightRe(b);
    textEl.innerHTML = hre ? rawHtml.replace(hre, (m) => '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">'+esc(m)+'</mark>') : rawHtml;
    // Citations
    const cc = el('resp-modal-cites');
    const cites = m.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openResp error:', e); }
}

function openResultFromRun(runId, platform, encodedQuery){
  try {
    const b = brand();
    if (!b) return;
    const q = decodeURIComponent(atob(encodedQuery));
    const run = (b.runs||[]).find(r => r.id === runId);
    if (!run || !run.allResults) return;
    const result = run.allResults.find(x => x.platform===platform && x.query===q);
    if (!result) return;
    const t = PLAT_THEME[platform]||{};
    const head = el('resp-modal-head');
    if (!head) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!titleEl || !queryEl || !textEl) return;
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red);font-size:11px;">— NOT FOUND</span>');
    queryEl.innerHTML = esc(q) + (result.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(result.model)+'</div>' : '');
    textEl.style.whiteSpace = 'normal';
    const rawHtml1 = mdToHtml(result.raw || result.context || '[No response text]');
    const hre1 = brandHighlightRe(b);
    textEl.innerHTML = hre1 ? rawHtml1.replace(hre1, '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">$1</mark>') : rawHtml1;
    // Show citations if any
    const cc = el('resp-modal-cites');
    const cites = result.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openResultFromRun error:', e); }
}

function openFullResult(platform, encodedQuery){
  try {
    const b = brand();
    if (!b) return;
    const q = decodeURIComponent(atob(encodedQuery));
    const proofSel = el('proof-run-sel');
    if (!proofSel) return;
    const run = (b.runs||[]).find(r => r.id === proofSel.value);
    if (!run || !run.allResults) return;
    const result = run.allResults.find(x => x.platform===platform && x.query===q);
    if (!result) return;
    const t = PLAT_THEME[platform]||{};
    const head = el('resp-modal-head');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!head || !titleEl || !queryEl || !textEl) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red);font-size:11px;">— NOT FOUND</span>');
    queryEl.innerHTML = esc(q) + (result.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(result.model)+'</div>' : '');
    textEl.style.whiteSpace = 'normal';
    const rawHtml2 = mdToHtml(result.raw || result.context || '[No response text]');
    const hre2 = brandHighlightRe(b);
    textEl.innerHTML = hre2 ? rawHtml2.replace(hre2, '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">$1</mark>') : rawHtml2;
    // Show citations
    const cc = el('resp-modal-cites');
    const cites = result.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openFullResult error:', e); }
}

// ─── EVIDENCE & PROOF ─────────────────────────────────────────────
function renderProof(){
  const b = brand();
  if (!b) return;
  // Populate run selector
  const sel = el('proof-run-sel');
  const curVal = sel.value;
  sel.innerHTML = '';
  (b.runs||[]).slice().reverse().forEach((r,i) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    const d = new Date(r.time || r.date || 0);
    const dateStr = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    opt.textContent = dateStr + ' — ' + (r.mentions||[]).length + ' mentions, SOV '+r.sov+'%';
    sel.appendChild(opt);
  });
  if (curVal && [...sel.options].some(o=>o.value===curVal)) sel.value = curVal;

  const selectedRunId = sel.value;
  const run = (b.runs||[]).find(r => r.id === selectedRunId);
  const cont = el('proof-container');

  if (!run) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">◆</div><p>No runs yet. Click Run Queries to start.</p></div>';
    return;
  }

  const platFilter = el('proof-plat-sel').value;
  const resultFilter = el('proof-result-sel').value;
  const mentions = run.mentions||[];

  // Build a lookup for ALL results per platform+query (including not-mentioned)
  const allResults = run.allResults || [];

  // CRITICAL: Use queries FROM THE RUN, not current brand queries.
  // If user changed queries after running, evidence must still show original run results.
  // Derive unique queries from run data (allResults + run.queries fallback + brand queries)
  const runQueries = run.queries || [];
  const resultQueries = [...new Set(allResults.map(r => r.query))];
  const queries = runQueries.length ? runQueries : (resultQueries.length ? resultQueries : (b.queries||[]));

  // Evidence summary — stat pills
  const totalResults = allResults.length;
  const foundCount = allResults.filter(r => r.mentioned).length;
  const notFoundCount = totalResults - foundCount - allResults.filter(r => r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const runDate = new Date(run.time || run.date);
  const platCount = (run.activePlatforms||[]).length || new Set(allResults.map(r=>r.platform)).size;
  const sovColor = run.sov >= 70 ? 'var(--green)' : run.sov >= 40 ? 'var(--amber)' : 'var(--red)';

  // Summary strip — 3 colored stat boxes (preview design)
  const summaryEl = el('proof-summary-strip');
  if (summaryEl) {
    summaryEl.innerHTML = `<div style="display:flex;gap:12px;margin-bottom:14px;">
      <div style="flex:1;background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.2);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-family:var(--mono);font-size:18px;font-weight:800;color:var(--green);">${foundCount}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;">Found</div>
      </div>
      <div style="flex:1;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.2);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-family:var(--mono);font-size:18px;font-weight:800;color:var(--red);">${notFoundCount}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;">Not Found</div>
      </div>
      <div style="flex:1;background:rgba(59,130,246,.05);border:1px solid rgba(59,130,246,.2);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-family:var(--mono);font-size:18px;font-weight:800;color:var(--blue);">${totalResults}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;">Total</div>
      </div>
    </div>`;
  }

  // Proof cards — flat list matching preview design
  let html = '';
  let proofCount = 0;
  const proofHre = brandHighlightRe(b);
  allResults.forEach(r => {
    if (platFilter && r.platform !== platFilter) return;
    if (resultFilter === 'found' && !r.mentioned) return;
    if (resultFilter === 'notfound' && (r.mentioned || r.error)) return;
    proofCount++;
    const t = PLAT_THEME[r.platform]||{};
    const isErr = r.error;
    const isMentioned = r.mentioned;
    const responseText = isErr ? '' : (r.raw || r.context || '');
    const excerpt = responseText.replace(/[#*_~`]/g,'').replace(/\n/g,' ').substring(0, 300);
    const highlighted = proofHre ? esc(excerpt).replace(proofHre, (m) => '<strong style="color:var(--green);">'+m+'</strong>') : esc(excerpt);
    const statusHtml = isErr
      ? '<span style="color:var(--amber);font-family:var(--mono);font-size:10px;font-weight:700;">ERROR</span>'
      : isMentioned ? '<span class="status-found">FOUND</span>' : '<span class="status-notfound">NOT FOUND</span>';
    const borderColor = isMentioned ? 'var(--green)' : 'var(--red)';
    const modelName = r.model || r.platform;
    const sentiment = r.sentiment || 'neutral';
    const posLabel = isMentioned && r.listPosition ? '#' + r.listPosition : '—';

    html += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div><span style="font-weight:700;color:${t.color||'#888'};">${esc(r.platform)}</span> <span style="color:var(--muted);font-size:11px;">&middot; ${esc(r.query)}</span></div>
        ${statusHtml}
      </div>
      <div style="background:var(--bg3);padding:14px;border-radius:var(--radius-xs);font-size:12px;color:var(--text);line-height:1.7;border-left:3px solid ${borderColor};">
        ${isErr ? esc(friendlyError(r.errorMessage)) : '"' + highlighted + (excerpt.length >= 300 ? '...' : '') + '"'}
      </div>
      <div style="margin-top:8px;font-family:var(--mono);font-size:9px;color:var(--muted);">Model: ${esc(modelName)} &middot; Position: ${posLabel} &middot; Sentiment: ${sentiment.charAt(0).toUpperCase()+sentiment.slice(1)} &middot; Recommended: ${r.recommended?'Yes':'No'}</div>
    </div>`;
  });
  if (proofCount > 0) {
    html += `<div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--muted);padding:8px;">Showing ${proofCount} of ${totalResults} proof entries</div>`;
  }
  cont.innerHTML = html || '<div style="text-align:center;color:var(--muted);padding:32px;">No results match your filters.</div>';
}


function exportProofCSV(){
  const b = brand(); if (!b) return;
  const run = (b.runs||[]).find(r => r.id === el('proof-run-sel').value);
  if (!run) return;
  function csvField(val){ const s = String(val||'').replace(/"/g,'""').replace(/\n/g,' '); return '"'+s+'"'; }
  let rows = [['Platform','Query','Mentioned','Sentiment','Recommended','Model','Full Response'].map(csvField).join(',')];
  const allResults = run.allResults || [];
  if (allResults.length) {
    allResults.forEach(r => {
      rows.push([r.platform, r.query, r.mentioned?'Yes':'No', r.sentiment||'', r.recommended?'Yes':'No', r.model||'', r.raw||r.context||''].map(csvField).join(','));
    });
  } else {
    (run.mentions||[]).forEach(m => {
      rows.push([m.platform, m.query, 'Yes', m.sentiment, m.recommended?'Yes':'No', m.model||'', m.raw||m.context||''].map(csvField).join(','));
    });
  }
  const csv = rows.join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'trackly-proof-'+run.date+'.csv';
  a.click();
}

// ─── PLATFORM STATUS ──────────────────────────────────────────────
async function renderPlatformStatus(){
  const b = brand();
  if (!b) return;

  // Fetch platform health from API
  const healthDiv = el('plat-health-cards');
  try {
    const hData = await api('GET', '/api/meta/platforms');
    const platformsObj = hData.platforms || {};
    const platformEntries = Object.entries(platformsObj);
    if (platformEntries.length) {
      healthDiv.innerHTML = platformEntries.map(([name, p]) => {
        const t = PLAT_THEME[name]||{};
        const statusClr = p.status === 'green' ? 'var(--green)' : p.status === 'amber' ? 'var(--amber,#f59e0b)' : p.status === 'red' ? 'var(--red)' : 'var(--muted)';
        const statusLabel = p.status === 'green' ? 'HEALTHY' : p.status === 'amber' ? 'DEGRADED' : p.status === 'red' ? 'DOWN' : 'NO DATA';
        return `<div class="card" style="padding:12px;border-left:3px solid ${t.color||'var(--border)'};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:700;color:${t.color||'var(--text)'};font-size:13px;">${t.logo||''} ${esc(name)}</span>
            <span class="badge" style="background:${statusClr};color:#fff;font-size:9px;padding:2px 6px;">${statusLabel}</span>
          </div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);line-height:1.8;">
            Avg latency: ${p.avg_latency_ms ? p.avg_latency_ms+'ms' : '—'}<br>
            Success rate: ${p.success_rate != null ? p.success_rate+'%' : '—'}<br>
            Last 24h calls: ${p.total_calls_24h || 0}
          </div>
        </div>`;
      }).join('');
    } else {
      healthDiv.innerHTML = '';
    }
  } catch(e) {
    healthDiv.innerHTML = '';
  }

  const cont = el('plat-status-container');
  if (!b.runs || !b.runs.length) {
    cont.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>';
    return;
  }
  let html = '<div class="card" style="padding:0;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);"><th class="th">Platform</th><th class="th">Last SOV</th><th class="th">Key Status</th><th class="th">Trend (last 7 runs)</th></tr></thead><tbody>';
  PLATS.forEach(plat => {
    const t = PLAT_THEME[plat]||{};
    const keyField = plat==='ChatGPT'?'openai':plat==='Google AIO'?'gemini':plat.toLowerCase();
    const hasKey = keyStatus[keyField];
    const recent = b.runs.slice(-7);
    const lastSOV = recent.length ? (recent[recent.length-1].platforms||{})[plat]||0 : 0;
    const bars = recent.map(r => {
      const sov = (r.platforms||{})[plat]||0;
      return `<div style="display:inline-block;width:18px;height:${Math.max(4,sov/100*32)}px;background:${t.color||'var(--green)'};margin-right:2px;vertical-align:bottom;opacity:.8;"></div>`;
    }).join('');
    html += `<tr class="trow">
      <td class="td"><span style="color:${t.color||'#888'};font-weight:700;">${t.logo||''} ${esc(plat)}</span></td>
      <td class="td"><span style="font-family:var(--mono);font-size:18px;font-weight:800;color:${t.color||'var(--green)'}">${lastSOV}%</span></td>
      <td class="td"><span style="font-family:var(--mono);font-size:10px;font-weight:700;color:${hasKey?'var(--green)':'var(--red)'};padding:2px 8px;background:${hasKey?'rgba(16,185,129,.08)':'rgba(239,68,68,.08)'};border-radius:100px;">${hasKey?'ACTIVE':'INACTIVE'}</span></td>
      <td class="td" style="vertical-align:bottom;padding-bottom:4px;">${bars}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

// ─── QUERY PERFORMANCE ────────────────────────────────────────────

function renderQPerf(){
  const b = brand(); if (!b) return;
  const qs = b.queryStats || {};
  const queries = b.queries || [];
  const cont = el('qperf-container');
  if (!queries.length) { cont.innerHTML='<div class="empty-state"><div class="icon">◻</div><p>No queries configured. Add queries in Overview or Brand Setup.</p></div>'; return; }

  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length - 1] : null;
  const allResults = lastRun ? (lastRun.allResults || []) : [];

  // Build lookup: query → platform → result
  const resultMap = {};
  allResults.forEach(r => {
    const key = r.query;
    if (!resultMap[key]) resultMap[key] = {};
    resultMap[key][r.platform] = r;
  });

  // Aggregate stats
  const totalRuns = queries.reduce((s, q) => s + (qs[q]?.runs || 0), 0);
  const totalMentions = queries.reduce((s, q) => s + (qs[q]?.mentions || 0), 0);
  const avgRate = totalRuns > 0 ? Math.round(totalMentions / totalRuns * 100) : 0;
  const topQueries = queries.filter(q => { const s = qs[q]; return s && s.runs && (s.mentions / s.runs) > 0.6; }).length;
  const lowQueries = queries.filter(q => { const s = qs[q]; return s && s.runs && (s.mentions / s.runs) <= 0.3; }).length;

  // ── Summary Cards (using .score-card for preview consistency) ──
  let html = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
    <div class="score-card"><div class="score-val" style="font-size:24px;">${queries.length}</div><div class="score-label">Total Queries</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:${avgRate > 60 ? 'var(--green)' : avgRate > 30 ? 'var(--amber)' : 'var(--red)'};">${avgRate}%</div><div class="score-label">Avg Mention Rate</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${topQueries}</div><div class="score-label">Strong (&gt;60%)</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:${lowQueries > 0 ? 'var(--red)' : 'var(--muted)'};">${lowQueries}</div><div class="score-label">Needs Work (&le;30%)</div></div>
  </div>`;

  // ── Last run info ──
  if (lastRun) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-xs);font-size:11px;color:var(--muted);font-family:var(--mono);">
      <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;"></span>
      Last run: ${new Date(lastRun.time||lastRun.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${new Date(lastRun.time||lastRun.date).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
      <span style="margin-left:auto;">${allResults.length} results across ${[...new Set(allResults.map(r=>r.platform))].length} platforms</span>
    </div>`;
  }

  // ── Query Cards ──
  html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
  // Sort queries by rate descending for better overview
  const sortedQueries = [...queries].sort((a, b) => {
    const ra = qs[a]?.runs ? (qs[a].mentions / qs[a].runs) : 0;
    const rb = qs[b]?.runs ? (qs[b].mentions / qs[b].runs) : 0;
    return rb - ra;
  });

  sortedQueries.forEach((q, idx) => {
    const stat = qs[q] || { runs: 0, mentions: 0 };
    const rate = stat.runs ? Math.round((stat.mentions / stat.runs) * 100) : 0;
    const rateColor = rate > 60 ? 'var(--green)' : rate > 30 ? 'var(--amber)' : 'var(--red)';
    const platResults = resultMap[q] || {};
    const platCount = Object.keys(platResults).length;
    const mentionedPlats = Object.values(platResults).filter(r => r.mentioned && !r.error).length;
    const errorPlats = Object.values(platResults).filter(r => r.error).length;

    html += `<div class="card" style="padding:14px 16px;animation:fadeIn .2s ease ${Math.min(idx*0.04,.4)}s both;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <!-- Rate circle -->
        <div style="min-width:52px;height:52px;border-radius:50%;border:3px solid ${rateColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-family:var(--mono);font-weight:800;font-size:14px;color:${rateColor};">${rate}%</span>
        </div>
        <!-- Query info -->
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--text);line-height:1.3;margin-bottom:4px;">${esc(q)}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted);font-family:var(--mono);">
            <span>${stat.runs} runs</span>
            <span>${stat.mentions} mentions</span>
            ${platCount > 0 ? `<span>${mentionedPlats}/${platCount} platforms</span>` : ''}
            ${errorPlats > 0 ? `<span style="color:var(--amber);">${errorPlats} error${errorPlats>1?'s':''}</span>` : ''}
          </div>
          <!-- Platform pills -->
          ${platCount > 0 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            ${Object.entries(platResults).map(([p, r]) => {
              const t = PLAT_THEME[p] || {};
              if (r.error) return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-family:var(--mono);background:rgba(245,158,11,.08);color:var(--amber);border:1px solid rgba(245,158,11,.2);" title="${esc(p)}: API error">${t.logo||''} ${p.length>9?p.slice(0,8)+'…':p} ⚠</span>`;
              if (r.mentioned) {
                const pos = r.listPosition;
                const label = pos ? '#'+pos : '✓';
                return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-family:var(--mono);background:${t.bg||'var(--bg2)'};color:${t.color||'var(--text)'};border:1px solid ${t.color||'var(--border)'}30;" title="${esc(p)}${pos?' — Ranked #'+pos:' — Mentioned'}">${t.logo||''} ${p.length>9?p.slice(0,8)+'…':p} <strong>${label}</strong>${r.recommended?' ★':''}</span>`;
              }
              return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-family:var(--mono);background:var(--bg2);color:var(--muted);border:1px solid var(--border);opacity:.6;" title="${esc(p)}: Not mentioned">${t.logo||''} ${p.length>9?p.slice(0,8)+'…':p} ✗</span>`;
            }).join('')}
          </div>` : ''}
        </div>
        <!-- Progress bar (right side) -->
        <div style="min-width:80px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div style="width:80px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="width:${rate}%;height:100%;background:${rateColor};border-radius:3px;transition:width .4s ease;"></div>
          </div>
          <span style="font-size:9px;color:var(--muted);font-family:var(--mono);">mention rate</span>
        </div>
      </div>
    </div>`;
  });

  html += `</div>`;
  cont.innerHTML = html;
}

// ─── COMPETITORS ──────────────────────────────────────────────────
async function renderCompetitors(){
  const b = brand(); if (!b) return;
  const cont = el('comp-tags');
  cont.innerHTML = '';
  (b.competitors||[]).forEach((c,i) => {
    const tag = document.createElement('span');
    tag.className = 'query-tag';
    const cText = document.createTextNode(c + ' ');
    tag.appendChild(cText);
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', function(){ removeComp(i); });
    tag.appendChild(btn);
    cont.appendChild(tag);
  });

  // Competitor comparison from run data
  const compDiv = el('comp-comparison');
  const competitors = b.competitors || [];
  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length - 1] : null;
  if (!competitors.length || !lastRun || !lastRun.allResults) {
    compDiv.innerHTML = competitors.length ? '<div class="card"><div class="empty-state"><p>Run queries to see competitor comparison data.</p></div></div>' : '';
    return;
  }

  const allResults = lastRun.allResults || [];
  // Count brand vs competitor mentions
  const brandMentions = allResults.filter(r => r.mentioned).length;
  const compStats = {};
  competitors.forEach(c => { compStats[c] = 0; });
  allResults.forEach(r => {
    const cm = r.competitorMentions || [];
    cm.forEach(c => { if (compStats[c] !== undefined) compStats[c]++; });
  });

  let html = '<div class="card" style="padding:0;overflow:hidden;"><div class="card-title" style="padding:14px 14px 0;">Mention Comparison (Last Run)</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);"><th class="th">Brand</th><th class="th">Mentions</th><th class="th">Share</th><th class="th">Bar</th></tr></thead><tbody>';

  // Your brand row
  const total = allResults.length;
  const brandPct = total ? Math.round((brandMentions / total) * 100) : 0;
  html += `<tr class="trow" style="background:rgba(255,97,84,.05);">
    <td class="td"><strong style="color:var(--green);">${esc(b.name)}</strong> <span style="font-size:9px;color:var(--muted);font-family:var(--mono);">YOU</span></td>
    <td class="td" style="font-family:var(--mono)">${brandMentions}/${total}</td>
    <td class="td" style="font-family:var(--mono);color:var(--green);font-weight:700;">${brandPct}%</td>
    <td class="td"><div class="sov-bar-wrap"><div class="sov-bar" style="width:${brandPct}%;background:var(--green);"></div></div></td>
  </tr>`;

  // Competitor rows sorted by mention count
  const sorted = competitors.slice().sort((a,b2) => (compStats[b2]||0) - (compStats[a]||0));
  sorted.forEach(c => {
    const cnt = compStats[c] || 0;
    const pct = total ? Math.round((cnt / total) * 100) : 0;
    const clr = cnt > brandMentions ? 'var(--red)' : cnt === brandMentions ? 'var(--amber,#f59e0b)' : 'var(--muted)';
    html += `<tr class="trow">
      <td class="td">${esc(c)}</td>
      <td class="td" style="font-family:var(--mono)">${cnt}/${total}</td>
      <td class="td" style="font-family:var(--mono);color:${clr};font-weight:700;">${pct}%</td>
      <td class="td"><div class="sov-bar-wrap"><div class="sov-bar" style="width:${pct}%;background:${clr};"></div></div></td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  compDiv.innerHTML = html;

  // Fetch co-occurrence data from prompt_runs
  const cooccDiv = el('comp-cooccurrence');
  const platBreakDiv = el('comp-platform-breakdown');
  try {
    const coData = await api('GET', '/api/brands/'+b.id+'/competitor-analysis');
    const topComps = coData.topCompetitors || [];
    if (topComps.length) {
      let coHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);"><th class="th">Competitor</th><th class="th">Appearances</th><th class="th">Prompts</th><th class="th">Platforms</th></tr></thead><tbody>';
      topComps.forEach(c => {
        coHtml += `<tr class="trow">
          <td class="td" style="font-weight:600;">${esc(c.competitor)}</td>
          <td class="td" style="font-family:var(--mono);">${c.total_appearances}</td>
          <td class="td" style="font-family:var(--mono);">${c.prompt_count}</td>
          <td class="td" style="font-family:var(--mono);">${c.platform_count}</td>
        </tr>`;
      });
      coHtml += '</tbody></table>';
      cooccDiv.innerHTML = coHtml;
    } else {
      cooccDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">No co-occurrence data yet. Run more queries to build up data.</div>';
    }

    // Platform breakdown
    const byPlat = coData.byPlatform || [];
    if (byPlat.length) {
      let pbHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);"><th class="th">Platform</th><th class="th">Competitor</th><th class="th">Appearances</th><th class="th">Co-mentioned</th></tr></thead><tbody>';
      byPlat.forEach(p => {
        const t = PLAT_THEME[p.platform]||{};
        pbHtml += `<tr class="trow">
          <td class="td"><span style="color:${t.color||'#888'};font-weight:700;">${t.logo||''} ${esc(p.platform)}</span></td>
          <td class="td">${esc(p.competitor)}</td>
          <td class="td" style="font-family:var(--mono);">${p.appearances}</td>
          <td class="td" style="font-family:var(--mono);">${p.co_mentioned_with_brand}</td>
        </tr>`;
      });
      pbHtml += '</tbody></table>';
      platBreakDiv.innerHTML = pbHtml;
    } else {
      platBreakDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">No platform breakdown data available.</div>';
    }
  } catch(e) {
    cooccDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">Could not load co-occurrence data.</div>';
    platBreakDiv.innerHTML = '';
  }
}

async function addComp(){
  const inp = el('comp-input');
  const v = inp.value.trim(); if (!v) return;
  const b = brand(); if (!b) return;
  const competitors = [...(b.competitors||[]), v];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { competitors });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    inp.value = '';
    renderCompetitors();
    toast('Competitor added', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

async function removeComp(i){
  const b = brand(); if (!b) return;
  const c = (b.competitors||[])[i];
  if (!confirm('Remove competitor "' + (c || '') + '"?')) return;
  const competitors = (b.competitors||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { competitors });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    renderCompetitors();
    toast('Competitor removed', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

// ─── SOV TRENDS (Chart.js) ────────────────────────────────────────
let sovChartInstance = null;
let platSovChartInstance = null;

function renderTrends(){
  const b = brand(); if (!b) return;

  // Lazy-load Chart.js then render
  ensureChartJs().then(() => _renderTrendsCharts(b)).catch(() => {
    const cont = document.querySelector('#view-trends');
    if (cont && !cont.querySelector('.chartjs-error')) {
      cont.insertAdjacentHTML('afterbegin', '<div class="empty-state chartjs-error"><p>Failed to load chart library. Please refresh the page.</p></div>');
    }
  });
}
function _renderTrendsCharts(b) {
  const history = b.sovHistory || [];

  // Destroy existing chart instances safely
  if (sovChartInstance) { sovChartInstance.destroy(); sovChartInstance = null; }
  if (platSovChartInstance) { platSovChartInstance.destroy(); platSovChartInstance = null; }

  // Ensure canvas elements exist (recreate if previously destroyed)
  const cards = document.querySelectorAll('#view-trends .card');
  const sovParent = el('sov-chart') ? el('sov-chart').parentElement : (cards[0] || null);
  if (!el('sov-chart') && sovParent) {
    sovParent.innerHTML = '<div class="card-title">Overall SOV Trend</div><canvas id="sov-chart" style="width:100%;max-height:300px;"></canvas>';
  }
  const platParent = el('plat-sov-chart') ? el('plat-sov-chart').parentElement : (cards[1] || null);
  if (!el('plat-sov-chart') && platParent) {
    platParent.innerHTML = '<div class="card-title">Per-Platform SOV Trend</div><canvas id="plat-sov-chart" style="width:100%;max-height:300px;"></canvas>';
  }
  if (!el('sov-chart') || !el('plat-sov-chart')) return;

  // Remove any previous empty-state messages (must happen before both branches)
  document.querySelectorAll('.trends-empty').forEach(e => e.remove());

  if (!history.length) {
    el('sov-chart').style.display = 'none';
    sovParent.querySelector('.card-title').insertAdjacentHTML('afterend', '<div class="empty-state trends-empty"><p>No trend data yet. Run queries at least twice to see trends.</p></div>');
    el('plat-sov-chart').style.display = 'none';
    platParent.querySelector('.card-title').insertAdjacentHTML('afterend', '<div class="empty-state trends-empty"><p>No trend data yet.</p></div>');
    return;
  }
  el('sov-chart').style.display = '';
  el('plat-sov-chart').style.display = '';

  const labels = history.map(h => {
    const d = new Date(h.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const sovData = history.map(h => h.overall);

  // Overall SOV chart
  const ctx = el('sov-chart').getContext('2d');
  sovChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Overall SOV %',
        data: sovData,
        borderColor: '#FF6154',
        backgroundColor: 'rgba(255,97,84,0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#FF6154',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: '#1a1e25' } },
        y: { min: 0, max: 100, ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v + '%' }, grid: { color: '#1a1e25' } }
      }
    }
  });

  // Per-platform SOV chart
  const allPlatforms = new Set();
  history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => allPlatforms.add(p)); });
  const datasets = [...allPlatforms].map(plat => {
    const t = PLAT_THEME[plat] || {};
    return {
      label: plat,
      data: history.map(h => (h.platforms || {})[plat] || 0),
      borderColor: t.color || '#888',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2
    };
  });

  const ctx2 = el('plat-sov-chart').getContext('2d');
  platSovChartInstance = new Chart(ctx2, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 } } } },
      scales: {
        x: { ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: '#1a1e25' } },
        y: { min: 0, max: 100, ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v + '%' }, grid: { color: '#1a1e25' } }
      }
    }
  });
}

// ─── ALERTS ──────────────────────────────────────────────────────
async function renderAlerts(){
  const b = brand(); if (!b) return;
  el('alert-webhook-url').value = b.webhookUrl || '';
  const status = el('webhook-status');
  if (b.webhookUrl) {
    status.innerHTML = '<span style="color:var(--green);">&#x2713; Webhook configured</span>';
  } else {
    status.innerHTML = '<span style="color:var(--muted);">No webhook configured</span>';
  }

  // Load alert rules from API
  const rulesEl = el('alert-rules-list');
  try {
    const data = await api('GET', '/api/brands/'+b.id+'/alerts');
    const rules = data.alerts || [];
    if (!rules.length) {
      rulesEl.innerHTML = '<div class="empty-state"><p>No alert rules configured. Click "+ Add Alert" to create one.</p></div>';
    } else {
      const condLabels = { visibility_drop:'Visibility Drop', sov_below:'SOV Below', brand_disappeared:'Brand Disappeared', negative_sentiment:'Negative Sentiment', new_competitor:'New Competitor' };
      rulesEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' +
        rules.map(r => {
          const params = r.condition_params || {};
          const thresh = r.condition_type==='brand_disappeared'||r.condition_type==='new_competitor' ? '' : ' ('+((params.threshold||0)+'%')+')';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg3);border-radius:var(--radius-xs);">
          <div><span style="font-weight:700;font-size:12px;">${esc(r.name)}</span> <span style="font-family:var(--mono);font-size:10px;color:var(--muted);">&middot; ${r.action_type.charAt(0).toUpperCase()+r.action_type.slice(1).replace('_',' ')} &middot; ${r.cooldown_hours||24}h cooldown${thresh}</span></div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="color:${r.enabled?'var(--green)':'var(--muted)'};font-family:var(--mono);font-size:10px;cursor:pointer;" onclick="toggleAlertRule('${escAttr(r.id)}',${r.enabled})">${r.enabled?'ACTIVE':'DISABLED'}</span>
            <button onclick="deleteAlertRule('${escAttr(r.id)}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;">&#x2715;</button>
          </div>
        </div>`;
        }).join('') +
        '</div>';
    }
  } catch(e) {
    rulesEl.innerHTML = '<div style="color:var(--muted);font-size:12px;">Could not load alert rules.</div>';
  }

  // SOV change history
  const histEl = el('alert-sov-history');
  const history = b.sovHistory || [];
  if (history.length < 2) {
    histEl.innerHTML = '<div class="empty-state"><p>No SOV changes recorded yet. Run queries at least twice to see changes here.</p></div>';
    return;
  }
  let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);"><th class="th">Date</th><th class="th">SOV</th><th class="th">Change</th><th class="th">Platforms</th></tr></thead><tbody>';
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const prev = i > 0 ? history[i - 1].overall : 0;
    const change = h.overall - prev;
    const changeStr = i === 0 ? '—' : (change > 0 ? '+' + change + '%' : change + '%');
    const changeColor = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--muted)';
    const date = new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const plats = h.platforms ? Object.entries(h.platforms).map(([p, v]) => p + ': ' + v + '%').join(', ') : '—';
    html += '<tr class="trow"><td class="td" style="font-family:var(--mono);font-size:11px;">' + date + '</td>';
    html += '<td class="td" style="font-family:var(--mono);font-weight:700;">' + h.overall + '%</td>';
    html += '<td class="td" style="font-family:var(--mono);color:' + changeColor + ';">' + (i === 0 ? '—' : changeStr) + '</td>';
    html += '<td class="td" style="font-family:var(--mono);font-size:10px;color:var(--muted);">' + esc(plats) + '</td></tr>';
  }
  html += '</tbody></table>';
  histEl.innerHTML = html;
}

async function saveWebhook(){
  const b = brand(); if (!b) return;
  const url = el('alert-webhook-url').value.trim();
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { webhookUrl: url });
    updateBrandInList(data.brand);
    renderAlerts();
    toast(url ? 'Webhook saved' : 'Webhook removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// ─── QUERY SUGGESTIONS ───────────────────────────────────────────
async function loadQuerySuggestions(){
  const b = brand(); if (!b) return;
  const industry = b.industry || '';
  const city = b.city || '';
  if (!industry && !city) { toast('Set industry and city in Brand Setup first', 'err'); return; }
  try {
    const data = await api('GET', '/api/query-suggestions?industry='+encodeURIComponent(industry)+'&city='+encodeURIComponent(city));
    const suggestions = data.suggestions || [];
    if (!suggestions.length) { toast('No suggestions available', 'warn'); return; }
    // Show in a modal-like dropdown
    const existing = new Set((b.queries || []).map(q => q.toLowerCase()));
    let newSuggestions = suggestions.filter(s => !existing.has(s.toLowerCase()));
    if (!newSuggestions.length) { toast('All suggestions already added!', 'ok'); return; }
    const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
    const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
    const remaining = promptLimit - totalPrompts;
    if (remaining <= 0) { toast('Prompt limit reached. Upgrade your plan.', 'err'); return; }
    if (newSuggestions.length > remaining) newSuggestions = newSuggestions.slice(0, remaining);
    const pick = confirm('Add ' + newSuggestions.length + ' suggested queries?\n\n' + newSuggestions.join('\n'));
    if (!pick) return;
    const queries = [...(b.queries || []), ...newSuggestions];
    const result = await api('PUT', '/api/brands/'+b.id, { queries });
    updateBrandInList(result.brand);
    renderAll();
    toast(newSuggestions.length + ' queries added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// ─── BRAND SETUP ──────────────────────────────────────────────────
function generateAliasesFromBrand(name, website){
  const aliases = new Set();
  if (!name) return [];
  const n = name.trim();
  const lower = n.toLowerCase();
  const words = n.split(/\s+/);
  const lowerWords = lower.split(/\s+/);

  // Original name & lowercase
  aliases.add(n);
  aliases.add(lower);

  // No spaces: "C Brooks Paving" → "CBrooksPaving" / "cbrookspaving"
  if (words.length > 1) {
    aliases.add(words.join(''));
    aliases.add(lowerWords.join(''));
  }

  // Hyphenated: "c-brooks-paving" / "C-Brooks-Paving"
  if (words.length > 1) {
    aliases.add(lowerWords.join('-'));
    aliases.add(words.join('-'));
  }

  // Underscored: "c_brooks_paving"
  if (words.length > 1) {
    aliases.add(lowerWords.join('_'));
  }

  // Dot-separated: "c.brooks.paving"
  if (words.length > 1) {
    aliases.add(lowerWords.join('.'));
  }

  // No punctuation (McDonald's → McDonalds)
  const noPunc = n.replace(/[''`\-.,&!]/g, '');
  if (noPunc !== n) {
    aliases.add(noPunc);
    aliases.add(noPunc.toLowerCase());
  }

  // No punctuation no spaces
  const noPuncNoSpace = noPunc.replace(/\s+/g, '');
  if (noPuncNoSpace !== n) {
    aliases.add(noPuncNoSpace);
    aliases.add(noPuncNoSpace.toLowerCase());
  }

  // First word only if multi-word and long enough
  if (words.length >= 2 && words[0].length >= 3) aliases.add(words[0]);
  if (words.length >= 2 && words[0].length >= 3) aliases.add(words[0].toLowerCase());

  // Last word only if multi-word and long enough (often the key brand word)
  const lastWord = words[words.length - 1];
  if (words.length >= 2 && lastWord.length >= 4) aliases.add(lastWord);
  if (words.length >= 2 && lastWord.length >= 4) aliases.add(lastWord.toLowerCase());

  // Initials / acronym: "C Brooks Paving" → "CBP" / "cbp"
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('');
    if (initials.length >= 2) {
      aliases.add(initials.toUpperCase());
      aliases.add(initials.toLowerCase());
    }
  }

  // First letter + last word: "CPaving" / "cpaving"
  if (words.length >= 2) {
    const combo = words[0][0] + lastWord;
    aliases.add(combo);
    aliases.add(combo.toLowerCase());
  }

  // Camel case: "cBrooksPaving"
  if (words.length > 1) {
    const camel = lowerWords[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    aliases.add(camel);
  }

  // Without common suffixes: LLC, Inc, Co, Corp, Group, Services, Agency, etc.
  const suffixes = /\s+(llc|inc|co|corp|ltd|group|services|service|agency|company|consulting|solutions|enterprises?|paving|plumbing|roofing|electric|electrical|construction|landscaping|painting|cleaning|hvac|remodeling|repair|restoration|removal|hauling|demolition|contracting|contractors?|builders?|design|studio|media|digital|marketing|tech|labs?)$/i;
  const withoutSuffix = n.replace(suffixes, '').trim();
  if (withoutSuffix !== n && withoutSuffix.length >= 2) {
    aliases.add(withoutSuffix);
    aliases.add(withoutSuffix.toLowerCase());
    aliases.add(withoutSuffix.toLowerCase().replace(/\s+/g, ''));
    aliases.add(withoutSuffix.toLowerCase().replace(/\s+/g, '-'));
  }

  // Without common prefixes: "The", "A"
  const prefixRe = /^(the|a)\s+/i;
  const withoutPrefix = n.replace(prefixRe, '').trim();
  if (withoutPrefix !== n && withoutPrefix.length >= 2) {
    aliases.add(withoutPrefix);
    aliases.add(withoutPrefix.toLowerCase());
    aliases.add(withoutPrefix.toLowerCase().replace(/\s+/g, ''));
  }

  // Possessive form: "Brooks'" / "Brooks's"
  if (words.length >= 1) {
    const mainWord = words.length >= 2 ? words.slice(0, -1).join(' ') : n;
    if (!mainWord.endsWith("'s") && !mainWord.endsWith("s'")) {
      aliases.add(mainWord + "'s");
      if (mainWord.endsWith('s')) aliases.add(mainWord + "'");
    }
  }

  // "& Co" / "and" swap: "Brooks & Sons" ↔ "Brooks and Sons"
  if (n.includes(' & ')) {
    aliases.add(n.replace(/ & /g, ' and '));
    aliases.add(n.replace(/ & /g, ' and ').toLowerCase());
  }
  if (/ and /i.test(n)) {
    aliases.add(n.replace(/ and /gi, ' & '));
    aliases.add(n.replace(/ and /gi, ' & ').toLowerCase());
  }

  // Partial multi-word combos: first two words, last two words
  if (words.length >= 3) {
    const firstTwo = words.slice(0, 2).join(' ');
    const lastTwo = words.slice(-2).join(' ');
    aliases.add(firstTwo);
    aliases.add(firstTwo.toLowerCase());
    aliases.add(lastTwo);
    aliases.add(lastTwo.toLowerCase());
    aliases.add(words.slice(0, 2).join('').toLowerCase());
    aliases.add(words.slice(-2).join('').toLowerCase());
  }

  // Website domain variations
  if (website) {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (domain) {
      aliases.add(domain);                           // coolairpro.com
      aliases.add(domain.split('.')[0]);             // coolairpro
      aliases.add('www.' + domain);                  // www.coolairpro.com
      // Domain with hyphen variations
      const domainName = domain.split('.')[0];
      if (domainName.includes('-')) {
        aliases.add(domainName.replace(/-/g, ''));   // c-brooks → cbrooks
        aliases.add(domainName.replace(/-/g, ' '));  // c-brooks → c brooks
      }
      if (!domainName.includes('-') && words.length > 1) {
        aliases.add(lowerWords.join('-'));            // cbrookspaving → c-brooks-paving (already added above)
      }
    }
  }

  // Common misspelling: doubled letters reduced ("brookks" → "brooks")
  // and single letters doubled — skip this to avoid noise

  return [...aliases].filter(a => a.length >= 2);
}

function renderAliasTags(){
  const b = brand(); if (!b) return;
  const cont = el('alias-tags');
  cont.innerHTML = '';
  (b.aliases||[]).forEach((a,i) => {
    const tag = document.createElement('span');
    tag.className = 'query-tag';
    tag.appendChild(document.createTextNode(a + ' '));
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', function(){ removeAlias(i); });
    tag.appendChild(btn);
    cont.appendChild(tag);
  });
}

async function addAlias(){
  const b = brand(); if (!b) return;
  const inp = el('alias-input');
  const val = inp.value.trim();
  if (!val) return;
  const aliases = [...(b.aliases||[])];
  if (!aliases.some(a => a.toLowerCase() === val.toLowerCase())) aliases.push(val);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { aliases });
    updateBrandInList(data.brand);
    inp.value = '';
    renderAliasTags();
    toast('Alias added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function removeAlias(i){
  const b = brand(); if (!b) return;
  const a = (b.aliases||[])[i];
  if (!confirm('Remove alias "' + (a || '') + '"?')) return;
  const aliases = (b.aliases||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { aliases });
    updateBrandInList(data.brand);
    renderAliasTags();
    toast('Alias removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function autoGenerateAliases(){
  const b = brand(); if (!b) return;
  const name = el('s-name').value.trim() || b.name;
  const website = el('s-website').value.trim() || b.website;
  const generated = generateAliasesFromBrand(name, website);
  const existing = new Set((b.aliases||[]).map(a => a.toLowerCase()));
  const newAliases = [...(b.aliases||[])];
  generated.forEach(a => {
    if (!existing.has(a.toLowerCase())) { newAliases.push(a); existing.add(a.toLowerCase()); }
  });
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { aliases: newAliases });
    updateBrandInList(data.brand);
    renderAliasTags();
    toast(generated.length + ' aliases generated', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

function renderAreaTags(){
  const b = brand(); if (!b) return;
  const cont = el('area-tags');
  cont.innerHTML = '';
  (b.nearbyAreas||[]).forEach((a,i) => {
    const tag = document.createElement('span');
    tag.className = 'query-tag';
    tag.appendChild(document.createTextNode(a + ' '));
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', function(){ removeArea(i); });
    tag.appendChild(btn);
    cont.appendChild(tag);
  });
}

async function addArea(){
  const b = brand(); if (!b) return;
  const inp = el('area-input');
  const val = inp.value.trim();
  if (!val) return;
  const nearbyAreas = [...(b.nearbyAreas||[])];
  if (!nearbyAreas.some(a => a.toLowerCase() === val.toLowerCase())) nearbyAreas.push(val);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { nearbyAreas });
    updateBrandInList(data.brand);
    inp.value = '';
    renderAreaTags();
    toast('Area added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function removeArea(i){
  const b = brand(); if (!b) return;
  const a = (b.nearbyAreas||[])[i];
  if (!confirm('Remove area "' + (a || '') + '"?')) return;
  const nearbyAreas = (b.nearbyAreas||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { nearbyAreas });
    updateBrandInList(data.brand);
    renderAreaTags();
    toast('Area removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function autoFetchNearbyAreas(){
  const b = brand(); if (!b) return;
  const city = (el('s-city').value || b.city || '').trim();
  if (!city) { toast('Enter a city/location first', 'err'); return; }

  const btn = el('auto-fetch-areas-btn');
  btn.disabled = true;
  btn.textContent = 'FETCHING...';
  btn.style.color = 'var(--amber)';

  try {
    const data = await api('POST', '/api/nearby-areas', { city });
    const existing = (b.nearbyAreas || []).map(a => a.toLowerCase());
    const newAreas = data.areas.filter(a => !existing.includes(a.toLowerCase()));
    if (!newAreas.length) { toast('No new areas found (all already added)', 'ok'); return; }

    const nearbyAreas = [...(b.nearbyAreas || []), ...newAreas];
    const saveData = await api('PUT', '/api/brands/' + b.id, { nearbyAreas });
    updateBrandInList(saveData.brand);
    renderAreaTags();
    toast(newAreas.length + ' nearby areas added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
  finally {
    btn.disabled = false;
    btn.textContent = 'AUTO-FETCH';
    btn.style.color = 'var(--muted)';
  }
}

function renderSetup(){
  const b = brand(); if (!b) return;
  el('s-name').value = b.name||'';
  el('s-industry').value = b.industry||'';
  el('s-website').value = b.website||'';
  el('s-city').value = b.city||'';
  el('s-goal').value = b.goal||70;

  // Auto-generate aliases on first visit if none exist
  if (!b.aliases || !b.aliases.length) {
    b.aliases = generateAliasesFromBrand(b.name, b.website);
  }
  renderAliasTags();
  renderAreaTags();

  // Render platform checkboxes
  const cont = el('setup-plat-list');
  cont.innerHTML = '';
  const savedPlats = b.platforms || PLATS; // default: all platforms
  PLATS.forEach(plat => {
    const t = PLAT_THEME[plat]||{};
    const isActive = keyStatus[plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai').replace('googleaio','gemini')];
    const lbl = document.createElement('label');
    lbl.className = 'plat-check';
    lbl.style.color = t.color||'#fff';
    if (!isActive) lbl.style.opacity = '0.4';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isActive && savedPlats.includes(plat);
    cb.disabled = !isActive;
    cb.dataset.plat = plat;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + (t.logo||'') + ' ' + plat));
    if (!isActive) {
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:8px;color:var(--muted);margin-left:4px;';
      hint.textContent = '(inactive)';
      lbl.appendChild(hint);
    }
    cont.appendChild(lbl);
  });
}

async function saveBrandSetup(){
  const b = brand(); if (!b) return;
  const name = el('s-name').value.trim();
  if (!name) { toast('Brand name cannot be empty','err'); return; }
  // Get selected platforms
  const platChecks = el('setup-plat-list').querySelectorAll('input[type=checkbox]:checked');
  const selectedPlats = [...platChecks].map(cb => cb.dataset.plat);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, {
      name,
      industry: el('s-industry').value.trim(),
      website: el('s-website').value.trim(),
      city: el('s-city').value.trim(),
      goal: parseInt(el('s-goal').value)||70,
      platforms: selectedPlats.length ? selectedPlats : PLATS,
      aliases: b.aliases || [],
      nearbyAreas: b.nearbyAreas || []
    });
    const idx = brands.findIndex(x=>x.id===b.id);
    if (idx >= 0) brands[idx] = data.brand;
    renderBrandSelect();
    el('brand-select').value = currentBrandId;
    renderAll();
    toast('Brand settings saved', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

// ─── PLATFORM STATUS (from server env vars) ─────────────────────

// ─── ADD BRAND ────────────────────────────────────────────────────
function openAddBrand(){
  el('add-brand-err').style.display = 'none';
  ['nb-name','nb-industry','nb-website','nb-city'].forEach(id => { const e=el(id); if(e) e.value=''; });
  // Reset wizard state
  _wizardComps = [];
  _wizardQueries = [];
  _wizardNearbyAreas = [];
  const nearbySection = el('wizard-nearby-section');
  if (nearbySection) nearbySection.style.display = 'none';
  wizardNext(1);
  openModal('add-brand-modal');
}

async function doAddBrand(){
  const name = el('nb-name').value.trim();
  const industry = el('nb-industry').value.trim();
  if (!name || !industry) {
    el('add-brand-err').textContent = 'Brand name and industry are required.';
    el('add-brand-err').style.display = 'block';
    return;
  }
  try {
    const data = await api('POST', '/api/brands', {
      name, industry,
      website: el('nb-website').value.trim(),
      city: el('nb-city').value.trim()
    });
    invalidateCache('/api/brands');
    brands.push(data.brand);
    currentBrandId = data.brand.id;
    localStorage.setItem('trackly_brand', currentBrandId);
    renderBrandSelect();
    el('brand-select').value = currentBrandId;
    closeModal('add-brand-modal');
    renderAll();
    toast('Brand "'+name+'" created', 'ok');
  } catch(e) {
    el('add-brand-err').textContent = e.message;
    el('add-brand-err').style.display = 'block';
  }
}

async function deleteBrand(){
  const b = brand();
  if (!b) return;
  if (!confirm('Delete brand "'+b.name+'"? This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/brands/'+b.id);
    invalidateCache('/api/brands');
    brands = brands.filter(x => x.id !== b.id);
    if (brands.length > 0) {
      currentBrandId = brands[0].id;
    } else {
      currentBrandId = '';
    }
    localStorage.setItem('trackly_brand', currentBrandId);
    renderBrandSelect();
    if (brands.length === 0) {
      openModal('add-brand-modal');
    } else {
      el('brand-select').value = currentBrandId;
      renderAll();
    }
    toast('Brand deleted', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// ─── RUN QUERIES (streaming — results appear live) ───────────────
function buildMentionCard(r, runTimeStr) {
  const t = PLAT_THEME[r.platform]||{};
  const isErr = r.error;
  const preview = isErr ? friendlyError(r.errorMessage) : (r.context || '').replace(/[#*_~`]/g, '').substring(0, 160).replace(/\n/g, ' ');
  const sent = r.sentiment || 'neutral';
  const borderClr = isErr ? 'var(--amber)' : r.mentioned ? 'var(--green)' : 'var(--red)';

  // Status tag
  let statusTag;
  if (isErr) statusTag = '<span class="mt-tag mt-tag-err">Error</span>';
  else if (r.mentioned) statusTag = '<span class="mt-tag mt-tag-yes">Mentioned</span>';
  else statusTag = '<span class="mt-tag mt-tag-no">Not Found</span>';

  // Sentiment + rec tags
  let metaTags = '';
  if (!isErr) {
    if (sent === 'positive') metaTags += '<span class="mt-tag mt-tag-pos">Positive</span>';
    else if (sent === 'negative') metaTags += '<span class="mt-tag mt-tag-neg">Negative</span>';
    if (r.recommended) metaTags += '<span class="mt-tag mt-tag-rec">Recommended</span>';
  }

  return `<div class="mt-live-card" style="--accent-clr:${borderClr};animation:fadeInUp .35s ease;">
    <div class="mt-live-top">
      <div class="mt-item-plat" style="background:${t.bg||'var(--bg3)'};border-color:${(t.color||'var(--border)')}25;">
        <span style="color:${t.color||'#888'};font-size:15px;">${t.logo||'?'}</span>
      </div>
      <div class="mt-live-info">
        <div class="mt-item-query">${esc(r.query)}<button class="copy-query-btn" onclick="event.stopPropagation();copyQuery(${escAttr(JSON.stringify(r.query))},this)" title="Copy keyword">&#x2398;</button></div>
        <div class="mt-item-meta">
          <span class="mt-item-pname" style="color:${t.color||'var(--muted)'}">${esc(r.platform)}</span>
          <span class="mt-item-model">${esc(r.model||'')}</span>
          ${runTimeStr ? `<span class="mt-item-model">${esc(runTimeStr)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="mt-live-tags">${statusTag}${metaTags}</div>
    <div class="mt-live-preview" style="${isErr?'color:var(--amber);':''}">${esc(preview)}${!isErr&&preview.length>=160?'...':''}</div>
  </div>`;
}

async function runQueries(){
  if (!currentUser) return;
  if (runningQueries) return;
  const b = brand();
  if (!b) { toast('Select a brand first','err'); return; }
  if (!b.queries||!b.queries.length) { toast('Add some queries first','err'); return; }
  const selectedPlats = b.platforms || PLATS;
  if (!selectedPlats.length) { toast('Select platforms in Brand Setup first','err'); return; }

  runningQueries = true;
  liveResults = [];
  _resetLiveCounters();
  _liveCardQueue = [];
  if (_liveCardRaf) { cancelAnimationFrame(_liveCardRaf); _liveCardRaf = null; }
  if (_liveUpdateTimer) { clearTimeout(_liveUpdateTimer); _liveUpdateTimer = null; }
  _liveUpdatePending = null;
  liveRunTime = new Date();

  const btn = el('run-btn');
  const prog = el('run-progress');
  const fill = el('run-progress-fill');
  const statusTxt = el('run-status-text');
  const timerEl = el('run-timer');

  btn.classList.add('running');
  btn.textContent = '⏳ RUNNING...';
  prog.style.display = 'block';
  fill.style.width = '0%';
  fill.style.background = '';
  statusTxt.style.color = '';
  statusTxt.textContent = 'Connecting to AI platforms...';

  // Live timer
  const startTime = Date.now();
  function fmtTime(ms) {
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const sec = s%60;
    return m > 0 ? m+'m '+sec+'s' : sec+'s';
  }
  timerEl.textContent = '0s';
  const timerInt = setInterval(() => {
    timerEl.textContent = fmtTime(Date.now()-startTime);
  }, 1000);

  // Stay on current view — render live state
  if (currentView === 'overview') { renderOverview(); setupLiveFeed(); }
  if (currentView === 'mentions') setupLiveMentions();
  if (currentView === 'proof') setupLiveProof();

  // Live results tracking
  let totalExpected = 0;
  let received = 0;
  let liveFoundCount = 0;
  let liveErrorCount = 0;
  let activeRunId = null;

  function updateLiveStats() {
    const statsEl = el('live-stats');
    if (!statsEl) return;
    const pct = totalExpected > 0 ? Math.round((received / totalExpected) * 100) : 0;
    fill.style.width = pct + '%';
    statsEl.innerHTML = `<div class="ov-live-badge"><span class="ov-live-dot"></span>LIVE</div>` +
      `<span style="color:var(--green);font-weight:700;">${liveFoundCount} found</span>` +
      `<span style="color:var(--muted);margin:0 4px;">·</span>` +
      `<span style="color:var(--muted);">${received - liveFoundCount - liveErrorCount} not found</span>` +
      (liveErrorCount > 0 ? `<span style="color:var(--muted);margin:0 4px;">·</span><span style="color:var(--red);font-weight:700;">${liveErrorCount} error${liveErrorCount>1?'s':''}</span>` : '') +
      `<span style="color:var(--muted);margin:0 4px;">·</span>` +
      `<span style="color:var(--muted);">${received}/${totalExpected} (${pct}%)</span>`;
  }

  // Abort controller for timeout (10 min) — declared outside try so catch can access
  const abortCtrl = new AbortController();
  const fetchTimeout = setTimeout(() => abortCtrl.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(API + '/api/brands/'+b.id+'/run?stream=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ platforms: selectedPlats }),
        signal: abortCtrl.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Request failed' }));
      // If concurrent run error (409), show force-run option
      if (response.status === 409) {
        clearTimeout(fetchTimeout);
        clearInterval(timerInt);
        statusTxt.textContent = '';
        prog.style.display = 'none';
        btn.classList.remove('running');
        btn.textContent = '▶ RUN QUERIES';
        runningQueries = false;
        toast('A run is already in progress. You can force a new run if the previous one is stuck.', 'warn');
        // Show a "Force Run" button
        const forceBtn = document.createElement('button');
        forceBtn.textContent = '⚡ FORCE RUN';
        forceBtn.className = 'ov-run-btn';
        forceBtn.style.cssText = 'background:#e74c3c;margin-left:8px;';
        forceBtn.onclick = async () => {
          forceBtn.disabled = true;
          forceBtn.textContent = 'Releasing lock...';
          try {
            await fetch(API + '/api/brands/' + b.id + '/force-release', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + token }
            });
            forceBtn.remove();
            runQueries(); // Retry the run
          } catch (e) {
                  forceBtn.textContent = '⚡ FORCE RUN';
            forceBtn.disabled = false;
            toast('Failed to force release. Try again.', 'err');
          }
        };
        btn.parentElement.appendChild(forceBtn);
        return;
      }
      throw new Error(errData.error || 'Request failed');
    }

      clearTimeout(fetchTimeout); // Connection established, clear fetch timeout
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch(_) { continue; }

        if (evt.type === 'start') {
          totalExpected = evt.totalExpected || 0;
          activeRunId = evt.runId || null;
          // Save active run to localStorage so we can resume after page reload
          if (activeRunId) {
            localStorage.setItem('trackly_active_run', JSON.stringify({
              runId: activeRunId, brandId: b.id, startedAt: Date.now()
            }));
          }
          statusTxt.textContent = `Running ${evt.queries?.length || 0} queries on ${evt.platforms?.length || 0} platforms...`;
          updateLiveStats();
        } else if (evt.type === 'result') {
          received++;
          const r = evt.result;
          if (r.error) liveErrorCount++;
          else if (r.mentioned) liveFoundCount++;

          // Feed result to all live views
          onLiveResult(r, received, totalExpected, liveFoundCount, liveErrorCount);

          // Throttle status bar updates — only update every 3rd result or at completion
          if (received % 3 === 0 || received >= totalExpected) {
            statusTxt.textContent = `${received}/${totalExpected} — ${liveFoundCount} found · ${fmtTime(Date.now()-startTime)}`;
            updateLiveStats();
          }
        } else if (evt.type === 'done') {
          finalData = evt;
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'Server error');
        }
      }
    }

    // Clear active run from localStorage
    localStorage.removeItem('trackly_active_run');

    clearInterval(timerInt);
    fill.style.width = '100%';

    // Reload fresh brand data from API (the done event only contains result summary
    // to avoid sending massive payloads that freeze the browser)
    try {
      const freshData = await api('GET', '/api/brands');
      if (freshData.brands) {
        brands = freshData.brands;
        renderBrandSelect();
        if (currentBrandId) el('brand-select').value = currentBrandId;
      }
    } catch(_e) { console.warn('[Trackly]', _e.message || _e); }

    const elapsed = fmtTime(Date.now()-startTime);
    timerEl.textContent = elapsed;
    const result = finalData?.result || { totalQ: received, totalM: liveFoundCount, sov: received > 0 ? Math.round((liveFoundCount/received)*100) : 0, newMentions: liveFoundCount, errorCount: liveErrorCount };
    const errors = result.errorCount || liveErrorCount;

    statusTxt.textContent = `Done! Brand found in ${result.newMentions} of ${result.totalQ} responses · ${elapsed}`;

    if (errors > 0) {
      storeRunError({
        time: new Date().toISOString(),
        error: `${errors} API error(s) in run`,
        type: 'partial',
        brand: b.name || b.id, brandId: b.id,
        queries: (b.queries || []).length, platforms: selectedPlats.join(', '),
        received, totalExpected, foundCount: liveFoundCount, errorCount: liveErrorCount,
        platformErrors: result.platformErrors || {}
      });
    }

    setTimeout(() => {
      prog.style.display = 'none';
      fill.style.width = '0%';
      timerEl.textContent = '';
    }, 5000);

    // Show overage warnings if any
    if (finalData && finalData.warnings && finalData.warnings.length) {
      finalData.warnings.forEach(w => toast(w, 'warn'));
    }

    // Re-render current view with final data (enables filters, pagination, VIEW FULL buttons)
    liveResults = [];
    liveRunTime = null;
    runningQueries = false;
    clearLiveNotifs();
    hideLiveFeed();
    renderView(currentView);

    if (errors > 0) {
      const okCount = result.totalQ - errors;
      toast(`Run complete — ${okCount} succeeded, ${errors} failed. Filter by "Errors" in Mentions.`, 'warn');
    } else {
      const toastMsg = result.sov === 0
        ? `Run complete — SOV: 0%. AI didn't mention your brand yet.`
        : `Run complete — SOV: ${result.sov}%! Found in ${result.newMentions} response${result.newMentions>1?'s':''}`;
      toast(toastMsg, result.sov > 0 ? 'ok' : 'warn');
    }
  } catch(e) {
    clearTimeout(fetchTimeout);
    // Handle abort/timeout specifically — just fall through to polling
    if (e.name === 'AbortError') {
      console.warn('[runQueries] Fetch timed out after 10 min. Falling back to polling.');
      toast('Connection timed out. Checking if run is still in progress...', 'warn');
    }
    clearInterval(timerInt);

    // If we have a runId, the server is still running in the background.
    // Switch to polling instead of showing an error.
    if (activeRunId) {
      console.log('[Run] SSE connection lost, switching to polling for runId:', activeRunId);
      statusTxt.textContent = 'Reconnecting — queries still running on server...';
      try {
        await pollRunStatus(b.id, activeRunId, { startTime, received, totalExpected, liveFoundCount, liveErrorCount, lastResultCount: received, timerInt: setInterval(() => { timerEl.textContent = fmtTime(Date.now()-startTime); }, 1000) });
        return; // pollRunStatus handles cleanup
      } catch(pollErr) {
        console.error('[Run] Polling also failed:', pollErr.message);
        // Fall through to error handling below
      }
    }

    statusTxt.style.color = 'var(--red)';
    statusTxt.textContent = 'Run failed: ' + e.message;
    fill.style.width = '0%';
    fill.style.background = 'var(--red)';

    storeRunError({
      time: new Date().toISOString(), error: e.message, type: 'crash',
      brand: b.name || b.id, brandId: b.id,
      queries: (b.queries || []).length, platforms: selectedPlats.join(', '),
      endpoint: API + '/api/brands/' + b.id + '/run?stream=1',
      received, totalExpected, foundCount: liveFoundCount, errorCount: liveErrorCount,
      stack: e.stack || null,
      userAgent: navigator.userAgent
    });

    // Reload brand data (emergency save may have stored partial results)
    try {
      const freshData = await api('GET', '/api/brands');
      if (freshData.brands) {
        brands = freshData.brands;
        renderBrandSelect();
        if (currentBrandId) el('brand-select').value = currentBrandId;
      }
    } catch(_e) { console.warn('[Trackly]', _e.message || _e); }

    localStorage.removeItem('trackly_active_run');
    liveResults = [];
    liveRunTime = null;
    runningQueries = false;
    clearLiveNotifs();
    btn.classList.remove('running');
    btn.textContent = '▶ RUN QUERIES';
    toast('Run failed — check API Logs for details.', 'err');
    setTimeout(() => {
      prog.style.display = 'none';
      statusTxt.style.color = '';
      fill.style.background = '';
      renderView(currentView);
    }, 2000);
    return;
  }

  runningQueries = false;
  btn.classList.remove('running');
  btn.textContent = '▶ RUN QUERIES';
}

// ─── POLL RUN STATUS (fallback when SSE disconnects or page reloads) ────
async function pollRunStatus(brandId, runId, opts) {
  opts = opts || {};
  const startTime = opts.startTime || Date.now();
  let received = opts.received || 0;
  let totalExpected = opts.totalExpected || 0;
  let liveFoundCount = opts.liveFoundCount || 0;
  let liveErrorCount = opts.liveErrorCount || 0;
  let lastResultCount = opts.lastResultCount || 0;

  const btn = el('run-btn');
  const prog = el('run-progress');
  const fill = el('run-progress-fill');
  const statusTxt = el('run-status-text');
  const timerEl = el('run-timer');

  function fmtTime(ms) {
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const sec = s%60;
    return m > 0 ? m+'m '+sec+'s' : sec+'s';
  }

  // Set up UI
  runningQueries = true;
  if (btn) { btn.classList.add('running'); btn.textContent = '⏳ RUNNING...'; }
  if (prog) prog.style.display = 'block';

  const timerInt = opts.timerInt || setInterval(() => {
    if (timerEl) timerEl.textContent = fmtTime(Date.now()-startTime);
  }, 1000);

  return new Promise((resolve, reject) => {
    let pollErrors = 0;
    const MAX_POLL_ERRORS = 15; // Stop after 15 consecutive errors
    let pollDelay = 2000; // Start at 2s, backoff to max 10s
    let pollTimeout = null;
    function schedulePoll() { pollTimeout = setTimeout(doPoll, pollDelay); }
    async function doPoll() {
      try {
        const data = await api('GET', `/api/brands/${brandId}/run-status/${runId}`);
        pollErrors = 0; // Reset on success
        // Reset delay on success (new data arriving = stay responsive)
        if (data.results && data.results.length > lastResultCount) {
          pollDelay = 2000; // New data — poll frequently
        } else {
          // No new data — back off gradually (2s → 3s → 4.5s → ... max 10s)
          pollDelay = Math.min(pollDelay * 1.5, 10000);
        }

        // Update progress
        received = data.received || 0;
        totalExpected = data.totalExpected || totalExpected;
        liveFoundCount = data.foundCount || 0;
        liveErrorCount = data.errorCount || 0;

        const pct = totalExpected > 0 ? Math.round((received / totalExpected) * 100) : 0;
        if (fill) fill.style.width = pct + '%';
        if (statusTxt) statusTxt.textContent = `${received}/${totalExpected} — ${liveFoundCount} found · ${fmtTime(Date.now()-startTime)}`;

        // Feed any new results to live views
        if (data.results && data.results.length > lastResultCount) {
          const newResults = data.results.slice(lastResultCount);
          for (const r of newResults) {
            onLiveResult(r, received, totalExpected, liveFoundCount, liveErrorCount);
          }
          lastResultCount = data.results.length;
        }

        if (data.status === 'done' || data.status === 'error') {
          clearInterval(timerInt);
          localStorage.removeItem('trackly_active_run');

          if (data.status === 'done') {
            if (fill) { fill.style.width = '100%'; fill.style.background = ''; }
            if (statusTxt) statusTxt.style.color = '';

            // Reload fresh brand data
            try {
              const freshData = await api('GET', '/api/brands');
              if (freshData.brands) {
                brands = freshData.brands;
                renderBrandSelect();
                if (currentBrandId) el('brand-select').value = currentBrandId;
              }
            } catch(_e) { console.warn('[Trackly]', _e.message || _e); }

            const elapsed = fmtTime(Date.now()-startTime);
            if (timerEl) timerEl.textContent = elapsed;
            const result = data.finalData?.result || { totalQ: received, totalM: liveFoundCount, sov: 0, newMentions: liveFoundCount, errorCount: liveErrorCount };

            if (statusTxt) statusTxt.textContent = `Done! Brand found in ${result.newMentions || liveFoundCount} of ${result.totalQ || received} responses · ${elapsed}`;

            setTimeout(() => {
              if (prog) prog.style.display = 'none';
              if (fill) fill.style.width = '0%';
              if (timerEl) timerEl.textContent = '';
            }, 5000);

            liveResults = [];
            liveRunTime = null;
            runningQueries = false;
            clearLiveNotifs();
            // Reset run selectors so mentions/proof auto-select the latest (newest) run
            const mSel = el('mentions-run-sel');
            if (mSel) mSel.value = '';
            const pSel = el('proof-run-sel');
            if (pSel) pSel.value = '';
            renderView(currentView);

            if (btn) { btn.classList.remove('running'); btn.textContent = '▶ RUN QUERIES'; }

            const errors = result.errorCount || liveErrorCount;
            if (errors > 0) {
              toast(`Run complete — ${result.totalQ - errors} succeeded, ${errors} failed.`, 'warn');
            } else {
              toast(result.sov === 0
                ? `Run complete — SOV: 0%. AI didn't mention your brand yet.`
                : `Run complete — SOV: ${result.sov}%! Found in ${result.newMentions} response${result.newMentions>1?'s':''}`,
                result.sov > 0 ? 'ok' : 'warn');
            }
            resolve();
          } else {
            // Error
            if (statusTxt) { statusTxt.style.color = 'var(--red)'; statusTxt.textContent = 'Run failed: ' + (data.error || 'Unknown error'); }
            if (fill) { fill.style.width = '0%'; fill.style.background = 'var(--red)'; }

            // Reload brand data (emergency save may have stored partial results)
            try {
              const freshData = await api('GET', '/api/brands');
              if (freshData.brands) { brands = freshData.brands; renderBrandSelect(); if (currentBrandId) el('brand-select').value = currentBrandId; }
            } catch(_e) { console.warn('[Trackly]', _e.message || _e); }

            liveResults = [];
            liveRunTime = null;
            runningQueries = false;
            clearLiveNotifs();
            if (btn) { btn.classList.remove('running'); btn.textContent = '▶ RUN QUERIES'; }
            toast('Run failed — check API Logs for details.', 'err');
            setTimeout(() => { if (prog) prog.style.display = 'none'; if (statusTxt) statusTxt.style.color = ''; if (fill) fill.style.background = ''; renderView(currentView); }, 2000);
            resolve();
          }
        } else {
          schedulePoll(); // Schedule next poll with current delay
        }
      } catch(pollErr) {
        pollErrors++;
        // Exponential backoff on errors: double delay each failure, max 10s
        pollDelay = Math.min(pollDelay * 2, 10000);
        console.error(`[Poll] Error polling run status (${pollErrors}/${MAX_POLL_ERRORS}):`, pollErr.message);
        if (pollErrors >= MAX_POLL_ERRORS) {
          clearInterval(timerInt);
          localStorage.removeItem('trackly_active_run');
          liveResults = []; liveRunTime = null; runningQueries = false; clearLiveNotifs();
          if (btn) { btn.classList.remove('running'); btn.textContent = '▶ RUN QUERIES'; }
          if (statusTxt) { statusTxt.style.color = 'var(--red)'; statusTxt.textContent = 'Lost connection to server. Run may still be in progress — refresh to check.'; }
          toast('Lost connection — refresh page to check run status.', 'err');
          resolve();
        } else {
          schedulePoll(); // Retry with increased delay
        }
      }
    }
    schedulePoll(); // Start first poll
  });
}

// ─── RESUME ACTIVE RUN ON PAGE LOAD ─────────────────────────────
async function checkActiveRun() {
  const stored = localStorage.getItem('trackly_active_run');
  if (!stored) return;
  let runInfo;
  try { runInfo = JSON.parse(stored); } catch(_) { localStorage.removeItem('trackly_active_run'); return; }

  // Discard runs older than 10 minutes (server cleans up after 10 min too)
  if (Date.now() - runInfo.startedAt > 10 * 60 * 1000) {
    localStorage.removeItem('trackly_active_run');
    return;
  }

  // Check if the run is still active on the server
  try {
    const data = await api('GET', `/api/brands/${runInfo.brandId}/run-status/${runInfo.runId}`);
    if (data.status === 'running') {
      // Switch to the brand that has a running query
      if (currentBrandId !== runInfo.brandId) {
        currentBrandId = runInfo.brandId;
        const sel = el('brand-select');
        if (sel) sel.value = currentBrandId;
      }
      toast('Resuming active query run...', 'ok');
      liveResults = [];
      liveRunTime = new Date(runInfo.startedAt);
      // Set running state BEFORE rendering so live views get initialized
      runningQueries = true;
      renderView(currentView); // Sets up live mentions/proof containers
      await pollRunStatus(runInfo.brandId, runInfo.runId, {
        startTime: runInfo.startedAt,
        received: data.received || 0,
        totalExpected: data.totalExpected || 0,
        liveFoundCount: data.foundCount || 0,
        liveErrorCount: data.errorCount || 0,
        lastResultCount: 0  // Feed all results from scratch on resume
      });
    } else {
      // Run already finished while we were away — just clear and reload
      localStorage.removeItem('trackly_active_run');
      try {
        const freshData = await api('GET', '/api/brands');
        if (freshData.brands) {
          brands = freshData.brands;
          renderBrandSelect();
          // Switch to the brand whose run completed
          if (currentBrandId !== runInfo.brandId) {
            currentBrandId = runInfo.brandId;
          }
          if (currentBrandId) el('brand-select').value = currentBrandId;
          // Force mentions/proof to show latest run by resetting selector state
          const mentionsSel = el('mentions-run-sel');
          if (mentionsSel) mentionsSel.value = '';
          const proofSel = el('proof-run-sel');
          if (proofSel) proofSel.value = '';
          renderView(currentView);
        }
      } catch(_e) { console.warn('[Trackly]', _e.message || _e); }
      if (data.status === 'done') {
        toast('Query run completed while you were away. Results are ready!', 'ok');
      }
    }
  } catch(_) {
    // Run not found — probably already cleaned up, just clear localStorage
    localStorage.removeItem('trackly_active_run');
  }
}

// ─── API LOGS / DIAGNOSTICS ─────────────────────────────────────
async function renderApiLogs(){
  const container = el('apilogs-content');
  container.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:20px;">Loading API logs from server...</div>';

  let html = '';

  // 1. Client-side errors (localStorage)
  const clientErrors = getStoredRunErrors();
  if (clientErrors.length > 0) {
    html += `<div class="card" style="margin-bottom:16px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.06);border-radius:var(--radius);">
      <div class="card-title" style="color:var(--red);">Recent Run Failures (${clientErrors.length})</div>`;
    clientErrors.forEach((err, errIdx) => {
      const dt = new Date(err.time);
      const dateStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      const isCrash = err.type === 'crash';

      // Build structured detail lines
      let details = '';
      if (err.brand) details += `<div><span style="color:var(--muted);">Brand:</span> <strong>${esc(err.brand)}</strong></div>`;
      if (err.platforms) details += `<div><span style="color:var(--muted);">Platforms:</span> ${esc(err.platforms)}</div>`;
      if (err.queries) details += `<div><span style="color:var(--muted);">Queries:</span> ${err.queries}</div>`;
      if (err.totalExpected) details += `<div><span style="color:var(--muted);">Progress:</span> ${err.received || 0}/${err.totalExpected} completed (${err.foundCount || 0} found, ${err.errorCount || 0} errors)</div>`;
      if (err.endpoint) details += `<div><span style="color:var(--muted);">Endpoint:</span> ${esc(err.endpoint)}</div>`;

      // Platform-specific errors
      let platDetails = '';
      if (err.platformErrors && Object.keys(err.platformErrors).length > 0) {
        Object.entries(err.platformErrors).forEach(([plat, msgs]) => {
          const t = PLAT_THEME[plat] || {};
          const uniqueMsgs = [...new Set(msgs)];
          platDetails += `<div style="margin-top:4px;"><span style="color:${t.color||'var(--text)'};font-weight:700;">${esc(plat)}</span>: <span style="color:var(--red);">${uniqueMsgs.map(m => esc(m)).join('; ')}</span></div>`;
        });
      }

      // Build the plain-text version for clipboard
      const copyId = 'err-copy-' + errIdx;

      html += `<div style="font-family:var(--mono);font-size:11px;margin-bottom:10px;line-height:1.7;padding:10px 12px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.15);border-radius:var(--radius-xs);position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <div>${esc(dateStr)} ${isCrash ? '<span style="color:var(--red);font-weight:700;">CRASHED</span>' : '<span style="color:var(--amber);font-weight:700;">ERRORS</span>'}</div>
          <button onclick="copyErrorLog(${errIdx})" style="background:var(--bg);border:1px solid var(--border);color:var(--muted);font-size:9px;padding:3px 8px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);white-space:nowrap;flex-shrink:0;" title="Copy full error details to clipboard">&#x1F4CB; Copy</button>
        </div>
        <div style="color:var(--red);font-weight:700;word-break:break-word;margin-bottom:6px;">${esc(err.error)}</div>
        ${details ? `<div style="font-size:10px;line-height:1.8;color:var(--text);margin-bottom:4px;">${details}</div>` : ''}
        ${platDetails}
        ${err.stack ? `<details style="margin-top:6px;"><summary style="cursor:pointer;color:var(--muted);font-size:9px;user-select:none;">Stack trace</summary><pre style="margin:4px 0 0;font-size:9px;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:auto;">${esc(err.stack)}</pre></details>` : ''}
      </div>`;
    });
    html += `<button onclick="clearStoredRunErrors();renderApiLogs();" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:10px;padding:4px 12px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);">DISMISS ALL</button></div>`;
  }

  // 2. API Key Status
  html += `<div class="card" style="margin-bottom:16px;">
    <div class="card-title">API Key Status</div>
    <div id="apilogs-key-status" style="font-family:var(--mono);font-size:11px;color:var(--muted);">Loading...</div>
  </div>`;

  // 3. Server-side API call logs
  html += `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div class="card-title" style="margin-bottom:0;">API Call Log</div>
      <div style="display:flex;gap:8px;">
        <button onclick="renderApiLogs()" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:10px;padding:4px 10px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);">REFRESH</button>
        <button onclick="clearApiLogs()" style="background:none;border:1px solid rgba(239,68,68,.3);color:var(--red);font-size:10px;padding:4px 10px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);">CLEAR LOGS</button>
      </div>
    </div>
    <div id="apilogs-stats" style="font-family:var(--mono);font-size:11px;color:var(--muted);margin:8px 0;"></div>
    <div id="apilogs-server-logs">Loading...</div>
  </div>`;

  // 4. Activity / Audit Log
  html += `<div class="card" style="margin-bottom:16px;">
    <div class="card-title">User Activity Log</div>
    <div id="apilogs-activity">Loading activity...</div>
  </div>`;

  // 5. Guide
  html += `<div class="card" style="margin-top:16px;">
    <div class="card-title">Common Errors &amp; Fixes</div>
    <div style="font-size:12px;line-height:1.8;color:var(--muted);">
      <div style="margin-bottom:8px;"><span style="color:var(--red);font-family:var(--mono);font-size:11px;">Rate limited / 429</span> — Too many requests. Multiple API keys help. Wait and retry.</div>
      <div style="margin-bottom:8px;"><span style="color:var(--red);font-family:var(--mono);font-size:11px;">Invalid API key / 401</span> — Key is wrong or expired. Replace in Railway and redeploy.</div>
      <div style="margin-bottom:8px;"><span style="color:var(--red);font-family:var(--mono);font-size:11px;">No credits / quota exceeded</span> — Add credits in your API provider dashboard.</div>
      <div style="margin-bottom:8px;"><span style="color:var(--red);font-family:var(--mono);font-size:11px;">Request timed out</span> — API took too long (>45s). Retry later.</div>
      <div><span style="color:var(--red);font-family:var(--mono);font-size:11px;">0 key(s)</span> — No keys loaded. Add PLATFORM_API_KEY_1, _2, _3 in Railway.</div>
    </div>
  </div>`;

  container.innerHTML = html;

  // Load key status
  loadKeyStatus();

  // Load server logs
  try {
    const b = brand();
    const brandParam = b ? '&brandId=' + b.id : '';
    const data = await api('GET', '/api/api-logs?limit=200' + brandParam);
    const logs = data.logs || [];
    const stats = data.stats || {};

    // Stats summary
    const statsEl = el('apilogs-stats');
    if (statsEl) {
      const totalCost24h = stats.total_cost ? '$' + stats.total_cost.toFixed(4) : '$0.00';
      const totalTokens24h = ((stats.total_tokens_in || 0) + (stats.total_tokens_out || 0)).toLocaleString();
      statsEl.innerHTML = `Last 24h: <span style="color:var(--green);">${stats.success || 0} ok</span> · <span style="color:var(--red);">${stats.errors || 0} errors</span> · ${stats.platforms_used || 0} platforms · avg ${stats.avg_ms || 0}ms · <span style="color:var(--amber);font-weight:700;">${totalCost24h}</span> cost · ${totalTokens24h} tokens`;
    }

    // Render logs table
    const logsEl = el('apilogs-server-logs');
    if (!logs.length) {
      logsEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:12px 0;">No API calls logged yet. Run queries to see every API call tracked here.</div>';
        }

    // Store logs for copy-to-clipboard access
    window._apiLogs = logs;

    // Group logs by run_id
    const runGroups = [];
    const runMap = {};
    const ungrouped = [];
    logs.forEach(log => {
      if (log.run_id) {
        if (!runMap[log.run_id]) {
          runMap[log.run_id] = { id: log.run_id, logs: [], totalCost: 0, totalTokens: 0, totalMs: 0, ok: 0, errors: 0, platforms: new Set(), startTime: null, endTime: null };
          runGroups.push(runMap[log.run_id]);
        }
        const g = runMap[log.run_id];
        g.logs.push(log);
        g.totalCost += parseFloat(log.cost) || 0;
        g.totalTokens += (log.tokens_in || 0) + (log.tokens_out || 0);
        g.totalMs += log.response_ms || 0;
        if (log.status === 'error') g.errors++; else g.ok++;
        g.platforms.add(log.platform);
        const t = new Date(log.created_at).getTime();
        if (!g.startTime || t < g.startTime) g.startTime = t;
        if (!g.endTime || t > g.endTime) g.endTime = t;
      } else {
        ungrouped.push(log);
      }
    });

    // Calculate running total across all logs
    let runningCostTotal = 0;
    const logsReversed = logs.slice().reverse();
    const runningMap = {};
    logsReversed.forEach(log => {
      runningCostTotal += parseFloat(log.cost) || 0;
      runningMap[log.id] = runningCostTotal;
    });

    let tbl = `<div style="overflow-x:auto;max-height:700px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead style="position:sticky;top:0;z-index:1;"><tr style="background:var(--bg3);">
        <th class="th" style="width:130px;">Time</th>
        <th class="th" style="width:80px;">Platform</th>
        <th class="th" style="width:120px;">Model</th>
        <th class="th">Query</th>
        <th class="th" style="width:60px;">Status</th>
        <th class="th" style="width:80px;">Tokens</th>
        <th class="th" style="width:60px;">Cost</th>
        <th class="th" style="width:70px;">Running</th>
        <th class="th" style="width:50px;">Time</th>
        <th class="th" style="width:60px;">Key</th>
        <th class="th">Error</th>
        <th style="width:36px;"></th>
      </tr></thead><tbody>`;

    // Render grouped runs + ungrouped logs in chronological order (newest first)
    // Build a flat render list with run summaries interleaved
    const renderItems = [];
    const processedRunIds = new Set();
    const logIndexMap = new Map();
    logs.forEach((log, idx) => { logIndexMap.set(log, idx); });
    logs.forEach(log => {
      if (log.run_id && !processedRunIds.has(log.run_id)) {
        processedRunIds.add(log.run_id);
        const g = runMap[log.run_id];
        renderItems.push({ type: 'run-summary', group: g });
        g.logs.forEach(l => renderItems.push({ type: 'log', log: l, runId: log.run_id, logIdx: logIndexMap.get(l) }));
      } else if (!log.run_id) {
        renderItems.push({ type: 'log', log, runId: null, logIdx: logIndexMap.get(log) });
      }
    });

    renderItems.forEach(item => {
      if (item.type === 'run-summary') {
        const g = item.group;
        const startDt = new Date(g.startTime);
        const timeStr = startDt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + startDt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
        const durationSec = g.endTime && g.startTime ? Math.round((g.endTime - g.startTime) / 1000) : 0;
        const durStr = durationSec >= 60 ? Math.floor(durationSec/60) + 'm ' + (durationSec%60) + 's' : durationSec + 's';
        const costStr = g.totalCost > 0 ? '$' + g.totalCost.toFixed(4) : '$0.00';
        const platList = [...g.platforms].join(', ');
        tbl += `<tr style="background:rgba(59,130,246,.06);border-top:2px solid rgba(59,130,246,.3);cursor:pointer;" onclick="this.classList.toggle('run-collapsed');let s=this.nextElementSibling;while(s&&s.dataset.runid==='${g.id}'){s.style.display=s.style.display==='none'?'':'none';s=s.nextElementSibling;}">
          <td style="font-family:var(--mono);font-size:10px;white-space:nowrap;color:var(--blue);font-weight:700;">▶ ${esc(timeStr)}</td>
          <td colspan="2" style="font-size:10px;font-weight:700;color:var(--text);">${g.ok + g.errors} calls · ${[...g.platforms].length} platforms</td>
          <td style="font-size:10px;color:var(--muted);">${esc(platList)}</td>
          <td style="text-align:center;"><span style="color:var(--green);font-weight:700;font-size:10px;">${g.ok}</span>${g.errors ? ` <span style="color:var(--red);font-weight:700;font-size:10px;">${g.errors}</span>` : ''}</td>
          <td style="font-family:var(--mono);font-size:9px;color:var(--muted);text-align:right;">${g.totalTokens.toLocaleString()}</td>
          <td style="font-family:var(--mono);font-size:11px;color:var(--amber);text-align:right;font-weight:800;">${costStr}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--amber);text-align:right;font-weight:700;">RUN TOTAL</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right;">${durStr}</td>
          <td colspan="3" style="font-family:var(--mono);font-size:9px;color:var(--blue);">▶ click to expand</td>
        </tr>`;
        return;
      }

      const log = item.log;
      const dt = new Date(log.created_at);
      const timeStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const isErr = log.status === 'error';
      const t = PLAT_THEME[log.platform] || {};
      const queryShort = (log.query || '').length > 50 ? log.query.substring(0, 50) + '...' : (log.query || '—');
      const respTime = log.response_ms ? (log.response_ms/1000).toFixed(1) + 's' : '—';
      const totalTokens = (log.tokens_in || 0) + (log.tokens_out || 0);
      const tokenStr = totalTokens > 0 ? totalTokens.toLocaleString() : '—';
      const costVal = parseFloat(log.cost) || 0;
      const costStr = costVal > 0 ? '$' + costVal.toFixed(4) : '—';
      const runCost = runningMap[log.id] || 0;
      const runCostStr = runCost > 0 ? '$' + runCost.toFixed(4) : '—';
      const modelShort = (log.model || '').replace(/^(gpt-|claude-|gemini-|grok-|sonar-|deepseek-)/, '').substring(0, 18);
      const dataAttr = item.runId ? ` data-runid="${esc(item.runId)}"` : '';

      tbl += `<tr${dataAttr} style="${item.runId ? 'display:none;' : ''}${isErr ? 'background:rgba(239,68,68,.06);' : ''}">
        <td style="font-family:var(--mono);font-size:10px;white-space:nowrap;${item.runId ? 'padding-left:24px;' : ''}">${esc(timeStr)}</td>
        <td style="color:${t.color || 'var(--text)'};font-weight:700;font-size:10px;">${esc(log.platform)}</td>
        <td style="font-family:var(--mono);font-size:9px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(log.model || '')}">${esc(modelShort || '—')}</td>
        <td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(log.query || '')}">${esc(queryShort)}</td>
        <td style="text-align:center;"><span style="color:${isErr ? 'var(--red)' : 'var(--green)'};font-weight:700;font-size:10px;">${isErr ? 'FAIL' : 'OK'}</span></td>
        <td style="font-family:var(--mono);font-size:9px;color:var(--muted);text-align:right;" title="In: ${(log.tokens_in||0).toLocaleString()} / Out: ${(log.tokens_out||0).toLocaleString()}">${tokenStr}</td>
        <td style="font-family:var(--mono);font-size:10px;color:var(--amber);text-align:right;font-weight:600;">${costStr}</td>
        <td style="font-family:var(--mono);font-size:10px;color:var(--text);text-align:right;font-weight:700;">${runCostStr}</td>
        <td style="font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right;">${respTime}</td>
        <td style="font-family:var(--mono);font-size:9px;color:var(--muted);">...${esc(log.key_hint || '?')}</td>
        <td style="font-size:10px;color:var(--red);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(log.error || '')}">${isErr ? esc(friendlyError(log.error)) : ''}</td>
        <td style="text-align:center;"><button onclick="copyApiLogRow(window._apiLogs[${item.logIdx}])" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:8px;padding:2px 5px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);" title="Copy log entry">&#x1F4CB;</button></td>
      </tr>`;
    });

    tbl += '</tbody></table></div>';
    if (logs.length >= 200) tbl += '<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px;">Showing last 200 entries. Older logs are auto-cleaned after 7 days.</div>';
    logsEl.innerHTML = tbl;

  } catch(e) {
    const logsEl = el('apilogs-server-logs');
    if (logsEl) logsEl.innerHTML = `<div style="color:var(--red);font-family:var(--mono);font-size:11px;">Failed to load logs: ${esc(e.message)}</div>`;
  }

  // Load activity logs
  try {
    const actData = await api('GET', '/api/activity-logs?limit=50');
    const actEl = el('apilogs-activity');
    const actLogs = actData.logs || [];
    if (!actLogs.length) {
      actEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:8px 0;">No activity logged yet.</div>';
    } else {
      const actionIcons = {login:'&#x1F511;',register:'&#x1F4DD;',create_brand:'&#x2795;',delete_brand:'&#x1F5D1;',run_queries:'&#x25B6;',update_brand:'&#x270F;',change_plan:'&#x2B50;',export_data:'&#x1F4E5;',change_password:'&#x1F512;',admin_edit_user:'&#x1F6E0;'};
      let actHtml = '<div style="max-height:400px;overflow-y:auto;">';
      actLogs.forEach(log => {
        const dt = new Date(log.created_at);
        const timeStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
        const icon = actionIcons[log.action] || '&#x25CF;';
        const email = log.user_email || 'Unknown';
        const details = log.details || {};
        let detailStr = '';
        if (details.brand) detailStr = ' — ' + esc(details.brand);
        if (details.plan) detailStr = ' — plan: ' + esc(details.plan);
        if (details.email) detailStr = ' — ' + esc(details.email);
        actHtml += `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <span style="font-size:14px;flex-shrink:0;width:20px;text-align:center;">${icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span style="font-weight:600;color:var(--text);">${esc(email)}</span>
              <span style="color:var(--muted);font-size:11px;">${esc(log.action.replace(/_/g,' '))}</span>
              <span style="color:var(--muted);font-family:var(--mono);font-size:9px;">${esc(timeStr)}</span>
            </div>
            ${detailStr ? `<div style="color:var(--muted);font-size:11px;margin-top:2px;">${detailStr}</div>` : ''}
          </div>
        </div>`;
      });
      actHtml += '</div>';
      actEl.innerHTML = actHtml;
    }
  } catch(e) {
    const actEl = el('apilogs-activity');
    if (actEl) actEl.innerHTML = `<div style="color:var(--muted);font-family:var(--mono);font-size:11px;">Activity logs unavailable.</div>`;
  }
}

// Copy full error detail to clipboard for sharing with developers
function copyErrorLog(errIdx) {
  const errors = getStoredRunErrors();
  const err = errors[errIdx];
  if (!err) return;
  const dt = new Date(err.time);
  const dateStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  let text = `--- Trackly Error Report ---\n`;
  text += `Time: ${dateStr}\n`;
  text += `Type: ${err.type === 'crash' ? 'CRASH' : 'PARTIAL ERRORS'}\n`;
  text += `Error: ${err.error}\n`;
  if (err.brand) text += `Brand: ${err.brand}\n`;
  if (err.brandId) text += `Brand ID: ${err.brandId}\n`;
  if (err.platforms) text += `Platforms: ${err.platforms}\n`;
  if (err.queries) text += `Queries: ${err.queries}\n`;
  if (err.totalExpected) text += `Progress: ${err.received || 0}/${err.totalExpected} (${err.foundCount || 0} found, ${err.errorCount || 0} errors)\n`;
  if (err.endpoint) text += `Endpoint: ${err.endpoint}\n`;
  if (err.userAgent) text += `Browser: ${err.userAgent}\n`;
  if (err.platformErrors && Object.keys(err.platformErrors).length) {
    text += `\nPlatform Errors:\n`;
    Object.entries(err.platformErrors).forEach(([plat, msgs]) => {
      const uniqueMsgs = [...new Set(msgs)];
      text += `  ${plat}: ${uniqueMsgs.join('; ')}\n`;
    });
  }
  if (err.stack) text += `\nStack Trace:\n${err.stack}\n`;
  text += `---`;
  navigator.clipboard.writeText(text).then(() => toast('Error details copied to clipboard', 'ok')).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('Error details copied to clipboard', 'ok');
  });
}

// Copy a single API log row detail for debugging
function copyApiLogRow(logData) {
  let text = `--- Trackly API Log ---\n`;
  text += `Time: ${logData.time}\n`;
  text += `Platform: ${logData.platform}\n`;
  text += `Model: ${logData.model || '—'}\n`;
  text += `Query: ${logData.query || '—'}\n`;
  text += `Status: ${logData.status}\n`;
  if (logData.error) text += `Error: ${logData.error}\n`;
  text += `Response Time: ${logData.response_ms ? logData.response_ms + 'ms' : '—'}\n`;
  text += `Tokens: In ${logData.tokens_in || 0} / Out ${logData.tokens_out || 0}\n`;
  text += `Cost: $${(parseFloat(logData.cost) || 0).toFixed(4)}\n`;
  text += `Key: ...${logData.key_hint || '?'}\n`;
  if (logData.run_id) text += `Run ID: ${logData.run_id}\n`;
  text += `---`;
  navigator.clipboard.writeText(text).then(() => toast('Log entry copied to clipboard', 'ok')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('Log entry copied to clipboard', 'ok');
  });
}

async function clearApiLogs() {
  if (!confirm('Clear all API logs? This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/api-logs');
    clearStoredRunErrors();
    toast('All logs cleared', 'ok');
    renderApiLogs();
  } catch(e) { toast(e.message, 'err'); }
}

function loadKeyStatus() {
  api('GET', '/api/keys/status').then(status => {
    const ksEl = el('apilogs-key-status');
    if (!ksEl) return;
    const counts = status.keyCounts || {};
    let ksHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    Object.entries(counts).forEach(([plat, count]) => {
      const color = count > 0 ? 'var(--green)' : 'var(--red)';
      ksHtml += `<div style="border:1px solid var(--border);padding:6px 12px;border-radius:var(--radius-xs);"><span style="color:${color};font-weight:700;">${count}</span> <span style="text-transform:capitalize;">${plat}</span> key${count!==1?'s':''}</div>`;
    });
    ksHtml += '</div>';
    if (Object.values(counts).some(c => c === 0)) {
      ksHtml += `<div style="margin-top:8px;color:var(--amber);font-size:10px;">Platforms with 0 keys will be skipped. Add keys in Railway variables.</div>`;
    }
    ksEl.innerHTML = ksHtml;
  }).catch(() => {
    const ksEl = el('apilogs-key-status');
    if (ksEl) ksEl.innerHTML = '<span style="color:var(--red);">Failed to load key status.</span>';
  });
}

function renderApiKeyStatus() {
  const container = el('api-key-status-content');
  const warning = el('api-key-status-warning');
  if (!container) return;
  container.innerHTML = '<span style="font-family:var(--mono);font-size:11px;color:var(--muted);">Loading...</span>';
  api('GET', '/api/keys/status').then(status => {
    const counts = status.keyCounts || {};
    let html = '';
    Object.entries(counts).forEach(([plat, count]) => {
      const t = PLAT_THEME[plat] || {};
      const color = count > 0 ? 'var(--green)' : 'var(--red)';
      html += `<div style="border:1px solid var(--border);padding:12px 18px;border-radius:var(--radius-xs);text-align:center;">
        <span style="color:${color};font-weight:700;font-size:18px;">${count}</span>
        <div style="font-size:10px;color:var(--muted);margin-top:4px;">${esc(plat)} key${count!==1?'s':''}</div>
      </div>`;
    });
    container.innerHTML = html;
    if (warning && Object.values(counts).some(c => c === 0)) {
      warning.textContent = 'Platforms with 0 keys will be skipped during queries. Add keys in Railway environment variables.';
    } else if (warning) {
      warning.textContent = '';
    }
  }).catch(() => {
    container.innerHTML = '<span style="color:var(--red);">Failed to load key status.</span>';
  });
}

// ─── ADMIN PANEL ──────────────────────────────────────────────
let adminUsers = [];

async function renderAdmin(){
  if (!currentUser || currentUser.role !== 'admin') {
    el('admin-users-table').innerHTML = '<div class="empty-state"><p>Admin access required.</p></div>';
    return;
  }
  el('admin-users-table').innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:20px;">Loading users...</div>';
  el('admin-stats').innerHTML = '';
  try {
    const data = await api('GET', '/api/admin/users');
    adminUsers = data.users || [];
    renderAdminStats(adminUsers);
    el('admin-user-count').textContent = adminUsers.length + ' user' + (adminUsers.length !== 1 ? 's' : '');
    filterAdminUsers();
  } catch(e) {
    el('admin-users-table').innerHTML = '<div class="empty-state"><p>Failed to load users: ' + esc(e.message) + '</p></div>';
  }
}

function renderAdminStats(users){
  const total = users.length;
  const free = users.filter(u => u.plan === 'free').length;
  const pro = users.filter(u => u.plan === 'pro').length;
  const agency = users.filter(u => u.plan === 'agency').length;
  const stats = [
    { label: 'Total Users', value: total, color: 'var(--text)' },
    { label: 'Free Plan', value: free, color: 'var(--muted)' },
    { label: 'Pro Plan', value: pro, color: 'var(--green)' },
    { label: 'Agency Plan', value: agency, color: 'var(--purple)' }
  ];
  el('admin-stats').innerHTML = stats.map(s => `
    <div style="background:var(--bg2);border:1px solid var(--border);padding:16px;border-radius:var(--radius);">
      <div style="font-family:var(--mono);font-size:9px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">${s.label}</div>
      <div style="font-size:28px;font-weight:800;color:${s.color};letter-spacing:-1px;">${s.value}</div>
    </div>
  `).join('');
}

function filterAdminUsers(){
  const q = (el('admin-search').value || '').toLowerCase().trim();
  const planFilter = el('admin-filter-plan').value;
  const roleFilter = el('admin-filter-role').value;
  let filtered = adminUsers;
  if (q) filtered = filtered.filter(u => u.email.toLowerCase().includes(q) || (u.name||'').toLowerCase().includes(q));
  if (planFilter) filtered = filtered.filter(u => u.plan === planFilter);
  if (roleFilter) filtered = filtered.filter(u => roleFilter === 'admin' ? u.role === 'admin' : u.role !== 'admin');
  el('admin-user-count').textContent = filtered.length + ' of ' + adminUsers.length + ' user' + (adminUsers.length !== 1 ? 's' : '');
  renderAdminTable(filtered);
}

function renderAdminTable(users){
  if (!users.length) {
    el('admin-users-table').innerHTML = '<div class="empty-state"><p>No users found.</p></div>';
    return;
  }
  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--bg3);">
    <th class="th">User</th><th class="th">Plan</th><th class="th">Role</th><th class="th">Brands</th><th class="th">API Keys</th><th class="th">Joined</th><th class="th" style="text-align:right;">Actions</th>
  </tr></thead><tbody>`;
  users.forEach(u => {
    const planColor = u.plan === 'agency' ? 'var(--purple)' : u.plan === 'pro' ? 'var(--green)' : 'var(--muted)';
    const planBg = u.plan === 'agency' ? 'rgba(155,114,255,.1)' : u.plan === 'pro' ? 'rgba(255,97,84,.1)' : 'rgba(255,255,255,.05)';
    const planBorder = u.plan === 'agency' ? 'rgba(155,114,255,.3)' : u.plan === 'pro' ? 'rgba(255,97,84,.3)' : 'var(--border)';
    const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const keyCount = (u.hasKeys||[]).length;
    const isMe = u.id === currentUser.id;
    html += `<tr>
      <td>
        <div style="font-weight:600;font-size:13px;">${esc(u.name || '—')}${isMe ? ' <span style="font-family:var(--mono);font-size:9px;color:var(--green);border:1px solid rgba(255,97,84,.3);padding:2px 6px;border-radius:4px;margin-left:6px;">YOU</span>' : ''}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:2px;">${esc(u.email)}${u.username ? ' · <span style="color:var(--green);">@' + esc(u.username) + '</span>' : ''}</div>
      </td>
      <td>
        <span style="display:inline-block;font-family:var(--mono);font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;background:${planBg};color:${planColor};border:1px solid ${planBorder};text-transform:uppercase;">${u.plan}</span>
      </td>
      <td><span class="badge ${u.role==='admin'?'pos':'neu'}">${u.role||'user'}</span></td>
      <td style="font-family:var(--mono);font-size:12px;">${u.brandCount !== undefined ? u.brandCount : '—'}</td>
      <td style="font-family:var(--mono);font-size:11px;color:${keyCount ? 'var(--green)' : 'var(--muted)'};">${keyCount ? keyCount + ' configured' : 'None'}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted);">${joined}</td>
      <td style="text-align:right;">
        <button onclick="openAdminEdit('${u.id}')" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:10px;padding:5px 12px;cursor:pointer;letter-spacing:0.5px;border-radius:var(--radius-xs);">EDIT</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el('admin-users-table').innerHTML = html;
}

function openAdminEdit(userId){
  const u = adminUsers.find(x => x.id === userId);
  if (!u) return;
  el('admin-edit-id').value = u.id;
  el('admin-edit-email').value = u.email || '';
  el('admin-edit-username').value = u.username || '';
  el('admin-edit-name').value = u.name || '';
  el('admin-edit-plan').value = u.plan || 'free';
  el('admin-edit-role').value = u.role || 'user';
  el('admin-edit-title').textContent = 'Edit User — ' + (u.name || u.email);
  // Read-only info
  const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  el('admin-edit-joined').textContent = joined;
  el('admin-edit-brands').textContent = (u.brandCount !== undefined ? u.brandCount : '—') + ' / ' + (u.limits?.brands || '?') + ' allowed';
  el('admin-edit-keys').textContent = (u.hasKeys||[]).length ? (u.hasKeys||[]).join(', ') : 'None';
  el('admin-edit-limits').textContent = (u.limits?.prompts || '?') + ' prompts, ' + (u.limits?.brands || '?') + ' brands';
  // Disable role change for self, hide delete for self
  el('admin-edit-role').disabled = (u.id === currentUser.id);
  el('admin-edit-password').value = '';
  const delBtn = document.getElementById('admin-edit-delete-btn');
  if (delBtn) delBtn.style.display = (u.id === currentUser.id) ? 'none' : 'block';
  document.getElementById('admin-edit-modal').classList.add('open');
}

function closeAdminEdit(){
  document.getElementById('admin-edit-modal').classList.remove('open');
}

async function saveAdminEdit(){
  const userId = el('admin-edit-id').value;
  if (!userId) return;
  const u = adminUsers.find(x => x.id === userId);
  if (!u) return;
  const payload = {};
  const newEmail = el('admin-edit-email').value.trim();
  const newUsername = el('admin-edit-username').value.trim();
  const newName = el('admin-edit-name').value.trim();
  const newPlan = el('admin-edit-plan').value;
  const newRole = el('admin-edit-role').value;
  if (newEmail !== u.email) payload.email = newEmail;
  if (newUsername !== (u.username || '')) payload.username = newUsername || null;
  if (newName !== (u.name || '')) payload.name = newName;
  if (newPlan !== u.plan) payload.plan = newPlan;
  if (newRole !== (u.role || 'user')) payload.role = newRole;
  if (!Object.keys(payload).length) { closeAdminEdit(); toast('No changes made', 'ok'); return; }
  try {
    const data = await api('PUT', '/api/admin/users/' + userId, payload);
    // Update local cache
    const idx = adminUsers.findIndex(x => x.id === userId);
    if (idx >= 0) Object.assign(adminUsers[idx], data.user);
    closeAdminEdit();
    renderAdminStats(adminUsers);
    filterAdminUsers();
    toast('User updated successfully', 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

async function changeUserPlan(userId, newPlan){
  try {
    await api('PUT', '/api/admin/users/' + userId, { plan: newPlan });
    const idx = adminUsers.findIndex(u => u.id === userId);
    if (idx >= 0) adminUsers[idx].plan = newPlan;
    renderAdminStats(adminUsers);
    toast('Plan updated to ' + newPlan.toUpperCase(), 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

// ─── Admin: Add User ──────────────────────────────────────────────
function openAdminAddUser(){
  el('admin-add-email').value = '';
  el('admin-add-username').value = '';
  el('admin-add-name').value = '';
  el('admin-add-password').value = '';
  el('admin-add-plan').value = 'free';
  el('admin-add-role').value = 'user';
  document.getElementById('admin-add-modal').classList.add('open');
}

function closeAdminAddUser(){
  document.getElementById('admin-add-modal').classList.remove('open');
}

function generateRandomPassword(){
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  el('admin-add-password').value = pw;
}

async function submitAdminAddUser(){
  const email = el('admin-add-email').value.trim();
  const username = el('admin-add-username').value.trim();
  const name = el('admin-add-name').value.trim();
  const password = el('admin-add-password').value;
  const plan = el('admin-add-plan').value;
  const role = el('admin-add-role').value;
  if (!email || !password) { toast('Email and password are required', 'err'); return; }
  if (password.length < 8) { toast('Password must be at least 8 characters', 'err'); return; }
  try {
    const data = await api('POST', '/api/admin/users', { email, username: username || undefined, name, password, plan, role });
    adminUsers.push(data.user);
    closeAdminAddUser();
    renderAdminStats(adminUsers);
    filterAdminUsers();
    toast('User created: ' + email, 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

// ─── Admin: Delete User ───────────────────────────────────────────
async function adminDeleteUser(){
  const userId = el('admin-edit-id').value;
  if (!userId) return;
  const u = adminUsers.find(x => x.id === userId);
  if (!u) return;
  if (u.id === currentUser.id) { toast('Cannot delete your own account', 'err'); return; }
  if (!confirm('Are you sure you want to delete user "' + (u.name || u.email) + '"?\n\nThis will permanently delete their account, all brands, and all data. This action cannot be undone.')) return;
  try {
    await api('DELETE', '/api/admin/users/' + userId);
    adminUsers = adminUsers.filter(x => x.id !== userId);
    closeAdminEdit();
    renderAdminStats(adminUsers);
    filterAdminUsers();
    toast('User deleted: ' + (u.name || u.email), 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

// ─── Admin: Reset Password ───────────────────────────────────────
async function adminResetPassword(){
  const userId = el('admin-edit-id').value;
  const password = el('admin-edit-password').value;
  if (!userId) return;
  if (!password || password.length < 8) { toast('Password must be at least 8 characters', 'err'); return; }
  if (!confirm('Reset password for this user?')) return;
  try {
    await api('PUT', '/api/admin/users/' + userId + '/password', { password });
    el('admin-edit-password').value = '';
    toast('Password reset successfully', 'ok');
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

async function becomeAdmin(){
  if (!confirm('This will make you the admin of this Trackly instance. Continue?')) return;
  try {
    const data = await api('POST', '/api/admin/make-first-admin');
    if (data.success) {
      currentUser.role = 'admin';
      el('nav-admin').style.display = 'block';
      el('nav-become-admin').style.display = 'none';
      toast('You are now an admin!', 'ok');
      go('admin');
    }
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT DETAILS VIEW (Epic 2.4)
// ═══════════════════════════════════════════════════════════════════
let _pdVisChart = null, _pdCompChart = null;

async function renderPromptDetails() {
  const b = brand();
  if (!b) return;
  showViewLoading('pd-metrics');

  // Populate prompt selector
  const sel = el('pd-prompt-select');
  const queries = b.queries || [];
  sel.innerHTML = queries.map((q, i) => `<option value="${esc(q)}">${esc(q)}</option>`).join('');

  // Populate platform filter
  const platFilter = el('pd-platform-filter');
  platFilter.innerHTML = '<option value="">All Platforms</option>' +
    PLATS.map(p => `<option value="${p}">${p}</option>`).join('');

  renderPromptDetail();
}

async function renderPromptDetail() {
  const b = brand();
  if (!b) return;
  const prompt = el('pd-prompt-select').value;
  const platform = el('pd-platform-filter').value;
  if (!prompt) return;

  try {
    // Load visibility data
    const visData = await api('GET', `/api/brands/${b.id}/prompt-visibility`);
    const promptData = (visData.visibility || []).find(v => v.prompt === prompt);

    // Render metrics cards
    const metricsEl = el('pd-metrics');
    if (promptData) {
      const platforms = Object.values(promptData.platforms);
      const totalRuns = platforms.reduce((s, p) => s + (p.total_runs || 0), 0);
      const totalMentions = platforms.reduce((s, p) => s + (p.mention_count || 0), 0);
      const avgRate = totalRuns > 0 ? (totalMentions / totalRuns * 100).toFixed(1) : 0;
      const rankedPlatforms = platforms.filter(p => p.avg_rank);
      const avgRank = rankedPlatforms.length > 0 ? rankedPlatforms.reduce((s, p) => s + parseFloat(p.avg_rank), 0) / rankedPlatforms.length : 0;

      // Compute dominant sentiment
      let totalSent = 0;
      const sentAgg = { positive: 0, neutral: 0, negative: 0 };
      platforms.forEach(p => {
        const dist = p.sentiment_distribution || {};
        sentAgg.positive += (dist.positive || 0);
        sentAgg.neutral += (dist.neutral || 0);
        sentAgg.negative += (dist.negative || 0);
      });
      totalSent = sentAgg.positive + sentAgg.neutral + sentAgg.negative;
      const domSent = sentAgg.positive >= sentAgg.negative ? 'Positive' : 'Negative';
      const domSentColor = domSent === 'Positive' ? 'var(--green)' : 'var(--red)';
      const platFoundCount = platforms.filter(p => (p.mention_count || 0) > 0).length;

      metricsEl.innerHTML = `
        <div class="score-card"><div class="score-val" style="font-size:20px;color:var(--green);">${avgRate}%</div><div class="score-label">Visibility</div></div>
        <div class="score-card"><div class="score-val" style="font-size:20px;color:var(--blue);">${platFoundCount}/${platforms.length}</div><div class="score-label">Platforms Found</div></div>
        <div class="score-card"><div class="score-val" style="font-size:20px;color:${domSentColor};">${domSent}</div><div class="score-label">Avg Sentiment</div></div>
        <div class="score-card"><div class="score-val" style="font-size:20px;color:var(--purple);">${avgRank ? '#' + avgRank.toFixed(1) : '--'}</div><div class="score-label">Avg Position</div></div>
      `;
    } else {
      metricsEl.innerHTML = '<div class="card" style="padding:16px;grid-column:1/-1;text-align:center;color:var(--muted);">No data yet. Run queries to see prompt-level metrics.</div>';
    }

    // Load history for chart (lazy-load Chart.js in parallel with data fetch)
    const [histData] = await Promise.all([
      api('GET', `/api/brands/${b.id}/prompt-history?prompt=${encodeURIComponent(prompt)}&days=30${platform ? '&platform=' + platform : ''}`),
      ensureChartJs()
    ]);

    // Visibility chart
    if (_pdVisChart) { _pdVisChart.destroy(); _pdVisChart = null; }
    const canvas = document.getElementById('pd-visibility-chart');
    if (canvas && histData.history && histData.history.length > 0) {
      const grouped = {};
      histData.history.forEach(h => {
        if (!grouped[h.platform]) grouped[h.platform] = [];
        grouped[h.platform].push(h);
      });
      const datasets = Object.entries(grouped).map(([plat, data]) => ({
        label: plat,
        data: data.map(d => ({ x: d.date, y: d.mentionRate })),
        borderColor: PLAT_THEME[plat]?.color || '#888',
        backgroundColor: PLAT_THEME[plat]?.bg || 'rgba(136,136,136,0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 3
      }));
      _pdVisChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { datasets },
        options: { responsive: true, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Mention Rate %' } } }, plugins: { legend: { position: 'bottom' } } }
      });
    }

    // Competitor chart
    if (_pdCompChart) { _pdCompChart.destroy(); _pdCompChart = null; }
    const compData = await api('GET', `/api/brands/${b.id}/competitor-analysis`);
    const compCanvas = document.getElementById('pd-competitor-chart');
    if (compCanvas && compData.topCompetitors && compData.topCompetitors.length > 0) {
      const top = compData.topCompetitors.slice(0, 8);
      _pdCompChart = new Chart(compCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: top.map(c => c.competitor),
          datasets: [{
            label: 'Appearances',
            data: top.map(c => c.total_appearances),
            backgroundColor: 'rgba(79,70,229,0.6)',
            borderRadius: 4
          }]
        },
        options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } } }
      });
    }

    // Per-Platform Results table (preview design)
    const tableEl = el('pd-platform-table');
    if (tableEl && promptData) {
      let tableRows = '';
      Object.entries(promptData.platforms).forEach(([plat, pData]) => {
        if (platform && plat !== platform) return;
        const t = PLAT_THEME[plat]||{};
        const found = (pData.mention_count || 0) > 0;
        const sent = pData.sentiment_distribution || {};
        const domS = (sent.positive||0) >= (sent.negative||0) ? (sent.positive ? 'Positive' : '—') : 'Negative';
        const domSC = domS === 'Positive' ? 'var(--green)' : domS === 'Negative' ? 'var(--red)' : '';
        const avgR = pData.avg_rank ? '#' + parseFloat(pData.avg_rank).toFixed(0) : '—';
        tableRows += `<tr class="trow">
          <td class="td" style="font-weight:700;color:${t.color||'#888'};">${esc(plat)}</td>
          <td class="td">${found ? '<span class="status-found">YES</span>' : '<span class="status-notfound">NO</span>'}</td>
          <td class="td">${avgR}</td>
          <td class="td" style="color:${domSC};">${domS}</td>
          <td class="td">${found ? 'Yes' : '—'}</td>
        </tr>`;
      });
      tableEl.innerHTML = `<div class="card-title" style="padding:14px 14px 0;">Per-Platform Results</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--bg3);"><th class="th">Platform</th><th class="th">Found</th><th class="th">Position</th><th class="th">Sentiment</th><th class="th">Recommended</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>`;
    }
  } catch(e) {
    console.error('[PromptDetails]', e);
  }
}

async function savePromptMetadata() {
  const b = brand();
  if (!b) return;
  const prompt = el('pd-prompt-select').value;
  if (!prompt) return;
  const tags = el('pd-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  try {
    await api('PUT', `/api/brands/${b.id}/prompt-metadata`, {
      prompt,
      intent: el('pd-intent').value,
      funnel_stage: el('pd-funnel').value,
      tags
    });
    toast('Prompt metadata saved', 'ok');
  } catch(e) { toast('Failed to save metadata', 'err'); }
}

async function viewPromptRun(brandId, runId) {
  try {
    const data = await api('GET', `/api/brands/${brandId}/prompt-runs/${runId}`);
    const r = data.run;
    const modal = document.createElement('div');
    modal.className = 'overlay open';
    modal.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <div class="modal-head">
          <span>Response Details</span>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">&times;</button>
        </div>
        <div style="padding:20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div><strong>Platform:</strong> ${esc(r.platform)}</div>
            <div><strong>Model:</strong> ${esc(r.model || 'N/A')}</div>
            <div><strong>Mentioned:</strong> ${r.mentioned ? 'Yes' : 'No'}</div>
            <div><strong>Sentiment:</strong> ${esc(r.sentiment)}</div>
            <div><strong>Position:</strong> ${r.list_position || 'N/A'}</div>
            <div><strong>Date:</strong> ${new Date(r.created_at).toLocaleString()}</div>
          </div>
          <div><strong>Prompt:</strong></div>
          <div style="background:var(--bg2);padding:12px;border-radius:8px;margin:8px 0;font-size:13px;">${esc(r.prompt)}</div>
          <div><strong>Full Response:</strong></div>
          <div style="background:var(--bg2);padding:12px;border-radius:8px;margin:8px 0;font-size:13px;max-height:400px;overflow-y:auto;white-space:pre-wrap;">${r.response_raw ? esc(r.response_raw) : '(response not stored)'}</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } catch(e) { toast('Failed to load response', 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// RECOMMENDATIONS VIEW (Epic 3.4)
// ═══════════════════════════════════════════════════════════════════
async function renderRecommendations() {
  const b = brand();
  if (!b) return;
  showViewLoading('rec-list');
  const status = el('rec-filter-status')?.value || '';
  const severity = el('rec-filter-severity')?.value || '';
  try {
    let url = `/api/brands/${b.id}/recommendations?`;
    if (status) url += `status=${status}&`;
    if (severity) url += `severity=${severity}&`;
    const data = await api('GET', url);
    let recs = data.recommendations || [];
    const listEl = el('rec-list');

    // By default, hide completed (done) and ignored items unless user explicitly filters
    if (!status) {
      recs = recs.filter(r => r.status !== 'done' && r.status !== 'ignored');
    }

    if (recs.length === 0) {
      const allRecs = data.recommendations || [];
      const doneCount = allRecs.filter(r => r.status === 'done' || r.status === 'ignored').length;
      listEl.innerHTML = doneCount > 0
        ? `<div class="card" style="padding:24px;text-align:center;color:var(--muted);">All recommendations completed! ${doneCount} item${doneCount>1?'s':''} done. Use the status filter to view completed items.</div>`
        : '<div class="card" style="padding:24px;text-align:center;color:var(--muted);">No recommendations yet. Click "Generate Recommendations" to analyze your data.</div>';
      return;
    }

    const sevColors = { critical: 'var(--red)', high: 'var(--red)', medium: 'var(--amber)', low: 'var(--blue)' };
    const sevLabels = { critical: 'HIGH PRIORITY', high: 'HIGH PRIORITY', medium: 'MEDIUM', low: 'SUGGESTION' };
    const sevBgs = { critical: 'rgba(239,68,68,.08)', high: 'rgba(239,68,68,.08)', medium: 'rgba(245,158,11,.08)', low: 'rgba(59,130,246,.08)' };
    listEl.innerHTML = recs.map(r => {
      const isDone = r.status === 'done';
      const color = isDone ? 'var(--green)' : (sevColors[r.severity] || 'var(--blue)');
      const label = isDone ? 'ON TRACK' : (sevLabels[r.severity] || 'SUGGESTION');
      const bg = isDone ? 'rgba(16,185,129,.08)' : (sevBgs[r.severity] || 'rgba(59,130,246,.08)');
      return `<div class="card" style="border-left:3px solid ${color};${isDone ? 'opacity:0.7;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:13px;font-weight:700;margin-bottom:4px;${isDone ? 'text-decoration:line-through;' : ''}">${esc(r.title)}</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.6;">${esc(r.description || '')}</div>
            ${r.playbook_id ? `<button class="pbtn" style="font-size:10px;margin-top:8px;" onclick="viewPlaybook('${escAttr(r.playbook_id)}')">View Playbook</button>` : ''}
            <div style="display:flex;gap:6px;margin-top:8px;">
              ${r.status !== 'done' ? `<button onclick="updateRecommendation('${escAttr(r.id)}','done')" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--green);color:var(--green);padding:3px 8px;cursor:pointer;border-radius:100px;white-space:nowrap;">&#10003; Done</button>` : ''}
              <select class="brand-select" style="width:100px;font-size:10px;padding:2px 6px;" onchange="updateRecommendation('${escAttr(r.id)}',this.value)">
                <option value="open" ${r.status==='open'?'selected':''}>Open</option>
                <option value="in_progress" ${r.status==='in_progress'?'selected':''}>In Progress</option>
                <option value="done" ${r.status==='done'?'selected':''}>Done</option>
                <option value="ignored" ${r.status==='ignored'?'selected':''}>Ignored</option>
              </select>
            </div>
          </div>
          <span style="font-family:var(--mono);font-size:9px;padding:3px 8px;border-radius:100px;background:${bg};color:${color};font-weight:700;white-space:nowrap;">${label}</span>
        </div>
      </div>`;
    }).join('');
  } catch(e) { toast('Failed to load recommendations', 'err'); } finally { hideViewLoading('rec-list'); }
}

async function generateRecommendations() {
  const b = brand();
  if (!b) return;
  try {
    toast('Analyzing data...', 'ok');
    const data = await api('POST', `/api/brands/${b.id}/recommendations/generate`);
    toast(`Generated ${data.generated} recommendations`, 'ok');
    renderRecommendations();
  } catch(e) { toast('Failed: ' + e.message, 'err'); }
}

async function updateRecommendation(id, status) {
  try {
    await api('PUT', `/api/recommendations/${id}`, { status });
    toast(status === 'done' ? 'Marked as completed' : 'Updated to ' + status, 'ok');
    // Re-render to reflect status change (done items get hidden)
    renderRecommendations();
  } catch(e) { toast('Failed', 'err'); }
}

async function viewPlaybook(playbookId) {
  try {
    const data = await api('GET', `/api/playbooks/${playbookId}`);
    const pb = data.playbook;
    const modal = document.createElement('div');
    modal.className = 'overlay open';
    modal.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-head">
          <span>${esc(pb.title)}</span>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">&times;</button>
        </div>
        <div style="padding:20px;">
          <p style="color:var(--muted);margin-bottom:16px;">${esc(pb.description)}</p>
          <div style="font-weight:600;margin-bottom:8px;">Action Steps:</div>
          ${pb.steps.map((s, i) => `<div style="padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:6px;font-size:13px;"><span style="font-weight:700;margin-right:8px;">${i + 1}.</span>${esc(s)}</div>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } catch(e) { toast('Failed to load playbook', 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// ACCURACY MONITOR VIEW (Epic 8.1)
// ═══════════════════════════════════════════════════════════════════
async function renderAccuracyMonitor() {
  const b = brand();
  if (!b) return;
  showViewLoading('facts-list');
  try {
    const data = await api('GET', `/api/brands/${b.id}/facts`);
    const facts = data.facts || [];

    // Populate KPI cards
    const kpisEl = el('accuracy-kpis');
    if (kpisEl) {
      // Try to get accuracy results for KPI stats
      let accRate = '--', issueCount = 0, claimsChecked = 0;
      try {
        const accData = await api('GET', `/api/brands/${b.id}/accuracy`);
        const mismatches = accData.mismatches || [];
        claimsChecked = accData.totalChecked || mismatches.length + (accData.matches || 0);
        issueCount = mismatches.length;
        accRate = claimsChecked > 0 ? Math.round(((claimsChecked - issueCount) / claimsChecked) * 100) + '%' : '--';
      } catch(e) {}
      kpisEl.innerHTML = `
        <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${accRate}</div><div class="score-label">Accuracy Rate</div></div>
        <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--red);">${issueCount}</div><div class="score-label">Inaccuracies Found</div></div>
        <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${claimsChecked || facts.length}</div><div class="score-label">Claims Verified</div></div>
      `;
    }

    const factsEl = el('facts-list');
    if (facts.length === 0) {
      factsEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px;">No facts defined yet. Add canonical facts below.</div>';
    } else {
      factsEl.innerHTML = facts.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:6px;">
          <div><span style="font-weight:600;font-size:13px;">${esc(f.fact_key)}</span>: <span style="font-size:13px;">${esc(f.fact_value)}</span> <span style="font-size:11px;color:var(--muted);">[${f.category}]</span></div>
          <button style="background:none;border:none;color:var(--red,#ef4444);cursor:pointer;font-size:14px;" onclick="deleteFact(${f.id})">&times;</button>
        </div>
      `).join('');
    }
  } catch(e) { console.error('[Accuracy]', e); }
}

async function addFact() {
  const b = brand();
  if (!b) return;
  const factKey = el('fact-key').value.trim();
  const factValue = el('fact-value').value.trim();
  const category = el('fact-category').value;
  if (!factKey || !factValue) { toast('Both key and value are required', 'err'); return; }
  try {
    await api('PUT', `/api/brands/${b.id}/facts`, { facts: [{ fact_key: factKey, fact_value: factValue, category }] });
    el('fact-key').value = '';
    el('fact-value').value = '';
    renderAccuracyMonitor();
    toast('Fact added', 'ok');
  } catch(e) { toast('Failed', 'err'); }
}

async function deleteFact(factId) {
  const b = brand();
  if (!b) return;
  try {
    await api('DELETE', `/api/brands/${b.id}/facts/${factId}`);
    renderAccuracyMonitor();
    toast('Fact deleted', 'ok');
  } catch(e) { toast('Failed', 'err'); }
}

async function checkAccuracy() {
  const b = brand();
  if (!b) return;
  try {
    const data = await api('GET', `/api/brands/${b.id}/accuracy`);
    const el2 = el('accuracy-results');
    // Re-render KPIs
    renderAccuracyMonitor();
    if (data.mismatches && data.mismatches.length > 0) {
      el2.innerHTML = data.mismatches.map((m, i) => {
        const color = i === 0 ? 'var(--red)' : 'var(--amber)';
        const bg = i === 0 ? 'rgba(239,68,68,.03)' : 'rgba(245,158,11,.03)';
        const dateStr = new Date(m.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-left:3px solid ${color};background:${bg};border-radius:var(--radius-xs);margin-bottom:10px;">
          <span style="color:${color};font-size:14px;">&#9888;</span>
          <div style="font-size:12px;"><strong>${esc(m.platform)}</strong> stated incorrect "${esc(m.fact_key)}" — expected: ${esc(m.expected_value)} <span style="color:var(--muted);">Detected ${dateStr}</span></div>
        </div>`;
      }).join('');
    } else {
      el2.innerHTML = `<div style="padding:16px;text-align:center;color:var(--green);">All AI responses match your canonical facts. Checked ${data.totalChecked || 0} responses.</div>`;
    }
  } catch(e) { toast('Failed: ' + e.message, 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// CITATION ANALYSIS VIEW (Epic 8.2)
// ═══════════════════════════════════════════════════════════════════
async function renderCitationAnalysis() {
  showViewLoading('citation-domains');
  const b = brand();
  if (!b) return;
  try {
    const data = await api('GET', `/api/brands/${b.id}/citation-analysis`);
    const domains = data.domains || [];

    // Brand domain citation count
    const bDomain = b.website ? b.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : '';
    const ownDomainCites = bDomain ? domains.filter(d => d.domain.includes(bDomain)).reduce((s, d) => s + d.totalCitations, 0) : 0;

    const summaryEl = el('citation-summary');
    summaryEl.innerHTML = `
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${domains.length}</div><div class="score-label">Domains Cited</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${data.totalCitations || 0}</div><div class="score-label">Total Citations</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--amber);">${ownDomainCites}</div><div class="score-label">Your Domain Cited</div></div>
    `;

    const domainsEl = el('citation-domains');
    if (domains.length === 0) {
      domainsEl.innerHTML = '<div style="color:var(--muted);padding:16px;text-align:center;">No citations found yet. Run more queries to build citation data.</div>';
      return;
    }
    domainsEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:var(--bg3);"><th class="th">Domain</th><th class="th">Type</th><th class="th">Citations</th><th class="th">Top URLs</th></tr></thead>
      <tbody>${domains.map(d => `
        <tr class="trow">
          <td class="td" style="font-weight:600;">${esc(d.domain)}</td>
          <td class="td"><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg3);">${d.type}</span></td>
          <td class="td" style="font-weight:600;">${d.totalCitations}</td>
          <td class="td" style="font-size:11px;">${(d.urls || []).slice(0, 2).map(u => `<a href="${safeHref(u.url)}" target="_blank" rel="noopener" style="color:var(--primary);word-break:break-all;">${esc(u.url.substring(0, 50))}...</a> (${u.count})`).join('<br>')}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  } catch(e) { toast('Failed to load citations', 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// COPILOT VIEW (Epic 8.3)
// ═══════════════════════════════════════════════════════════════════
async function askCopilot() {
  const b = brand();
  if (!b) return;
  const input = el('copilot-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  const historyEl = el('copilot-history');
  // Add user question bubble (right-aligned)
  historyEl.innerHTML += `
    <div style="display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse;">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;">U</div>
      <div style="background:var(--blue);color:#fff;padding:12px 16px;border-radius:12px 12px 4px 12px;font-size:12px;max-width:80%;">${esc(question)}</div>
    </div>`;
  // Scroll to bottom
  historyEl.scrollTop = historyEl.scrollHeight;

  try {
    const data = await api('POST', `/api/brands/${b.id}/copilot`, { question });
    historyEl.innerHTML += `
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">&#9672;</div>
        <div style="background:var(--bg3);padding:12px 16px;border-radius:12px 12px 12px 4px;font-size:12px;line-height:1.6;max-width:80%;">${mdToHtml(data.answer)}</div>
      </div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  } catch(e) {
    historyEl.innerHTML += `
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:var(--red);">!</div>
        <div style="background:rgba(239,68,68,.05);padding:12px 16px;border-radius:12px 12px 12px 4px;font-size:12px;max-width:80%;border:1px solid rgba(239,68,68,.2);">${esc(e.message)}</div>
      </div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BILLING VIEW (Epic 7.1-7.2)
// ═══════════════════════════════════════════════════════════════════
async function renderBilling() {
  try {
    const data = await api('GET', '/api/billing');
    const plan = data.plan;
    const usage = data.usage || {};

    // Plan card
    const planEl = el('billing-plan-card');
    const planColors = { free: '#6b7280', pro: '#4f46e5', agency: '#7c3aed', enterprise: '#9b72ff', owner: '#059669' };
    planEl.innerHTML = `
      <div class="card" style="padding:20px;border-left:4px solid ${planColors[plan] || '#888'};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Current Plan</div>
            <div style="font-size:28px;font-weight:700;text-transform:uppercase;color:${planColors[plan]};">${plan}</div>
            <div style="font-size:12px;color:var(--muted);">Member since ${new Date(data.memberSince).toLocaleDateString()}</div>
          </div>
          ${plan !== 'owner' ? '<button class="btn-primary" style="font-size:13px;" onclick="go(\'account\')">Upgrade Plan</button>' : ''}
        </div>
      </div>`;

    // Usage meters
    const usageEl = el('billing-usage');
    const meters = [
      { label: 'Brands', ...usage.brands },
      { label: 'Runs Today', ...usage.runsToday },
      { label: 'Queries', ...usage.queries },
      { label: 'Platforms', ...usage.platforms }
    ];
    usageEl.innerHTML = meters.map(m => {
      const pct = m.limit > 0 ? Math.min((m.used / m.limit) * 100, 100) : 0;
      const color = pct > 90 ? 'var(--red,#ef4444)' : pct > 70 ? '#f59e0b' : 'var(--green)';
      return `<div class="card" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span>${m.label}</span><span style="font-weight:600;">${m.used} / ${m.limit >= 9999 ? '∞' : m.limit}</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
        </div>
      </div>`;
    }).join('');

    // Warnings
    const warningsEl = el('billing-warnings');
    if (data.warnings && data.warnings.length) {
      warningsEl.innerHTML = data.warnings.map(w => `
        <div style="padding:10px 14px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:8px;font-size:13px;">
          ⚠ ${esc(w.message)}
        </div>
      `).join('');
    } else {
      warningsEl.innerHTML = '';
    }

    // Plan comparison
    const plansEl = el('billing-plans');
    const allPlans = data.allPlans || {};
    plansEl.innerHTML = `<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:12px;">
      <thead><tr style="border-bottom:2px solid var(--bg3);">
        <th style="text-align:left;padding:8px;">Feature</th>
        ${Object.keys(allPlans).map(p => `<th style="text-align:center;padding:8px;${p === plan ? 'color:var(--primary);font-weight:700;' : ''}">${p.toUpperCase()}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">Total Prompts</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.prompts >= 9999 ? '∞' : l.prompts}</td>`).join('')}</tr>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">Brands</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.brands >= 9999 ? '∞' : l.brands}</td>`).join('')}</tr>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">Competitors</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.competitors >= 9999 ? '∞' : l.competitors}</td>`).join('')}</tr>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">Platforms</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.platforms}</td>`).join('')}</tr>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">Sentiment</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.sentiment ? '✓' : '—'}</td>`).join('')}</tr>
        <tr style="border-bottom:1px solid var(--bg3);"><td style="padding:8px;">API Access</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.apiAccess ? '✓' : '—'}</td>`).join('')}</tr>
        <tr><td style="padding:8px;">Priority Support</td>${Object.values(allPlans).map(l => `<td style="text-align:center;padding:8px;">${l.prioritySupport ? '✓' : '—'}</td>`).join('')}</tr>
      </tbody>
    </table>`;
  } catch(e) { toast('Failed to load billing', 'err'); }
}

// ─── ADVANCED EXPORTS ─────────────────────────────────────────────
async function exportPromptData(){
  const b = brand(); if (!b) return;
  try {
    const res = await fetch(API + `/api/export/prompts?brandId=${b.id}&format=csv`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Export failed');
    const csv = await res.text();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${b.name}_prompts.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded prompt data', 'ok');
  } catch(e) { toast('Export failed: ' + e.message, 'err'); }
}

async function exportRecommendations(){
  const b = brand(); if (!b) return;
  try {
    const res = await fetch(API + `/api/export/recommendations?brandId=${b.id}&format=csv`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Export failed');
    const csv = await res.text();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${b.name}_recommendations.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded recommendations', 'ok');
  } catch(e) { toast('Export failed: ' + e.message, 'err'); }
}

// ─── DASHBOARD PRESETS ────────────────────────────────────────────
let _activePreset = '';

const _presetMeta = {
  founder: {
    icon: '👔',
    title: 'Founder Overview',
    desc: 'High-level KPIs and trends for executive decision-making. Focus on what matters most — growth trajectory, brand sentiment, and competitive position.',
    className: 'preset-founder'
  },
  seo_manager: {
    icon: '🔍',
    title: 'SEO Manager Dashboard',
    desc: 'Technical analytics for optimizing AI visibility. Deep-dive into platform performance, query rankings, and citation sources.',
    className: 'preset-seo_manager'
  },
  agency_manager: {
    icon: '📊',
    title: 'Agency Overview',
    desc: 'Client reporting dashboard with platform health, competitive landscape, and performance status at a glance.',
    className: 'preset-agency_manager'
  }
};

function applyDashboardPreset(preset){
  _activePreset = preset || '';
  // Section IDs on the overview page that can be toggled
  const allSections = ['ov-hero','ov-api-health','ov-scores-row','ov-category-row','ov-plat-grid','ov-mini-trend','ov-query-perf','ov-competitors','ov-citations','ov-last-run-summary','ov-location-viz','ov-insights','ov-query-section'];
  // Define which sections each preset shows
  const presetSections = {
    '': allSections, // Custom = show all
    founder: ['ov-hero','ov-scores-row','ov-mini-trend','ov-competitors','ov-insights','ov-last-run-summary'],
    seo_manager: ['ov-hero','ov-api-health','ov-scores-row','ov-plat-grid','ov-query-perf','ov-citations','ov-category-row'],
    agency_manager: ['ov-hero','ov-api-health','ov-category-row','ov-plat-grid','ov-last-run-summary','ov-competitors']
  };
  const visible = new Set(presetSections[preset] || allSections);
  allSections.forEach(id => {
    const section = el(id);
    if (section) section.style.display = visible.has(id) ? '' : 'none';
  });

  // Apply preset-specific CSS class to the overview container
  const ovContainer = el('view-overview');
  if (ovContainer) {
    // Remove all preset classes
    ovContainer.classList.remove('preset-founder', 'preset-seo_manager', 'preset-agency_manager');
    // Add the active preset class
    const meta = _presetMeta[preset];
    if (meta) ovContainer.classList.add(meta.className);
  }

  // Render preset banner
  const bannerEl = el('ov-preset-banner');
  if (bannerEl) {
    const meta = _presetMeta[preset];
    if (meta) {
      bannerEl.innerHTML = `<div class="ov-preset-banner">
        <div class="ov-preset-banner-icon">${meta.icon}</div>
        <div class="ov-preset-banner-text">
          <div class="ov-preset-banner-title">${meta.title}</div>
          <div class="ov-preset-banner-desc">${meta.desc}</div>
        </div>
      </div>`;
    } else {
      bannerEl.innerHTML = '';
    }
  }

  // Re-render overview to populate visible sections
  if (currentView === 'overview') renderOverview();
  const label = el('ov-preset-select')?.selectedOptions[0]?.text || 'Custom View';
  toast('Switched to ' + label, 'ok');
}

// ─── LOADING STATE HELPER ─────────────────────────────────────────
function showViewLoading(containerId){
  const cont = el(containerId);
  if (cont) cont.innerHTML = skeletonHTML(3);
}

// ─── ALERTS CRUD ──────────────────────────────────────────────────
function openAddAlert(){
  el('alert-add-form').style.display = 'block';
  el('alert-name').value = '';
  el('alert-condition').value = 'visibility_drop';
  el('alert-threshold').value = '10';
  el('alert-action').value = 'in_app';
  updateAlertParams();
}

function updateAlertParams(){
  const cond = el('alert-condition').value;
  const threshLabel = el('alert-params-row').querySelector('.flabel');
  if (cond === 'brand_disappeared' || cond === 'new_competitor') {
    threshLabel.textContent = 'N/A';
    el('alert-threshold').disabled = true;
    el('alert-threshold').value = '0';
  } else if (cond === 'sov_below') {
    threshLabel.textContent = 'SOV Threshold (%)';
    el('alert-threshold').disabled = false;
    el('alert-threshold').value = '20';
  } else if (cond === 'negative_sentiment') {
    threshLabel.textContent = 'Spike Threshold (%)';
    el('alert-threshold').disabled = false;
    el('alert-threshold').value = '30';
  } else {
    threshLabel.textContent = 'Threshold (%)';
    el('alert-threshold').disabled = false;
    el('alert-threshold').value = '10';
  }
}

async function saveAlertRule(){
  const b = brand(); if (!b) return;
  const name = el('alert-name').value.trim();
  if (!name) { toast('Alert name is required','err'); return; }
  const condType = el('alert-condition').value;
  const threshold = parseFloat(el('alert-threshold').value) || 0;
  const rule = {
    name,
    condition_type: condType,
    condition_params: { threshold },
    action_type: el('alert-action').value,
    cooldown_hours: parseInt(el('alert-cooldown').value) || 24
  };
  try {
    await api('POST', '/api/brands/'+b.id+'/alerts', rule);
    el('alert-add-form').style.display = 'none';
    toast('Alert rule created','ok');
    renderAlerts();
  } catch(e) { toast(e.message,'err'); }
}

async function deleteAlertRule(ruleId){
  if (!confirm('Delete this alert rule?')) return;
  try {
    await api('DELETE', '/api/alerts/'+ruleId);
    toast('Alert rule deleted','ok');
    renderAlerts();
  } catch(e) { toast(e.message,'err'); }
}

async function toggleAlertRule(ruleId, enabled){
  try {
    await api('PUT', '/api/alerts/'+ruleId, { enabled: !enabled });
    renderAlerts();
  } catch(e) { toast(e.message,'err'); }
}

// ─── ONBOARDING WIZARD ───────────────────────────────────────────
let _wizardComps = [];
let _wizardQueries = [];
let _wizardNearbyAreas = [];

// Show/hide nearby areas section when city field changes
document.addEventListener('DOMContentLoaded', () => {
  const cityInput = el('nb-city');
  if (cityInput) {
    cityInput.addEventListener('input', () => {
      const section = el('wizard-nearby-section');
      if (section) {
        if (cityInput.value.trim()) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
          _wizardNearbyAreas = [];
          renderWizardNearbyTags();
        }
      }
    });
  }
});

function renderWizardNearbyTags(){
  const cont = el('wizard-nearby-tags');
  if (!cont) return;
  cont.innerHTML = _wizardNearbyAreas.map((a,i) =>
    `<span class="query-tag" style="font-size:11px;padding:3px 8px;">${esc(a)} <button onclick="_wizardNearbyAreas.splice(${i},1);renderWizardNearbyTags()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 2px;">&#x2715;</button></span>`
  ).join('');
  if (!_wizardNearbyAreas.length) cont.innerHTML = '<div style="color:var(--muted);font-size:11px;">No nearby areas yet.</div>';
}

function wizardAddNearbyArea(){
  const inp = el('wizard-nearby-input');
  const v = inp.value.trim();
  if (!v) return;
  if (_wizardNearbyAreas.some(a => a.toLowerCase() === v.toLowerCase())) { toast('Already added','err'); return; }
  _wizardNearbyAreas.push(v);
  inp.value = '';
  renderWizardNearbyTags();
}

async function wizardFetchNearbyAreas(){
  const hasAnyKey = Object.values(keyStatus).some(v => v);
  if (!hasAnyKey) { toast('Configure API keys in Settings first to use this feature','err'); return; }
  const city = el('nb-city').value.trim();
  if (!city) { toast('Enter a city first','err'); return; }
  const btn = el('wizard-fetch-areas-btn');
  btn.disabled = true;
  btn.textContent = 'Fetching...';
  try {
    const data = await api('POST', '/api/nearby-areas', { city });
    const existing = new Set(_wizardNearbyAreas.map(a => a.toLowerCase()));
    const newAreas = (data.areas || []).filter(a => !existing.has(a.toLowerCase()));
    if (!newAreas.length) { toast('No new areas found','ok'); return; }
    _wizardNearbyAreas.push(...newAreas);
    renderWizardNearbyTags();
    toast(newAreas.length + ' nearby areas added','ok');
  } catch(e) { toast(e.message,'err'); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Fetch Nearby Areas';
  }
}

function wizardNext(step){
  // Validate step 1 before moving forward
  if (step === 2) {
    const name = el('nb-name').value.trim();
    const industry = el('nb-industry').value.trim();
    if (!name || !industry) {
      el('add-brand-err').textContent = 'Brand name and industry are required.';
      el('add-brand-err').style.display = 'block';
      return;
    }
    el('add-brand-err').style.display = 'none';
    // Auto-generate query suggestions for step 3
    if (!_wizardQueries.length) {
      const city = el('nb-city').value.trim();
      _wizardQueries = generateWizardQueries(name, industry, city);
    }
  }
  // Show target step, hide others
  for (let i = 1; i <= 3; i++) {
    const s = el('wizard-step-'+i);
    if (s) s.style.display = i === step ? 'block' : 'none';
  }
  // Update step indicators
  document.querySelectorAll('.wizard-step').forEach(ws => {
    const wsStep = parseInt(ws.getAttribute('data-step'));
    ws.classList.toggle('active', wsStep === step);
    ws.classList.toggle('done', wsStep < step);
  });
  // Render step content
  if (step === 2) renderWizardComps();
  if (step === 3) renderWizardQueries();
}

function generateWizardQueries(name, industry, city){
  const qs = [];
  const loc = city ? ' in '+city : '';
  qs.push('What is the best '+industry+' company'+loc+'?');
  qs.push('Top '+industry+' services'+loc);
  qs.push('Compare '+industry+' companies'+loc);
  qs.push('Is '+name+' a good '+industry+' company?');
  if (city) qs.push('Best '+industry+' near '+city);
  return qs;
}

function renderWizardComps(){
  const cont = el('wizard-comp-tags');
  cont.innerHTML = _wizardComps.map((c,i) =>
    `<span class="query-tag">${esc(c)} <button onclick="_wizardComps.splice(${i},1);renderWizardComps()">&#x2715;</button></span>`
  ).join('');
}

function wizardAddComp(){
  const inp = el('wizard-comp-input');
  const v = inp.value.trim();
  if (!v) return;
  if (_wizardComps.includes(v)) { toast('Already added','err'); return; }
  _wizardComps.push(v);
  inp.value = '';
  renderWizardComps();
}

function renderWizardQueries(){
  const cont = el('wizard-query-list');
  cont.innerHTML = _wizardQueries.map((q,i) =>
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span class="query-tag" style="flex:1;">${esc(q)}</span>
      <button onclick="_wizardQueries.splice(${i},1);renderWizardQueries()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;">&#x2715;</button>
    </div>`
  ).join('');
  if (!_wizardQueries.length) cont.innerHTML = '<div style="color:var(--muted);font-size:12px;">No queries yet. Add custom ones or load suggestions.</div>';
}

function wizardAddQuery(){
  const inp = el('wizard-query-input');
  const v = inp.value.trim();
  if (!v) return;
  _wizardQueries.push(v);
  inp.value = '';
  renderWizardQueries();
}

async function wizardLoadSuggestions(){
  const industry = el('nb-industry').value.trim();
  const city = el('nb-city').value.trim();
  if (!industry) { toast('Set industry in Step 1 first','err'); return; }
  try {
    const data = await api('GET', '/api/query-suggestions?industry='+encodeURIComponent(industry)+'&city='+encodeURIComponent(city));
    const suggestions = data.suggestions || [];
    const existing = new Set(_wizardQueries.map(q => q.toLowerCase()));
    suggestions.forEach(s => { if (!existing.has(s.toLowerCase())) _wizardQueries.push(s); });
    renderWizardQueries();
    toast(suggestions.length+' suggestions loaded','ok');
  } catch(e) { toast(e.message,'err'); }
}

async function doAddBrandWizard(){
  const name = el('nb-name').value.trim();
  const industry = el('nb-industry').value.trim();
  if (!name || !industry) {
    toast('Brand name and industry are required','err');
    return;
  }
  if (!_wizardQueries.length) {
    el('add-brand-err').textContent = 'Add at least one query before creating the brand.';
    el('add-brand-err').style.display = 'block';
    return;
  }
  try {
    const payload = {
      name, industry,
      website: el('nb-website').value.trim(),
      city: el('nb-city').value.trim(),
      competitors: _wizardComps,
      queries: _wizardQueries,
      nearbyAreas: _wizardNearbyAreas
    };
    const queryCount = _wizardQueries.length;
    const data = await api('POST', '/api/brands', payload);
    invalidateCache('/api/brands');
    brands.push(data.brand);
    currentBrandId = data.brand.id;
    localStorage.setItem('trackly_brand', currentBrandId);
    renderBrandSelect();
    el('brand-select').value = currentBrandId;
    closeModal('add-brand-modal');
    _wizardComps = [];
    _wizardQueries = [];
    _wizardNearbyAreas = [];
    renderAll();
    toast('Brand "'+name+'" created with '+queryCount+' queries','ok');
    // Auto-run queries after brand creation
    if (queryCount > 0) {
      setTimeout(() => runQueries(), 500);
    }
  } catch(e) {
    el('add-brand-err').textContent = e.message;
    el('add-brand-err').style.display = 'block';
  }
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    document.querySelectorAll('.overlay.open').forEach(o => {
      if (o.id !== 'add-brand-modal' || brands.length > 0) o.classList.remove('open');
    });
  }
});

// ─── AUTO-LOGIN ───────────────────────────────────────────────────
(async function(){
  // Load public config (Google Client ID etc.) with 5s timeout
  try {
    const cfgCtrl = new AbortController();
    const cfgTimeout = setTimeout(() => cfgCtrl.abort(), 5000);
    const cfg = await fetch('/api/config', { signal: cfgCtrl.signal }).then(r => r.json());
    clearTimeout(cfgTimeout);
    if (cfg.googleClientId) window.__GOOGLE_CLIENT_ID = cfg.googleClientId;
  } catch(e) { /* config unavailable — Google sign-in will be hidden */ }
  // Show Google landing button only when configured
  if (window.__GOOGLE_CLIENT_ID) {
    const lg = document.getElementById('land-google-signin');
    if (lg) lg.style.display = '';
  }
  // Check for password reset token in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('token') && window.location.pathname === '/reset-password') {
    el('landing-page').style.display = 'none';
    el('auth-page').style.display = 'flex';
    el('app').style.display = 'none';
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    el('panel-reset').classList.add('active');
    return;
  }
  // Direct /login or /signup URL — show auth form immediately (skip landing page)
  if ((window.location.pathname === '/login' || window.location.pathname === '/signup') && !_hasSession) {
    el('landing-page').style.display = 'none';
    el('auth-page').style.display = 'flex';
    el('app').style.display = 'none';
    authTab(window.location.pathname === '/signup' ? 'register' : 'login');
    return;
  }
  if (!_hasSession) {
    el('landing-page').style.display = 'block';
    el('auth-page').style.display = 'none';
    el('app').style.display = 'none';
    return;
  }
  // Try auto-login via httpOnly cookie
  el('landing-page').style.display = 'none';
  try {
    const data = await cachedApi('GET', '/api/auth/me', null, 30000);
    currentUser = data.user;
    await initApp();
  } catch(e) {
    // Cookie invalid or expired — show login page directly (not landing)
    localStorage.removeItem('trackly_session');
    token = '';
    el('landing-page').style.display = 'none';
    el('app').style.display = 'none';
    el('auth-page').style.display = 'flex';
    authTab('login');
    // Show helpful message
    el('auth-err').textContent = 'Session expired. Please log in again.';
    el('auth-err').style.display = 'block';
  }
})();
