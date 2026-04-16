
// ─── ACCOUNT & PLAN ──────────────────────────────────────────────
function getUserLimits() {
  return (currentUser && currentUser.limits) || { brands: 1, prompts: 3, queries: 3, competitors: 0, platforms: 2, sentiment: false };
}

function renderAccount(){
  if (!currentUser) return;
  el('acct-email').textContent = currentUser.email;
  // Username
  const usernameEl = el('acct-username');
  if (usernameEl) usernameEl.textContent = currentUser.username ? '@' + currentUser.username : '-';
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
  planEl.style.color = currentUser.plan === 'enterprise' ? 'var(--purple)' : currentUser.plan === 'agency' ? 'var(--purple)' : currentUser.plan === 'pro' ? 'var(--green)' : currentUser.plan === 'starter' ? 'var(--amber)' : 'var(--muted)';
  el('acct-since').textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  // Subscription status + cancel button
  loadSubscriptionStatus();

  // Usage stats
  const limits = getUserLimits();
  const brandCount = brands.length;
  const b = brand();
  const queryCount = b ? (b.queries || []).length : 0;
  const compCount = b ? (b.competitors || []).length : 0;
  const today = new Date().toISOString().split('T')[0];
  const todayRuns = b ? (b.runs || []).filter(r => (r.date || '').startsWith(today)).length : 0;

  const usageHtml = `
    <div class="section-title" style="margin-top:14px;">Your Usage</div>
    <div style="display:grid;gap:12px;margin-top:8px;">
      ${usageBar('Brands', brandCount, limits.brands)}
      ${usageBar('Total prompts', brands.reduce((s,br)=>s+(br.queries||[]).length,0), limits.prompts)}
      ${usageBar('Platforms', limits.platforms, 7)}
      ${usageBar('Competitors', compCount, limits.competitors)}
    </div>
  `;
  const acctUsageEl = el('acct-usage');
  if (acctUsageEl) acctUsageEl.innerHTML = usageHtml;

  // Plan cards - reuse landing page pricing card classes
  const planData = [
    { id: 'starter', name: 'Starter', price: '$9', tagline: 'Perfect for getting started', features: ['<strong>30</strong> tracked queries', 'Unlimited brands', '2 AI platforms', 'Sentiment analysis'] },
    { id: 'pro', name: 'Pro', price: '$29', tagline: 'For growing businesses', featured: true, features: ['<strong>100</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (8)', 'Sentiment analysis'] },
    { id: 'agency', name: 'Agency', price: '$89', tagline: 'Scale with confidence', features: ['<strong>500</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (20)', 'Sentiment analysis'] },
    { id: 'enterprise', name: 'Enterprise', price: 'Custom', tagline: 'Full power', features: ['<strong>50,000</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (100)', 'API access', 'Priority support'] }
  ];
  const current = currentUser.plan || 'free';
  el('acct-plans').innerHTML = '<div class="land-pricing" style="margin-top:16px;">' + planData.map(p => {
    const isCurrent = p.id === current;
    const disabled = isCurrent ? 'disabled' : '';
    const btnText = isCurrent ? 'CURRENT PLAN' : 'SWITCH TO ' + p.name.toUpperCase();
    const btnStyle = isCurrent ? 'width:100%;opacity:.5;cursor:default;' : 'width:100%;';
    return `<div class="land-price-card ${p.featured ? 'featured' : ''}"${p.id === 'enterprise' ? ' style="border-color:var(--purple,#9b72ff);"' : ''}>
      <h3${p.id === 'enterprise' ? ' style="color:var(--purple,#9b72ff);"' : ''}>${p.name}</h3>
      <div class="price">${p.price}<span>/mo</span></div>
      <div class="price-sub">${p.tagline}</div>
      <ul>${p.features.map(f => '<li>' + f + '</li>').join('')}</ul>
      <button class="land-btn land-btn-primary" style="${btnStyle}" onclick="doUpgrade('${p.id}')" ${disabled}>${btnText}</button>
    </div>`;
  }).join('') + '</div>';
}

