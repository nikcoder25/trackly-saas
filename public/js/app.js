// ─── LANDING / AUTH NAVIGATION ────────────────────────────────────
function showAuth(tab){
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('landing-page').style.display = 'none';
  el('auth-page').style.display = 'flex';
  el('app').style.display = 'none';
  authTab(tab || 'login');
}
function showLanding(){
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('landing-page').style.display = 'block';
  el('auth-page').style.display = 'none';
  el('app').style.display = 'none';
}

// ─── CONSTANTS ────────────────────────────────────────────────────
const API = '';  // relative URLs - same server
const PLATS = ['ChatGPT','Perplexity','Claude','Gemini','Grok','Google AIO','DeepSeek','Mistral'];
const PLAT_THEME = {
  'ChatGPT':    {bg:'#212121',color:'#19c37d',logo:'⬡'},
  'Perplexity': {bg:'#1b1b2e',color:'#9b72ff',logo:'◎'},
  'Claude':     {bg:'#1a1612',color:'#d97706',logo:'◈'},
  'Gemini':     {bg:'#0d1117',color:'#4285f4',logo:'✦'},
  'Grok':       {bg:'#0c0c0c',color:'#1d9bf0',logo:'⚡'},
  'Google AIO': {bg:'#0d1117',color:'#34a853',logo:'⬤'},
  'DeepSeek':   {bg:'#0d1a2e',color:'#4a9eff',logo:'◇'},
  'Mistral':    {bg:'#1a0d1e',color:'#ff7000',logo:'▣'},
};

// ─── STATE ────────────────────────────────────────────────────────
let token = localStorage.getItem('trackly_token') || '';
let refreshToken = localStorage.getItem('trackly_refresh') || '';
let currentUser = null;
let brands = [];
let currentBrandId = localStorage.getItem('trackly_brand') || '';
let keyStatus = {};
let runningQueries = false;
let currentTheme = localStorage.getItem('trackly_theme') || 'dark';

// ─── UTILS ────────────────────────────────────────────────────────
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function safeHref(url){ return /^https?:\/\//i.test(url) ? esc(url) : '#'; }
// Simple markdown to HTML for AI responses
function mdToHtml(s){
  if (!s) return '';
  let h = esc(s);
  // Headers: ### Title → <strong>Title</strong> with margin
  h = h.replace(/^#{1,4}\s+(.+)$/gm, '<div style="font-weight:700;margin:10px 0 4px;">$1</div>');
  // Bold: **text** or __text__
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_ (but not inside words)
  h = h.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');
  // Unordered list items: - item or * item
  h = h.replace(/^[\s]*[-*]\s+(.+)$/gm, '<div style="padding-left:16px;margin:2px 0;">• $1</div>');
  // Numbered list items: 1. item
  h = h.replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<div style="padding-left:16px;margin:2px 0;">$1. $2</div>');
  // Paragraphs — convert double newlines
  h = h.replace(/\n\n/g, '<div style="margin:8px 0;"></div>');
  // Single newlines
  h = h.replace(/\n/g, '<br>');
  return h;
}
// Persistent error storage (survives page reloads and brand data refreshes)
function storeRunError(entry) {
  try {
    const errors = JSON.parse(localStorage.getItem('trackly_run_errors') || '[]');
    errors.unshift(entry);
    // Keep last 20 errors
    localStorage.setItem('trackly_run_errors', JSON.stringify(errors.slice(0, 20)));
  } catch(_) {}
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
  // Build regex that matches brand name + all aliases with word boundaries
  // Must use \b to avoid highlighting "Pro" inside "Professional" etc.
  const terms = [b.name];
  if (b.aliases && b.aliases.length) terms.push(...b.aliases);
  const escaped = terms.filter(t=>t&&t.length>=2).map(t => t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if (!escaped.length) return null;
  // Sort longest first so longer matches take priority
  escaped.sort((x,y) => y.length - x.length);
  return new RegExp('\\b('+escaped.join('|')+')\\b', 'gi');
}
function toast(msg, type='ok'){
  const t = el('toast');
  t.textContent = msg; t.className = type;
  t.style.display = 'block';
  setTimeout(() => t.style.display='none', 3000);
}
function show(id){ const e=el(id); if(e) e.style.display='block'; }
function hide(id){ const e=el(id); if(e) e.style.display='none'; }
function closeModal(id){ const e=el(id); if(e) e.classList.remove('open'); }
function openModal(id){ const e=el(id); if(e) e.classList.add('open'); }
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

async function api(method, path, data){
  // Longer timeout for run endpoints (5 min), default 30s for other calls
  const timeoutMs = path.includes('/run') ? 300000 : 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    signal: controller.signal
  };
  if (data) opts.body = JSON.stringify(data);
  let res;
  try { res = await fetch(API + path, opts); } catch(e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw e;
  }
  clearTimeout(timeoutId);
  // Auto-refresh token on 401 (not for auth endpoints themselves)
  if (res.status === 401 && refreshToken && path !== '/api/auth/login' && path !== '/api/auth/register' && path !== '/api/auth/refresh') {
    try {
      const refreshRes = await fetch(API + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        token = refreshData.token;
        refreshToken = refreshData.refreshToken;
        localStorage.setItem('trackly_token', token);
        localStorage.setItem('trackly_refresh', refreshToken);
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
    throw new Error(json.error || 'Request failed');
  }
  return json;
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
}

async function doLogin(){
  const email = el('login-email').value.trim();
  const password = el('login-pass').value;
  el('auth-err').style.display = 'none';
  const btn = document.querySelector('#panel-login .btn-primary');
  if (!email || !password) {
    el('auth-err').textContent = 'Email/username and password are required.';
    el('auth-err').style.display = 'block';
    return;
  }
  btn.disabled = true; btn.textContent = 'LOGGING IN...';
  try {
    const data = await api('POST', '/api/auth/login', { email, password });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('trackly_token', token);
    localStorage.setItem('trackly_refresh', refreshToken);
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'LOG IN';
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
    localStorage.setItem('trackly_token', token);
    localStorage.setItem('trackly_refresh', refreshToken);
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  }
}

function showForgotPassword(){
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  const fp = el('panel-forgot');
  if (fp) fp.classList.add('active');
  el('auth-err').style.display = 'none';
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
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.background = 'var(--success-light,rgba(0,255,136,.05))';
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
  const token = params.get('token');
  if (!token) { msgEl.textContent = 'Invalid reset link.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const btn = document.querySelector('#panel-reset .btn-primary');
  btn.disabled = true; btn.textContent = 'RESETTING...';
  try {
    const data = await api('POST', '/api/auth/reset-password', { token, newPassword: pw });
    msgEl.textContent = data.message || 'Password reset! You can now log in.';
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.display = 'block';
    setTimeout(() => { window.location.href = '/'; }, 2000);
  } catch(e) {
    msgEl.textContent = e.message; msgEl.style.borderColor = 'var(--danger,var(--red))'; msgEl.style.color = 'var(--danger,var(--red))'; msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'RESET PASSWORD';
  }
}

function doLogout(){
  token = '';
  refreshToken = '';
  currentUser = null;
  brands = [];
  currentBrandId = '';
  localStorage.removeItem('trackly_token');
  localStorage.removeItem('trackly_refresh');
  localStorage.removeItem('trackly_brand');
  // Close all open overlays/modals
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('app').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('landing-page').style.display = 'block';
}

// ─── APP INIT ─────────────────────────────────────────────────────
async function initApp(){
  el('landing-page').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('app').style.display = 'grid';

  // Update topbar
  el('user-email-badge').textContent = currentUser.email;
  const pb = el('plan-badge');
  pb.textContent = (currentUser.plan||'free').toUpperCase();
  pb.className = 'plan-badge ' + (currentUser.plan||'free');

  // Show admin nav if user is admin, or "Become Admin" button if no admin exists yet
  const adminNav = el('nav-admin');
  const becomeAdminNav = el('nav-become-admin');
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
  const data = await api('GET', '/api/brands');
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

function renderView(view){
  const b = brand();
  if (view==='account') { renderAccount(); loadModelSettings(); return; }
  if (view==='admin')   { renderAdmin(); return; }
  if (!b) {
    // Show helpful message for views that require a brand
    const viewEl = el('view-' + view);
    if (viewEl) {
      const existing = viewEl.querySelector('.no-brand-msg');
      if (!existing) {
        const msg = document.createElement('div');
        msg.className = 'empty-state no-brand-msg';
        msg.innerHTML = '<p>Select or create a brand first to view this section.</p>';
        viewEl.prepend(msg);
      }
    }
    return;
  }
  // Remove no-brand messages when brand is available
  document.querySelectorAll('.no-brand-msg').forEach(m => m.remove());
  if (view==='overview')    renderOverview();
  if (view==='mentions')    renderMentions();
  if (view==='proof')       renderProof();
  if (view==='platforms')   renderPlatformStatus();
  if (view==='qperf')       renderQPerf();
  if (view==='trends')      renderTrends();
  if (view==='competitors') renderCompetitors();
  if (view==='setup')       renderSetup();
  if (view==='alerts')      renderAlerts();
  if (view==='apilogs')     renderApiLogs();
}

// ─── ACCOUNT & PLAN ──────────────────────────────────────────────
function getUserLimits() {
  return (currentUser && currentUser.limits) || { brands: 1, queries: 5, runsPerDay: 2, competitors: 0, scheduledRuns: false, platforms: 3 };
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
      verifyEl.innerHTML = '<span class="badge neg">UNVERIFIED</span> <button onclick="resendVerification()" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--amber);color:var(--amber);padding:2px 8px;cursor:pointer;">RESEND VERIFICATION</button>';
    }
  }
  const planEl = el('acct-plan');
  planEl.textContent = currentUser.plan || 'free';
  planEl.style.color = currentUser.plan === 'agency' ? 'var(--purple,#9b72ff)' : currentUser.plan === 'pro' ? 'var(--green)' : 'var(--muted)';
  el('acct-since').textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  // Theme button
  const themeBtn = el('theme-toggle-btn');
  if (themeBtn) themeBtn.textContent = currentTheme === 'dark' ? 'LIGHT MODE' : 'DARK MODE';

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
      ${usageBar('Queries (current brand)', queryCount, limits.queries)}
      ${usageBar('Runs today', todayRuns, limits.runsPerDay)}
      ${usageBar('Platforms', limits.platforms, 8)}
      ${usageBar('Competitors', compCount, limits.competitors)}
    </div>
  `;
  el('acct-usage').innerHTML = usageHtml;

  // Plan cards
  const planData = [
    { id: 'free', name: 'Free', price: '$0', features: '1 brand, 3 platforms, 5 queries, 2 runs/day' },
    { id: 'pro', name: 'Pro', price: '$29/mo', features: '5 brands, 8 platforms, 25 queries, 10 runs/day, competitors, scheduled runs' },
    { id: 'agency', name: 'Agency', price: '$79/mo', features: '20 brands, 8 platforms, 50 queries, 50 runs/day, 20 competitors, scheduled runs' }
  ];
  const current = currentUser.plan || 'free';
  el('acct-plans').innerHTML = planData.map(p => `
    <div class="upgrade-plan-card ${p.id === current ? 'active' : ''}" data-plan="${p.id}">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;${p.id==='pro'?'color:var(--green);':p.id==='agency'?'color:var(--purple,#9b72ff);':''}">${p.name}</div>
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
      const resp = await api('GET', '/api/models');
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
      'Mistral': '<span style="color:#ff7000;">&#9670;</span>',
      'Google AIO': '<span style="color:#ea4335;">&#9733;</span>'
    };

    let html = '<div style="display:grid;gap:10px;">';
    for (const [platform, models] of Object.entries(platformModels)) {
      const currentModel = currentModels[platform] || models.find(m => m.default)?.id || models[0]?.id;
      const icon = platformIcons[platform] || '';
      // Default to enabled if not explicitly set
      const isEnabled = enabledPlatforms[platform] !== false;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border);border-radius:6px;${isEnabled?'':'opacity:0.5;'}">
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
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="color:var(--muted);font-family:var(--mono);font-size:10px;">Failed to load model settings</div>';
  }
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
    localStorage.removeItem('trackly_token');
    location.reload();
  } catch(e) { toast(e.message, 'err'); }
}

// ── Theme Toggle ───────────────────────────────────────
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.style.setProperty('--bg', '#f5f5f5');
    root.style.setProperty('--bg2', '#ffffff');
    root.style.setProperty('--bg3', '#eaeaea');
    root.style.setProperty('--bg4', '#ddd');
    root.style.setProperty('--border', '#d0d0d0');
    root.style.setProperty('--text', '#1a1a1a');
    root.style.setProperty('--muted', '#666');
  } else {
    root.style.setProperty('--bg', '#0a0a0a');
    root.style.setProperty('--bg2', '#111');
    root.style.setProperty('--bg3', '#1a1a1a');
    root.style.setProperty('--bg4', '#222');
    root.style.setProperty('--border', '#2a2a2a');
    root.style.setProperty('--text', '#e8e8e8');
    root.style.setProperty('--muted', '#666');
  }
  currentTheme = theme;
  localStorage.setItem('trackly_theme', theme);
}
function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  const btn = el('theme-toggle-btn');
  if (btn) btn.textContent = currentTheme === 'dark' ? 'LIGHT MODE' : 'DARK MODE';
}
// Apply saved theme on load
applyTheme(currentTheme);

