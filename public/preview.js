// ===== FUNCTIONS =====

function showView(view) {
  document.querySelectorAll('[id^="view-"]').forEach(function(v) { v.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  if (event && event.target) {
    var btn = event.target.closest ? event.target.closest('.nav-item') : event.target;
    if (btn) btn.classList.add('active');
  }
  var el = document.getElementById('view-' + view);
  if (el) el.style.display = 'block';
  var main = document.getElementById('main-content');
  if (main) main.scrollTop = 0;
}

function switchLogTab(btn, tabId) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('tab-active'); });
  document.querySelectorAll('.log-tab').forEach(function(t) { t.style.display = 'none'; });
  btn.classList.add('tab-active');
  var tab = document.getElementById(tabId);
  if (tab) tab.style.display = 'block';
}

// ===== DATA =====
var platforms = [
  { name: 'ChatGPT', color: '#10a37f', sov: 75, active: true },
  { name: 'Perplexity', color: '#20b8cd', sov: 92, active: true },
  { name: 'Claude', color: '#cc9b7a', sov: 80, active: true },
  { name: 'Gemini', color: '#4285f4', sov: 18, active: true },
  { name: 'Grok', color: '#1d9bf0', sov: 65, active: true },
];

var queryData = [
  { q: 'Best HVAC company in Austin TX', pct: 92 },
  { q: 'Top rated AC repair near me', pct: 83 },
  { q: 'Emergency heating repair Austin', pct: 75 },
  { q: 'HVAC installation cost Texas', pct: 67 },
  { q: 'Who fixes air conditioning Austin', pct: 58 },
  { q: 'Affordable furnace repair', pct: 42 }
];

var allQueryData = [
  { q: 'Best HVAC company in Austin TX', pct: 92 },
  { q: 'Top rated AC repair near me', pct: 83 },
  { q: 'Emergency heating repair Austin', pct: 75 },
  { q: 'HVAC installation cost Texas', pct: 67 },
  { q: 'Who fixes air conditioning Austin', pct: 58 },
  { q: 'Affordable furnace repair', pct: 42 },
  { q: 'Best central heating Austin TX', pct: 83 },
  { q: 'AC not cooling Austin help', pct: 75 },
  { q: 'HVAC company near Round Rock', pct: 58 },
  { q: 'Residential HVAC service Texas', pct: 50 },
  { q: 'Heat pump installation Austin', pct: 33 },
  { q: 'Commercial HVAC contractor', pct: 25 }
];

var compList = [
  { name: 'ABC Cooling Co', count: 14 },
  { name: 'Texas Climate Pros', count: 11 },
  { name: 'CoolAir Pro', count: 9 },
  { name: 'Reliable HVAC', count: 7 },
  { name: 'AirFlow Masters', count: 5 }
];

var citationData = [
  { domain: 'acmehvac.com', count: 12, own: true },
  { domain: 'yelp.com', count: 8, own: false },
  { domain: 'bbb.org', count: 5, own: false },
  { domain: 'homeadvisor.com', count: 4, own: false },
  { domain: 'angi.com', count: 3, own: false },
  { domain: 'reddit.com', count: 2, own: false }
];

var citationDataFull = [
  { domain: 'acmehvac.com', count: 12, own: true },
  { domain: 'yelp.com', count: 8, own: false },
  { domain: 'bbb.org', count: 5, own: false },
  { domain: 'homeadvisor.com', count: 4, own: false },
  { domain: 'angi.com', count: 3, own: false },
  { domain: 'reddit.com', count: 2, own: false },
  { domain: 'trustpilot.com', count: 2, own: false },
  { domain: 'austin360.com', count: 1, own: false }
];

var sovTrendData = [48, 52, 55, 58, 60, 64, 68, 72];

// ===== HELPERS =====
function renderQBar(el, items) {
  if (!el) return;
  var html = '';
  items.forEach(function(q) {
    var c = q.pct >= 50 ? 'var(--green)' : q.pct > 0 ? 'var(--amber)' : 'var(--red)';
    html += '<div class="qbar-row"><span class="qbar-label">' + q.q + '</span><div class="qbar-track"><div class="qbar-fill" style="width:' + q.pct + '%;background:' + c + ';"></div></div><span class="qbar-val" style="color:' + c + ';">' + q.pct + '%</span></div>';
  });
  el.innerHTML = html;
}

function renderCitBars(el, items, maxVal) {
  if (!el) return;
  var html = '';
  items.forEach(function(c) {
    var pct = (c.count / maxVal * 100);
    var star = c.own ? '<span style="color:var(--amber);">★</span> ' : '';
    var col = c.own ? 'var(--amber)' : 'var(--blue)';
    html += '<div class="qbar-row"><span class="qbar-label">' + star + c.domain + '</span><div class="qbar-track"><div class="qbar-fill" style="width:' + pct + '%;background:' + col + ';"></div></div><span class="qbar-val" style="color:var(--muted);">' + c.count + '</span></div>';
  });
  el.innerHTML = html;
}

