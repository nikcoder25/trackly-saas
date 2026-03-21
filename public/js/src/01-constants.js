// ─── LAZY-LOAD CHART.JS ──────────────────────────────────────────
// Chart.js (~200KB) is only loaded when a chart view is first opened,
// saving bandwidth on initial page load for all users.
let _chartJsLoaded = false;
let _chartJsPromise = null;
function ensureChartJs() {
  if (_chartJsLoaded || typeof Chart != 'undefined') { _chartJsLoaded = true; return Promise.resolve(); }
  if (_chartJsPromise) return _chartJsPromise;
  _chartJsPromise = new Promise((resolve, reject) => {
    const scriptEl = document.createElement('script');
    scriptEl.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
    scriptEl.crossOrigin = 'anonymous';
    scriptEl.onload = () => { _chartJsLoaded = true; resolve(); };
    scriptEl.onerror = () => { _chartJsPromise = null; reject(new Error('Failed to load Chart.js')); };
    document.head.appendChild(scriptEl);
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

// ─── CLIENT-SIDE COST ESTIMATION (fallback for logs with no server cost) ──
const CLIENT_MODEL_PRICING = {
  'gpt-5-search-api':        { i: 2.50, o: 10.00 },
  'gpt-4o-search-preview':   { i: 2.50, o: 10.00 },
  'gpt-5.4':                 { i: 2.50, o: 10.00 },
  'gpt-4o':                  { i: 2.50, o: 10.00 },
  'claude-sonnet-4-20250514':{ i: 3.00, o: 15.00 },
  'claude-opus-4-6':         { i:15.00, o: 75.00 },
  'claude-sonnet-4-6':       { i: 3.00, o: 15.00 },
  'claude-haiku-4-5-20251001':{ i: 0.80, o: 4.00 },
  'gemini-2.5-flash':        { i: 0.15, o: 0.60 },
  'gemini-2.5-pro':          { i: 1.25, o: 10.00 },
  'gemini-2.0-flash':        { i: 0.10, o: 0.40 },
  'grok-3-mini':             { i: 0.30, o: 0.50 },
  'grok-4':                  { i: 3.00, o: 15.00 },
  'grok-4-1-fast':           { i: 2.00, o: 10.00 },
  'sonar-pro':               { i: 3.00, o: 15.00 },
  'sonar':                   { i: 1.00, o: 1.00 },
  'sonar-reasoning-pro':     { i: 3.00, o: 15.00 },
  'deepseek-chat':           { i: 0.27, o: 1.10 },
  'deepseek-reasoner':       { i: 0.55, o: 2.19 },
};
function clientEstimateCost(model, tokensIn, tokensOut) {
  if (!model || (!tokensIn && !tokensOut)) return 0;
  let pricing = CLIENT_MODEL_PRICING[model];
  if (!pricing) {
    const key = Object.keys(CLIENT_MODEL_PRICING).find(k => model.startsWith(k) || k.startsWith(model));
    if (key) pricing = CLIENT_MODEL_PRICING[key];
  }
  if (!pricing) return 0;
  return ((tokensIn || 0) * pricing.i + (tokensOut || 0) * pricing.o) / 1_000_000;
}
