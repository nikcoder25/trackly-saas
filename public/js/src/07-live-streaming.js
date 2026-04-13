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
    notif.setAttribute('role', 'status');
    notif.setAttribute('aria-live', 'polite');
    notif.innerHTML = `
      <div class="live-notif-icon" aria-hidden="true" style="background:${t.bg || 'var(--bg3)'};color:${t.color || 'var(--muted)'};">${t.logo || '?'}</div>
      <div class="live-notif-body">
        <div class="live-notif-title">${esc(result.platform)}</div>
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
        queryEl.innerHTML = esc(result.query||'');
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
      const keyId = plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai');
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
    const chatAI = ['ChatGPT', 'Claude', 'Grok'];
    const searchAI = ['Perplexity', 'Gemini'];
    let chatTotal = 0, chatFound = 0, searchTotal = 0, searchFound = 0;
    for (const p of chatAI) { chatTotal += c.platCounts[p] || 0; chatFound += c.platMentions[p] || 0; }
    for (const p of searchAI) { searchTotal += c.platCounts[p] || 0; searchFound += c.platMentions[p] || 0; }
    const chatSOV = chatTotal > 0 ? Math.round(chatFound / chatTotal * 100) : null;
    const searchSOV = searchTotal > 0 ? Math.round(searchFound / searchTotal * 100) : null;
    const _sc = window.sovColor || function(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; };
    let ch = '';
    if (chatSOV !== null) ch += `<div class="ov-cat-card" style="border-top:2px solid ${_sc(chatSOV)};"><div class="ov-cat-label">💬 Chat AI</div><div class="ov-cat-val" style="color:${_sc(chatSOV)};">${chatSOV}%</div><div class="ov-cat-detail">Mentioned in ${chatFound} of ${chatTotal} responses</div><div class="ov-cat-sub">ChatGPT · Claude · Grok</div></div>`;
    if (searchSOV !== null) ch += `<div class="ov-cat-card" style="border-top:2px solid ${_sc(searchSOV)};"><div class="ov-cat-label">🔍 Search AI</div><div class="ov-cat-val" style="color:${_sc(searchSOV)};">${searchSOV}%</div><div class="ov-cat-detail">Mentioned in ${searchFound} of ${searchTotal} responses</div><div class="ov-cat-sub">Perplexity · Gemini</div></div>`;
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