// ── Data Export ────────────────────────────────────────
function exportAllData() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  window.open(API + '/api/export/brand/' + b.id + '?t=' + token, '_blank');
}
function exportAllBrandsData() {
  window.open(API + '/api/export/all?t=' + token, '_blank');
}
function exportBrandCSV() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  window.open(API + '/api/export/brand/' + b.id + '/csv?t=' + token, '_blank');
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
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);"><span style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px;">NOTIFICATIONS</span><button onclick="markAllRead()" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--border);color:var(--green);padding:2px 8px;cursor:pointer;">MARK ALL READ</button></div>';
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
  const tiers = {free:0, pro:1, agency:2};
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

// ─── OVERVIEW ─────────────────────────────────────────────────────
function renderOverview(){
  const b = brand();
  if (!b) return;

  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length-1] : null;
  const sov = lastRun ? lastRun.sov : 0;
  const mentions = lastRun ? (lastRun.mentions||[]).length : 0;
  const totalResults = lastRun ? (lastRun.allResults||[]).length : 0;
  const activePlats = lastRun ? Object.keys(lastRun.platforms||{}).length : 0;
  const queries = (b.queries||[]).length;
  const prevRun = b.runs && b.runs.length > 1 ? b.runs[b.runs.length - 2] : null;
  const prevSOV = prevRun ? (prevRun.sov || 0) : null;
  const sovDiff = prevSOV !== null ? sov - prevSOV : null;

  // ─── Header ──────────────────────────────────────────────────
  el('ov-brand-title').textContent = b.name || 'Overview';
  el('ov-sub').textContent = [b.industry, b.city].filter(Boolean).join(' · ') || 'Select a brand and run queries to see results.';

  // Header actions: Run button + last run age
  let runAgeText = 'Never';
  let ageDotClass = '';
  if (lastRun) {
    const runTime = new Date(lastRun.time || lastRun.date);
    const ageMins = Math.floor((Date.now() - runTime.getTime()) / 60000);
    if (ageMins < 60) { runAgeText = ageMins + 'm ago'; ageDotClass = 'ok'; }
    else if (ageMins < 1440) { runAgeText = Math.floor(ageMins / 60) + 'h ago'; ageDotClass = ageMins > 720 ? 'warn' : 'ok'; }
    else { runAgeText = Math.floor(ageMins / 1440) + 'd ago'; ageDotClass = parseInt(runAgeText) > 3 ? 'bad' : 'warn'; }
  }
  const actionsEl = el('ov-header-actions');
  actionsEl.innerHTML = (queries > 0 ? `<button onclick="runQueries()" class="ov-run-btn">▶ RUN NOW</button>` : '') +
    `<div class="ov-run-age"><span class="dot ${ageDotClass}"></span>${runAgeText}</div>`;

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

  el('ov-mentions').textContent = mentions + ' / ' + totalResults;
  el('ov-platforms').textContent = activePlats + ' / ' + PLATS.length;
  const qLimit = getUserLimits().queries;
  el('ov-queries').textContent = queries + ' / ' + qLimit;
  el('ov-queries').style.color = queries >= qLimit ? 'var(--red)' : '';
  el('ov-last-run-age').textContent = runAgeText;
  el('ov-last-run-age').style.color = ageDotClass === 'bad' ? 'var(--red)' : ageDotClass === 'warn' ? 'var(--amber)' : '';

  // ─── API Health Banner ───────────────────────────────────────
  const healthEl = el('ov-api-health');
  if (lastRun && lastRun.allResults) {
    const errs = lastRun.allResults.filter(r => r.error).length;
    const okCount = lastRun.allResults.filter(r => !r.error).length;
    const healthyPlats = new Set(lastRun.allResults.filter(r => !r.error).map(r => r.platform)).size;
    const totalPlats = new Set(lastRun.allResults.map(r => r.platform)).size;
    const dotColor = errs === 0 ? 'var(--green)' : errs <= 3 ? 'var(--amber)' : 'var(--red)';
    healthEl.innerHTML = `<div class="ov-health">
      <div class="ov-health-dot" style="background:${dotColor};"></div>
      <div class="ov-health-text"><strong>${healthyPlats}/${totalPlats}</strong> platforms healthy · <strong>${okCount}</strong> ok · <span style="color:${errs > 0 ? 'var(--red)' : 'inherit'}">${errs} error${errs !== 1 ? 's' : ''}</span></div>
      ${errs > 0 ? `<a href="#" onclick="go('apilogs');return false;" style="font-family:var(--mono);font-size:10px;color:var(--red);text-decoration:none;margin-left:auto;">View Errors →</a>` : ''}
    </div>`;
  } else {
    healthEl.innerHTML = '';
  }

  // ─── Category SOV + Best/Worst Row ───────────────────────────
  const catRow = el('ov-category-row');
  if (lastRun && lastRun.allResults && lastRun.allResults.length > 0) {
    const chatAI = ['ChatGPT', 'Claude', 'Grok', 'DeepSeek', 'Mistral'];
    const searchAI = ['Perplexity', 'Google AIO', 'Gemini'];
    const chatResults = lastRun.allResults.filter(r => chatAI.includes(r.platform) && !r.error);
    const searchResults = lastRun.allResults.filter(r => searchAI.includes(r.platform) && !r.error);
    const chatSOV = chatResults.length > 0 ? Math.round(chatResults.filter(r => r.mentioned).length / chatResults.length * 100) : null;
    const searchSOV = searchResults.length > 0 ? Math.round(searchResults.filter(r => r.mentioned).length / searchResults.length * 100) : null;

    const platEntries = Object.entries(lastRun.platforms || {});
    const best = platEntries.length ? platEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null;

    function catColor(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; }

    let catHtml = '';
    if (chatSOV !== null) {
      catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${catColor(chatSOV)};">
        <div class="ov-cat-label">Chat AI</div>
        <div class="ov-cat-val" style="color:${catColor(chatSOV)};">${chatSOV}%</div>
        <div class="ov-cat-sub">ChatGPT · Claude · Grok · DeepSeek · Mistral</div>
      </div>`;
    }
    if (searchSOV !== null) {
      catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${catColor(searchSOV)};">
        <div class="ov-cat-label">Search AI</div>
        <div class="ov-cat-val" style="color:${catColor(searchSOV)};">${searchSOV}%</div>
        <div class="ov-cat-sub">Perplexity · Google AIO · Gemini</div>
      </div>`;
    }
    if (best) {
      catHtml += `<div class="ov-cat-card" style="border-top:2px solid var(--green);">
        <div class="ov-cat-label">Best Platform</div>
        <div class="ov-cat-val" style="color:var(--green);">${esc(best[0])}</div>
        <div class="ov-cat-sub">${best[1]}% SOV — strongest visibility</div>
      </div>`;
    }
    catRow.innerHTML = catHtml;
    catRow.style.gridTemplateColumns = `repeat(${[chatSOV !== null, searchSOV !== null, !!best].filter(Boolean).length}, 1fr)`;
  } else {
    catRow.innerHTML = '';
  }

  // ─── Platform Cards ──────────────────────────────────────────
  const pg = el('ov-plat-grid');
  pg.innerHTML = '';
  const platSOV = lastRun ? (lastRun.platforms||{}) : {};
  PLATS.forEach(plat => {
    const t = PLAT_THEME[plat]||{};
    const pSov = platSOV[plat]||0;
    const keyId = plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai').replace('googleaio','gemini');
    const active = keyStatus[keyId];
    const barColor = pSov >= 50 ? 'var(--green)' : pSov > 0 ? 'var(--amber)' : 'var(--border)';
    const div = document.createElement('div');
    div.className = 'ov-plat-card';
    div.innerHTML = `<div class="ov-plat-logo" style="color:${t.color||'#fff'}">${t.logo||'?'}</div>
      <div class="ov-plat-info">
        <div class="ov-plat-name">${plat}</div>
        <div class="ov-plat-status" style="color:${active ? 'var(--green)' : 'var(--muted)'}">${active ? '● ACTIVE' : '○ INACTIVE'}</div>
        <div class="ov-plat-bar"><div class="ov-plat-bar-fill" style="width:${pSov}%;background:${barColor};"></div></div>
      </div>
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
      let qpHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">Query Performance</div><div class="ov-card-sub">${sorted.length} queries</div></div>`;
      sorted.forEach(s => {
        const barColor = s.rate >= 50 ? 'var(--green)' : s.rate > 0 ? 'var(--amber)' : 'var(--red)';
        qpHtml += `<div class="ov-qp-bar">
          <div class="ov-qp-query">${esc(s.query)}</div>
          <div class="ov-qp-track"><div class="ov-qp-fill" style="width:${s.rate}%;background:${barColor};"></div></div>
          <div class="ov-qp-rate" style="color:${barColor};">${s.rate}%</div>
        </div>`;
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
      let compHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">Competitors in AI</div><div class="ov-card-sub">${topComp.length} brands</div></div>`;
      compHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
      topComp.forEach(([name, count]) => {
        compHtml += `<div class="ov-comp-chip"><span>${esc(name)}</span><span class="ov-comp-count">${count}x</span></div>`;
      });
      compHtml += `</div></div>`;
      compEl.innerHTML = compHtml;
    } else { compEl.innerHTML = ''; }
  } else { compEl.innerHTML = ''; }

  // ─── Last Run Summary ────────────────────────────────────────
  const lrs = el('ov-last-run-summary');
  if (lastRun && lastRun.allResults && lastRun.allResults.length) {
    const errors = lastRun.allResults.filter(r => r.error);
    const found = lastRun.allResults.filter(r => r.mentioned);
    const runTime = new Date(lastRun.time || lastRun.date);
    let summaryHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">Last Run — ${runTime.toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${runTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
    if (errors.length > 0) {
      summaryHtml += `<div style="background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.15);padding:10px 14px;margin-bottom:12px;font-family:var(--mono);font-size:11px;">`;
      summaryHtml += `<span style="color:var(--red);font-weight:700;">${errors.length} API error${errors.length>1?'s':''}</span>`;
      summaryHtml += `<span style="color:var(--muted);margin-left:8px;">— Check API keys or <a href="#" onclick="go('apilogs');return false;" style="color:var(--red);text-decoration:none;">view logs</a></span>`;
      summaryHtml += `</div>`;
    }
    summaryHtml += `<div style="font-family:var(--mono);font-size:11px;color:var(--muted);">${found.length} found / ${lastRun.allResults.length} total responses · <a href="#" onclick="go('mentions');return false;" style="color:var(--green);text-decoration:none;">View All Results →</a></div>`;
    if (found.length === 0 && lastRun.allResults.length > 0 && errors.length === 0) {
      summaryHtml += `<div style="background:rgba(59,130,246,.05);border:1px solid rgba(59,130,246,.15);padding:12px 14px;margin-top:12px;font-size:12px;line-height:1.6;">
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
  const queryLimit = currentUser.limits ? currentUser.limits.queries : 5;
  const qCountEl = el('ov-query-count');
  if (qCountEl) {
    const atLimit = queryCount >= queryLimit;
    qCountEl.textContent = queryCount + ' / ' + queryLimit + ' queries';
    qCountEl.style.color = atLimit ? '#f0a030' : 'var(--muted)';
  }
  const limitMsg = el('ov-query-limit-msg');
  if (limitMsg) {
    if (queryCount >= queryLimit) {
      limitMsg.textContent = 'Query limit reached (' + queryLimit + '). Remove a query or upgrade your plan to add more.';
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
    const qText = document.createTextNode(q + ' ');
    tag.appendChild(qText);
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', function(){ ovRemoveQuery(i); });
    tag.appendChild(btn);
    ql.appendChild(tag);
  });

  // Mini SOV trend chart on overview
  const miniTrend = el('ov-mini-trend');
  const history = b.sovHistory || [];
  if (history.length >= 2 && typeof Chart !== 'undefined') {
    miniTrend.style.display = 'block';
    const miniLabels = history.slice(-14).map(h => {
      const d = new Date(h.date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const miniData = history.slice(-14).map(h => h.overall);
    if (window._ovMiniChart) window._ovMiniChart.destroy();
    const mCtx = el('ov-mini-chart').getContext('2d');
    window._ovMiniChart = new Chart(mCtx, {
      type: 'line',
      data: {
        labels: miniLabels,
        datasets: [{
          label: 'SOV %',
          data: miniData,
          borderColor: '#FF6154',
          backgroundColor: 'rgba(255,97,84,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#FF6154'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#666', font: { size: 9 } }, grid: { color: '#1a1a1a' } },
          y: { min: 0, max: 100, ticks: { color: '#666', font: { size: 9 }, callback: v => v + '%' }, grid: { color: '#1a1a1a' } }
        }
      }
    });
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
  const queryLimit = currentUser.limits ? currentUser.limits.queries : 5;
  if ((b.queries||[]).length >= queryLimit) {
    toast('Query limit reached (' + queryLimit + '). Upgrade your plan to add more.', 'err');
    showUpgradeModal('Your plan allows up to ' + queryLimit + ' queries. Upgrade for more.');
    return;
  }
  const queries = [...(b.queries||[]), q];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
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
  const queryLimit = currentUser.limits ? currentUser.limits.queries : 5;
  const currentCount = (b.queries||[]).length;
  if (currentCount + unique.length > queryLimit) {
    const allowed = queryLimit - currentCount;
    if (allowed <= 0) { toast('Query limit reached (' + queryLimit + '). Upgrade your plan.', 'err'); return; }
    unique.splice(allowed);
    toast('Only ' + allowed + ' queries added (plan limit: ' + queryLimit + ')', 'warn');
  }
  const queries = [...(b.queries||[]), ...unique];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
    renderOverview();
    toast('All queries cleared', 'ok');
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
    const queryLimit = currentUser.limits ? currentUser.limits.queries : 5;
    const remaining = queryLimit - (b.queries||[]).length;
    if (remaining <= 0) { toast('Query limit reached. Upgrade your plan.', 'err'); return; }
    if (newQs.length > remaining) newQs = newQs.slice(0, remaining);
    const pick = confirm('Add ' + newQs.length + ' AI-generated queries?\n\n' + newQs.join('\n'));
    if (!pick) return;
    const queries = [...(b.queries||[]), ...newQs];
    const result = await api('PUT', '/api/brands/'+b.id, { queries });
    brands[brands.findIndex(x=>x.id===b.id)] = result.brand;
    renderOverview();
    toast(newQs.length + ' AI-generated queries added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.textContent = origText; btn.disabled = false; }
}

// ─── MENTIONS / ALL RESULTS ───────────────────────────────────────
let mentionsPage = 0;
const MENTIONS_PER_PAGE = 25;

function renderMentions(){
  const b = brand();
  if (!b) return;
  const cont = el('mentions-container');

  // Populate run selector
  const sel = el('mentions-run-sel');
  const curVal = sel.value;
  sel.innerHTML = '';
  const runs = (b.runs||[]).slice().reverse();
  if (!runs.length) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results yet. Run queries to collect data.</p></div>';
    return;
  }
  runs.forEach((r,i) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    const d = new Date(r.time || r.date);
    opt.textContent = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) + ' — SOV '+r.sov+'%';
    sel.appendChild(opt);
  });
  if (curVal && [...sel.options].some(o=>o.value===curVal)) sel.value = curVal;

  const selectedRunId = sel.value;
  const run = (b.runs||[]).find(r => r.id === selectedRunId);
  if (!run) { cont.innerHTML = '<div class="empty-state"><p>Select a run to see results.</p></div>'; return; }

  const filter = el('mentions-filter-sel').value;
  const searchTerm = (el('mentions-search').value || '').trim().toLowerCase();
  const allResults = run.allResults || [];

  if (!allResults.length) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results in this run.</p></div>';
    return;
  }

  const filtered = allResults.filter(r => {
    if (filter === 'mentioned' && !r.mentioned) return false;
    if (filter === 'not-mentioned' && r.mentioned) return false;
    if (searchTerm) {
      const haystack = ((r.platform||'') + ' ' + (r.query||'') + ' ' + (r.raw||r.context||'') + ' ' + (r.model||'')).toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    cont.innerHTML = '<div class="empty-state"><p>No results match your filter.</p></div>';
    return;
  }

  const totalPages = Math.ceil(filtered.length / MENTIONS_PER_PAGE);
  if (mentionsPage >= totalPages) mentionsPage = totalPages - 1;
  if (mentionsPage < 0) mentionsPage = 0;
  const pageStart = mentionsPage * MENTIONS_PER_PAGE;
  const pageItems = filtered.slice(pageStart, pageStart + MENTIONS_PER_PAGE);

  const runTime = new Date(run.time || run.date);
  const runTimeStr = runTime.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + runTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

  let html = '<div class="table-scroll"><table class="tbl"><thead><tr><th>Platform</th><th>Query</th><th>Status</th><th>Sentiment</th><th>Model</th><th>Timestamp</th><th>Response Preview</th><th></th></tr></thead><tbody>';
  const sentimentLabels = {positive:'Positive',negative:'Negative',neutral:'Neutral'};
  const sentimentTips = {positive:'AI spoke favorably about your brand',negative:'AI expressed concerns about your brand',neutral:'AI mentioned your brand without strong opinion'};
  pageItems.forEach(r => {
    const t = PLAT_THEME[r.platform]||{};
    const isErr = r.error;
    const preview = isErr ? friendlyError(r.errorMessage) : (r.raw || r.context || '').replace(/[#*_~`]/g, '').substring(0, 120).replace(/\n/g, ' ');
    const statusBadge = isErr
      ? '<span class="badge" style="background:rgba(255,136,0,.15);color:#ff8800;font-weight:700;">ERROR</span>'
      : `<span class="badge ${r.mentioned?'pos':'neg'}" style="font-weight:700">${r.mentioned?'FOUND':'NOT FOUND'}</span>`;
    const sent = r.sentiment || 'neutral';
    const sentLabel = isErr ? '—' : (sentimentLabels[sent] || 'Neutral');
    const sentTip = isErr ? '' : (sentimentTips[sent] || '');
    html += `<tr${isErr?' style="opacity:0.6"':''}>
      <td><span style="color:${t.color||'#fff'}">${t.logo||''}</span> ${esc(r.platform)}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r.query)}">${esc(r.query)}</td>
      <td>${statusBadge}</td>
      <td><span class="badge ${sent==='positive'?'pos':sent==='negative'?'neg':'neu'}" title="${sentTip}">${sentLabel}</span></td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--muted)">${esc(r.model||'—')}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--muted);white-space:nowrap;">${esc(runTimeStr)}</td>
      <td style="max-width:250px;font-size:11px;color:${isErr?'#ff8800':'var(--muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(preview)}">${esc(preview)}${!isErr&&preview.length>=120?'...':''}</td>
      <td>${isErr?'':'<button onclick="openResultFromRun(\''+selectedRunId+"','"+r.platform+"','"+btoa(encodeURIComponent(r.query))+'\')" style="font-family:var(--mono);font-size:9px;padding:3px 8px;background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;">VIEW</button>'}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px;">`;
  html += `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);">Showing ${pageStart+1}-${Math.min(pageStart+MENTIONS_PER_PAGE,filtered.length)} of ${filtered.length} results — ${allResults.filter(r=>r.mentioned).length} found</div>`;
  if (totalPages > 1) {
    html += `<div style="display:flex;gap:6px;align-items:center;">`;
    html += `<button onclick="mentionsPage=0;renderMentions()" class="btn" style="padding:4px 8px;font-size:10px;" ${mentionsPage===0?'disabled':''}>«</button>`;
    html += `<button onclick="mentionsPage--;renderMentions()" class="btn" style="padding:4px 8px;font-size:10px;" ${mentionsPage===0?'disabled':''}>‹</button>`;
    html += `<span style="font-family:var(--mono);font-size:10px;color:var(--muted);">Page ${mentionsPage+1}/${totalPages}</span>`;
    html += `<button onclick="mentionsPage++;renderMentions()" class="btn" style="padding:4px 8px;font-size:10px;" ${mentionsPage>=totalPages-1?'disabled':''}>›</button>`;
    html += `<button onclick="mentionsPage=${totalPages-1};renderMentions()" class="btn" style="padding:4px 8px;font-size:10px;" ${mentionsPage>=totalPages-1?'disabled':''}>»</button>`;
    html += `</div>`;
  }
  html += `</div>`;
  cont.innerHTML = html;
}

function openResp(mentionId){
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
  const modal = el('resp-modal');
  const head = el('resp-modal-head');
  head.style.background = t.bg||'var(--bg2)';
  head.style.borderBottom = '1px solid '+t.color;
  el('resp-modal-title').innerHTML = (t.logo||'') + ' ' + esc(m.platform) + ' <span style="color:var(--green);font-size:11px;">— FOUND</span>';
  el('resp-modal-query').innerHTML = esc(m.query) + (m.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(m.model)+' | Captured: '+new Date(m.time).toLocaleString()+'</div>' : '');
  const textEl = el('resp-modal-text');
  textEl.style.whiteSpace = 'normal';
  const rawHtml = mdToHtml(m.raw || m.context || '');
  const hre = brandHighlightRe(b);
  textEl.innerHTML = hre ? rawHtml.replace(hre, '<mark style="background:rgba(0,255,136,.2);color:var(--green);border-radius:2px;padding:0 2px;">$1</mark>') : rawHtml;
  // Citations
  const cc = el('resp-modal-cites');
  const cites = m.citations||[];
  if (cites.length) {
    cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
      + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
  } else cc.innerHTML = '';
  openModal('resp-modal');
}

function openResultFromRun(runId, platform, encodedQuery){
  const b = brand();
  if (!b) return;
  const q = decodeURIComponent(atob(encodedQuery));
  const run = (b.runs||[]).find(r => r.id === runId);
  if (!run || !run.allResults) return;
  const result = run.allResults.find(x => x.platform===platform && x.query===q);
  if (!result) return;
  const t = PLAT_THEME[platform]||{};
  const head = el('resp-modal-head');
  head.style.background = t.bg||'var(--bg2)';
  head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
  el('resp-modal-title').innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red,#ff4444);font-size:11px;">— NOT FOUND</span>');
  el('resp-modal-query').innerHTML = esc(q) + (result.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(result.model)+'</div>' : '');
  const textEl = el('resp-modal-text');
  textEl.style.whiteSpace = 'normal';
  const rawHtml1 = mdToHtml(result.raw || result.context || '[No response text]');
  const hre1 = brandHighlightRe(b);
  textEl.innerHTML = hre1 ? rawHtml1.replace(hre1, '<mark style="background:rgba(0,255,136,.2);color:var(--green);border-radius:2px;padding:0 2px;">$1</mark>') : rawHtml1;
  // Show citations if any
  const cc = el('resp-modal-cites');
  const cites = result.citations||[];
  if (cites.length) {
    cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
      + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
  } else cc.innerHTML = '';
  openModal('resp-modal');
}

function openFullResult(platform, encodedQuery){
  const b = brand();
  if (!b) return;
  const q = decodeURIComponent(atob(encodedQuery));
  const run = (b.runs||[]).find(r => r.id === el('proof-run-sel').value);
  if (!run || !run.allResults) return;
  const result = run.allResults.find(x => x.platform===platform && x.query===q);
  if (!result) return;
  const t = PLAT_THEME[platform]||{};
  const head = el('resp-modal-head');
  head.style.background = t.bg||'var(--bg2)';
  head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
  el('resp-modal-title').innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red,#ff4444);font-size:11px;">— NOT FOUND</span>');
  el('resp-modal-query').innerHTML = esc(q) + (result.model ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Model: '+esc(result.model)+'</div>' : '');
  const textEl = el('resp-modal-text');
  textEl.style.whiteSpace = 'normal';
  const rawHtml2 = mdToHtml(result.raw || result.context || '[No response text]');
  const hre2 = brandHighlightRe(b);
  textEl.innerHTML = hre2 ? rawHtml2.replace(hre2, '<mark style="background:rgba(0,255,136,.2);color:var(--green);border-radius:2px;padding:0 2px;">$1</mark>') : rawHtml2;
  // Show citations
  const cc = el('resp-modal-cites');
  const cites = result.citations||[];
  if (cites.length) {
    cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
      + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
  } else cc.innerHTML = '';
  openModal('resp-modal');
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
    const d = new Date(r.time || r.date);
    opt.textContent = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) + ' — ' + (r.mentions||[]).length + ' mentions, SOV '+r.sov+'%';
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

  // Evidence summary — show run stats at top
  const totalResults = allResults.length;
  const foundCount = allResults.filter(r => r.mentioned).length;
  const errorCount = allResults.filter(r => r.error).length;
  const runDate = new Date(run.time || run.date);
  let html = `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 16px;margin-bottom:16px;background:var(--bg2);border:1px solid var(--border);font-family:var(--mono);font-size:11px;">
    <span style="color:var(--muted);">RUN: ${runDate.toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${runDate.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
    <span style="color:var(--text);font-weight:700;">${totalResults} results</span>
    <span style="color:var(--green);font-weight:700;">${foundCount} found</span>
    <span style="color:${errorCount?'#ff8800':'var(--muted)'}">${errorCount} errors</span>
    <span style="color:var(--muted);">${queries.length} queries × ${(run.activePlatforms||[]).length || new Set(allResults.map(r=>r.platform)).size} platforms</span>
    <span style="color:var(--text);font-weight:700;">SOV: ${run.sov}%</span>
  </div>`;

  // Evidence cards — show EXACT AI response as proof for each query+platform
  queries.forEach(q => {
    // Use platforms from run data, not just PLATS constant
    const runPlatforms = run.activePlatforms || [...new Set(allResults.map(r => r.platform))];
    const platList = platFilter ? [platFilter] : (runPlatforms.length ? runPlatforms : PLATS);
    let hasCards = false;
    const cards = platList.map(plat => {
      const m = mentions.find(x => x.platform===plat && x.query===q);
      const fullResult = allResults.find(x => x.platform===plat && x.query===q);
      const isMentionedResult = m || (fullResult && fullResult.mentioned);
      if (resultFilter==='found' && !isMentionedResult) return '';
      if (resultFilter==='notfound' && isMentionedResult) return '';
      if (!fullResult && !m) return ''; // No data for this platform+query combo
      hasCards = true;
      const t = PLAT_THEME[plat]||{};
      const isError = fullResult && fullResult.error;
      const isMentioned = !!(m || (fullResult && fullResult.mentioned));
      // Always prefer fullResult.raw (full AI response) as the authoritative source
      // Fall back to mention data only if fullResult is missing
      const responseText = isError
        ? ''
        : (fullResult ? (fullResult.raw || fullResult.context || '') : (m ? (m.raw || m.context || '') : ''));
      const renderedResp = mdToHtml(responseText);
      const proofHre = brandHighlightRe(b);
      // Highlight brand name in ALL responses (not just mentioned) so user can verify
      const displayResp = proofHre
        ? renderedResp.replace(proofHre,'<mark>$1</mark>')
        : renderedResp;
      const modelName = (m && m.model) || (fullResult && fullResult.model) || '';
      const sentiment = (m && m.sentiment) || (fullResult && fullResult.sentiment) || 'neutral';
      const sentBadge = sentiment==='positive'?'pos':sentiment==='negative'?'neg':'neu';
      const cites = ((m && m.citations) || (fullResult && fullResult.citations) || []).length;
      const recommended = (m && m.recommended) || (fullResult && fullResult.recommended) || false;
      const locRelevant = (m && m.locationRelevant) || (fullResult && fullResult.locationRelevant);
      const matchedLoc = (m && m.matchedLocation) || (fullResult && fullResult.matchedLocation) || '';
      const compMentions = (fullResult && fullResult.competitorMentions) || [];

      // Status badge — clear FOUND / NOT FOUND / ERROR
      const statusBadge = isError
        ? `<div class="proof-card-badge" style="color:#ff8800;border:1px solid rgba(255,136,0,.3);font-weight:700;">⚠ API ERROR</div>`
        : isMentioned
        ? `<div class="proof-card-badge" style="color:var(--green);border:1px solid rgba(0,255,136,.3);font-weight:700;">&#x2713; FOUND</div>`
        : `<div class="proof-card-badge" style="color:var(--red,#ff4444);border:1px solid rgba(255,68,68,.3);font-weight:700;">&#x2717; NOT FOUND</div>`;

      const cardBg = isMentioned ? (t.bg||'var(--bg2)') : 'var(--bg2)';
      const cardBorder = isMentioned ? (t.color||'var(--border)')+'33' : 'var(--border)';
      const mid = m ? m.id : null;
      const viewBtn = mid
        ? `<button class="proof-view-btn" onclick="openResp('${mid}')">VIEW FULL &#x2197;</button>`
        : `<button class="proof-view-btn" onclick="openFullResult('${plat}','${btoa(encodeURIComponent(q))}')">VIEW FULL &#x2197;</button>`;

      return `<div class="proof-card" style="background:${cardBg};--proof-card-bg:${cardBg};border:1px solid ${cardBorder};">
        <div class="proof-card-header" style="background:${t.bg||'var(--bg3)'};border-bottom:1px solid ${cardBorder};">
          <div class="proof-card-logo" style="color:${t.color||'#fff'}">${t.logo||'?'}</div>
          <div class="proof-card-name" style="color:${isMentioned?(t.color||'var(--text)'):'var(--text)'}">${plat}</div>
          <div class="proof-card-badges">
            ${statusBadge}
          </div>
        </div>
        <div class="proof-card-body">
          <div class="proof-card-query">"${esc(q)}"</div>
          ${isError
            ? `<div class="proof-not-found" style="color:#ff8800;"><div style="font-weight:700;margin-bottom:6px;">API Error</div><div style="font-size:11px;color:var(--muted);line-height:1.5;">${friendlyError(fullResult.errorMessage)}</div></div>`
            : displayResp
            ? `<div class="proof-card-resp" id="proof-resp-${plat.replace(/\s/g,'')}-${btoa(encodeURIComponent(q)).substring(0,12)}" style="${isMentioned?'':'color:var(--muted);'}">${displayResp}</div>`
            : `<div class="proof-not-found">No response received from this platform.</div>`
          }
        </div>
        <div class="proof-card-footer">
          <span class="badge ${sentBadge}" title="${sentiment==='positive'?'AI spoke favorably':sentiment==='negative'?'AI expressed concerns':'Neutral mention'}">${sentiment==='positive'?'Positive':sentiment==='negative'?'Negative':'Neutral'}</span>
          ${recommended?'<span class="badge pos">RECOMMENDED</span>':''}
          ${matchedLoc?`<span style="font-family:var(--mono);font-size:8px;color:var(--blue);background:rgba(59,130,246,.1);padding:2px 6px;border:1px solid rgba(59,130,246,.2);">${esc(matchedLoc)}</span>`:''}
          ${cites?`<span style="font-family:var(--mono);font-size:9px;color:var(--muted);">${cites} source${cites>1?'s':''}</span>`:''}
          ${compMentions.length?`<span style="font-family:var(--mono);font-size:8px;color:var(--red);background:rgba(255,68,68,.08);padding:2px 6px;border:1px solid rgba(255,68,68,.2);" title="${esc(compMentions.join(', '))}">${compMentions.length} competitor${compMentions.length>1?'s':''}</span>`:''}
          ${modelName?`<span style="font-family:var(--mono);font-size:8px;color:var(--muted);">${esc(modelName)}</span>`:''}
          ${viewBtn}
        </div>
      </div>`;
    }).join('');
    if (hasCards && cards.trim()) {
      html += `<div style="margin-bottom:28px;">
        <div class="proof-query-header"><span class="q-label">QUERY:</span> ${esc(q)}</div>
        <div class="proof-grid">${cards}</div>
      </div>`;
    }
  });
  cont.innerHTML = html || '<div class="empty-state"><p>No results match your filters.</p></div>';
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
function renderPlatformStatus(){
  const b = brand();
  if (!b) return;
  const cont = el('plat-status-container');
  if (!b.runs || !b.runs.length) {
    cont.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>';
    return;
  }
  let html = '<div class="table-scroll"><table class="tbl"><thead><tr><th>Platform</th><th>Last SOV</th><th>Key Status</th><th>Trend (last 7 runs)</th></tr></thead><tbody>';
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
    html += `<tr>
      <td><span style="color:${t.color||'#fff'}">${t.logo}</span> ${plat}</td>
      <td><span class="stat-val" style="font-size:18px;color:${t.color||'var(--green)'}">${lastSOV}%</span></td>
      <td><span class="badge ${hasKey?'real':'sim'}">${hasKey?'ACTIVE':'INACTIVE'}</span></td>
      <td style="vertical-align:bottom;padding-bottom:4px;">${bars}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

// ─── QUERY PERFORMANCE ────────────────────────────────────────────
function renderQPerf(){
  const b = brand(); if (!b) return;
  const qs = b.queryStats||{};
  const queries = b.queries||[];
  const cont = el('qperf-container');
  if (!queries.length) { cont.innerHTML='<div class="empty-state"><p>No queries set.</p></div>'; return; }
  let html = '<div class="table-scroll"><table class="tbl"><thead><tr><th>Query</th><th>Runs</th><th>Mentions</th><th>Mention Rate</th><th>Bar</th></tr></thead><tbody>';
  queries.forEach(q => {
    const stat = qs[q]||{runs:0,mentions:0};
    const rate = stat.runs ? Math.round((stat.mentions/stat.runs)*100) : 0;
    html += `<tr>
      <td>${esc(q)}</td>
      <td style="font-family:var(--mono)">${stat.runs}</td>
      <td style="font-family:var(--mono)">${stat.mentions}</td>
      <td style="font-family:var(--mono);color:${rate>60?'var(--green)':rate>30?'var(--amber)':'var(--red)'}">${rate}%</td>
      <td><div class="sov-bar-wrap"><div class="sov-bar" style="width:${rate}%;background:${rate>60?'var(--green)':rate>30?'var(--amber)':'var(--red)'}"></div></div></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

// ─── COMPETITORS ──────────────────────────────────────────────────
function renderCompetitors(){
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

  let html = '<div class="card"><div class="card-title">Mention Comparison (Last Run)</div>';
  html += '<table class="tbl"><thead><tr><th>Brand</th><th>Mentions</th><th>Share</th><th>Bar</th></tr></thead><tbody>';

  // Your brand row
  const total = allResults.length;
  const brandPct = total ? Math.round((brandMentions / total) * 100) : 0;
  html += `<tr style="background:rgba(0,255,136,.05);">
    <td><strong style="color:var(--green);">${esc(b.name)}</strong> <span style="font-size:9px;color:var(--muted);font-family:var(--mono);">YOU</span></td>
    <td style="font-family:var(--mono)">${brandMentions}/${total}</td>
    <td style="font-family:var(--mono);color:var(--green);font-weight:700;">${brandPct}%</td>
    <td><div class="sov-bar-wrap"><div class="sov-bar" style="width:${brandPct}%;background:var(--green);"></div></div></td>
  </tr>`;

  // Competitor rows sorted by mention count
  const sorted = competitors.slice().sort((a,b2) => (compStats[b2]||0) - (compStats[a]||0));
  sorted.forEach(c => {
    const cnt = compStats[c] || 0;
    const pct = total ? Math.round((cnt / total) * 100) : 0;
    const clr = cnt > brandMentions ? 'var(--red)' : cnt === brandMentions ? 'var(--amber,#f59e0b)' : 'var(--muted)';
    html += `<tr>
      <td>${esc(c)}</td>
      <td style="font-family:var(--mono)">${cnt}/${total}</td>
      <td style="font-family:var(--mono);color:${clr};font-weight:700;">${pct}%</td>
      <td><div class="sov-bar-wrap"><div class="sov-bar" style="width:${pct}%;background:${clr};"></div></div></td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  compDiv.innerHTML = html;
}

async function addComp(){
  const inp = el('comp-input');
  const v = inp.value.trim(); if (!v) return;
  const b = brand(); if (!b) return;
  const competitors = [...(b.competitors||[]), v];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { competitors });
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
    renderCompetitors();
    toast('Competitor removed', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

// ─── SOV TRENDS (Chart.js) ────────────────────────────────────────
let sovChartInstance = null;
let platSovChartInstance = null;

function renderTrends(){
  const b = brand(); if (!b) return;
  const history = b.sovHistory || [];

  // Destroy existing chart instances safely
  if (sovChartInstance) { sovChartInstance.destroy(); sovChartInstance = null; }
  if (platSovChartInstance) { platSovChartInstance.destroy(); platSovChartInstance = null; }

  // Ensure canvas elements exist (recreate if previously destroyed)
  const sovParent = el('sov-chart') ? el('sov-chart').parentElement : document.querySelector('#view-trends .card:first-child');
  if (!el('sov-chart')) {
    sovParent.innerHTML = '<div class="card-title">Overall SOV Trend</div><canvas id="sov-chart" style="width:100%;max-height:300px;"></canvas>';
  }
  const platParent = el('plat-sov-chart') ? el('plat-sov-chart').parentElement : document.querySelector('#view-trends .card:nth-child(2)');
  if (!el('plat-sov-chart')) {
    platParent.innerHTML = '<div class="card-title">Per-Platform SOV Trend</div><canvas id="plat-sov-chart" style="width:100%;max-height:300px;"></canvas>';
  }

  if (!history.length) {
    el('sov-chart').style.display = 'none';
    sovParent.querySelector('.card-title').insertAdjacentHTML('afterend', '<div class="empty-state trends-empty"><p>No trend data yet. Run queries at least twice to see trends.</p></div>');
    el('plat-sov-chart').style.display = 'none';
    platParent.querySelector('.card-title').insertAdjacentHTML('afterend', '<div class="empty-state trends-empty"><p>No trend data yet.</p></div>');
    return;
  }

  // Remove any previous empty-state messages
  document.querySelectorAll('.trends-empty').forEach(e => e.remove());
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
      plugins: { legend: { labels: { color: '#888', font: { family: "'JetBrains Mono', monospace", size: 11 } } } },
      scales: {
        x: { ticks: { color: '#666', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: '#1a1a1a' } },
        y: { min: 0, max: 100, ticks: { color: '#666', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v + '%' }, grid: { color: '#1a1a1a' } }
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
      plugins: { legend: { labels: { color: '#888', font: { family: "'JetBrains Mono', monospace", size: 10 } } } },
      scales: {
        x: { ticks: { color: '#666', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: '#1a1a1a' } },
        y: { min: 0, max: 100, ticks: { color: '#666', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v + '%' }, grid: { color: '#1a1a1a' } }
      }
    }
  });
}

// ─── ALERTS ──────────────────────────────────────────────────────
function renderAlerts(){
  const b = brand(); if (!b) return;
  el('alert-webhook-url').value = b.webhookUrl || '';
  const status = el('webhook-status');
  if (b.webhookUrl) {
    status.innerHTML = '<span style="color:var(--green);">&#x2713; Webhook configured</span>';
  } else {
    status.innerHTML = '<span style="color:var(--muted);">No webhook configured</span>';
  }

  // SOV change history
  const histEl = el('alert-sov-history');
  const history = b.sovHistory || [];
  if (history.length < 2) {
    histEl.innerHTML = '<div class="empty-state"><p>No SOV changes recorded yet. Run queries at least twice to see changes here.</p></div>';
    return;
  }
  let html = '<table class="tbl"><thead><tr><th>Date</th><th>SOV</th><th>Change</th><th>Platforms</th></tr></thead><tbody>';
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const prev = i > 0 ? history[i - 1].overall : 0;
    const change = h.overall - prev;
    const changeStr = i === 0 ? '—' : (change > 0 ? '+' + change + '%' : change + '%');
    const changeColor = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--muted)';
    const date = new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const plats = h.platforms ? Object.entries(h.platforms).map(([p, v]) => p + ': ' + v + '%').join(', ') : '—';
    html += '<tr><td style="font-family:var(--mono);font-size:11px;">' + date + '</td>';
    html += '<td style="font-family:var(--mono);font-weight:700;">' + h.overall + '%</td>';
    html += '<td style="font-family:var(--mono);color:' + changeColor + ';">' + (i === 0 ? '—' : changeStr) + '</td>';
    html += '<td style="font-family:var(--mono);font-size:10px;color:var(--muted);">' + esc(plats) + '</td></tr>';
  }
  html += '</tbody></table>';
  histEl.innerHTML = html;
}

async function saveWebhook(){
  const b = brand(); if (!b) return;
  const url = el('alert-webhook-url').value.trim();
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { webhookUrl: url });
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    const queryLimit = currentUser.limits ? currentUser.limits.queries : 5;
    const remaining = queryLimit - (b.queries || []).length;
    if (remaining <= 0) { toast('Query limit reached. Upgrade your plan.', 'err'); return; }
    if (newSuggestions.length > remaining) newSuggestions = newSuggestions.slice(0, remaining);
    const pick = confirm('Add ' + newSuggestions.length + ' suggested queries?\n\n' + newSuggestions.join('\n'));
    if (!pick) return;
    const queries = [...(b.queries || []), ...newSuggestions];
    const result = await api('PUT', '/api/brands/'+b.id, { queries });
    brands[brands.findIndex(x=>x.id===b.id)] = result.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;
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
    brands[brands.findIndex(x => x.id === b.id)] = saveData.brand;
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

// ─── RUN QUERIES ──────────────────────────────────────────────────
async function runQueries(){
  if (runningQueries) return;
  const b = brand();
  if (!b) { toast('Select a brand first','err'); return; }
  if (!b.queries||!b.queries.length) { toast('Add some queries first','err'); return; }
  const selectedPlats = b.platforms || PLATS;
  if (!selectedPlats.length) { toast('Select platforms in Brand Setup first','err'); return; }

  runningQueries = true;
  const btn = el('run-btn');
  const prog = el('run-progress');
  const fill = el('run-progress-fill');
  const statusTxt = el('run-status-text');
  const timerEl = el('run-timer');

  btn.classList.add('running');
  btn.textContent = '⏳ RUNNING...';
  prog.style.display = 'block';
  fill.style.width = '0%';
  statusTxt.textContent = 'Sending queries to AI platforms...';

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

  // Animate progress bar
  let progress = 0;
  const progInt = setInterval(() => {
    progress = Math.min(progress+2, 90);
    fill.style.width = progress+'%';
  }, 400);

  try {
    const data = await api('POST', '/api/brands/'+b.id+'/run', { platforms: selectedPlats });
    brands[brands.findIndex(x=>x.id===b.id)] = data.brand;

    clearInterval(progInt);
    clearInterval(timerInt);
    fill.style.width = '100%';

    const elapsed = fmtTime(Date.now()-startTime);
    timerEl.textContent = elapsed;
    const errors = data.result.errorCount || 0;
    const statusParts = [`Brand found in ${data.result.newMentions} of ${data.result.totalQ} responses`];
    if (errors > 0) statusParts.push(`${errors} API error${errors>1?'s':''}`);
    statusParts.push(elapsed);
    statusTxt.textContent = 'Done! ' + statusParts.join(' · ');

    if (errors > 0) {
      // Store errors persistently so API Logs always has them
      storeRunError({
        time: new Date().toISOString(),
        error: `${errors} API error(s) in run`,
        type: 'partial',
        platformErrors: data.result.platformErrors || {}
      });

      // Show error details inline
      if (data.result.platformErrors) {
        const errDetails = Object.entries(data.result.platformErrors).map(([plat, msgs]) => {
          const uniqueMsgs = [...new Set(msgs)];
          return `${plat}: ${friendlyError(uniqueMsgs[0])}${uniqueMsgs.length>1?' (+' +(uniqueMsgs.length-1)+' more)':''}`;
        }).join('\n');
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.2);padding:10px 14px;margin-top:8px;font-family:var(--mono);font-size:10px;line-height:1.7;white-space:pre-wrap;color:var(--red);max-height:120px;overflow-y:auto;';
        errDiv.textContent = errDetails;
        prog.appendChild(errDiv);
      }

      // Redirect to API Logs so user can see full error details
      toast(`Run complete with ${errors} error(s) — redirecting to API Logs`, 'warn');
      setTimeout(() => {
        prog.style.display = 'none';
        prog.querySelectorAll('div[style*="rgba(255,68,68"]').forEach(d => d.remove());
        fill.style.width = '0%';
        timerEl.textContent = '';
        go('apilogs');
      }, 4000);
    } else {
      setTimeout(() => {
        prog.style.display = 'none';
        fill.style.width = '0%';
        timerEl.textContent = '';
      }, 5000);
      go('mentions');
      const toastMsg = data.result.sov === 0
        ? `Run complete — SOV: 0%. AI didn't mention your brand yet. Check Evidence & Proof to see what AI recommends instead.`
        : `Run complete — SOV: ${data.result.sov}%! Your brand was found in ${data.result.newMentions} response${data.result.newMentions>1?'s':''}`;
      toast(toastMsg, data.result.sov > 0 ? 'ok' : 'warn');
    }
  } catch(e) {
    clearInterval(progInt);
    clearInterval(timerInt);
    timerEl.textContent = '';
    statusTxt.style.color = 'var(--red)';
    statusTxt.textContent = 'Run failed: ' + e.message;
    fill.style.width = '0%';
    fill.style.background = 'var(--red)';

    // Store the failure persistently
    storeRunError({
      time: new Date().toISOString(),
      error: e.message,
      type: 'crash'
    });

    // Reload brand data (emergency save may have stored partial results)
    try {
      const savedErrors = JSON.parse(localStorage.getItem('trackly_run_errors') || '[]');
      const freshData = await api('GET', '/api/brands');
      if (freshData.brands) {
        brands = freshData.brands;
        renderBrandSelect();
        if (currentBrandId) el('brand-select').value = currentBrandId;
      }
      // Restore errors after reload (they're in localStorage, not brand object)
    } catch(_) {}

    toast('Run failed — opening API Logs', 'err');

    setTimeout(() => {
      prog.style.display = 'none';
      statusTxt.style.color = '';
      fill.style.background = '';
      go('apilogs');
    }, 2000);
  }

  runningQueries = false;
  btn.classList.remove('running');
  btn.textContent = '▶ RUN QUERIES';
}

// ─── API LOGS / DIAGNOSTICS ─────────────────────────────────────
async function renderApiLogs(){
  const container = el('apilogs-content');
  container.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:20px;">Loading API logs from server...</div>';

  let html = '';

  // 1. Client-side errors (localStorage)
  const clientErrors = getStoredRunErrors();
  if (clientErrors.length > 0) {
    html += `<div class="card" style="margin-bottom:16px;border:1px solid rgba(255,68,68,.4);background:rgba(255,68,68,.06);">
      <div class="card-title" style="color:var(--red);">Recent Run Failures (${clientErrors.length})</div>`;
    clientErrors.forEach(err => {
      const dt = new Date(err.time);
      const dateStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      const isCrash = err.type === 'crash';
      html += `<div style="font-family:var(--mono);font-size:11px;margin-bottom:8px;line-height:1.6;padding:8px 10px;background:rgba(255,68,68,.04);border:1px solid rgba(255,68,68,.15);">
        <div style="color:var(--muted);margin-bottom:4px;">${esc(dateStr)} ${isCrash ? '<span style="color:var(--red);font-weight:700;">CRASHED</span>' : '<span style="color:var(--amber);font-weight:700;">ERRORS</span>'}</div>
        <div style="color:var(--red);word-break:break-word;">${esc(friendlyError(err.error))}</div>`;
      if (err.platformErrors && Object.keys(err.platformErrors).length > 0) {
        Object.entries(err.platformErrors).forEach(([plat, msgs]) => {
          const t = PLAT_THEME[plat] || {};
          const uniqueMsgs = [...new Set(msgs)];
          html += `<div style="margin-top:4px;"><span style="color:${t.color||'var(--text)'};font-weight:700;">${esc(plat)}</span>: <span style="color:var(--red);">${esc(friendlyError(uniqueMsgs[0]))}</span></div>`;
        });
      }
      html += `</div>`;
    });
    html += `<button onclick="clearStoredRunErrors();renderApiLogs();" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:10px;padding:4px 12px;cursor:pointer;font-family:var(--mono);">DISMISS ALL</button></div>`;
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
        <button onclick="renderApiLogs()" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:10px;padding:4px 10px;cursor:pointer;font-family:var(--mono);">REFRESH</button>
        <button onclick="clearApiLogs()" style="background:none;border:1px solid rgba(255,68,68,.3);color:var(--red);font-size:10px;padding:4px 10px;cursor:pointer;font-family:var(--mono);">CLEAR LOGS</button>
      </div>
    </div>
    <div id="apilogs-stats" style="font-family:var(--mono);font-size:11px;color:var(--muted);margin:8px 0;"></div>
    <div id="apilogs-server-logs">Loading...</div>
  </div>`;

  // 4. Guide
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
      statsEl.innerHTML = `Last 24h: <span style="color:var(--green);">${stats.success || 0} ok</span> · <span style="color:var(--red);">${stats.errors || 0} errors</span> · ${stats.platforms_used || 0} platforms · avg ${stats.avg_ms || 0}ms`;
    }

    // Render logs table
    const logsEl = el('apilogs-server-logs');
    if (!logs.length) {
      logsEl.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:12px 0;">No API calls logged yet. Run queries to see every API call tracked here.</div>';
      return;
    }

    let tbl = `<div style="overflow-x:auto;max-height:600px;overflow-y:auto;">
      <table class="data-table" style="width:100%;font-size:11px;">
      <thead style="position:sticky;top:0;background:var(--bg1);z-index:1;"><tr>
        <th style="width:130px;">Time</th>
        <th style="width:80px;">Platform</th>
        <th>Query</th>
        <th style="width:60px;">Status</th>
        <th style="width:60px;">Key</th>
        <th style="width:50px;">Time</th>
        <th>Error</th>
      </tr></thead><tbody>`;

    logs.forEach(log => {
      const dt = new Date(log.created_at);
      const timeStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const isErr = log.status === 'error';
      const t = PLAT_THEME[log.platform] || {};
      const queryShort = (log.query || '').length > 50 ? log.query.substring(0, 50) + '...' : (log.query || '—');
      const respTime = log.response_ms ? (log.response_ms/1000).toFixed(1) + 's' : '—';

      tbl += `<tr style="${isErr ? 'background:rgba(255,68,68,.06);' : ''}">
        <td style="font-family:var(--mono);font-size:10px;white-space:nowrap;">${esc(timeStr)}</td>
        <td style="color:${t.color || 'var(--text)'};font-weight:700;font-size:10px;">${esc(log.platform)}</td>
        <td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(log.query || '')}">${esc(queryShort)}</td>
        <td style="text-align:center;"><span style="color:${isErr ? 'var(--red)' : 'var(--green)'};font-weight:700;font-size:10px;">${isErr ? 'FAIL' : 'OK'}</span></td>
        <td style="font-family:var(--mono);font-size:9px;color:var(--muted);">...${esc(log.key_hint || '?')}</td>
        <td style="font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right;">${respTime}</td>
        <td style="font-size:10px;color:var(--red);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(log.error || '')}">${isErr ? esc(friendlyError(log.error)) : ''}</td>
      </tr>`;
    });

    tbl += '</tbody></table></div>';
    if (logs.length >= 200) tbl += '<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px;">Showing last 200 entries. Older logs are auto-cleaned after 7 days.</div>';
    logsEl.innerHTML = tbl;

  } catch(e) {
    const logsEl = el('apilogs-server-logs');
    if (logsEl) logsEl.innerHTML = `<div style="color:var(--red);font-family:var(--mono);font-size:11px;">Failed to load logs: ${esc(e.message)}</div>`;
  }
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
      ksHtml += `<div style="border:1px solid var(--border);padding:6px 12px;"><span style="color:${color};font-weight:700;">${count}</span> <span style="text-transform:capitalize;">${plat}</span> key${count!==1?'s':''}</div>`;
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
    <div style="background:var(--bg2);border:1px solid var(--border);padding:16px;">
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
  let html = `<table class="tbl"><thead><tr>
    <th>User</th><th>Plan</th><th>Role</th><th>Brands</th><th>API Keys</th><th>Joined</th><th style="text-align:right;">Actions</th>
  </tr></thead><tbody>`;
  users.forEach(u => {
    const planColor = u.plan === 'agency' ? 'var(--purple)' : u.plan === 'pro' ? 'var(--green)' : 'var(--muted)';
    const planBg = u.plan === 'agency' ? 'rgba(155,114,255,.1)' : u.plan === 'pro' ? 'rgba(0,255,136,.1)' : 'rgba(255,255,255,.05)';
    const planBorder = u.plan === 'agency' ? 'rgba(155,114,255,.3)' : u.plan === 'pro' ? 'rgba(0,255,136,.3)' : 'var(--border)';
    const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const keyCount = (u.hasKeys||[]).length;
    const isMe = u.id === currentUser.id;
    html += `<tr>
      <td>
        <div style="font-weight:600;font-size:13px;">${esc(u.name || '—')}${isMe ? ' <span style="font-family:var(--mono);font-size:9px;color:var(--green);border:1px solid rgba(0,255,136,.3);padding:1px 5px;border-radius:2px;margin-left:6px;">YOU</span>' : ''}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:2px;">${esc(u.email)}${u.username ? ' · <span style="color:var(--green);">@' + esc(u.username) + '</span>' : ''}</div>
      </td>
      <td>
        <span style="display:inline-block;font-family:var(--mono);font-size:10px;font-weight:700;padding:3px 8px;border-radius:2px;background:${planBg};color:${planColor};border:1px solid ${planBorder};text-transform:uppercase;">${u.plan}</span>
      </td>
      <td><span class="badge ${u.role==='admin'?'pos':'neu'}">${u.role||'user'}</span></td>
      <td style="font-family:var(--mono);font-size:12px;">${u.brandCount !== undefined ? u.brandCount : '—'}</td>
      <td style="font-family:var(--mono);font-size:11px;color:${keyCount ? 'var(--green)' : 'var(--muted)'};">${keyCount ? keyCount + ' configured' : 'None'}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted);">${joined}</td>
      <td style="text-align:right;">
        <button onclick="openAdminEdit('${u.id}')" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:10px;padding:5px 12px;cursor:pointer;letter-spacing:0.5px;">EDIT</button>
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
  el('admin-edit-limits').textContent = (u.limits?.queries || '?') + ' queries, ' + (u.limits?.runsPerDay || '?') + ' runs/day';
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
  if (!token) {
    el('landing-page').style.display = 'block';
    el('auth-page').style.display = 'none';
    el('app').style.display = 'none';
    return;
  }
  // Try auto-login with saved token
  el('landing-page').style.display = 'none';
  try {
    const data = await api('GET', '/api/auth/me');
    currentUser = data.user;
    await initApp();
  } catch(e) {
    // Token invalid or expired — show login page directly (not landing)
    localStorage.removeItem('trackly_token');
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
