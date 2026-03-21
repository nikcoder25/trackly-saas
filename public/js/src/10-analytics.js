// ─── PLATFORM STATUS ──────────────────────────────────────────────
async function renderPlatformStatus(){
  const b = brand();
  if (!b) return;

  const grid = el('plat-status-grid');
  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length - 1] : null;

  // Fetch platform health from API
  let platformHealth = {};
  try {
    const hData = await cachedApi('GET', '/api/meta/platforms', null, 60000);
    platformHealth = hData.platforms || {};
  } catch(e) {}

  grid.innerHTML = PLATS.map(plat => {
    const t = PLAT_THEME[plat]||{};
    const keyField = plat==='ChatGPT'?'openai':plat==='Google AIO'?'gemini':plat.toLowerCase();
    const hasKey = keyStatus[keyField];
    const sov = lastRun ? ((lastRun.platforms||{})[plat]||0) : 0;
    const sovColor = sov >= 50 ? 'var(--green)' : sov > 0 ? 'var(--amber)' : 'var(--muted)';
    const statusLabel = hasKey ? 'ACTIVE' : 'INACTIVE';
    const statusColor = hasKey ? 'var(--green)' : 'var(--muted)';
    const health = platformHealth[plat] || {};
    const latencyMs = health.avg_latency_ms;
    const latencyStr = latencyMs ? (latencyMs / 1000).toFixed(1) + 's' : '—';
    const successRate = health.success_rate != null ? health.success_rate + '%' : '—';
    const apiStatus = health.status === 'red' ? 'Degraded' : health.status === 'amber' ? 'Slow' : 'Healthy';
    const apiStatusColor = health.status === 'red' ? 'var(--red)' : health.status === 'amber' ? 'var(--amber)' : 'var(--green)';
    const calls24h = health.total_calls_24h || 0;

    return `<div class="card" style="padding:18px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-weight:700;color:${t.color||'var(--text)'};font-size:15px;">${esc(plat)}</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;font-weight:700;color:${statusColor};">
          <span style="width:7px;height:7px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
          ${statusLabel}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <span style="font-size:11px;color:var(--muted);font-weight:600;">SOV</span>
        <span style="font-family:var(--mono);font-size:18px;font-weight:800;color:${sovColor};">${sov}%</span>
      </div>
      <div style="width:100%;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:12px;">
        <div style="width:${sov}%;height:100%;background:${sovColor};border-radius:4px;transition:width .4s ease;"></div>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);">
        API: <span style="color:${apiStatusColor};">${apiStatus}</span> &middot; Avg response: ${latencyStr} &middot; Success: ${successRate}${calls24h > 0 ? ' &middot; ' + calls24h + ' calls/24h' : ''}
      </div>
    </div>`;
  }).join('');
}

// ─── QUERY PERFORMANCE ────────────────────────────────────────────

