// ─── MENTIONS / ALL RESULTS ───────────────────────────────────────
let mentionsPage = 0;
let MENTIONS_PER_PAGE = 15;

let mentionsPlatFilter = 'all';
let mentionsExpandedRow = null;

function exportMentionsCSV(){
  const b = brand();
  if (!b) return;
  const run = (b.runs||[]).find(r => r.id === el('mentions-run-sel').value);
  if (!run || !run.allResults) return;
  const rows = [['Platform','Query','Status','Sentiment','Recommended','Response Preview']];
  run.allResults.forEach(r => {
    const preview = (r.raw || r.context || '').replace(/[#*_~`\n]/g,' ').substring(0,300);
    rows.push([r.platform, r.query, r.error?'ERROR':r.mentioned?'Mentioned':'Not Found', r.sentiment||'neutral', r.recommended?'Yes':'No', preview]);
  });
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `livesov-mentions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); toast('CSV exported');
}

function toggleMentionRow(idx){
  mentionsExpandedRow = mentionsExpandedRow === idx ? null : idx;
  renderMentions();
}

async function retryQuery(runId, platform, query, btnEl){
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="mt-retry-spin"></span> Retrying...'; }
  try {
    const b = brand();
    if (!b) throw new Error('No brand selected');
    const resp = await fetch(`/api/brands/${b.id}/retry-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ runId, platform, query })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Retry failed');
    // Update local brand data from server response
    const idx = brands.findIndex(x => x.id === b.id);
    if (idx !== -1 && data.brand) brands[idx] = data.brand;
    toast('Query retried successfully');
    mentionsExpandedRow = null;
    renderMentions();
  } catch(e) {
    toast(e.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '↻ Retry'; }
  }
}

