async function renderApiLogs(){
  const container = el('apilogs-content');
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">Loading API call logs...</div>';

  // Client-side errors banner (if any)
  let errBanner = '';
  const clientErrors = getStoredRunErrors();
  if (clientErrors.length > 0) {
    errBanner = `<div style="margin-bottom:14px;padding:12px 16px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.04);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:12px;"><span style="color:var(--red);font-weight:700;">${clientErrors.length} recent run failure${clientErrors.length>1?'s':''}</span> <span style="color:var(--muted);">— check console for details</span></div>
      <button onclick="clearStoredRunErrors();renderApiLogs();" style="background:none;border:1px solid var(--border);color:var(--muted);font-size:10px;padding:4px 12px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);">DISMISS</button>
    </div>`;
  }

  // Load server logs
  try {
    const b = brand();
    const brandParam = b ? '&brandId=' + b.id : '';
    const data = await api('GET', '/api/api-logs?limit=200' + brandParam);
    const logs = data.logs || [];
    const stats = data.stats || {};
    if (!logs.length) {
      container.innerHTML = errBanner + `<div class="card" style="text-align:center;padding:32px;">
        <div style="font-size:28px;margin-bottom:8px;">&#128225;</div>
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">No API Calls Yet</div>
        <div style="color:var(--muted);font-size:12px;">Run queries to see every API call tracked here.</div>
      </div>`;
      return;
    }

    // Stats summary line — recalculate cost to include client-estimated costs for all platforms
    let recalcCost = 0;
    logs.forEach(l => {
      recalcCost += parseFloat(l.cost) || clientEstimateCost(l.model, l.tokens_in, l.tokens_out);
    });
    const totalCost24h = recalcCost > 0 ? '$' + recalcCost.toFixed(4) : '$0.00';
    const totalTokens24h = ((stats.total_tokens_in || 0) + (stats.total_tokens_out || 0)).toLocaleString();
    const statsSummary = `<div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-bottom:14px;">
      Last 24h: <span style="color:var(--green);font-weight:600;">${stats.success || 0} ok</span> · <span style="color:${(stats.errors||0) > 0 ? 'var(--red)' : 'var(--muted)'};">${stats.errors || 0} errors</span> · ${stats.platforms_used || 0} platforms · avg ${stats.avg_ms || 0}ms · <span style="color:var(--amber);font-weight:700;">${totalCost24h}</span> cost · ${totalTokens24h} tokens
    </div>`;

    // Group logs by run_id
    const runMap = {};
    const runGroups = [];
    logs.forEach(log => {
      if (log.run_id) {
        if (!runMap[log.run_id]) {
          runMap[log.run_id] = { id: log.run_id, logs: [], totalCost: 0, totalTokens: 0, ok: 0, errors: 0, platforms: new Set(), startTime: null, endTime: null };
          runGroups.push(runMap[log.run_id]);
        }
        const g = runMap[log.run_id];
        g.logs.push(log);
        const logCost = parseFloat(log.cost) || clientEstimateCost(log.model, log.tokens_in, log.tokens_out);
        g.totalCost += logCost;
        g.totalTokens += (log.tokens_in || 0) + (log.tokens_out || 0);
        if (log.status === 'error') g.errors++; else g.ok++;
        g.platforms.add(log.platform);
        const t = new Date(log.created_at).getTime();
        if (!g.startTime || t < g.startTime) g.startTime = t;
        if (!g.endTime || t > g.endTime) g.endTime = t;
      }
    });

    // Build table
    let tbl = `<div class="card" style="padding:0;overflow:hidden;">
      <div style="overflow-x:auto;max-height:700px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead style="position:sticky;top:0;z-index:1;"><tr style="background:var(--bg3);">
        <th class="th">Time</th>
        <th class="th">Platform</th>
        <th class="th">Model</th>
        <th class="th">Query</th>
        <th class="th">Status</th>
        <th class="th">Time</th>
        <th class="th">Cost</th>
      </tr></thead><tbody>`;

    // Build render items (grouped runs interleaved)
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
        const timeStr = startDt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
        const durationSec = g.endTime && g.startTime ? Math.round((g.endTime - g.startTime) / 1000) : 0;
        const durStr = durationSec >= 60 ? Math.floor(durationSec/60) + 'm ' + (durationSec%60) + 's' : durationSec + 's';
        const costStr = g.totalCost > 0 ? '$' + g.totalCost.toFixed(3) : '$0.00';
        tbl += `<tr style="background:rgba(59,130,246,.05);border-top:2px solid rgba(59,130,246,.2);cursor:pointer;" onclick="let s=this.nextElementSibling;while(s&&s.dataset.runid==='${g.id}'){s.style.display=s.style.display==='none'?'':'none';s=s.nextElementSibling;}">
          <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:700;white-space:nowrap;">▶ ${esc(timeStr)}</td>
          <td class="td" style="font-weight:700;font-size:11px;">${g.ok + g.errors} calls · ${[...g.platforms].length} platforms</td>
          <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--muted);">${[...g.platforms].join(', ')}</td>
          <td class="td" style="font-size:10px;color:var(--muted);">${g.ok} ok${g.errors ? ', <span style="color:var(--red);">' + g.errors + ' errors</span>' : ''}</td>
          <td class="td"><span class="status-found">${g.ok}</span></td>
          <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--muted);">${durStr}</td>
          <td class="td" style="font-family:var(--mono);font-size:11px;color:var(--amber);font-weight:700;">${costStr}</td>
        </tr>`;
        return;
      }

      const log = item.log;
      const dt = new Date(log.created_at);
      const timeStr = dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      const isErr = log.status === 'error';
      const t = PLAT_THEME[log.platform] || {};
      const queryShort = (log.query || '').length > 40 ? log.query.substring(0, 40) + '...' : (log.query || '—');
      const respTime = log.response_ms ? (log.response_ms/1000).toFixed(1) + 's' : '—';
      const costVal = parseFloat(log.cost) || clientEstimateCost(log.model, log.tokens_in, log.tokens_out);
      const costStr = costVal > 0 ? '$' + costVal.toFixed(3) : '—';
      const modelShort = (log.model || '').replace(/^(gpt-|claude-|gemini-|grok-|sonar-)/, '').substring(0, 18);
      const dataAttr = item.runId ? ` data-runid="${esc(item.runId)}"` : '';

      const errMsg = isErr && log.error ? log.error : '';
      const errId = isErr && errMsg ? 'err-' + (log.id || Math.random().toString(36).slice(2)) : '';
      const copyErrJson = isErr && errMsg ? JSON.stringify({platform:log.platform,model:log.model||'',query:log.query||'',status:log.http_status||'ERR',error:log.error,time:log.created_at}) : '';

      tbl += `<tr class="trow"${dataAttr} style="${item.runId ? 'display:none;' : ''}${isErr ? 'background:rgba(239,68,68,.04);' : ''}">
        <td class="td" style="font-family:var(--mono);font-size:10px;white-space:nowrap;${item.runId ? 'padding-left:24px;' : ''}">${esc(timeStr)}</td>
        <td class="td" style="color:${t.color || 'var(--text)'};font-weight:700;font-size:11px;">${esc(log.platform)}</td>
        <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--muted);">${esc(modelShort || '—')}</td>
        <td class="td" style="font-size:11px;" title="${esc(log.query || '')}">${esc(queryShort)}</td>
        <td class="td" style="text-align:center;"><span style="color:${isErr ? 'var(--red)' : 'var(--green)'};font-weight:700;font-size:10px;">${log.http_status || (isErr ? 'ERR' : '200')}</span></td>
        <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--muted);">${respTime}</td>
        <td class="td" style="font-family:var(--mono);font-size:10px;color:var(--amber);font-weight:600;">${costStr}</td>
      </tr>`;
      if (isErr && errMsg) {
        tbl += `<tr${dataAttr} style="${item.runId ? 'display:none;' : ''}background:rgba(239,68,68,.04);">
          <td class="td" colspan="7" style="padding:6px 16px 10px ${item.runId ? '24px' : '16px'};">
            <div style="display:flex;align-items:flex-start;gap:10px;">
              <div style="flex:1;font-family:var(--mono);font-size:10px;color:var(--red);line-height:1.5;word-break:break-all;" id="${errId}">${esc(errMsg)}</div>
              <button onclick="copyLogError(this, \`${escAttr(copyErrJson)}\`)" style="flex-shrink:0;background:none;border:1px solid rgba(239,68,68,.3);color:var(--red);font-size:9px;padding:3px 10px;cursor:pointer;font-family:var(--mono);border-radius:var(--radius-xs);white-space:nowrap;" title="Copy full error details">Copy Error</button>
            </div>
          </td>
        </tr>`;
      }
    });

    tbl += '</tbody></table></div></div>';

    const countLine = logs.length >= 200
      ? `<div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--muted);padding:10px 0;">Showing 200 of ${stats.total_calls || 200}+ API calls</div>`
      : `<div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--muted);padding:10px 0;">Showing ${logs.length} of ${stats.total_calls || logs.length} API calls</div>`;

    container.innerHTML = errBanner + statsSummary + tbl + countLine;

  } catch(e) {
    container.innerHTML = errBanner + `<div style="color:var(--red);font-family:var(--mono);font-size:11px;padding:16px;">Failed to load logs: ${esc(e.message)}</div>`;
  }
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
  const starter = users.filter(u => u.plan === 'starter').length;
  const pro = users.filter(u => u.plan === 'pro').length;
  const agency = users.filter(u => u.plan === 'agency').length;
  const stats = [
    { label: 'Total Users', value: total, color: 'var(--text)' },
    { label: 'Free Plan', value: free, color: 'var(--muted)' },
    { label: 'Starter Plan', value: starter, color: 'var(--amber)' },
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
  if (!confirm('This will make you the admin of this Livesov instance. Continue?')) return;
  try {
    // Try without secret first (works when ADMIN_SECRET is not configured)
    let data;
    try {
      data = await api('POST', '/api/admin/make-first-admin');
    } catch(e) {
      // If server requires admin secret, prompt for it
      if (e.message && e.message.toLowerCase().includes('admin secret')) {
        const secret = prompt('Enter the ADMIN_SECRET to become admin:');
        if (!secret) return;
        data = await api('POST', '/api/admin/make-first-admin', null, { 'X-Admin-Key': secret });
      } else {
        throw e;
      }
    }
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

