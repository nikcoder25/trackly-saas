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
  el('ov-brand-title').textContent = presetTitle ? (b.name || 'Overview') + ' - ' + presetTitle : (b.name || 'Overview');
  const baseSub = [b.industry, b.city].filter(Boolean).join(' · ') || 'Select a brand and run queries to see results.';
  el('ov-sub').textContent = baseSub;

  // Header actions: Run button + last run age (live countdown)
  const { text: runAgeText, dot: ageDotClass } = _fmtRunAge(lastRun);
  const actionsEl = el('ov-header-actions');
  if (runningQueries) {
    actionsEl.innerHTML = `<div class="ov-live-badge"><span class="ov-live-dot"></span>RUNNING</div>`;
  } else {
    let actionsHtml = (queries > 0 && currentUser && currentUser.role === 'admin') ? `<button onclick="runQueries()" class="ov-run-btn">▶ RUN NOW</button>` : '';
    // PDF Report button - Pro plan and above only
    const pdfPlans = ['pro', 'agency', 'enterprise', 'owner'];
    const userPlan = (currentUser && currentUser.plan) || 'free';
    if (pdfPlans.includes(userPlan) && lastRun) {
      actionsHtml += `<button onclick="downloadPdfReport()" class="ov-pdf-btn" title="Download PDF Report">&#128196; PDF Report</button>`;
    } else if (!pdfPlans.includes(userPlan) && lastRun) {
      actionsHtml += `<button onclick="showUpgradeModal('PDF reports are available on Pro plan and above.')" class="ov-pdf-btn ov-pdf-btn-locked" title="Upgrade to Pro for PDF reports">&#128274; PDF Report</button>`;
    }
    actionsEl.innerHTML = actionsHtml;
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
        const overdueMs = Math.abs(diffMs);
        const oh = Math.floor(overdueMs / 3600000);
        const om = Math.floor((overdueMs % 3600000) / 60000);
        const overdueText = oh > 0 ? oh + 'h ' + om + 'm' : om + 'm';
        el('ov-next-run-text').textContent = 'Overdue by ' + overdueText + ' - waiting for next scheduled run';
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
      <div class="ov-hero-stat"><div class="ov-hero-stat-val">${queries} / ${qLimit >= 9999 ? '∞' : qLimit}</div><div class="ov-hero-stat-lbl">Queries / Limit</div></div>
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
    el('ov-queries').textContent = queries + ' / ' + (qLimit >= 9999 ? '∞' : qLimit);
    el('ov-queries').style.color = (qLimit < 9999 && queries >= qLimit) ? 'var(--red)' : '';
    el('ov-last-run-age').textContent = runAgeText;
    el('ov-last-run-age').style.color = ageDotClass === 'bad' ? 'var(--red)' : ageDotClass === 'warn' ? 'var(--amber)' : '';

    // Run duration - show how long the last crawl took
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
  const _ovChatAI = new Set(['ChatGPT', 'Claude', 'Grok']);
  const _ovSearchAI = new Set(['Perplexity', 'Gemini']);
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

    // Use global sovColor function (not the local sovColor string variable)
    const _catColor = window.sovColor || function(v) { return v >= 40 ? 'var(--green)' : v > 0 ? 'var(--amber)' : 'var(--red)'; };

    let catHtml = '';
    catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${_catColor(chatSOV)};">
      <div class="ov-cat-label">💬 Chat AI SOV</div>
      <div class="ov-cat-val" style="color:${_catColor(chatSOV)};">${chatSOV}%</div>
      <div class="ov-cat-detail">Mentioned in ${_ovChatMentioned} of ${_ovChatTotal} responses</div>
      <div class="ov-cat-sub">ChatGPT · Claude · Grok</div>
    </div>`;
    catHtml += `<div class="ov-cat-card" style="border-top:2px solid ${_catColor(searchSOV)};">
      <div class="ov-cat-label">🔍 Search AI SOV</div>
      <div class="ov-cat-val" style="color:${_catColor(searchSOV)};">${searchSOV}%</div>
      <div class="ov-cat-detail">Mentioned in ${_ovSearchMentioned} of ${_ovSearchTotal} responses</div>
      <div class="ov-cat-sub">Perplexity · Gemini</div>
    </div>`;
    if (best) {
      catHtml += `<div class="ov-cat-card" style="border-top:2px solid var(--green);">
        <div class="ov-cat-label">🏆 Best Platform</div>
        <div class="ov-cat-val" style="color:var(--green);">${esc(best[0])}</div>
        <div class="ov-cat-sub">${best[1]}% SOV - strongest visibility</div>
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
      tips.push({ type: 'gap', icon: '⚡', title: 'Platform Gap Detected', text: `Strong on <strong>${strongPlats.join(', ')}</strong> but invisible on <strong>${missingPlats.join(', ')}</strong>. Different AI platforms pull from different sources - diversify your online presence.`, color: 'var(--amber)' });
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
    const keyId = plat.toLowerCase().replace(/ /g,'').replace('chatgpt','openai');
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
          const name = m[1].trim().replace(/\*+/g, '').replace(/\s*[-\u2014:].*/,'').trim();
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
    let summaryHtml = `<div class="ov-card"><div class="ov-card-head"><div class="ov-card-title">${summaryTitle} - ${timeStr}</div></div>`;
    if (errors.length > 0) {
      summaryHtml += `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);padding:10px 14px;margin-bottom:12px;font-family:var(--mono);font-size:11px;border-radius:var(--radius-xs);">`;
      summaryHtml += `<span style="color:var(--red);font-weight:700;">${errors.length} API error${errors.length>1?'s':''}</span>`;
      summaryHtml += `<span style="color:var(--muted);margin-left:8px;">- Check API keys or <a href="#" onclick="go('activitylog');return false;" style="color:var(--red);text-decoration:none;">view logs</a></span>`;
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
    qCountEl.textContent = totalPrompts + ' / ' + (promptLimit >= 9999 ? '∞' : promptLimit) + ' prompts';
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
            y: { min: 0, max: 100, ticks: { color: '#7a8194', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,.06)' } }
          }
        }
      });
    }).catch(() => {});
  } else {
    miniTrend.style.display = 'none';
  }

  // Load Google AI Overviews data (non-blocking)
  loadAiOverviews();
}

