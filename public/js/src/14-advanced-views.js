// ═══════════════════════════════════════════════════════════════════
// PROMPT DETAILS VIEW (Epic 2.4) — Redesigned
// ═══════════════════════════════════════════════════════════════════
let _pdVisChart = null, _pdCompChart = null;

async function renderPromptDetails() {
  const b = brand();
  if (!b) return;

  const queries = b.queries || [];
  const metricsEl = el('pd-metrics');
  const tableEl = el('pd-platform-table');
  const runsEl = el('pd-recent-runs');
  const countEl = el('pd-query-count');

  if (!queries.length) {
    metricsEl.innerHTML = '';
    if (countEl) countEl.textContent = '0 queries';
    if (runsEl) runsEl.style.display = 'none';
    tableEl.innerHTML = `<div style="text-align:center;padding:48px 24px;">
      <div style="font-size:36px;margin-bottom:12px;opacity:.3;">&#9671;</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;color:var(--text);">No Queries Configured</div>
      <div style="color:var(--muted);font-size:12px;max-width:300px;margin:0 auto;">Add queries in <a href="#" onclick="go('setup');return false;" style="color:var(--primary);font-weight:600;">Brand Setup</a> to see prompt-level analytics.</div>
    </div>`;
    return;
  }

  // Populate prompt selector
  const sel = el('pd-prompt-select');
  sel.innerHTML = queries.map((q, i) => `<option value="${esc(q)}">${esc(q)}</option>`).join('');

  // Populate platform filter
  const platFilter = el('pd-platform-filter');
  platFilter.innerHTML = '<option value="">All Platforms</option>' +
    PLATS.map(p => `<option value="${p}">${p}</option>`).join('');

  // Show query count
  if (countEl) countEl.textContent = queries.length + ' quer' + (queries.length === 1 ? 'y' : 'ies');

  renderPromptDetail();
}

function refreshPromptDetail() {
  renderPromptDetail();
  toast('Refreshing prompt data...', 'ok');
}