// ── Subscription Status ──────────────────────────────
async function loadSubscriptionStatus() {
  const statusEl = el('acct-sub-status');
  const cancelRow = el('acct-cancel-row');
  const detailsEl = el('acct-sub-details');
  const billingCard = el('acct-billing-card');
  if (!statusEl || !cancelRow) return;
  const plan = (currentUser && currentUser.plan) || 'free';
  if (plan === 'free') {
    statusEl.innerHTML = '';
    cancelRow.style.display = 'none';
    if (detailsEl) detailsEl.style.display = 'none';
    if (billingCard) billingCard.style.display = 'none';
    return;
  }
  try {
    const data = await api('GET', '/api/payments/subscription');
    if (data.hasSubscription) {
      const statusMap = { active: 'pos', on_hold: 'neg', cancelled: 'neg' };
      const statusLabel = (data.status || 'active').toUpperCase().replace('_', ' ');
      statusEl.innerHTML = `<span class="badge ${statusMap[data.status] || 'pos'}">${statusLabel}</span>`;
      cancelRow.style.display = data.status === 'cancelled' ? 'none' : '';
      // Show subscription details
      if (detailsEl) {
        let html = '';
        if (data.nextBillingDate) {
          html += `<div>Next billing: <strong style="color:var(--text);">${new Date(data.nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>`;
        }
        if (data.previousBillingDate) {
          html += `<div>Last billed: ${new Date(data.previousBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>`;
        }
        if (data.cancelAtNextBilling) {
          html += `<div style="color:var(--amber);">Cancels at end of billing period</div>`;
        }
        if (html) { detailsEl.innerHTML = html; detailsEl.style.display = ''; }
        else { detailsEl.style.display = 'none'; }
      }
    } else {
      statusEl.innerHTML = '';
      cancelRow.style.display = 'none';
      if (detailsEl) detailsEl.style.display = 'none';
    }
    // Load billing history for any paid plan
    loadBillingHistory();
  } catch(e) {
    statusEl.innerHTML = '';
    cancelRow.style.display = 'none';
  }
}