async function downloadPdfReport() {
  const b = brand();
  if (!b) { toast('No brand selected', 'err'); return; }
  const btn = document.querySelector('.ov-pdf-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  try {
    const res = await fetch(API + '/api/brands/' + b.id + '/report/pdf', {
      headers: { 'Authorization': 'Bearer ' + token },
      credentials: 'include'
    });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        if (json.planLimit) showUpgradeModal(json.error);
        else toast(json.error || 'Failed to generate report', 'err');
      } else {
        toast('Failed to generate report', 'err');
      }
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('PDF report downloaded', 'ok');
  } catch (e) { toast('Failed to download report: ' + e.message, 'err'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#128196; PDF Report'; }
  }
}

async function ovAddQuery(){
  const inp = el('ov-new-query');
  const q = inp.value.trim();
  if (!q) return;
  const b = brand();
  if (!b) return;
  // Total prompts check - count across all brands
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

// -- MULTI-SELECT QUERY MANAGEMENT ------------------
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

// ═══════════════════════════════════════════════════════════════════
// GOOGLE AI OVERVIEWS (DataForSEO integration)
// ═══════════════════════════════════════════════════════════════════

let _aioData = null;
let _aioLoading = false;

async function loadAiOverviews() {
  const b = brand();
  if (!b) return;
  const container = el('ov-ai-overviews');
  if (!container) return;

  try {
    const data = await api('GET', '/api/brands/' + b.id + '/ai-overviews');
    _aioData = data;

    if (!data.configured) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    renderAiOverviews(data);
  } catch (e) {
    container.style.display = 'none';
  }
}

async function checkAiOverviews() {
  const b = brand();
  if (!b) return;
  if (_aioLoading) return;

  const btn = el('ov-aio-check-btn');
  const loadingEl = el('ov-aio-loading');
  const resultsEl = el('ov-aio-results');

  _aioLoading = true;
  if (btn) { btn.textContent = 'CHECKING...'; btn.disabled = true; }
  if (loadingEl) loadingEl.style.display = 'block';
  if (resultsEl) resultsEl.style.display = 'none';

  try {
    const data = await api('POST', '/api/brands/' + b.id + '/ai-overviews/check');
    _aioData = { results: data.results, summary: null, configured: true };
    // Recompute summary
    const rows = data.results || [];
    const total = rows.length;
    const withAio = rows.filter(r => r.has_ai_overview).length;
    const mentioned = rows.filter(r => r.has_ai_overview && r.brand_mentioned).length;
    _aioData.summary = {
      total, withAiOverview: withAio, withoutAiOverview: total - withAio,
      brandMentioned: mentioned, brandNotMentioned: withAio - mentioned,
      aiOverviewRate: total > 0 ? Math.round((withAio / total) * 100) : 0,
      brandMentionRate: withAio > 0 ? Math.round((mentioned / withAio) * 100) : 0,
    };
    renderAiOverviews(_aioData);
    toast('AI Overview check complete: ' + data.checked + ' queries checked', 'ok');
  } catch (e) {
    toast('AI Overview check failed: ' + e.message, 'err');
  } finally {
    _aioLoading = false;
    if (btn) { btn.textContent = 'CHECK NOW'; btn.disabled = false; }
    if (loadingEl) loadingEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = '';
  }
}

function renderAiOverviews(data) {
  const summaryEl = el('ov-aio-summary');
  const resultsEl = el('ov-aio-results');
  if (!summaryEl || !resultsEl) return;

  const s = data.summary;
  const rows = data.results || [];

  if (!rows.length) {
    summaryEl.innerHTML = '<div style="color:var(--muted);font-size:12px;font-family:var(--mono);">No AI Overview data yet. Click CHECK NOW to scan your queries.</div>';
    resultsEl.innerHTML = '';
    return;
  }

  // Summary bar
  const aioRate = s ? s.aiOverviewRate : 0;
  const mentionRate = s ? s.brandMentionRate : 0;
  const aioColor = aioRate >= 50 ? 'var(--amber)' : aioRate > 0 ? 'var(--blue)' : 'var(--muted)';
  const mentionColor = mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--amber)' : 'var(--red)';
  const lastChecked = rows[0]?.checked_at ? new Date(rows[0].checked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

  summaryEl.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
      <div style="flex:1;min-width:120px;background:var(--bg2);border:1px solid var(--border);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-size:20px;font-weight:800;color:${aioColor};font-family:var(--mono);">${aioRate}%</div>
        <div style="font-size:10px;color:var(--muted);font-family:var(--mono);letter-spacing:.5px;margin-top:2px;">AI OVERVIEW RATE</div>
        <div style="font-size:10px;color:var(--muted);">${s ? s.withAiOverview : 0} / ${s ? s.total : 0} queries</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg2);border:1px solid var(--border);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-size:20px;font-weight:800;color:${mentionColor};font-family:var(--mono);">${mentionRate}%</div>
        <div style="font-size:10px;color:var(--muted);font-family:var(--mono);letter-spacing:.5px;margin-top:2px;">BRAND IN AI OVERVIEW</div>
        <div style="font-size:10px;color:var(--muted);">${s ? s.brandMentioned : 0} / ${s ? s.withAiOverview : 0} overviews</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg2);border:1px solid var(--border);padding:12px;border-radius:var(--radius-xs);text-align:center;">
        <div style="font-size:14px;font-weight:700;color:var(--text);font-family:var(--mono);">${lastChecked}</div>
        <div style="font-size:10px;color:var(--muted);font-family:var(--mono);letter-spacing:.5px;margin-top:2px;">LAST CHECKED</div>
      </div>
    </div>`;

  // Results table
  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--mono);">';
  html += '<thead><tr style="border-bottom:1px solid var(--border);text-align:left;">';
  html += '<th style="padding:8px 10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;">QUERY</th>';
  html += '<th style="padding:8px 10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;text-align:center;">AI OVERVIEW</th>';
  html += '<th style="padding:8px 10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;text-align:center;">BRAND FOUND</th>';
  html += '<th style="padding:8px 10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;">COMPETITORS</th>';
  html += '<th style="padding:8px 10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;text-align:center;">CITATIONS</th>';
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    const aioIcon = row.has_ai_overview ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--muted);">&#10005;</span>';
    const brandIcon = row.has_ai_overview ? (row.brand_mentioned ? '<span style="color:var(--green);font-weight:700;">&#10003; Yes</span>' : '<span style="color:var(--red);">&#10005; No</span>') : '<span style="color:var(--muted);">-</span>';
    const competitors = row.competitor_mentions || [];
    const compText = competitors.length > 0 ? competitors.map(c => '<span style="background:rgba(239,68,68,.08);padding:2px 6px;border-radius:4px;font-size:10px;color:var(--red);">' + esc(typeof c === 'string' ? c : c.toString()) + '</span>').join(' ') : '<span style="color:var(--muted);">-</span>';
    const citations = row.citations || [];
    const citeCount = citations.length;

    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:8px 10px;color:var(--text);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(row.query) + '">' + esc(row.query) + '</td>';
    html += '<td style="padding:8px 10px;text-align:center;">' + aioIcon + '</td>';
    html += '<td style="padding:8px 10px;text-align:center;">' + brandIcon + '</td>';
    html += '<td style="padding:8px 10px;">' + compText + '</td>';
    html += '<td style="padding:8px 10px;text-align:center;">' + citeCount + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  resultsEl.innerHTML = html;
}

