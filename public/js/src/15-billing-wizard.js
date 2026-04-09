// ═══════════════════════════════════════════════════════════════════
async function renderBilling() {
  try {
    const data = await api('GET', '/api/billing');
    const plan = data.plan;
    const usage = data.usage || {};

    // Plan card
    const planEl = el('billing-plan-card');
    const planColors = { free: '#6b7280', starter: '#f59e0b', pro: '#4f46e5', agency: '#7c3aed', enterprise: '#9b72ff', owner: '#059669' };
    const pc = planColors[plan] || '#888';
    planEl.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;border:none;">
        <div style="background:linear-gradient(135deg,${pc},${pc}cc);padding:24px 28px;color:#fff;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.85;">Current Plan</div>
          <div style="font-size:32px;font-weight:800;text-transform:uppercase;margin:4px 0;">${plan}</div>
          <div style="font-size:12px;opacity:.75;">Member since ${new Date(data.memberSince).toLocaleDateString()}</div>
        </div>
        ${plan !== 'owner' ? '<div style="padding:16px 28px;background:var(--bg2);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius) var(--radius);"><button class="pbtn" style="background:var(--primary);color:#fff;border-color:var(--primary);font-size:13px;padding:10px 24px;" onclick="showUpgradeModal()">Upgrade Plan</button></div>' : ''}
      </div>`;

    // Usage meters
    const usageEl = el('billing-usage');
    const meterColors = ['#4f46e5', '#059669', '#f59e0b', '#7c3aed'];
    const meters = [
      { label: 'Brands', ...usage.brands },
      { label: 'Runs Today', ...usage.runsToday },
      { label: 'Queries', ...usage.queries },
      { label: 'Platforms', ...usage.platforms }
    ];
    usageEl.className = 'billing-meters-grid';
    usageEl.innerHTML = meters.map((m, i) => {
      const pct = m.limit > 0 ? Math.min((m.used / m.limit) * 100, 100) : 0;
      const barColor = pct > 90 ? 'var(--red,#ef4444)' : pct > 70 ? '#f59e0b' : meterColors[i];
      return `<div class="billing-meter-card" style="border-top-color:${meterColors[i]};">
        <div class="billing-meter-label">${m.label}</div>
        <div class="billing-meter-value">${m.used} <span style="font-size:13px;font-weight:500;color:var(--muted);">/ ${m.limit >= 9999 ? '∞' : m.limit}</span></div>
        <div class="billing-meter-bar">
          <div class="billing-meter-fill" style="width:${pct}%;background:${barColor};"></div>
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

    // Plan pricing cards
    const cardsEl = el('billing-plan-cards');
    const planPricing = [
      { id: 'starter', name: 'Starter', price: '$9', period: '/mo', tagline: 'Perfect for getting started', color: '#f59e0b', features: ['<strong>30</strong> prompts/month', '1 brand', '2 AI platforms', 'Weekly tracking', 'SOV tracking & export'] },
      { id: 'pro', name: 'Pro', price: '$29', period: '/mo', tagline: 'For growing businesses', color: '#4f46e5', featured: true, features: ['<strong>250</strong> prompts/month', '5 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (5)', 'Sentiment analysis', 'Scheduled runs'] },
      { id: 'agency', name: 'Agency', price: '$89', period: '/mo', tagline: 'For agencies & teams', color: '#7c3aed', features: ['<strong>1,000</strong> prompts/month', '20 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (20)', 'Sentiment analysis', 'Priority support'] },
      { id: 'enterprise', name: 'Enterprise', price: '$499', period: '/mo', tagline: 'For large organizations', color: '#9b72ff', features: ['<strong>10,000</strong> prompts/month', '100 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (100)', 'API access', 'Priority support'] }
    ];
    cardsEl.innerHTML = `
      <div class="billing-cards-header">
        <div class="card-title">Choose Your Plan</div>
        <div style="font-size:13px;color:var(--muted);">Select a plan that fits your needs</div>
      </div>
      <div class="billing-pricing-grid">
        ${planPricing.map(p => {
          const isCurrent = p.id === plan;
          const isDowngrade = ['free','starter','pro','agency','enterprise'].indexOf(p.id) < ['free','starter','pro','agency','enterprise'].indexOf(plan);
          return `<div class="billing-price-card${p.featured ? ' billing-card-featured' : ''}${isCurrent ? ' billing-card-current' : ''}" style="--card-accent:${p.color};">
            ${p.featured ? '<div class="billing-card-badge">MOST POPULAR</div>' : ''}
            ${isCurrent ? '<div class="billing-card-badge billing-card-badge-current">CURRENT PLAN</div>' : ''}
            <div class="billing-card-name">${p.name}</div>
            <div class="billing-card-price">${p.price}<span>${p.period}</span></div>
            <div class="billing-card-tagline">${p.tagline}</div>
            <ul class="billing-card-features">
              ${p.features.map(f => '<li>' + f + '</li>').join('')}
            </ul>
            <button class="billing-card-btn${isCurrent ? ' billing-card-btn-current' : ''}" onclick="${isCurrent ? '' : "doUpgrade('" + p.id + "')"}" ${isCurrent ? 'disabled' : ''}>
              ${isCurrent ? 'Current Plan' : isDowngrade ? 'Downgrade' : 'Buy ' + p.name}
            </button>
          </div>`;
        }).join('')}
      </div>`;

    // Plan comparison
    const plansEl = el('billing-plans');
    const allPlans = data.allPlans || {};
    const displayPlans = ['free', 'starter', 'pro', 'agency', 'enterprise'].filter(k => allPlans[k]);
    const planMeta = {
      free: { label: 'Free', price: '$0', color: '#6b7280' },
      starter: { label: 'Starter', price: '$9', color: '#f59e0b' },
      pro: { label: 'Pro', price: '$29', color: '#4f46e5' },
      agency: { label: 'Agency', price: '$89', color: '#7c3aed' },
      enterprise: { label: 'Enterprise', price: '$499', color: '#9b72ff' }
    };
    const boolCell = (val, p) => `<td class="cmp-cell${p === plan ? ' cmp-cell-active' : ''}">${val ? '<span class="cmp-check">&#10003;</span>' : '<span class="cmp-dash">—</span>'}</td>`;
    const numCell = (val, p) => `<td class="cmp-cell${p === plan ? ' cmp-cell-active' : ''}"><span class="cmp-num">${val >= 9999 ? '∞' : val.toLocaleString()}</span></td>`;
    const features = [
      { label: 'Monthly Prompts', icon: '&#9889;', key: 'prompts', type: 'num' },
      { label: 'Brands', icon: '&#9733;', key: 'brands', type: 'num' },
      { label: 'Competitors', icon: '&#9878;', key: 'competitors', type: 'num' },
      { label: 'Platforms', icon: '&#9881;', key: 'platforms', type: 'num' },
      { label: 'Sentiment Analysis', icon: '&#9829;', key: 'sentiment', type: 'bool' },
      { label: 'Scheduled Runs', icon: '&#8635;', key: 'scheduledRuns', type: 'bool' },
      { label: 'API Access', icon: '&#10100;', key: 'apiAccess', type: 'bool' },
      { label: 'Priority Support', icon: '&#9993;', key: 'prioritySupport', type: 'bool' }
    ];
    plansEl.innerHTML = `
      <div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead>
            <tr>
              <th class="cmp-feature-head">Features</th>
              ${displayPlans.map(p => {
                const m = planMeta[p] || { label: p, price: '', color: '#888' };
                return `<th class="cmp-plan-head${p === plan ? ' cmp-plan-head-active' : ''}">
                  <div class="cmp-plan-name" style="color:${m.color};">${m.label}</div>
                  <div class="cmp-plan-price">${m.price}<span>/mo</span></div>
                  ${p === plan ? '<div class="cmp-current-badge">Your Plan</div>' : ''}
                </th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${features.map((f, i) => `<tr class="cmp-row${i % 2 === 0 ? ' cmp-row-stripe' : ''}">
              <td class="cmp-feature-cell"><span class="cmp-feature-icon">${f.icon}</span>${f.label}</td>
              ${displayPlans.map(p => f.type === 'bool' ? boolCell(allPlans[p][f.key], p) : numCell(allPlans[p][f.key], p)).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
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
function hideViewLoading(containerId){
  const cont = el(containerId);
  if (cont && cont.querySelector('.skeleton')) cont.innerHTML = '';
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
  const threshLabel = el('alert-params-row').querySelector('.flbl');
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
    invalidateCache('/api/brands');
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
    localStorage.setItem('livesov_brand', currentBrandId);
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
    localStorage.removeItem('livesov_session');
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