async function renderPromptDetail() {
  const b = brand();
  if (!b) return;
  const prompt = el('pd-prompt-select').value;
  const platform = el('pd-platform-filter').value;
  const days = el('pd-days-filter')?.value || '30';
  if (!prompt) return;

  // Show loading
  const loadingEl = el('pd-loading');
  if (loadingEl) loadingEl.style.display = 'flex';

  try {
    // Load visibility data + history + competitors + recent runs in parallel
    const [visData, histData, compData, runsData] = await Promise.all([
      api('GET', `/api/brands/${b.id}/prompt-visibility`),
      Promise.all([
        api('GET', `/api/brands/${b.id}/prompt-history?prompt=${encodeURIComponent(prompt)}&days=${days}${platform ? '&platform=' + platform : ''}`),
        ensureChartJs()
      ]).then(([h]) => h),
      api('GET', `/api/brands/${b.id}/competitor-analysis`),
      api('GET', `/api/brands/${b.id}/prompt-runs?prompt=${encodeURIComponent(prompt)}&limit=10${platform ? '&platform=' + platform : ''}`).catch(() => ({ runs: [] }))
    ]);

    if (loadingEl) loadingEl.style.display = 'none';

    const promptData = (visData.visibility || []).find(v => v.prompt === prompt);

    // ── METRICS CARDS ──
    const metricsEl = el('pd-metrics');
    if (promptData) {
      const platforms = Object.values(promptData.platforms);
      const totalRuns = platforms.reduce((s, p) => s + (p.total_runs || 0), 0);
      const totalMentions = platforms.reduce((s, p) => s + (p.mention_count || 0), 0);
      const avgRate = totalRuns > 0 ? (totalMentions / totalRuns * 100) : 0;
      const rankedPlatforms = platforms.filter(p => p.avg_rank);
      const avgRank = rankedPlatforms.length > 0 ? rankedPlatforms.reduce((s, p) => s + parseFloat(p.avg_rank), 0) / rankedPlatforms.length : 0;

      // Aggregate sentiment
      const sentAgg = { positive: 0, neutral: 0, negative: 0 };
      platforms.forEach(p => {
        const dist = p.sentiment_distribution || {};
        sentAgg.positive += (dist.positive || 0);
        sentAgg.neutral += (dist.neutral || 0);
        sentAgg.negative += (dist.negative || 0);
      });
      const totalSent = sentAgg.positive + sentAgg.neutral + sentAgg.negative;
      const sentPct = totalSent > 0 ? ((sentAgg.positive / totalSent) * 100).toFixed(0) : 0;
      const domSent = sentAgg.positive >= sentAgg.negative ? 'Positive' : 'Negative';
      const domSentColor = domSent === 'Positive' ? 'var(--green)' : 'var(--red)';
      const platFoundCount = platforms.filter(p => (p.mention_count || 0) > 0).length;

      // Compute trend from history
      const trend = histData.trend || {};
      const trendDir = trend.direction || 'flat';
      const trendPct = trend.changePercent ? Math.abs(trend.changePercent).toFixed(1) : '0';
      const trendClass = trendDir === 'up' ? 'pd-trend-up' : trendDir === 'down' ? 'pd-trend-down' : 'pd-trend-flat';
      const trendArrow = trendDir === 'up' ? '&#9650;' : trendDir === 'down' ? '&#9660;' : '&#8212;';
      const trendText = trendDir === 'flat' ? 'Stable' : trendPct + '%';

      metricsEl.innerHTML = `
        <div class="pd-metric-card pd-m-vis">
          <div class="pd-metric-top">
            <div class="pd-metric-label">Visibility Rate</div>
            <div class="pd-metric-icon">&#9673;</div>
          </div>
          <div class="pd-metric-val" style="color:${avgRate >= 40 ? 'var(--green)' : avgRate > 0 ? 'var(--amber)' : 'var(--red)'};">${avgRate.toFixed(1)}%</div>
          <div class="pd-metric-bar"><div class="pd-metric-bar-fill" style="width:${Math.min(avgRate,100)}%;background:${avgRate >= 40 ? 'var(--green)' : avgRate > 0 ? 'var(--amber)' : 'var(--red)'};"></div></div>
          <div class="pd-metric-sub"><span class="${trendClass}">${trendArrow} ${trendText}</span> <span>vs prev period</span></div>
        </div>
        <div class="pd-metric-card pd-m-plat">
          <div class="pd-metric-top">
            <div class="pd-metric-label">Platforms Found</div>
            <div class="pd-metric-icon">&#9632;</div>
          </div>
          <div class="pd-metric-val" style="color:var(--blue);">${platFoundCount}<span style="font-size:14px;color:var(--muted);font-weight:500;">/${platforms.length}</span></div>
          <div class="pd-metric-bar"><div class="pd-metric-bar-fill" style="width:${platforms.length ? (platFoundCount/platforms.length*100) : 0}%;background:var(--blue);"></div></div>
          <div class="pd-metric-sub">${totalRuns} total runs across ${platforms.length} platforms</div>
        </div>
        <div class="pd-metric-card pd-m-sent">
          <div class="pd-metric-top">
            <div class="pd-metric-label">Sentiment</div>
            <div class="pd-metric-icon">&#9829;</div>
          </div>
          <div class="pd-metric-val" style="color:${domSentColor};">${domSent}</div>
          <div class="pd-metric-bar"><div class="pd-metric-bar-fill" style="width:${sentPct}%;background:var(--green);"></div></div>
          <div class="pd-metric-sub">${sentAgg.positive} pos / ${sentAgg.neutral} neu / ${sentAgg.negative} neg</div>
        </div>
        <div class="pd-metric-card pd-m-rank">
          <div class="pd-metric-top">
            <div class="pd-metric-label">Avg Position</div>
            <div class="pd-metric-icon">&#9733;</div>
          </div>
          <div class="pd-metric-val" style="color:var(--purple);">${avgRank ? '#' + avgRank.toFixed(1) : '—'}</div>
          <div class="pd-metric-bar"><div class="pd-metric-bar-fill" style="width:${avgRank ? Math.max(5, 100 - avgRank * 10) : 0}%;background:var(--purple);"></div></div>
          <div class="pd-metric-sub">${rankedPlatforms.length} platforms with ranking data</div>
        </div>
      `;
    } else {
      metricsEl.innerHTML = ['Visibility Rate', 'Platforms Found', 'Sentiment', 'Avg Position'].map((label, i) => {
        const cls = ['pd-m-vis','pd-m-plat','pd-m-sent','pd-m-rank'][i];
        const icons = ['&#9673;','&#9632;','&#9829;','&#9733;'];
        return `<div class="pd-metric-card ${cls}">
          <div class="pd-metric-top"><div class="pd-metric-label">${label}</div><div class="pd-metric-icon">${icons[i]}</div></div>
          <div class="pd-metric-val" style="color:var(--muted);">—</div>
          <div class="pd-metric-bar"><div class="pd-metric-bar-fill" style="width:0;"></div></div>
          <div class="pd-metric-sub">No data yet</div>
        </div>`;
      }).join('');
    }

    // ── VISIBILITY CHART ──
    if (_pdVisChart) { _pdVisChart.destroy(); _pdVisChart = null; }
    const canvas = document.getElementById('pd-visibility-chart');
    const visPlaceholder = document.getElementById('pd-vis-placeholder');
    const visTrendEl = document.getElementById('pd-vis-trend');
    if (canvas && histData.history && histData.history.length > 0) {
      if (visPlaceholder) visPlaceholder.style.display = 'none';
      canvas.style.display = '';
      const grouped = {};
      histData.history.forEach(h => {
        if (!grouped[h.platform]) grouped[h.platform] = [];
        grouped[h.platform].push(h);
      });
      const datasets = Object.entries(grouped).map(([plat, data]) => ({
        label: plat,
        data: data.map(d => ({ x: d.date, y: d.mentionRate })),
        borderColor: PLAT_THEME[plat]?.color || '#888',
        backgroundColor: PLAT_THEME[plat]?.bg || 'rgba(136,136,136,0.1)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 5
      }));
      _pdVisChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, max: 100, title: { display: true, text: 'Mention Rate %', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.04)' } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11 } } },
            tooltip: { backgroundColor: 'rgba(26,26,46,.9)', padding: 12, titleFont: { size: 12 }, bodyFont: { size: 11 }, cornerRadius: 8 }
          }
        }
      });
      // Show trend badge
      if (visTrendEl && histData.trend) {
        const t = histData.trend;
        const dir = t.direction || 'flat';
        visTrendEl.className = 'pd-trend-badge ' + dir;
        visTrendEl.innerHTML = dir === 'up' ? '&#9650; +' + Math.abs(t.changePercent||0).toFixed(1) + '%' :
          dir === 'down' ? '&#9660; ' + Math.abs(t.changePercent||0).toFixed(1) + '%' : '&#8212; Stable';
      }
    } else if (canvas) {
      canvas.style.display = 'none';
      if (visPlaceholder) visPlaceholder.style.display = 'flex';
      if (visTrendEl) visTrendEl.innerHTML = '';
    }

    // ── COMPETITOR CHART ──
    if (_pdCompChart) { _pdCompChart.destroy(); _pdCompChart = null; }
    const compCanvas = document.getElementById('pd-competitor-chart');
    const compPlaceholder = document.getElementById('pd-comp-placeholder');
    const compCountEl = document.getElementById('pd-comp-count');
    if (compCanvas && compData.topCompetitors && compData.topCompetitors.length > 0) {
      if (compPlaceholder) compPlaceholder.style.display = 'none';
      compCanvas.style.display = '';
      const top = compData.topCompetitors.slice(0, 8);
      if (compCountEl) compCountEl.textContent = compData.topCompetitors.length + ' competitors detected';
      const chartColors = [
        'rgba(79,70,229,0.75)','rgba(16,185,129,0.75)','rgba(245,158,11,0.75)',
        'rgba(239,68,68,0.75)','rgba(59,130,246,0.75)','rgba(139,92,246,0.75)',
        'rgba(236,72,153,0.75)','rgba(20,184,166,0.75)'
      ];
      _pdCompChart = new Chart(compCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: top.map(c => c.competitor),
          datasets: [{
            data: top.map(c => c.total_appearances),
            backgroundColor: chartColors,
            borderWidth: 3,
            borderColor: '#fff',
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '55%',
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
            tooltip: { backgroundColor: 'rgba(26,26,46,.9)', padding: 12, cornerRadius: 8 }
          }
        }
      });
    } else if (compCanvas) {
      compCanvas.style.display = 'none';
      if (compPlaceholder) compPlaceholder.style.display = 'flex';
      if (compCountEl) compCountEl.textContent = '';
    }

    // ── PER-PLATFORM TABLE ──
    const tableEl = el('pd-platform-table');
    if (tableEl && promptData) {
      const entries = Object.entries(promptData.platforms).filter(([plat]) => !platform || plat === platform);
      let tableRows = '';
      entries.forEach(([plat, pData]) => {
        const t = PLAT_THEME[plat]||{};
        const found = (pData.mention_count || 0) > 0;
        const mentionRate = pData.total_runs > 0 ? ((pData.mention_count / pData.total_runs) * 100).toFixed(0) : 0;
        const sent = pData.sentiment_distribution || {};
        const domS = (sent.positive||0) >= (sent.negative||0) ? (sent.positive ? 'Positive' : '—') : 'Negative';
        const domSC = domS === 'Positive' ? 'var(--green)' : domS === 'Negative' ? 'var(--red)' : '';
        const sentBadgeClass = domS === 'Positive' ? 'pos' : domS === 'Negative' ? 'neg' : 'neu';
        const avgR = pData.avg_rank ? '#' + parseFloat(pData.avg_rank).toFixed(0) : '—';
        const rateColor = mentionRate >= 60 ? 'var(--green)' : mentionRate >= 30 ? 'var(--amber)' : 'var(--red)';
        tableRows += `<tr class="trow">
          <td class="td"><span class="pd-plat-badge"><span class="pd-plat-dot" style="background:${t.color||'#888'};"></span> ${esc(plat)}</span></td>
          <td class="td">${found ? '<span class="status-found">YES</span>' : '<span class="status-notfound">NO</span>'}</td>
          <td class="td"><div class="pd-mention-rate-bar"><span class="pd-mention-rate-val" style="color:${rateColor};">${mentionRate}%</span><div class="pd-mention-rate-track"><div class="pd-mention-rate-fill" style="width:${mentionRate}%;background:${rateColor};"></div></div></div></td>
          <td class="td" style="font-family:var(--mono);font-weight:700;color:var(--purple);">${avgR}</td>
          <td class="td"><span class="badge ${sentBadgeClass}">${domS}</span></td>
          <td class="td" style="font-family:var(--mono);font-size:11px;color:var(--muted);">${pData.total_runs || 0}</td>
          <td class="td">${found ? (pData.recommended_count > 0 ? '<span style="color:var(--green);font-weight:700;">Yes</span>' : '<span style="color:var(--muted);">No</span>') : '<span style="color:var(--muted);">—</span>'}</td>
        </tr>`;
      });
      tableEl.innerHTML = `<div class="pd-table-title-row">
          <div class="card-title">Per-Platform Performance</div>
          <span style="font-size:11px;color:var(--muted);font-weight:600;">${entries.length} platform${entries.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-scroll">
        <table class="tbl">
          <thead><tr><th class="th">Platform</th><th class="th">Found</th><th class="th">Mention Rate</th><th class="th">Position</th><th class="th">Sentiment</th><th class="th">Runs</th><th class="th">Recommended</th></tr></thead>
          <tbody>${tableRows || '<tr><td class="td" colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No platform data yet</td></tr>'}</tbody>
        </table>
        </div>`;
    } else if (tableEl) {
      tableEl.innerHTML = `<div class="pd-table-title-row"><div class="card-title">Per-Platform Performance</div></div>
        <div style="text-align:center;padding:32px;color:var(--muted);font-size:12px;">No data available for this query.</div>`;
    }

    // ── RECENT RUNS ──
    const runsEl = el('pd-recent-runs');
    const runsList = el('pd-runs-list');
    const runsCountEl = el('pd-runs-count');
    const runs = runsData.runs || [];
    if (runsEl && runs.length > 0) {
      runsEl.style.display = '';
      if (runsCountEl) runsCountEl.textContent = `Showing ${runs.length} of ${runsData.total || runs.length} runs`;
      runsList.innerHTML = `<div class="pd-run-row" style="font-weight:700;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;cursor:default;background:var(--bg3);">
          <div>Platform</div><div>Date</div><div>Found</div><div>Sentiment</div><div style="text-align:right;">Actions</div>
        </div>` +
        runs.map(r => {
          const t = PLAT_THEME[r.platform] || {};
          const sentColor = r.sentiment === 'positive' ? 'var(--green)' : r.sentiment === 'negative' ? 'var(--red)' : 'var(--muted)';
          const dt = new Date(r.created_at);
          const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          return `<div class="pd-run-row" onclick="viewPromptRun('${b.id}','${r.id}')">
            <div class="pd-run-plat" style="color:${t.color||'#888'};">${esc(r.platform)}</div>
            <div class="pd-run-date">${dateStr}</div>
            <div class="pd-run-mentioned" style="color:${r.mentioned ? 'var(--green)' : 'var(--red)'};">${r.mentioned ? 'YES' : 'NO'}</div>
            <div class="pd-run-sent" style="color:${sentColor};">${esc(r.sentiment || '—')}</div>
            <div class="pd-run-view">View details &rarr;</div>
          </div>`;
        }).join('');
    } else if (runsEl) {
      runsEl.style.display = 'none';
    }

  } catch(e) {
    console.error('[PromptDetails]', e);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

async function savePromptMetadata() {
  const b = brand();
  if (!b) return;
  const prompt = el('pd-prompt-select')?.value;
  if (!prompt) return;
  const tagsEl = el('pd-tags');
  const tags = tagsEl ? tagsEl.value.split(',').map(t => t.trim()).filter(Boolean) : [];
  try {
    await api('PUT', `/api/brands/${b.id}/prompt-metadata`, {
      prompt,
      intent: el('pd-intent')?.value || '',
      funnel_stage: el('pd-funnel')?.value || '',
      tags
    });
    toast('Prompt metadata saved', 'ok');
  } catch(e) {
    toast('Failed to save metadata', 'err');
  }
}

async function viewPromptRun(brandId, runId) {
  try {
    const data = await api('GET', `/api/brands/${brandId}/prompt-runs/${runId}`);
    const r = data.run;
    const t = PLAT_THEME[r.platform] || {};
    const sentColor = r.sentiment === 'positive' ? 'var(--green)' : r.sentiment === 'negative' ? 'var(--red)' : 'var(--muted)';
    const modal = document.createElement('div');
    modal.className = 'overlay open';
    modal.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <div class="modal-head">
          <span style="display:flex;align-items:center;gap:8px;">
            <span class="pd-plat-dot" style="background:${t.color||'#888'};"></span>
            Response Details — ${esc(r.platform)}
          </span>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">&times;</button>
        </div>
        <div style="padding:20px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;">
            <div class="pd-meta-field">
              <div class="pd-meta-label">Platform</div>
              <div style="font-weight:700;color:${t.color||'#888'};">${esc(r.platform)}</div>
            </div>
            <div class="pd-meta-field">
              <div class="pd-meta-label">Date</div>
              <div style="font-family:var(--mono);font-size:12px;">${new Date(r.created_at).toLocaleString()}</div>
            </div>
            <div class="pd-meta-field">
              <div class="pd-meta-label">Mentioned</div>
              <div>${r.mentioned ? '<span class="status-found">YES</span>' : '<span class="status-notfound">NO</span>'}</div>
            </div>
            <div class="pd-meta-field">
              <div class="pd-meta-label">Sentiment</div>
              <div style="font-weight:600;color:${sentColor};">${esc(r.sentiment || 'N/A')}</div>
            </div>
            <div class="pd-meta-field">
              <div class="pd-meta-label">Position</div>
              <div style="font-family:var(--mono);font-weight:700;color:var(--purple);">${r.list_position ? '#' + r.list_position : 'N/A'}</div>
            </div>
          </div>
          <div class="pd-meta-label" style="margin-bottom:6px;">Query</div>
          <div style="background:var(--bg3);padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px;border:1px solid var(--border);">${esc(r.prompt)}</div>
          <div class="pd-meta-label" style="margin-bottom:6px;">Full AI Response</div>
          <div style="background:var(--bg3);padding:14px 16px;border-radius:var(--radius-sm);font-size:13px;max-height:400px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;border:1px solid var(--border);">${r.response_raw ? esc(r.response_raw) : '<span style="color:var(--muted);font-style:italic;">(response not stored)</span>'}</div>
        </div>
      </div>`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  } catch(e) { toast('Failed to load response', 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// RECOMMENDATIONS VIEW (Epic 3.4)
// ═══════════════════════════════════════════════════════════════════
async function renderRecommendations() {
  const b = brand();
  if (!b) return;
  showViewLoading('rec-list');
  const status = el('rec-filter-status')?.value || '';
  const severity = el('rec-filter-severity')?.value || '';
  try {
    let url = `/api/brands/${b.id}/recommendations?`;
    if (status) url += `status=${status}&`;
    if (severity) url += `severity=${severity}&`;
    const data = await api('GET', url);
    const allRecs = data.recommendations || [];
    const listEl = el('rec-list');

    // KPI cards
    const kpisEl = el('rec-kpis');
    if (kpisEl) {
      const open = allRecs.filter(r => r.status === 'open').length;
      const inProg = allRecs.filter(r => r.status === 'in_progress').length;
      const done = allRecs.filter(r => r.status === 'done').length;
      const high = allRecs.filter(r => r.severity === 'critical' || r.severity === 'high').length;
      kpisEl.innerHTML = `
        <div class="score-card"><div class="score-val" style="font-size:24px;">${allRecs.length}</div><div class="score-label">Total</div></div>
        <div class="score-card"><div class="score-val" style="font-size:24px;color:${open > 0 ? 'var(--amber)' : 'var(--muted)'};">${open}</div><div class="score-label">Open</div></div>
        <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${inProg}</div><div class="score-label">In Progress</div></div>
        <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${done}</div><div class="score-label">Completed</div></div>
      `;
    }

    // Filter
    let recs = [...allRecs];
    if (!status) {
      recs = recs.filter(r => r.status !== 'done' && r.status !== 'ignored');
    }

    if (recs.length === 0) {
      const doneCount = allRecs.filter(r => r.status === 'done' || r.status === 'ignored').length;
      listEl.innerHTML = doneCount > 0
        ? `<div class="card" style="padding:32px;text-align:center;color:var(--muted);"><div style="font-size:28px;margin-bottom:8px;">&#10003;</div><div style="font-weight:700;font-size:14px;margin-bottom:4px;">All Caught Up!</div><div style="font-size:12px;">${doneCount} recommendation${doneCount>1?'s':''} completed. Use the status filter to review.</div></div>`
        : '<div class="card" style="padding:32px;text-align:center;color:var(--muted);"><div style="font-size:28px;margin-bottom:8px;">&#9733;</div><div style="font-weight:700;font-size:14px;margin-bottom:4px;">No Recommendations Yet</div><div style="font-size:12px;">Click "Generate" to analyze your data and get actionable suggestions.</div></div>';
      return;
    }

    const sevColors = { critical: 'var(--red)', high: 'var(--red)', medium: 'var(--amber)', low: 'var(--blue)' };
    const sevLabels = { critical: 'HIGH', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
    listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${recs.map((r, idx) => {
      const isDone = r.status === 'done';
      const isIgnored = r.status === 'ignored';
      const color = isDone ? 'var(--green)' : isIgnored ? 'var(--muted)' : (sevColors[r.severity] || 'var(--blue)');
      const label = isDone ? 'DONE' : isIgnored ? 'IGNORED' : (sevLabels[r.severity] || 'LOW');
      const dimmed = isDone || isIgnored;
      return `<div class="card" style="padding:16px 20px;border-left:3px solid ${color};${dimmed ? 'opacity:0.5;' : ''}animation:fadeIn .2s ease ${Math.min(idx*0.04,.3)}s both;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px;${isDone ? 'text-decoration:line-through;' : ''}">${esc(r.title)}</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:10px;">${esc(r.description || '')}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              ${r.playbook_id ? `<button class="pbtn" style="font-size:10px;padding:4px 10px;" onclick="viewPlaybook('${escAttr(r.playbook_id)}')">Playbook</button>` : ''}
              ${!isDone ? `<button onclick="updateRecommendation('${escAttr(r.id)}','done')" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--green);color:var(--green);padding:4px 10px;cursor:pointer;border-radius:100px;">&#10003; Mark Done</button>` : ''}
              <select class="finp" style="width:110px;margin:0;font-size:10px;padding:3px 6px;" onchange="updateRecommendation('${escAttr(r.id)}',this.value)">
                <option value="open" ${r.status==='open'?'selected':''}>Open</option>
                <option value="in_progress" ${r.status==='in_progress'?'selected':''}>In Progress</option>
                <option value="done" ${r.status==='done'?'selected':''}>Done</option>
                <option value="ignored" ${r.status==='ignored'?'selected':''}>Ignored</option>
              </select>
            </div>
          </div>
          <span style="font-family:var(--mono);font-size:9px;font-weight:700;padding:4px 10px;border-radius:100px;color:${color};background:${color === 'var(--red)' ? 'rgba(239,68,68,.08)' : color === 'var(--amber)' ? 'rgba(245,158,11,.08)' : color === 'var(--green)' ? 'rgba(16,185,129,.08)' : 'rgba(59,130,246,.08)'};white-space:nowrap;flex-shrink:0;">${label}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch(e) { toast('Failed to load recommendations', 'err'); } finally { hideViewLoading('rec-list'); }
}

async function generateRecommendations() {
  const b = brand();
  if (!b) return;
  try {
    toast('Analyzing data...', 'ok');
    const data = await api('POST', `/api/brands/${b.id}/recommendations/generate`);
    toast(`Generated ${data.generated} recommendations`, 'ok');
    renderRecommendations();
  } catch(e) { toast('Failed: ' + e.message, 'err'); }
}

async function updateRecommendation(id, status) {
  try {
    await api('PUT', `/api/recommendations/${id}`, { status });
    toast(status === 'done' ? 'Marked as completed' : 'Updated to ' + status, 'ok');
    // Re-render to reflect status change (done items get hidden)
    renderRecommendations();
  } catch(e) { toast('Failed', 'err'); }
}

async function viewPlaybook(playbookId) {
  try {
    const data = await api('GET', `/api/playbooks/${playbookId}`);
    const pb = data.playbook;
    const modal = document.createElement('div');
    modal.className = 'overlay open';
    modal.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-head">
          <span>${esc(pb.title)}</span>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">&times;</button>
        </div>
        <div style="padding:20px;">
          <p style="color:var(--muted);margin-bottom:16px;">${esc(pb.description)}</p>
          <div style="font-weight:600;margin-bottom:8px;">Action Steps:</div>
          ${pb.steps.map((s, i) => `<div style="padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:6px;font-size:13px;"><span style="font-weight:700;margin-right:8px;">${i + 1}.</span>${esc(s)}</div>`).join('')}
        </div>
      </div>`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  } catch(e) { toast('Failed to load playbook', 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// ACCURACY MONITOR VIEW (Epic 8.1)
// ═══════════════════════════════════════════════════════════════════
async function renderAccuracyMonitor() {
  const b = brand();
  if (!b) return;
  const kpisEl = el('accuracy-kpis');
  const factsEl = el('facts-list');
  const resultsEl = el('accuracy-results');

  // Show loading state
  kpisEl.innerHTML = `
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Accuracy Rate</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Inaccuracies Found</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Claims Verified</div></div>
  `;

  try {
    const data = await api('GET', `/api/brands/${b.id}/facts`);
    const facts = data.facts || [];

    // Fetch accuracy results for KPI stats
    let accRate = '--', issueCount = 0, claimsChecked = 0, mismatches = [];
    try {
      const accData = await api('GET', `/api/brands/${b.id}/accuracy`);
      mismatches = accData.mismatches || [];
      issueCount = mismatches.length;
      claimsChecked = accData.totalChecked || 0;
      // If totalChecked is 0 but we have mismatches, use mismatch count as minimum
      if (claimsChecked === 0 && issueCount > 0) claimsChecked = issueCount;
      accRate = claimsChecked > 0 ? Math.round(((claimsChecked - issueCount) / claimsChecked) * 100) + '%' : '--';
    } catch(e) {}

    const accColor = accRate === '--' ? 'var(--muted)' : parseInt(accRate) >= 90 ? 'var(--green)' : parseInt(accRate) >= 70 ? 'var(--amber)' : 'var(--red)';
    kpisEl.innerHTML = `
      <div class="score-card"><div class="score-val" style="font-size:24px;color:${accColor};">${accRate}</div><div class="score-label">Accuracy Rate</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:${issueCount > 0 ? 'var(--red)' : 'var(--green)'};">${issueCount}</div><div class="score-label">Inaccuracies Found</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${claimsChecked || facts.length}</div><div class="score-label">Claims Verified</div></div>
    `;

    // Render facts list
    if (facts.length === 0) {
      factsEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">
        No facts defined yet. Add your brand's canonical facts below (e.g. founded year, pricing, phone number) to check AI accuracy.
      </div>`;
    } else {
      factsEl.innerHTML = facts.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-xs);margin-bottom:6px;">
          <div>
            <span style="font-weight:700;font-size:12px;color:var(--text);">${esc(f.fact_key)}</span>
            <span style="font-size:12px;color:var(--text);"> = </span>
            <span style="font-family:var(--mono);font-size:12px;color:var(--text);">${esc(f.fact_value)}</span>
            <span style="font-family:var(--mono);font-size:9px;padding:2px 6px;border-radius:100px;background:var(--bg);color:var(--muted);margin-left:6px;">${esc(f.category)}</span>
          </div>
          <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;" onclick="deleteFact(${f.id})">&times;</button>
        </div>
      `).join('');
    }

    // Render mismatches in the results section
    if (resultsEl) {
      if (mismatches.length > 0) {
        resultsEl.innerHTML = mismatches.map(m => {
          const t = PLAT_THEME[m.platform] || {};
          const severity = m.severity === 'high' ? 'var(--red)' : 'var(--amber)';
          const bgColor = severity === 'var(--red)' ? 'rgba(239,68,68,.03)' : 'rgba(245,158,11,.03)';
          const mDate = m.detected_at || m.date;
          const dateStr = mDate ? 'Detected ' + new Date(mDate).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '';
          const expectedVal = m.fact_value || m.expected_value || '?';
          return `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-left:3px solid ${severity};background:${bgColor};border-radius:var(--radius-xs);margin-bottom:10px;">
            <span style="color:${severity};font-size:14px;flex-shrink:0;">&#9888;</span>
            <div style="font-size:12px;line-height:1.6;">
              <strong>${esc(m.platform || 'Unknown')}</strong>
              ${m.fact_key ? ` stated incorrect <strong>${esc(m.fact_key)}</strong> — expected: <em>${esc(expectedVal)}</em>` : esc(m.description || 'Mismatch detected')}
              ${dateStr ? ` <span style="color:var(--muted);">${dateStr}</span>` : ''}
            </div>
          </div>`;
        }).join('');
      } else if (claimsChecked > 0) {
        resultsEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--green);font-size:12px;font-weight:600;">No mismatches detected. AI platforms are reporting your brand information accurately.</div>`;
      } else {
        resultsEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">Add canonical facts below and click "Check Now" to verify AI accuracy.</div>`;
      }
    }
  } catch(e) {
    console.error('[Accuracy]', e);
    factsEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);">Could not load accuracy data. <a href="#" onclick="renderAccuracyMonitor();return false;" style="color:var(--primary);">Retry</a></div>`;
  }
}