function renderQPerf(){
  const b = brand(); if (!b) return;
  const qs = b.queryStats || {};
  const queries = b.queries || [];
  const cont = el('qperf-container');
  const kpis = el('qperf-kpis');
  if (!queries.length) {
    kpis.innerHTML = '';
    cont.innerHTML = `<div class="card" style="text-align:center;padding:32px;">
      <div style="font-size:28px;margin-bottom:8px;">&#9723;</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">No Queries Configured</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:12px;">Add queries in Brand Setup to start tracking performance.</div>
      <button class="pbtn" onclick="go('setup')">Go to Brand Setup</button>
    </div>`;
    return;
  }

  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length - 1] : null;
  const allResults = lastRun ? (lastRun.allResults || []) : [];

  // Build lookup: query → platform → result
  const resultMap = {};
  allResults.forEach(r => {
    const key = r.query;
    if (!resultMap[key]) resultMap[key] = {};
    resultMap[key][r.platform] = r;
  });

  // Aggregate stats
  const totalRuns = queries.reduce((s, q) => s + (qs[q]?.runs || 0), 0);
  const totalMentions = queries.reduce((s, q) => s + (qs[q]?.mentions || 0), 0);
  const avgRate = totalRuns > 0 ? Math.round(totalMentions / totalRuns * 100) : 0;
  const topQueries = queries.filter(q => { const s = qs[q]; return s && s.runs && (s.mentions / s.runs) > 0.6; }).length;
  const lowQueries = queries.filter(q => { const s = qs[q]; return s && s.runs && (s.mentions / s.runs) <= 0.3; }).length;

  // Hide KPI row — clean bar chart layout
  kpis.innerHTML = '';

  // Sort queries by rate descending
  const sortedQueries = [...queries].sort((a, bq) => {
    const ra = qs[a]?.runs ? (qs[a].mentions / qs[a].runs) : 0;
    const rb = qs[bq]?.runs ? (qs[bq].mentions / qs[bq].runs) : 0;
    return rb - ra;
  });

  // ── Horizontal Bar Chart ──
  let html = `<div class="card" style="padding:20px 24px;">`;

  sortedQueries.forEach((q, idx) => {
    const stat = qs[q] || { runs: 0, mentions: 0 };
    const rate = stat.runs ? Math.round((stat.mentions / stat.runs) * 100) : 0;
    const barColor = rate > 40 ? 'var(--green)' : 'var(--amber)';

    html += `<div class="qperf-bar-row" style="animation:fadeIn .25s ease ${Math.min(idx * 0.04, .5)}s both;">
      <div class="qperf-bar-label" title="${esc(q)}">${esc(q)}</div>
      <div class="qperf-bar-track">
        <div class="qperf-bar-fill" style="width:${rate}%;background:${barColor};"></div>
      </div>
      <div class="qperf-bar-value" style="color:${barColor};">${rate}%</div>
    </div>`;
  });

  html += `</div>`;
  cont.innerHTML = html;
}

