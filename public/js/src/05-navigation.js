// ─── APP INIT ─────────────────────────────────────────────────────
async function initApp(){
  el('landing-page').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('app').style.display = 'grid';
      if (window.location.pathname !== '/dashboard') history.replaceState(null, '', '/dashboard');

  // Update topbar
  const emailBadge = el('user-email-badge');
  if (emailBadge) emailBadge.textContent = currentUser.email;
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
  localStorage.setItem('livesov_brand', id);
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
    if (platSovChartInstance) { platSovChartInstance.destroy(); platSovChartInstance = null; }
  }
  if (currentView === 'overview' && window._ovMiniChart) {
    window._ovMiniChart.destroy(); window._ovMiniChart = null;
  }
  if (currentView === 'promptdetails') {
    if (_pdVisChart) { _pdVisChart.destroy(); _pdVisChart = null; }
    if (_pdCompChart) { _pdCompChart.destroy(); _pdCompChart = null; }
  }
  if (currentView === 'keywordtracker' && window._ktExpandedChart) {
    window._ktExpandedChart.destroy(); window._ktExpandedChart = null;
  }
  // Clear run age timer when leaving overview to prevent memory leak
  if (currentView === 'overview' && _runAgeTimer) {
    clearInterval(_runAgeTimer);
    _runAgeTimer = null;
  }
  currentView = view;
  closeMobileMenu();
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = ''; // Clear any inline display overrides so CSS classes take effect
  });
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    if (n.getAttribute('onclick') === "go('"+view+"')") n.classList.add('active');
  });
  const v = el('view-'+view);
  if (v) v.classList.add('active');
  // Scroll main content to top when switching tabs
  const mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  renderView(view);
}

function switchActivityTab(btn, tabId) {
  const view = document.getElementById('view-activitylog');
  if (view) {
    view.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    view.querySelectorAll('.al-tab-content').forEach(t => t.style.display = 'none');
  }
  btn.classList.add('tab-active');
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
    // Remove .active from all views so CSS hides them (display:none)
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
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
        '<h2 class=\"global-empty-title\">Welcome to Livesov!</h2>' +
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
  if (view==='keywordtracker')  renderKeywordTracker();
  if (view==='copilot')         { /* copilot is interactive, no auto-render */ }
  if (view==='billing')         renderBilling();
}