async function addFact() {
  const b = brand();
  if (!b) return;
  const factKey = el('fact-key').value.trim();
  const factValue = el('fact-value').value.trim();
  const category = el('fact-category').value;
  if (!factKey || !factValue) { toast('Both key and value are required', 'err'); return; }
  try {
    await api('PUT', `/api/brands/${b.id}/facts`, { facts: [{ fact_key: factKey, fact_value: factValue, category }] });
    el('fact-key').value = '';
    el('fact-value').value = '';
    renderAccuracyMonitor();
    toast('Fact added', 'ok');
  } catch(e) { toast('Failed', 'err'); }
}

async function deleteFact(factId) {
  const b = brand();
  if (!b) return;
  try {
    await api('DELETE', `/api/brands/${b.id}/facts/${factId}`);
    renderAccuracyMonitor();
    toast('Fact deleted', 'ok');
  } catch(e) { toast('Failed', 'err'); }
}

async function checkAccuracy() {
  const b = brand();
  if (!b) return;
  try {
    toast('Checking accuracy...', 'ok');
    // Just re-render the full monitor which already fetches and displays everything
    await renderAccuracyMonitor();
    toast('Accuracy check complete', 'ok');
  } catch(e) { toast('Failed: ' + e.message, 'err'); }
}

// ═══════════════════════════════════════════════════════════════════
// CITATION ANALYSIS VIEW (Epic 8.2)
// ═══════════════════════════════════════════════════════════════════
async function renderCitationAnalysis() {
  const b = brand();
  if (!b) return;
  const summaryEl = el('citation-summary');
  const domainsEl = el('citation-domains');

  // Show loading skeleton
  summaryEl.innerHTML = `
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Domains Cited</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Total Citations</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--muted);">—</div><div class="score-label">Your Domain Cited</div></div>
  `;
  domainsEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">Loading citations...</div>';

  try {
    const data = await api('GET', `/api/brands/${b.id}/citation-analysis`);
    const domains = data.domains || [];

    // Brand domain citation count
    const bDomain = b.website ? b.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : '';
    const ownDomainCites = bDomain ? domains.filter(d => d.domain.includes(bDomain)).reduce((s, d) => s + d.totalCitations, 0) : 0;

    summaryEl.innerHTML = `
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${domains.length}</div><div class="score-label">Domains Cited</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${data.totalCitations || 0}</div><div class="score-label">Total Citations</div></div>
      <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--amber);">${ownDomainCites}</div><div class="score-label">Your Domain Cited</div></div>
    `;

    if (domains.length === 0) {
      domainsEl.innerHTML = `<div style="text-align:center;padding:32px 16px;">
        <div style="font-size:28px;margin-bottom:8px;">&#11044;</div>
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">No Citations Found</div>
        <div style="color:var(--muted);font-size:12px;">Run more queries to build citation data. AI platforms cite sources when they reference authoritative content.</div>
      </div>`;
      return;
    }

    const maxCites = domains[0]?.totalCitations || 1;
    domainsEl.innerHTML = domains.map(d => {
      const isOwn = bDomain && d.domain.includes(bDomain);
      const barW = Math.round(d.totalCitations / maxCites * 100);
      const barColor = isOwn ? 'var(--amber)' : 'var(--blue)';
      return `<div class="qperf-bar-row">
        <div class="qperf-bar-label">${isOwn ? '<span style="color:var(--amber);">&#9733; </span>' : ''}${esc(d.domain)}</div>
        <div class="qperf-bar-track"><div class="qperf-bar-fill" style="width:${barW}%;background:${barColor};"></div></div>
        <div class="qperf-bar-value" style="color:var(--text);">${d.totalCitations}</div>
      </div>`;
    }).join('');
  } catch(e) {
    summaryEl.innerHTML = '';
    domainsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">
      Could not load citation data. <a href="#" onclick="renderCitationAnalysis();return false;" style="color:var(--primary);">Retry</a>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// COPILOT VIEW (Epic 8.3)
// ═══════════════════════════════════════════════════════════════════
async function askCopilot() {
  const b = brand();
  if (!b) return;
  const input = el('copilot-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  const historyEl = el('copilot-history');
  // Add user question bubble (right-aligned)
  historyEl.innerHTML += `
    <div style="display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse;">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;">U</div>
      <div style="background:var(--blue);color:#fff;padding:12px 16px;border-radius:12px 12px 4px 12px;font-size:12px;max-width:80%;">${esc(question)}</div>
    </div>`;
  // Scroll to bottom
  historyEl.scrollTop = historyEl.scrollHeight;

  try {
    const data = await api('POST', `/api/brands/${b.id}/copilot`, { question });
    historyEl.innerHTML += `
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">&#9672;</div>
        <div style="background:var(--bg3);padding:12px 16px;border-radius:12px 12px 12px 4px;font-size:12px;line-height:1.6;max-width:80%;">${mdToHtml(data.answer)}</div>
      </div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  } catch(e) {
    historyEl.innerHTML += `
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:var(--red);">!</div>
        <div style="background:rgba(239,68,68,.05);padding:12px 16px;border-radius:12px 12px 12px 4px;font-size:12px;max-width:80%;border:1px solid rgba(239,68,68,.2);">${esc(e.message)}</div>
      </div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BILLING VIEW (Epic 7.1-7.2)
