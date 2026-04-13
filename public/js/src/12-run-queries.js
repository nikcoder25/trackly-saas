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
            localStorage.setItem('livesov_active_run', JSON.stringify({
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
    localStorage.removeItem('livesov_active_run');

    clearInterval(timerInt);
    fill.style.width = '100%';

    // Reload fresh brand data from API (the done event only contains result summary
    // to avoid sending massive payloads that freeze the browser)
    invalidateCache('/api/brands');
    try {
      const freshData = await api('GET', '/api/brands?_t=' + Date.now());
      if (freshData.brands) {
        brands = freshData.brands;
        renderBrandSelect();
        if (currentBrandId) el('brand-select').value = currentBrandId;
      }
    } catch(_e) { console.warn('[Livesov]', _e.message || _e); }

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
    invalidateCache('/api/brands');
    try {
      const freshData = await api('GET', '/api/brands?_t=' + Date.now());
      if (freshData.brands) {
        brands = freshData.brands;
        renderBrandSelect();
        if (currentBrandId) el('brand-select').value = currentBrandId;
      }
    } catch(_e) { console.warn('[Livesov]', _e.message || _e); }

    localStorage.removeItem('livesov_active_run');
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
          localStorage.removeItem('livesov_active_run');

          if (data.status === 'done') {
            if (fill) { fill.style.width = '100%'; fill.style.background = ''; }
            if (statusTxt) statusTxt.style.color = '';

            // Reload fresh brand data
            invalidateCache('/api/brands');
            try {
              const freshData = await api('GET', '/api/brands?_t=' + Date.now());
              if (freshData.brands) {
                brands = freshData.brands;
                renderBrandSelect();
                if (currentBrandId) el('brand-select').value = currentBrandId;
              }
            } catch(_e) { console.warn('[Livesov]', _e.message || _e); }

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
            invalidateCache('/api/brands');
            try {
              const freshData = await api('GET', '/api/brands?_t=' + Date.now());
              if (freshData.brands) { brands = freshData.brands; renderBrandSelect(); if (currentBrandId) el('brand-select').value = currentBrandId; }
            } catch(_e) { console.warn('[Livesov]', _e.message || _e); }

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
          localStorage.removeItem('livesov_active_run');
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
  const stored = localStorage.getItem('livesov_active_run');
  if (!stored) return;
  let runInfo;
  try { runInfo = JSON.parse(stored); } catch(_) { localStorage.removeItem('livesov_active_run'); return; }

  // Discard runs older than 10 minutes (server cleans up after 10 min too)
  if (Date.now() - runInfo.startedAt > 10 * 60 * 1000) {
    localStorage.removeItem('livesov_active_run');
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
      localStorage.removeItem('livesov_active_run');
      invalidateCache('/api/brands');
      try {
        const freshData = await api('GET', '/api/brands?_t=' + Date.now());
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
      } catch(_e) { console.warn('[Livesov]', _e.message || _e); }
      if (data.status === 'done') {
        toast('Query run completed while you were away. Results are ready!', 'ok');
      }
    }
  } catch(_) {
    // Run not found — probably already cleaned up, just clear localStorage
    localStorage.removeItem('livesov_active_run');
  }
}

// ─── API LOGS / DIAGNOSTICS ─────────────────────────────────────