async function loadBillingHistory() {
  const billingCard = el('acct-billing-card');
  const historyEl = el('acct-billing-history');
  if (!billingCard || !historyEl) return;
  try {
    const data = await api('GET', '/api/payments/history');
    const payments = data.payments || [];
    if (!payments.length) {
      billingCard.style.display = 'none';
      return;
    }
    billingCard.style.display = '';
    historyEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px;">
      <thead><tr style="color:var(--muted);text-align:left;border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">Date</th><th style="padding:6px 8px;">Plan</th><th style="padding:6px 8px;">Amount</th><th style="padding:6px 8px;">Status</th><th style="padding:6px 8px;"></th>
      </tr></thead>
      <tbody>${payments.map(p => {
        const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
        const amt = p.amount != null ? ('$' + (p.amount / 100).toFixed(2)) : '-';
        const statusColor = p.status === 'succeeded' ? 'var(--green)' : p.status === 'failed' ? 'var(--red)' : 'var(--muted)';
        return `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 8px;">${date}</td>
          <td style="padding:6px 8px;text-transform:uppercase;">${p.plan || '-'}</td>
          <td style="padding:6px 8px;">${amt}</td>
          <td style="padding:6px 8px;color:${statusColor};text-transform:uppercase;">${p.status || '-'}</td>
          <td style="padding:6px 8px;">${p.paymentId ? `<a href="/api/payments/invoice/${p.paymentId}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:10px;">INVOICE</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch(e) {
    billingCard.style.display = 'none';
  }
}

async function cancelSubscription() {
  if (!confirm('Are you sure you want to cancel your subscription? You will be downgraded to the free plan immediately.')) return;
  if (!confirm('This will take effect immediately. Continue?')) return;
  try {
    const data = await api('POST', '/api/payments/cancel');
    currentUser = data.user;
    const pb = el('plan-badge');
    pb.textContent = 'FREE';
    pb.className = 'plan-badge free';
    toast(data.message || 'Subscription cancelled', 'ok');
    if (currentView === 'account') renderAccount();
  } catch(e) {
    toast(e.message || 'Failed to cancel subscription', 'err');
  }
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
        <select class="finp model-select" data-platform="${platform}" style="margin:0;flex:1;font-size:11px;padding:4px 8px;height:28px;" ${isEnabled?'':'disabled'}>
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

function toggleEditUsername(){
  const display = el('acct-username');
  const input = el('acct-username-input');
  const btn = el('acct-username-btn');
  if (input.style.display === 'none') {
    // Enter edit mode
    input.value = currentUser.username || '';
    input.style.display = '';
    display.style.display = 'none';
    btn.textContent = 'SAVE';
    input.focus();
  } else {
    // Save
    saveUsername();
  }
}

async function saveUsername(){
  const input = el('acct-username-input');
  const display = el('acct-username');
  const btn = el('acct-username-btn');
  const trimmed = input.value.trim().toLowerCase();
  if (trimmed && trimmed.length < 3) { toast('Username must be at least 3 characters', 'err'); return; }
  btn.disabled = true; btn.textContent = 'SAVING...';
  try {
    const data = await api('PUT', '/api/auth/username', { username: trimmed || null });
    currentUser.username = data.username;
    display.textContent = data.username ? '@' + data.username : '-';
    toast(data.username ? 'Username set to @' + data.username : 'Username removed', 'ok');
    input.style.display = 'none';
    display.style.display = '';
    btn.textContent = 'EDIT';
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
    btn.textContent = 'SAVE';
  } finally {
    btn.disabled = false;
  }
}

async function deleteAccount() {
  const pw = prompt('Type your password to confirm account deletion:');
  if (!pw) return;
  if (!confirm('Are you sure? This will permanently delete your account and all brands. This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/auth/account', { password: pw });
    localStorage.removeItem('livesov_session');
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
  _downloadViaFetch(API + '/api/export/brand/' + b.id, `livesov-${b.name || 'brand'}-export.json`);
}
function exportAllBrandsData() {
  _downloadViaFetch(API + '/api/export/all', 'livesov-full-export.json');
}
function exportBrandCSV() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  _downloadViaFetch(API + '/api/export/brand/' + b.id + '/csv', `livesov-${b.name || 'brand'}-data.csv`);
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
    if (!brandData.name) { toast('Invalid brand file - missing name', 'err'); return; }
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
    localStorage.setItem('livesov_brand', currentBrandId);
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
      if (details.brand) detailStr = ' - ' + esc(details.brand);
      if (details.plan) detailStr = ' - plan: ' + esc(details.plan);
      if (details.email) detailStr = ' - ' + esc(details.email);
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
      actionsEl.innerHTML = '<button class="pbtn" onclick="el(\'twofa-disable-form\').style.display=el(\'twofa-disable-form\').style.display===\'none\'?\'block\':\'none\'" style="font-size:11px;">DISABLE 2FA</button>';
      el('twofa-setup-form').style.display = 'none';
    } else {
      statusEl.innerHTML = '<span style="color:var(--muted);">Not enabled.</span> <span style="font-size:11px;color:var(--muted);">Add an extra layer of security to your account with an authenticator app.</span>';
      actionsEl.innerHTML = '<button class="pbtn" onclick="setup2FA()" style="background:var(--primary);color:#fff;border-color:var(--primary);font-size:11px;">ENABLE 2FA</button>';
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
          <button class="pbtn" onclick="navigator.clipboard.writeText('${data.backupCodes.join('\\n')}');toast('Backup codes copied!','ok');" style="font-size:10px;">COPY ALL CODES</button>
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
    { key: 'negative_sentiment', label: 'Negative Sentiment', desc: 'When negative sentiment spikes' },
    { key: 'team_invite', label: 'Team Invitations', desc: 'When you are added to a team' }
  ];
  const togglesEl = el('notif-type-toggles');
  let togglesHtml = '';
  types.forEach((t, i) => {
    const isLast = i === types.length - 1;
    togglesHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${isLast ? '' : 'border-bottom:1px solid var(--border);'}">
      <div>
        <div style="font-size:12px;font-weight:600;">${esc(t.label)}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(t.desc)}</div>
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
      const dotColor = n.read ? 'var(--border)' : (n.severity === 'critical' || n.severity === 'high') ? 'var(--red)' : n.severity === 'medium' ? 'var(--amber)' : 'var(--primary)';
      html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);${n.read?'opacity:.6;':''}">
        <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};margin-top:5px;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:${n.read?'400':'700'};">${esc(n.title)}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px;">${esc(n.message||'')} &middot; ${time}${n.read?' &middot; read':''}</div>
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
          <select class="finp" style="margin:0;width:100px;font-size:10px;padding:4px 6px;" onchange="updateTeamRole('${esc(m.user_id)}',this.value)">
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
      <span style="color:${color};font-weight:700;">${current}/${max >= 9999 ? '∞' : max}</span>
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
  const current = (currentUser && currentUser.plan) || 'free';
  const planData = [
    { id: 'starter', name: 'Starter', price: '$9', tagline: 'Perfect for getting started', features: ['<strong>30</strong> tracked queries', 'Unlimited brands', '2 AI platforms', 'Sentiment analysis'] },
    { id: 'pro', name: 'Pro', price: '$29', tagline: 'For growing businesses', featured: true, features: ['<strong>100</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (8)', 'Sentiment analysis'] },
    { id: 'agency', name: 'Agency', price: '$89', tagline: 'Scale with confidence', features: ['<strong>500</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (20)', 'Sentiment analysis'] },
    { id: 'enterprise', name: 'Enterprise', price: 'Custom', tagline: 'Full power', features: ['<strong>50,000</strong> tracked queries', 'Unlimited brands', 'All 6 AI platforms', 'Competitor tracking (100)', 'API access', 'Priority support'] }
  ];
  el('upgrade-plans').innerHTML = '<div class="land-pricing">' + planData.map(p => {
    const isCurrent = p.id === current;
    const btnStyle = isCurrent ? 'width:100%;opacity:.5;cursor:default;' : 'width:100%;';
    const btnText = isCurrent ? 'CURRENT PLAN' : 'SWITCH TO ' + p.name.toUpperCase();
    return `<div class="land-price-card ${p.featured ? 'featured' : ''}"${p.id === 'enterprise' ? ' style="border-color:var(--purple,#9b72ff);"' : ''}>
      <h3${p.id === 'enterprise' ? ' style="color:var(--purple,#9b72ff);"' : ''}>${p.name}</h3>
      <div class="price">${p.price}<span>/mo</span></div>
      <div class="price-sub">${p.tagline}</div>
      <ul>${p.features.map(f => '<li>' + f + '</li>').join('')}</ul>
      <button class="land-btn land-btn-primary" style="${btnStyle}" onclick="doUpgrade('${p.id}')" ${isCurrent ? 'disabled' : ''}>${btnText}</button>
    </div>`;
  }).join('') + '</div>';
  openModal('upgrade-modal');
}

async function doUpgrade(plan) {
  const current = (currentUser && currentUser.plan) || 'free';
  if (plan === current) return;
  const tiers = {free:0, starter:1, pro:2, agency:3, enterprise:4};
  const action = tiers[plan] > tiers[current] ? 'upgrade' : tiers[plan] < tiers[current] ? 'downgrade' : 'switch';
  if (!confirm(`${action === 'downgrade' ? 'Downgrade' : 'Upgrade'} to ${plan.toUpperCase()} plan?`)) return;
  try {
    // Upgrades go through payment checkout; downgrades are self-service
    if (action === 'upgrade') {
      const data = await api('POST', '/api/payments/checkout', { plan });
      if (data.checkout_url) {
        window.open(data.checkout_url, '_blank');
        toast('Redirecting to payment...', 'ok');
      } else {
        toast('Failed to create checkout session. Contact support.', 'err');
      }
      return;
    }
    const data = await api('POST', '/api/upgrade', { plan });
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