// ===== RENDER ON LOAD =====
document.addEventListener('DOMContentLoaded', function() {

  // Bind sidebar navigation via data attributes (no inline onclick)
  document.querySelectorAll('[data-view]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var view = btn.getAttribute('data-view');
      document.querySelectorAll('[id^="view-"]').forEach(function(v) { v.style.display = 'none'; });
      document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
      btn.classList.add('active');
      var el = document.getElementById('view-' + view);
      if (el) el.style.display = 'block';
      var main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;
    });
  });

  // Bind log tab switchers
  document.querySelectorAll('[data-logtab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('tab-active'); });
      document.querySelectorAll('.log-tab').forEach(function(t) { t.style.display = 'none'; });
      btn.classList.add('tab-active');
      var tab = document.getElementById(btn.getAttribute('data-logtab'));
      if (tab) tab.style.display = 'block';
    });
  });

  // Overview: platform cards
  var grid = document.getElementById('plat-grid');
  if (grid) {
    var html = '';
    platforms.forEach(function(p) {
      var barColor = p.sov >= 50 ? 'var(--green)' : p.sov > 0 ? 'var(--amber)' : 'var(--bg4)';
      html += '<div class="ov-plat-card">' +
        '<div class="ov-plat-name" style="color:' + p.color + ';">' + p.name + '</div>' +
        '<div class="ov-plat-status" style="color:' + (p.active ? 'var(--green)' : 'var(--muted)') + ';">' + (p.active ? '● ACTIVE' : '○ INACTIVE') + '</div>' +
        '<div class="ov-plat-bar"><div class="ov-plat-bar-fill" style="width:' + p.sov + '%;background:' + barColor + ';"></div></div>' +
        '<div class="ov-plat-sov" style="color:' + p.color + ';">' + p.sov + '%</div>' +
        '</div>';
    });
    grid.innerHTML = html;
  }

  // Overview: query perf bars
  renderQBar(document.getElementById('qperf-bars'), queryData);

  // Overview: competitor chips
  var cEl = document.getElementById('comp-chips');
  if (cEl) {
    var html = '';
    compList.forEach(function(c) {
      html += '<span class="comp-chip">' + c.name + ' <span class="comp-count">' + c.count + 'x</span></span>';
    });
    cEl.innerHTML = html;
  }

  // Overview: citation bars
  renderCitBars(document.getElementById('citation-bars'), citationData, 12);

  // Overview: SOV trend bars
  sovTrendData.forEach(function(v, i) {
    var bar = document.getElementById('bar' + (i + 1));
    if (bar) bar.style.height = (v / 100 * 120) + 'px';
  });

  // Full query perf page
  renderQBar(document.getElementById('qperf-full'), allQueryData);

  // Competitor comparison
  var compCompare = document.getElementById('comp-compare');
  if (compCompare) {
    var compCompareData = [
      { name: 'Acme HVAC (You)', pct: 72, color: 'var(--primary)' },
      { name: 'ABC Cooling Co', pct: 56, color: 'var(--blue)' },
      { name: 'Texas Climate Pros', pct: 44, color: 'var(--purple)' },
      { name: 'CoolAir Pro', pct: 36, color: 'var(--amber)' }
    ];
    var html = '';
    compCompareData.forEach(function(c) {
      var fw = c.name.indexOf('You') !== -1 ? '700' : '400';
      html += '<div class="qbar-row"><span class="qbar-label" style="font-weight:' + fw + ';">' + c.name + '</span><div class="qbar-track"><div class="qbar-fill" style="width:' + c.pct + '%;background:' + c.color + ';"></div></div><span class="qbar-val" style="color:' + c.color + ';">' + c.pct + '%</span></div>';
    });
    compCompare.innerHTML = html;
  }

  // Competitor co-occurrence
  var cooccur = document.getElementById('comp-cooccur');
  if (cooccur) {
    var coData = [
      { name: 'ABC Cooling Co', count: 14 },
      { name: 'Texas Climate Pros', count: 11 },
      { name: 'CoolAir Pro', count: 9 },
      { name: 'Reliable HVAC', count: 7 },
      { name: 'AirFlow Masters', count: 5 }
    ];
    var html = '';
    coData.forEach(function(c) {
      html += '<div class="qbar-row"><span class="qbar-label">' + c.name + '</span><div class="qbar-track"><div class="qbar-fill" style="width:' + (c.count / 14 * 100) + '%;background:var(--purple);"></div></div><span class="qbar-val" style="color:var(--muted);">' + c.count + 'x</span></div>';
    });
    cooccur.innerHTML = html;
  }

  // Full citation page
  renderCitBars(document.getElementById('citation-full'), citationDataFull, 12);

  // Platform status cards
  var platStatus = document.getElementById('plat-status-cards');
  if (platStatus) {
    var html = '';
    platforms.forEach(function(p) {
      var barColor = p.sov >= 50 ? 'var(--green)' : p.sov > 0 ? 'var(--amber)' : 'var(--bg4)';
      html += '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><span style="font-weight:700;color:' + p.color + ';">' + p.name + '</span><span style="font-family:var(--mono);font-size:10px;color:' + (p.active ? 'var(--green)' : 'var(--red)') + ';">' + (p.active ? '● ACTIVE' : '○ INACTIVE') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-family:var(--mono);font-size:10px;color:var(--muted);">SOV</span><span style="font-family:var(--mono);font-size:14px;font-weight:800;color:' + p.color + ';">' + p.sov + '%</span></div>' +
        '<div class="ov-plat-bar" style="height:6px;"><div class="ov-plat-bar-fill" style="width:' + p.sov + '%;background:' + barColor + ';"></div></div>' +
        '<div style="margin-top:10px;font-family:var(--mono);font-size:9px;color:var(--muted);">API: <span style="color:var(--green);">Healthy</span> &middot; Avg response: 1.4s &middot; Cost: $0.012/run</div>' +
        '</div>';
    });
    platStatus.innerHTML = html;
  }

  // Compare toggle
  document.querySelectorAll('.compare-toggle button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.compare-toggle button').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

});
