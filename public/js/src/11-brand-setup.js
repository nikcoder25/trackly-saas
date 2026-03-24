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

}

async function saveWebhook(){
  const b = brand(); if (!b) return;
  const url = el('alert-webhook-url').value.trim();
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { webhookUrl: url });
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    invalidateCache('/api/brands');
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
    const isActive = keyStatus[plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai')];
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

  // Render queries in setup
  renderSetupQueries();
}

// ─── SETUP PAGE QUERY MANAGEMENT ──────────────────────────────────
let _setupSelectMode = false;
let _setupSelectedIndices = new Set();

function renderSetupQueries(){
  const b = brand(); if (!b) return;
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);

  const countEl = el('setup-query-count');
  if (countEl) {
    const atLimit = totalPrompts >= promptLimit;
    countEl.textContent = totalPrompts + ' / ' + (promptLimit >= 9999 ? '∞' : promptLimit) + ' prompts';
    countEl.style.color = atLimit ? 'var(--amber)' : 'var(--muted)';
  }
  const limitMsg = el('setup-query-limit-msg');
  if (limitMsg) {
    if (totalPrompts >= promptLimit) {
      limitMsg.textContent = 'Prompt limit reached (' + totalPrompts + '/' + promptLimit + '). Remove a query or upgrade your plan.';
      limitMsg.style.display = 'block';
    } else {
      limitMsg.style.display = 'none';
    }
  }

  const container = el('setup-query-tags');
  if (!container) return;
  container.innerHTML = '';
  (b.queries||[]).forEach((q, i) => {
    const tag = document.createElement('span');
    tag.className = 'query-tag';
    if (_setupSelectMode) {
      tag.classList.add('query-tag-selectable');
      if (_setupSelectedIndices.has(i)) tag.classList.add('query-tag-selected');
      tag.addEventListener('click', function(){ setupToggleQuerySelection(i); });
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = _setupSelectedIndices.has(i);
      cb.className = 'query-select-cb';
      cb.addEventListener('click', function(e){ e.stopPropagation(); setupToggleQuerySelection(i); });
      tag.insertBefore(cb, tag.firstChild);
    }
    tag.appendChild(document.createTextNode(q + ' '));
    if (!_setupSelectMode) {
      const btn = document.createElement('button');
      btn.textContent = '\u2715';
      btn.addEventListener('click', function(){ setupRemoveQuery(i); });
      tag.appendChild(btn);
    }
    container.appendChild(tag);
  });

  if (!(b.queries||[]).length) {
    container.innerHTML = '<span style="font-family:var(--mono);font-size:11px;color:var(--muted);">No queries yet. Add queries below.</span>';
  }
}