async function recheckQuery(runId, platform, query, btnEl){
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="mt-retry-spin"></span> Rechecking...'; }
  try {
    const b = brand();
    if (!b) throw new Error('No brand selected');
    const resp = await fetch(`/api/brands/${b.id}/recheck-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ runId, platform, query })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Recheck failed');
    const idx = brands.findIndex(x => x.id === b.id);
    if (idx !== -1 && data.brand) brands[idx] = data.brand;
    const msg = data.statusChange === 'now_mentioned' ? 'Recheck complete — now mentioned!'
      : data.statusChange === 'no_longer_mentioned' ? 'Recheck complete — no longer mentioned'
      : 'Recheck complete — status unchanged';
    toast(msg);
    mentionsExpandedRow = null;
    renderMentions();
  } catch(e) {
    toast(e.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '⟳ Recheck'; }
  }
}

function renderMentions(){
  const b = brand();
  if (!b) return;
  const cont = el('mentions-container');
  const kpis = el('mentions-kpis');
  const platFilters = el('mentions-plat-filters');

  // Run selector
  const sel = el('mentions-run-sel');
  const curVal = sel.value;
  sel.innerHTML = '';
  const runs = (b.runs||[]).slice().reverse();
  if (!runs.length) {
    kpis.innerHTML = ''; platFilters.innerHTML = '';
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results yet — run queries to start tracking.</p></div>';
    return;
  }
  runs.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    const d = new Date(r.time || r.date || 0);
    const dateStr = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ', ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    opt.textContent = dateStr + '  ·  SOV ' + r.sov + '%';
    sel.appendChild(opt);
  });
  if (curVal && [...sel.options].some(o=>o.value===curVal)) sel.value = curVal;

  const run = (b.runs||[]).find(r => r.id === sel.value);
  if (!run) { kpis.innerHTML=''; platFilters.innerHTML=''; cont.innerHTML=''; return; }
  const all = run.allResults || [];
  if (!all.length) {
    kpis.innerHTML=''; platFilters.innerHTML='';
    cont.innerHTML = '<div class="empty-state"><div class="icon">◎</div><p>No results in this run.</p></div>';
    return;
  }
  const runId = sel.value;

  // ── Metrics ──
  const ok = all.filter(r => !r.error);
  const found = all.filter(r => r.mentioned);
  const notfound = ok.filter(r => !r.mentioned);
  const errs = all.filter(r => r.error);
  const pos = found.filter(r => r.sentiment === 'positive');
  const neg = found.filter(r => r.sentiment === 'negative');
  const rec = found.filter(r => r.recommended);
  const sovPct = ok.length ? Math.round(found.length / ok.length * 100) : 0;
  const recPct = ok.length ? Math.round(rec.length / ok.length * 100) : 0;

  // ── Platform counts ──
  const pc = {};
  all.forEach(r => { if (!pc[r.platform]) pc[r.platform]={t:0,f:0}; pc[r.platform].t++; if(r.mentioned)pc[r.platform].f++; });

  // ── KPI Cards (4 cards matching preview) ──
  kpis.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--green);">${sovPct}%</div><div class="score-label">Mention Rate</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;">${found.length}/${ok.length}</div><div class="score-label">Found / Total</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--blue);">${Object.keys(pc).length}</div><div class="score-label">Platforms</div></div>
    <div class="score-card"><div class="score-val" style="font-size:24px;color:var(--purple);">${recPct}%</div><div class="score-label">Recommended</div></div>
  </div>`;
  let chips = `<span class="plat-filter ${mentionsPlatFilter==='all'?'active-filter':''}" onclick="mentionsPlatFilter='all';mentionsPage=0;mentionsExpandedRow=null;renderMentions()">All</span>`;
  PLATS.forEach(p=>{
    const on=mentionsPlatFilter===p;
    const c=pc[p]||{t:0,f:0};
    const dim=c.t===0?' style="opacity:.45"':'';
    chips+=`<span class="plat-filter ${on?'active-filter':''}"${dim} onclick="mentionsPlatFilter='${escAttr(p)}';mentionsPage=0;mentionsExpandedRow=null;renderMentions()">${esc(p)}</span>`;
  });
  // Also include any platforms from data not in PLATS
  Object.keys(pc).filter(p=>!PLATS.includes(p)).forEach(p=>{
    const on=mentionsPlatFilter===p;
    chips+=`<span class="plat-filter ${on?'active-filter':''}" onclick="mentionsPlatFilter='${escAttr(p)}';mentionsPage=0;mentionsExpandedRow=null;renderMentions()">${esc(p)}</span>`;
  });
  platFilters.innerHTML = chips;

  // ── Filter + search ──
  const fv = el('mentions-filter-sel').value;
  const sq = (el('mentions-search').value||'').trim().toLowerCase();
  const filtered = all.filter(r => {
    if (mentionsPlatFilter!=='all' && r.platform!==mentionsPlatFilter) return false;
    if (fv==='mentioned' && !r.mentioned) return false;
    if (fv==='not-mentioned' && (r.mentioned||r.error)) return false;
    if (fv==='recommended' && !r.recommended) return false;
    if (fv==='errors' && !r.error) return false;
    if (sq && !((r.platform||'')+' '+(r.query||'')+' '+(r.raw||r.context||'')).toLowerCase().includes(sq)) return false;
    return true;
  });

  if (!filtered.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:48px 0;"><p>No results match your filters.</p></div>';
    return;
  }

  const effectivePerPage = MENTIONS_PER_PAGE === 0 ? filtered.length : MENTIONS_PER_PAGE;
  const pages = effectivePerPage > 0 ? Math.ceil(filtered.length / effectivePerPage) : 1;
  if (mentionsPage >= pages) mentionsPage = pages - 1;
  if (mentionsPage < 0) mentionsPage = 0;
  const from = mentionsPage * effectivePerPage;
  const slice = filtered.slice(from, from + effectivePerPage);

  // ── Results table (preview design) ──
  let html = `<div class="card" style="padding:0;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:var(--bg3);"><th class="th">Platform</th><th class="th">Query</th><th class="th">Status</th><th class="th">Sentiment</th><th class="th">Position</th></tr></thead>
      <tbody>`;
  slice.forEach((r, i) => {
    const t = PLAT_THEME[r.platform]||{};
    const isErr = r.error;
    const sent = r.sentiment||'neutral';
    const statusHtml = isErr ? '<span style="color:var(--amber);font-family:var(--mono);font-size:10px;font-weight:700;">ERROR</span>'
      : r.mentioned ? '<span class="status-found">FOUND</span>'
      : '<span class="status-notfound">NOT FOUND</span>';
    const sentColor = sent==='positive' ? 'var(--green)' : sent==='negative' ? 'var(--red)' : 'var(--muted)';
    const sentLabel = isErr || !r.mentioned ? '—' : `<span style="color:${sentColor};">${sent.charAt(0).toUpperCase()+sent.slice(1)}</span>`;
    const posLabel = r.mentioned && r.listPosition ? '#'+r.listPosition : '—';
    html += `<tr class="trow" style="cursor:pointer;" onclick="toggleMentionRow(${from+i})">
      <td class="td"><span style="color:${t.color||'#888'};font-weight:700;">${esc(r.platform)}</span></td>
      <td class="td">${esc(r.query)}</td>
      <td class="td">${statusHtml}</td>
      <td class="td">${sentLabel}</td>
      <td class="td">${posLabel}</td>
    </tr>`;
    // Expanded detail row
    if (mentionsExpandedRow === from + i) {
      const full = isErr ? friendlyError(r.errorMessage) : (r.raw||r.context||'');
      const hre = brandHighlightRe(b);
      const hlHtml = hre ? mdToHtml(full).replace(hre, (m) => '<mark style="background:rgba(16,185,129,.12);color:var(--green);border-radius:3px;padding:1px 4px;">'+esc(m)+'</mark>') : mdToHtml(full);
      html += `<tr><td colspan="5" style="padding:16px;background:var(--bg);border-bottom:1px solid var(--bg3);">
        <div style="background:var(--bg3);padding:14px;border-radius:var(--radius-xs);font-size:12px;color:var(--text);line-height:1.7;border-left:3px solid ${r.mentioned?'var(--green)':'var(--red)'};">${hlHtml}</div>
        <div style="margin-top:8px;font-family:var(--mono);font-size:9px;color:var(--muted);">Position: ${posLabel} &middot; Sentiment: ${sent} &middot; Recommended: ${r.recommended?'Yes':'No'}</div>
      </td></tr>`;
    }
  });
  html += `</tbody></table></div>`;
  // Pagination footer
  const showingEnd = MENTIONS_PER_PAGE === 0 ? filtered.length : Math.min(from + MENTIONS_PER_PAGE, filtered.length);
  html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;flex-wrap:wrap;gap:8px;">`;
  html += `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);">Showing ${from+1}–${showingEnd} of ${filtered.length} results</div>`;

  // Per-page selector
  html += `<div style="display:flex;align-items:center;gap:8px;">`;
  html += `<span style="font-size:11px;color:var(--muted);">Show:</span>`;
  [15, 25, 50, 100, 0].forEach(n => {
    const label = n === 0 ? 'All' : n;
    const isActive = MENTIONS_PER_PAGE === n;
    html += `<button style="padding:4px 10px;border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};background:${isActive ? 'var(--primary)' : 'var(--bg2)'};color:${isActive ? '#fff' : 'var(--muted)'};font-family:var(--mono);font-size:10px;font-weight:600;cursor:pointer;border-radius:var(--radius-xs);" onclick="MENTIONS_PER_PAGE=${n};mentionsPage=0;mentionsExpandedRow=null;renderMentions()">${label}</button>`;
  });
  html += `</div>`;
  html += `</div>`;

  // Page buttons
  if (pages > 1) {
    const ps = Math.max(0, Math.min(mentionsPage - 2, pages - 5));
    const pe = Math.min(pages - 1, ps + 4);
    html += `<div style="display:flex;justify-content:center;gap:4px;margin-top:4px;">`;
    if (mentionsPage > 0) html += `<button class="pbtn" onclick="mentionsPage--;mentionsExpandedRow=null;renderMentions()">‹</button>`;
    for (let p=ps;p<=pe;p++) html += `<button class="pbtn" style="${p===mentionsPage?'background:var(--primary);color:#fff;border-color:var(--primary);':''}" onclick="mentionsPage=${p};mentionsExpandedRow=null;renderMentions()">${p+1}</button>`;
    if (mentionsPage < pages-1) html += `<button class="pbtn" onclick="mentionsPage++;mentionsExpandedRow=null;renderMentions()">›</button>`;
    html += `</div>`;
  }

  cont.innerHTML = html;
}

function openResp(mentionId){
  try {
    const b = brand();
    if (!b) return;
    let m = null;
    // Search all runs
    (b.runs||[]).forEach(r => {
      (r.mentions||[]).forEach(x => { if(x.id===mentionId) m=x; });
    });
    if (!m) (b.mentions||[]).forEach(x => { if(x.id===mentionId) m=x; });
    if (!m) return;
    const t = PLAT_THEME[m.platform]||{};
    const head = el('resp-modal-head');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!head || !titleEl || !queryEl || !textEl) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(m.platform) + ' <span style="color:var(--green);font-size:11px;">— FOUND</span>';
    queryEl.innerHTML = esc(m.query) + (m.time ? '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;">Captured: '+new Date(m.time).toLocaleString()+'</div>' : '');
    textEl.style.whiteSpace = 'normal';
    const rawHtml = mdToHtml(m.raw || m.context || '');
    const hre = brandHighlightRe(b);
    textEl.innerHTML = hre ? rawHtml.replace(hre, (m) => '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">'+esc(m)+'</mark>') : rawHtml;
    // Citations
    const cc = el('resp-modal-cites');
    const cites = m.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openResp error:', e); }
}

function openResultFromRun(runId, platform, encodedQuery){
  try {
    const b = brand();
    if (!b) return;
    const q = decodeURIComponent(atob(encodedQuery));
    const run = (b.runs||[]).find(r => r.id === runId);
    if (!run || !run.allResults) return;
    const result = run.allResults.find(x => x.platform===platform && x.query===q);
    if (!result) return;
    const t = PLAT_THEME[platform]||{};
    const head = el('resp-modal-head');
    if (!head) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!titleEl || !queryEl || !textEl) return;
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red);font-size:11px;">— NOT FOUND</span>');
    queryEl.innerHTML = esc(q);
    textEl.style.whiteSpace = 'normal';
    const rawHtml1 = mdToHtml(result.raw || result.context || '[No response text]');
    const hre1 = brandHighlightRe(b);
    textEl.innerHTML = hre1 ? rawHtml1.replace(hre1, '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">$1</mark>') : rawHtml1;
    // Show citations if any
    const cc = el('resp-modal-cites');
    const cites = result.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openResultFromRun error:', e); }
}

function openFullResult(platform, encodedQuery){
  try {
    const b = brand();
    if (!b) return;
    const q = decodeURIComponent(atob(encodedQuery));
    const proofSel = el('proof-run-sel');
    if (!proofSel) return;
    const run = (b.runs||[]).find(r => r.id === proofSel.value);
    if (!run || !run.allResults) return;
    const result = run.allResults.find(x => x.platform===platform && x.query===q);
    if (!result) return;
    const t = PLAT_THEME[platform]||{};
    const head = el('resp-modal-head');
    const titleEl = el('resp-modal-title');
    const queryEl = el('resp-modal-query');
    const textEl = el('resp-modal-text');
    if (!head || !titleEl || !queryEl || !textEl) return;
    head.style.background = t.bg||'var(--bg2)';
    head.style.borderBottom = '1px solid '+(t.color||'var(--border)');
    titleEl.innerHTML = (t.logo||'') + ' ' + esc(platform) + (result.mentioned ? ' <span style="color:var(--green);font-size:11px;">— FOUND</span>' : ' <span style="color:var(--red);font-size:11px;">— NOT FOUND</span>');
    queryEl.innerHTML = esc(q);
    textEl.style.whiteSpace = 'normal';
    const rawHtml2 = mdToHtml(result.raw || result.context || '[No response text]');
    const hre2 = brandHighlightRe(b);
    textEl.innerHTML = hre2 ? rawHtml2.replace(hre2, '<mark style="background:rgba(255,97,84,.2);color:var(--green);border-radius:4px;padding:1px 4px;">$1</mark>') : rawHtml2;
    // Show citations
    const cc = el('resp-modal-cites');
    const cites = result.citations||[];
    if (cc) {
      if (cites.length) {
        cc.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px;">SOURCES (' + cites.length + ')</div>'
          + cites.map((c,i)=>`<div style="font-family:var(--mono);font-size:10px;margin-bottom:4px;"><span style="color:var(--muted)">[${i+1}]</span> <a href="${safeHref(c)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${esc(c)}</a></div>`).join('');
      } else cc.innerHTML = '';
    }
    openModal('resp-modal');
  } catch(e) { console.error('openFullResult error:', e); }
}

// ─── EVIDENCE & PROOF ─────────────────────────────────────────────
let _proofView = 'grouped';
function setProofView(mode){
  _proofView = mode;
  el('proof-view-grouped').classList.toggle('active', mode==='grouped');
  el('proof-view-flat').classList.toggle('active', mode==='flat');
  renderProof();
}

function renderProof(){
  const b = brand();
  if (!b) return;
  const sel = el('proof-run-sel');
  const curVal = sel.value;
  sel.innerHTML = '';
  (b.runs||[]).slice().reverse().forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    const d = new Date(r.time || r.date || 0);
    const dateStr = isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    opt.textContent = dateStr + ' \u2014 SOV '+r.sov+'%';
    sel.appendChild(opt);
  });
  if (curVal && [...sel.options].some(o=>o.value===curVal)) sel.value = curVal;

  const run = (b.runs||[]).find(r => r.id === sel.value);
  const cont = el('proof-container');
  const summaryEl = el('proof-summary-strip');

  if (!run) {
    if (summaryEl) summaryEl.innerHTML = '';
    cont.innerHTML = `<div style="text-align:center;padding:70px 20px;">
      <div style="font-size:36px;opacity:.25;margin-bottom:12px;">&#9670;</div>
      <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px;">No runs yet</div>
      <div style="color:var(--muted);font-size:12px;">Click <strong style="color:var(--primary);">Run Queries</strong> to start.</div>
    </div>`;
    return;
  }

  const platFilter = el('proof-plat-sel').value;
  const resultFilter = el('proof-result-sel').value;
  const allResults = run.allResults || [];
  const runQueries = run.queries || [];
  const resultQueries = [...new Set(allResults.map(r => r.query))];
  const queries = runQueries.length ? runQueries : (resultQueries.length ? resultQueries : (b.queries||[]));

  const totalResults = allResults.length;
  const foundCount = allResults.filter(r => r.mentioned).length;
  const notFoundCount = totalResults - foundCount - allResults.filter(r => r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const queryCount = queries.length;
  const uniquePlats = [...new Set(allResults.map(r => r.platform))];
  const platCount = uniquePlats.length;
  const sovPct = run.sov || 0;
  const sovColor = sovPct >= 70 ? '#10b981' : sovPct >= 40 ? '#f59e0b' : '#ef4444';
  const foundPct = totalResults > 0 ? Math.round((foundCount/totalResults)*100) : 0;
  const nfPct = totalResults > 0 ? Math.round((notFoundCount/totalResults)*100) : 0;

  const sentPos = allResults.filter(r => r.sentiment === 'positive').length;
  const sentNeg = allResults.filter(r => r.sentiment === 'negative').length;
  const sentNeu = totalResults - sentPos - sentNeg;

  // Per-query & per-platform stats
  const qStats = {};
  allResults.forEach(r => {
    if (!qStats[r.query]) qStats[r.query] = {found:0,total:0};
    qStats[r.query].total++;
    if (r.mentioned) qStats[r.query].found++;
  });
  let bestQ = '', worstQ = '', bestS = -1, worstS = 101;
  Object.entries(qStats).forEach(([q,s]) => {
    const sv = s.total > 0 ? Math.round((s.found/s.total)*100) : 0;
    if (sv > bestS) { bestS = sv; bestQ = q; }
    if (sv < worstS) { worstS = sv; worstQ = q; }
  });
  const platStats = {};
  allResults.forEach(r => {
    if (!platStats[r.platform]) platStats[r.platform] = {found:0,total:0};
    platStats[r.platform].total++;
    if (r.mentioned) platStats[r.platform].found++;
  });

  // ── SCORE BANNER ──
  const sovDash = Math.round((sovPct / 100) * 226.2);
  let sh = `<div class="ep-banner">
    <div class="ep-banner-ring">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="var(--bg3)" stroke-width="5"/>
        <circle cx="40" cy="40" r="36" fill="none" stroke="${sovColor}" stroke-width="5"
          stroke-dasharray="226.2" stroke-dashoffset="${226.2 - sovDash}" stroke-linecap="round"
          transform="rotate(-90 40 40)" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1);"/>
      </svg>
      <div class="ep-banner-ring-lbl">
        <span class="ep-banner-ring-pct" style="color:${sovColor};">${sovPct}%</span>
        <span class="ep-banner-ring-sub">SOV</span>
      </div>
    </div>
    <div class="ep-banner-metrics">
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--green);">${foundCount}</div>
        <div class="ep-banner-metric-lbl">Found</div>
        <div class="ep-banner-metric-bar"><div style="width:${foundPct}%;background:var(--green);"></div></div>
      </div>
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--red);">${notFoundCount}</div>
        <div class="ep-banner-metric-lbl">Not Found</div>
        <div class="ep-banner-metric-bar"><div style="width:${nfPct}%;background:var(--red);"></div></div>
      </div>
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--text);">${queryCount}</div>
        <div class="ep-banner-metric-lbl">Queries</div>
      </div>
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--blue);">${platCount}</div>
        <div class="ep-banner-metric-lbl">Platforms</div>
      </div>
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--text);">${totalResults}</div>
        <div class="ep-banner-metric-lbl">Total Checks</div>
      </div>
      <div class="ep-banner-metric">
        <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
          <span style="font-family:var(--mono);font-size:14px;font-weight:800;color:var(--green);">${sentPos}</span>
          <span style="font-family:var(--mono);font-size:12px;color:var(--muted);">${sentNeu}</span>
          <span style="font-family:var(--mono);font-size:14px;font-weight:800;color:var(--red);">${sentNeg}</span>
        </div>
        <div class="ep-banner-metric-lbl">Sentiment</div>
      </div>
      ${errorCount ? `<div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--amber);">${errorCount}</div>
        <div class="ep-banner-metric-lbl">Errors</div>
      </div>` : `<div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="color:var(--green);">${foundPct}%</div>
        <div class="ep-banner-metric-lbl">Hit Rate</div>
      </div>`}
      <div class="ep-banner-metric">
        <div class="ep-banner-metric-val" style="font-size:14px;color:var(--text);">${run.durationMs ? (run.durationMs/1000).toFixed(1)+'s' : '\u2014'}</div>
        <div class="ep-banner-metric-lbl">Run Time</div>
      </div>
    </div>
  </div>`;

  // ── PLATFORM CARDS ──
  sh += `<div class="ep-plat-row">`;
  uniquePlats.forEach(p => {
    const t = PLAT_THEME[p]||{};
    const ps = platStats[p]||{found:0,total:0};
    const pPct = ps.total > 0 ? Math.round((ps.found/ps.total)*100) : 0;
    const pColor = pPct >= 70 ? 'var(--green)' : pPct >= 40 ? 'var(--amber)' : 'var(--red)';
    const ringDash = Math.round((pPct/100)*62.8);
    sh += `<div class="ep-plat-card">
      <span class="ep-plat-dot" style="background:${t.color||'#888'};"></span>
      <div class="ep-plat-info">
        <div class="ep-plat-name">${esc(p)}</div>
        <div class="ep-plat-score" style="color:${pColor};">${ps.found}/${ps.total} found</div>
      </div>
      <div class="ep-plat-minibar">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="var(--bg3)" stroke-width="2.5"/>
          <circle cx="12" cy="12" r="10" fill="none" stroke="${pColor}" stroke-width="2.5"
            stroke-dasharray="62.8" stroke-dashoffset="${62.8-ringDash}" stroke-linecap="round"
            transform="rotate(-90 12 12)"/>
        </svg>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:8px;font-weight:800;color:${pColor};">${pPct}%</span>
      </div>
    </div>`;
  });
  sh += `</div>`;

  // ── INSIGHTS ──
  if (bestQ && Object.keys(qStats).length > 1) {
    sh += `<div class="ep-insights">
      <div class="ep-insight-card">
        <div class="ep-insight-badge" style="background:rgba(16,185,129,.08);color:var(--green);">&#9650;</div>
        <div class="ep-insight-text">
          <div class="ep-insight-label" style="color:var(--green);">Best Query</div>
          <div class="ep-insight-query">${esc(bestQ)}</div>
        </div>
        <div class="ep-insight-pct" style="color:var(--green);">${bestS}%</div>
      </div>
      <div class="ep-insight-card">
        <div class="ep-insight-badge" style="background:rgba(239,68,68,.08);color:var(--red);">&#9660;</div>
        <div class="ep-insight-text">
          <div class="ep-insight-label" style="color:var(--red);">Needs Work</div>
          <div class="ep-insight-query">${esc(worstQ)}</div>
        </div>
        <div class="ep-insight-pct" style="color:var(--red);">${worstS}%</div>
      </div>
    </div>`;
  }

  if (summaryEl) summaryEl.innerHTML = sh;

  // ── FILTER ──
  const filtered = allResults.filter(r => {
    if (platFilter && r.platform !== platFilter) return false;
    if (resultFilter === 'found' && !r.mentioned) return false;
    if (resultFilter === 'notfound' && (r.mentioned || r.error)) return false;
    return true;
  });

  const proofHre = brandHighlightRe(b);

  function buildRow(r, showQ) {
    const t = PLAT_THEME[r.platform]||{};
    const isErr = r.error;
    const isMentioned = r.mentioned;
    const txt = isErr ? '' : (r.raw || r.context || '');
    const excerpt = txt.replace(/[#*_~`]/g,'').replace(/\n/g,' ').substring(0, 260);
    const hl = proofHre ? esc(excerpt).replace(proofHre, m => '<mark style="color:var(--green);background:rgba(16,185,129,.12);padding:0 3px;border-radius:3px;font-weight:700;">'+m+'</mark>') : esc(excerpt);
    const cls = isErr ? 'error' : isMentioned ? 'found' : 'notfound';
    const label = isErr ? 'ERROR' : isMentioned ? 'FOUND' : 'NOT FOUND';
    const model = r.model || '';
    const sent = r.sentiment || 'neutral';
    const sentC = sent==='positive' ? 'var(--green)' : sent==='negative' ? 'var(--red)' : 'var(--muted)';
    const pos = isMentioned && r.listPosition ? '#'+r.listPosition : '';

    return `<div class="ep-row">
      <div class="ep-row-left">
        <div class="ep-row-plat">
          <span class="ep-row-plat-dot" style="background:${t.color||'#888'};"></span>
          <span class="ep-row-plat-name" style="color:${t.color||'#888'};">${esc(r.platform)}</span>
        </div>
        ${model ? '<div class="ep-row-model">'+esc(model)+'</div>' : ''}
      </div>
      <div class="ep-row-mid">
        ${showQ ? '<div class="ep-flat .ep-row-query" style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:4px;font-family:var(--mono);">'+esc(r.query)+'</div>' : ''}
        <div class="ep-row-excerpt ${cls}">
          ${isErr ? '<span style="color:var(--amber);">'+esc(friendlyError(r.errorMessage))+'</span>' : '\u201c'+hl+(excerpt.length>=260?'...':'')+'\u201d'}
        </div>
        <div class="ep-row-tags">
          ${pos ? '<span class="ep-tag"><span class="ep-tag-dot" style="background:var(--blue);"></span>Rank '+pos+'</span>' : ''}
          <span class="ep-tag"><span class="ep-tag-dot" style="background:${sentC};"></span>${sent.charAt(0).toUpperCase()+sent.slice(1)}</span>
          ${r.recommended ? '<span class="ep-tag" style="color:var(--green);"><span class="ep-tag-dot" style="background:var(--green);"></span>Recommended</span>' : ''}
          ${isMentioned && r.competitorMentions && r.competitorMentions.length ? '<span class="ep-tag">'+r.competitorMentions.length+' competitor'+(r.competitorMentions.length>1?'s':'')+'</span>' : ''}
        </div>
      </div>
      <div class="ep-row-right">
        <span class="ep-row-status ${cls}">${label}</span>
      </div>
    </div>`;
  }

  let html = '';

  if (_proofView === 'grouped') {
    const qOrder = [];
    const qMap = {};
    filtered.forEach(r => {
      if (!qMap[r.query]) { qMap[r.query] = []; qOrder.push(r.query); }
      qMap[r.query].push(r);
    });

    qOrder.forEach((q, gi) => {
      const res = qMap[q];
      const qF = res.filter(r => r.mentioned).length;
      const qT = res.length;
      const qSov = qT > 0 ? Math.round((qF/qT)*100) : 0;
      const qC = qSov >= 70 ? 'var(--green)' : qSov >= 40 ? 'var(--amber)' : 'var(--red)';

      // Platform dots: tiny colored squares per platform
      const dots = res.map(r => {
        const t = PLAT_THEME[r.platform]||{};
        const bg = r.error ? 'var(--amber)' : r.mentioned ? 'var(--green)' : 'var(--red)';
        const letter = (r.platform||'?')[0];
        return `<span class="ep-qcard-dot" style="background:${bg};" title="${esc(r.platform)}: ${r.mentioned?'Found':'Not Found'}">${letter}</span>`;
      }).join('');

      const foundOn = res.filter(r => r.mentioned).map(r => r.platform);
      const sub = foundOn.length ? foundOn.join(', ') : 'Not found on any platform';

      html += `<div class="ep-qcard">
        <div class="ep-qcard-head collapsed" onclick="this.classList.toggle('collapsed');this.nextElementSibling.style.display=this.classList.contains('collapsed')?'none':'block';">
          <div class="ep-qcard-idx">${gi+1}</div>
          <div class="ep-qcard-mid">
            <div class="ep-qcard-title">${esc(q)}</div>
            <div class="ep-qcard-sub">${sub}</div>
          </div>
          <div class="ep-qcard-dots">${dots}</div>
          <div class="ep-qcard-stat" style="color:${qC};">${qF}/${qT}</div>
          <div class="ep-qcard-chevron">&#9662;</div>
        </div>
        <div class="ep-qcard-body" style="display:none;">
          ${res.map(r => buildRow(r, false)).join('')}
        </div>
      </div>`;
    });
  } else {
    if (filtered.length) {
      html += `<div class="ep-flat">`;
      filtered.forEach(r => { html += buildRow(r, true); });
      html += `</div>`;
    }
  }

  if (filtered.length > 0) {
    html += `<div class="ep-footer">Showing ${filtered.length} of ${totalResults} results across ${platCount} platform${platCount!==1?'s':''}</div>`;
  }
  cont.innerHTML = html || `<div style="text-align:center;padding:60px 20px;">
    <div style="font-size:28px;opacity:.25;margin-bottom:10px;">&#9671;</div>
    <div style="color:var(--muted);font-size:12px;">No results match your filters.</div>
  </div>`;
}


function exportProofCSV(){
  const b = brand(); if (!b) return;
  const run = (b.runs||[]).find(r => r.id === el('proof-run-sel').value);
  if (!run) return;
  function csvField(val){ const s = String(val||'').replace(/"/g,'""').replace(/\n/g,' '); return '"'+s+'"'; }
  let rows = [['Platform','Query','Mentioned','Sentiment','Recommended','Full Response'].map(csvField).join(',')];
  const allResults = run.allResults || [];
  if (allResults.length) {
    allResults.forEach(r => {
      rows.push([r.platform, r.query, r.mentioned?'Yes':'No', r.sentiment||'', r.recommended?'Yes':'No', r.raw||r.context||''].map(csvField).join(','));
    });
  } else {
    (run.mentions||[]).forEach(m => {
      rows.push([m.platform, m.query, 'Yes', m.sentiment, m.recommended?'Yes':'No', m.raw||m.context||''].map(csvField).join(','));
    });
  }
  const csv = rows.join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'livesov-proof-'+run.date+'.csv';
  a.click();
}