// ─── COMPETITORS ──────────────────────────────────────────────────
const COMP_BAR_COLORS = ['var(--primary)', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1'];

async function renderCompetitors(){
  const b = brand(); if (!b) return;
  const cont = el('comp-tags');
  cont.innerHTML = '';
  if (!(b.competitors||[]).length) {
    cont.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:4px 0;">No competitors added yet. Add competitor names below to track.</div>';
  }
  (b.competitors||[]).forEach((c,i) => {
    const tag = document.createElement('span');
    tag.className = 'comp-chip';
    tag.textContent = c + ' ';
    const btn = document.createElement('button');
    btn.style.cssText = 'background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;margin-left:4px;';
    btn.textContent = '\u00d7';
    btn.addEventListener('click', function(){ removeComp(i); });
    tag.appendChild(btn);
    cont.appendChild(tag);
  });

  // Competitor comparison from run data
  const compDiv = el('comp-comparison');
  const competitors = b.competitors || [];
  const lastRun = b.runs && b.runs.length ? b.runs[b.runs.length - 1] : null;
  if (!competitors.length || !lastRun || !lastRun.allResults) {
    compDiv.innerHTML = competitors.length ? `<div class="card" style="text-align:center;padding:24px;">
      <div style="font-size:28px;margin-bottom:8px;">&#8856;</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">No Comparison Data</div>
      <div style="color:var(--muted);font-size:12px;">Run queries to see how your brand compares against competitors.</div>
    </div>` : '';
    el('comp-cooccurrence').innerHTML = '';
    el('comp-platform-breakdown').innerHTML = '';
    return;
  }

  const allResults = lastRun.allResults || [];
  const brandMentions = allResults.filter(r => r.mentioned).length;
  const compStats = {};
  competitors.forEach(c => { compStats[c] = 0; });
  allResults.forEach(r => {
    const cm = r.competitorMentions || [];
    cm.forEach(c => { if (compStats[c] !== undefined) compStats[c]++; });
  });

  const total = allResults.length;
  const brandPct = total ? Math.round((brandMentions / total) * 100) : 0;

  // Build horizontal bar chart for comparison
  let html = `<div class="card"><div class="section-title">Competitor Comparison</div>`;

  // Brand row (always first, red/primary color)
  html += `<div class="qperf-bar-row">
    <div class="qperf-bar-label" style="font-weight:700;">${esc(b.name)} <span style="font-size:10px;color:var(--muted);font-weight:400;">(You)</span></div>
    <div class="qperf-bar-track"><div class="qperf-bar-fill" style="width:${brandPct}%;background:var(--primary);"></div></div>
    <div class="qperf-bar-value" style="color:var(--primary);">${brandPct}%</div>
  </div>`;

  // Competitor rows sorted by mention count
  const sorted = competitors.slice().sort((a,b2) => (compStats[b2]||0) - (compStats[a]||0));
  sorted.forEach((c, i) => {
    const cnt = compStats[c] || 0;
    const pct = total ? Math.round((cnt / total) * 100) : 0;
    const clr = COMP_BAR_COLORS[(i + 1) % COMP_BAR_COLORS.length];
    html += `<div class="qperf-bar-row">
      <div class="qperf-bar-label">${esc(c)}</div>
      <div class="qperf-bar-track"><div class="qperf-bar-fill" style="width:${pct}%;background:${clr};"></div></div>
      <div class="qperf-bar-value" style="color:${clr};">${pct}%</div>
    </div>`;
  });

  html += `</div>`;
  compDiv.innerHTML = html;

  // Fetch co-occurrence data from prompt_runs
  const cooccDiv = el('comp-cooccurrence');
  const platBreakDiv = el('comp-platform-breakdown');
  try {
    const coData = await api('GET', '/api/brands/'+b.id+'/competitor-analysis');
    const topComps = coData.topCompetitors || [];
    if (topComps.length) {
      const maxApp = Math.max(...topComps.map(c => c.total_appearances), 1);
      let coHtml = '';
      topComps.forEach((c, i) => {
        const pct = (c.total_appearances / maxApp) * 100;
        const clr = COMP_BAR_COLORS[(i + 1) % COMP_BAR_COLORS.length];
        coHtml += `<div class="qperf-bar-row">
          <div class="qperf-bar-label">${esc(c.competitor)}</div>
          <div class="qperf-bar-track"><div class="qperf-bar-fill" style="width:${pct}%;background:${clr};"></div></div>
          <div class="qperf-bar-value" style="color:var(--text);">${c.total_appearances}x</div>
        </div>`;
      });
      cooccDiv.innerHTML = coHtml;
    } else {
      cooccDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">No co-occurrence data yet. Run more queries to build up data.</div>';
    }

    // Platform breakdown (keep but hide if empty)
    const byPlat = coData.byPlatform || [];
    const platCard = el('comp-platform-card');
    if (byPlat.length) {
      if (platCard) platCard.style.display = '';
      let pbHtml = '';
      byPlat.forEach((p, i) => {
        const t = PLAT_THEME[p.platform]||{};
        const maxPlatApp = Math.max(...byPlat.map(x => x.appearances), 1);
        const pct = (p.appearances / maxPlatApp) * 100;
        pbHtml += `<div class="qperf-bar-row">
          <div class="qperf-bar-label"><span style="color:${t.color||'#888'};font-weight:600;">${t.logo||''} ${esc(p.platform)}</span> — ${esc(p.competitor)}</div>
          <div class="qperf-bar-track"><div class="qperf-bar-fill" style="width:${pct}%;background:${t.color||'#888'};"></div></div>
          <div class="qperf-bar-value" style="color:var(--text);">${p.appearances}x</div>
        </div>`;
      });
      platBreakDiv.innerHTML = pbHtml;
    } else {
      if (platCard) platCard.style.display = 'none';
      platBreakDiv.innerHTML = '';
    }
  } catch(e) {
    cooccDiv.innerHTML = '<div style="color:var(--muted);font-size:12px;">Could not load co-occurrence data.</div>';
    platBreakDiv.innerHTML = '';
  }
}

async function addComp(){
  const inp = el('comp-input');
  const v = inp.value.trim(); if (!v) return;
  const b = brand(); if (!b) return;
  const competitors = [...(b.competitors||[]), v];
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { competitors });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    inp.value = '';
    renderCompetitors();
    toast('Competitor added', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

async function removeComp(i){
  const b = brand(); if (!b) return;
  const c = (b.competitors||[])[i];
  if (!confirm('Remove competitor "' + (c || '') + '"?')) return;
  const competitors = (b.competitors||[]).filter((_,idx)=>idx!==i);
  try {
    const data = await api('PUT', '/api/brands/'+b.id, { competitors });
    invalidateCache('/api/brands');
    updateBrandInList(data.brand);
    renderCompetitors();
    toast('Competitor removed', 'ok');
  } catch(e) { toast(e.message,'err'); }
}

// ─── SOV TRENDS (Chart.js) ────────────────────────────────────────
let platSovChartInstance = null;

function renderTrends(){
  const b = brand(); if (!b) return;

  // Lazy-load Chart.js then render
  ensureChartJs().then(() => _renderTrendsCharts(b)).catch(() => {
    // Fallback: still render bar chart (doesn't need Chart.js)
    _renderTrendsCharts(b);
  });
}
function _renderTrendsCharts(b) {
  const history = b.sovHistory || [];

  // Destroy existing chart instance safely
  if (platSovChartInstance) { platSovChartInstance.destroy(); platSovChartInstance = null; }

  const barContainer = el('sov-bar-container');
  const platCanvas = el('plat-sov-chart');
  const platPlaceholder = el('plat-sov-placeholder');

  // Remove any previous empty-state messages
  document.querySelectorAll('.trends-empty').forEach(e => e.remove());

  if (!history.length) {
    // Show placeholder bar chart (static design from preview)
    if (barContainer) {
      let barHtml = '<div style="height:200px;background:var(--bg3);border-radius:var(--radius-xs);display:flex;align-items:end;gap:4px;padding:16px;">';
      const heights = [40, 45, 50, 52, 55, 58, 60, 64, 68, 72];
      const opacities = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 1.0];
      heights.forEach((h, i) => {
        barHtml += `<div style="flex:1;background:var(--primary);border-radius:3px 3px 0 0;height:${h}%;opacity:${opacities[i]};"></div>`;
      });
      barHtml += '</div>';
      barContainer.innerHTML = barHtml;
    }
    if (platCanvas) platCanvas.style.display = 'none';
    if (platPlaceholder) platPlaceholder.style.display = 'flex';
    return;
  }

  // ── Overall SOV bar chart (CSS bars matching screenshot) ──
  if (barContainer) {
    const maxSOV = Math.max(...history.map(h => h.overall), 1);
    let barHtml = '<div style="height:200px;background:var(--bg3);border-radius:var(--radius-xs);display:flex;align-items:end;gap:4px;padding:16px;">';
    history.forEach((h, i) => {
      const pct = Math.max((h.overall / 100) * 100, 4);
      const opacity = 0.4 + (i / Math.max(history.length - 1, 1)) * 0.6;
      barHtml += `<div style="flex:1;background:var(--primary);border-radius:3px 3px 0 0;height:${pct}%;opacity:${opacity};transition:height .3s ease;" title="${h.overall}% — ${new Date(h.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}"></div>`;
    });
    barHtml += '</div>';
    barContainer.innerHTML = barHtml;
  }

  // ── Per-platform SOV line chart (Chart.js) ──
  const allPlatforms = new Set();
  history.forEach(h => { if (h.platforms) Object.keys(h.platforms).forEach(p => allPlatforms.add(p)); });

  if (allPlatforms.size > 0 && platCanvas && typeof Chart !== 'undefined') {
    if (platPlaceholder) platPlaceholder.style.display = 'none';
    platCanvas.style.display = '';

    const labels = history.map(h => {
      const d = new Date(h.date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const datasets = [...allPlatforms].map(plat => {
      const t = PLAT_THEME[plat] || {};
      return {
        label: plat,
        data: history.map(h => (h.platforms || {})[plat] || 0),
        borderColor: t.color || '#888',
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2
      };
    });

    const ctx2 = platCanvas.getContext('2d');
    platSovChartInstance = new Chart(ctx2, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 } } } },
        scales: {
          x: { ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { min: 0, max: 100, ticks: { color: '#7a8194', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,.06)' } }
        }
      }
    });
  } else {
    if (platCanvas) platCanvas.style.display = 'none';
    if (platPlaceholder) platPlaceholder.style.display = 'flex';
  }
}

// ─── ALERTS ──────────────────────────────────────────────────────