async function setupAddQuery(){
  const inp = el('setup-query-input');
  const q = inp.value.trim();
  if (!q) return;
  const b = brand(); if (!b) return;
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
  if (totalPrompts >= promptLimit) {
    toast('Prompt limit reached (' + totalPrompts + '/' + promptLimit + '). Upgrade your plan.', 'err');
    return;
  }
  const existing = new Set((b.queries||[]).map(x => x.toLowerCase()));
  if (existing.has(q.toLowerCase())) { toast('Query already exists', 'err'); return; }
  const queries = [...(b.queries||[]), q];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    inp.value = '';
    renderSetupQueries();
    toast('Query added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function setupRemoveQuery(i){
  const b = brand();
  const q = (b.queries||[])[i];
  if (!confirm('Remove query "' + (q || '') + '"?')) return;
  const queries = (b.queries||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    renderSetupQueries();
    toast('Query removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

function setupToggleBulkAdd(){
  const box = el('setup-bulk-query-box');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') {
    el('setup-bulk-query-input').focus();
    el('setup-bulk-query-input').oninput = function(){
      const lines = this.value.split('\n').filter(l => l.trim());
      el('setup-bulk-count-hint').textContent = lines.length + ' quer' + (lines.length===1?'y':'ies') + ' detected';
    };
  }
}

async function setupBulkAddQueries(){
  const b = brand(); if (!b) return;
  const raw = el('setup-bulk-query-input').value;
  const newQs = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!newQs.length) { toast('No queries entered', 'err'); return; }
  const existing = new Set((b.queries||[]).map(q => q.toLowerCase()));
  const unique = newQs.filter(q => !existing.has(q.toLowerCase()));
  if (!unique.length) { toast('All queries already exist', 'err'); return; }
  const promptLimit = currentUser.limits ? currentUser.limits.prompts : 5;
  const totalPrompts = brands.reduce((sum, br) => sum + (br.queries||[]).length, 0);
  if (totalPrompts + unique.length > promptLimit) {
    const allowed = promptLimit - totalPrompts;
    if (allowed <= 0) { toast('Prompt limit reached. Upgrade your plan.', 'err'); return; }
    unique.splice(allowed);
    toast('Only ' + allowed + ' prompts added (plan limit: ' + promptLimit + ')', 'warn');
  }
  const queries = [...(b.queries||[]), ...unique];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    el('setup-bulk-query-input').value = '';
    el('setup-bulk-query-box').style.display = 'none';
    renderSetupQueries();
    toast(unique.length + ' quer' + (unique.length===1?'y':'ies') + ' added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function setupClearAllQueries(){
  const b = brand(); if (!b) return;
  if (!(b.queries||[]).length) { toast('No queries to clear', 'warn'); return; }
  if (!confirm('Clear all ' + b.queries.length + ' queries? This cannot be undone.')) return;
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries: [] });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    renderSetupQueries();
    toast('All queries cleared', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

function setupToggleSelectMode(){
  _setupSelectMode = !_setupSelectMode;
  _setupSelectedIndices.clear();
  const btn = el('setup-select-mode-btn');
  const delBtn = el('setup-delete-selected-btn');
  const selAllBtn = el('setup-select-all-btn');
  const deselAllBtn = el('setup-deselect-all-btn');
  if (btn) btn.textContent = _setupSelectMode ? '✓ SELECTING' : '☐ SELECT';
  if (delBtn) delBtn.style.display = _setupSelectMode ? '' : 'none';
  if (selAllBtn) selAllBtn.style.display = _setupSelectMode ? '' : 'none';
  if (deselAllBtn) deselAllBtn.style.display = _setupSelectMode ? '' : 'none';
  setupUpdateSelectedCount();
  renderSetupQueries();
}

function setupToggleQuerySelection(i){
  if (_setupSelectedIndices.has(i)) _setupSelectedIndices.delete(i);
  else _setupSelectedIndices.add(i);
  setupUpdateSelectedCount();
  renderSetupQueries();
}

function setupSelectAllQueries(){
  const b = brand();
  (b.queries||[]).forEach((_, i) => _setupSelectedIndices.add(i));
  setupUpdateSelectedCount();
  renderSetupQueries();
}

function setupDeselectAllQueries(){
  _setupSelectedIndices.clear();
  setupUpdateSelectedCount();
  renderSetupQueries();
}

function setupUpdateSelectedCount(){
  const countEl = el('setup-selected-count');
  if (countEl) countEl.textContent = _setupSelectedIndices.size;
  const delBtn = el('setup-delete-selected-btn');
  if (delBtn) delBtn.disabled = _setupSelectedIndices.size === 0;
}

async function setupDeleteSelectedQueries(){
  const b = brand(); if (!b) return;
  const count = _setupSelectedIndices.size;
  if (count === 0) { toast('No queries selected', 'warn'); return; }
  if (!confirm('Delete ' + count + ' selected quer' + (count===1?'y':'ies') + '? This cannot be undone.')) return;
  const queries = (b.queries||[]).filter((_, idx) => !_setupSelectedIndices.has(idx));
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { queries });
    invalidateCache('/api/brands');
    const idx = brands.findIndex(x => x.id === b.id);
    brands[idx] = data.brand;
    _setupSelectedIndices.clear();
    _setupSelectMode = false;
    const btn = el('setup-select-mode-btn');
    const delBtn = el('setup-delete-selected-btn');
    const selAllBtn = el('setup-select-all-btn');
    const deselAllBtn = el('setup-deselect-all-btn');
    if (btn) { btn.textContent = '☐ SELECT'; }
    if (delBtn) delBtn.style.display = 'none';
    if (selAllBtn) selAllBtn.style.display = 'none';
    if (deselAllBtn) deselAllBtn.style.display = 'none';
    renderSetupQueries();
    toast(count + ' quer' + (count===1?'y':'ies') + ' removed', 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

async function setupAiGenerateQueries(){
  const b = brand(); if (!b) return;
  if (!b.name) { toast('Set brand name first', 'err'); return; }
  if (!b.industry) { toast('Set industry first', 'err'); return; }
  const btn = el('setup-ai-gen-btn');
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
    renderSetupQueries();
    toast(newQs.length + ' AI-generated queries added', 'ok');
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.textContent = origText; btn.disabled = false; }
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
    invalidateCache('/api/brands');
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
    localStorage.setItem('livesov_brand', currentBrandId);
    renderBrandSelect();
    el('brand-select').value = currentBrandId;
    closeModal('add-brand-modal');
    renderAll();
    toast('Brand "'+name+'" created — running first scan...', 'ok');
    // Auto-run queries after brand creation so new users see results immediately
    const queryCount = (data.brand.queries || []).length;
    if (queryCount > 0) {
      setTimeout(() => runQueries(), 500);
    }
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
    localStorage.setItem('livesov_brand', currentBrandId);
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

