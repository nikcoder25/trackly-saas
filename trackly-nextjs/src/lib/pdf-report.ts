// @ts-nocheck
/**
 * PDF Report Generator — White-label AI Visibility Report.
 *
 * Produces a polished, print-ready A4 report from a brand's stored runs.
 * Single entry point `generateReport(brand)` returns a PDFKit document
 * stream (the caller buffers it). `@ts-nocheck` is intentional: strict
 * typing against PDFKit's drawing API is low value for a pure-output module.
 *
 * Design language is kept in sync with the dashboard: indigo→violet accent,
 * slate text scale, rounded cards, soft separators, and an honest empty
 * state when a brand has no run data yet.
 */
import PDFDocument from 'pdfkit';

// ─── Brand / palette ────────────────────────────────────────────
const BRANDING = {
  companyName: 'Livesov',
  tagline: 'AI VISIBILITY REPORT',
};

const C = {
  primary:   '#6366F1', // indigo
  primaryDk: '#4F46E5',
  violet:    '#8B5CF6',
  ink:       '#0F172A', // headings
  text:      '#1E293B',
  muted:     '#64748B',
  faint:     '#94A3B8',
  line:      '#E2E8F0',
  lineSoft:  '#EEF2F6',
  bg:        '#F8FAFC',
  white:     '#FFFFFF',
  green:     '#16A34A',
  amber:     '#D97706',
  red:       '#DC2626',
  blue:      '#2563EB',
};

const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];
const PLATFORM_COLOR = {
  ChatGPT: '#10A37F', Perplexity: '#20808D', Claude: '#D97757', Gemini: '#4285F4', Grok: '#111827',
};

// ─── Small helpers ──────────────────────────────────────────────
function sovColor(v) {
  if (v >= 70) return C.green;
  if (v >= 40) return C.amber;
  if (v > 0) return C.red;
  return C.faint;
}
function grade(v) {
  if (v >= 70) return 'Excellent';
  if (v >= 40) return 'Good';
  if (v >= 20) return 'Fair';
  if (v > 0) return 'Emerging';
  return 'Not yet visible';
}
function platSov(raw) {
  if (typeof raw === 'number') return Math.round(raw);
  if (raw && typeof raw === 'object') return Math.round(raw.sov || 0);
  return 0;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Geometry resolved per-doc
function geo(doc) {
  const W = doc.page.width, H = doc.page.height;
  const M = 44;
  return { W, H, M, cw: W - M * 2, bottom: H - 56 };
}

/** Ensure `need` vertical space remains; add a page (and reset cursor) if not. */
function ensure(doc, need) {
  const { bottom, M } = geo(doc);
  if (doc.y + need > bottom) {
    doc.addPage();
    doc.y = M;
    return true;
  }
  return false;
}

function eyebrow(doc, text, x, y, color = C.faint) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(color)
    .text(String(text).toUpperCase(), x, y, { characterSpacing: 1.2 });
}

// Rounded progress bar (track + fill)
function bar(doc, x, y, w, h, pct, color) {
  const p = Math.max(0, Math.min(100, pct));
  doc.save();
  doc.roundedRect(x, y, w, h, h / 2).fill(C.lineSoft);
  if (p > 0) doc.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2).fill(color);
  doc.restore();
}

// Section heading: accent tab + title + optional subtitle + hairline.
function section(doc, title, subtitle) {
  const { M, W } = geo(doc);
  ensure(doc, subtitle ? 64 : 52);
  doc.y += 6;
  const y = doc.y;
  doc.save();
  doc.roundedRect(M, y + 1, 4, 16, 2).fill(C.primary);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(13.5).fillColor(C.ink)
    .text(title, M + 14, y, { width: W - M * 2 - 14 });
  let ny = doc.y;
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text(subtitle, M + 14, ny + 2, { width: W - M * 2 - 14 });
    ny = doc.y;
  }
  ny += 8;
  doc.save();
  doc.moveTo(M, ny).lineTo(W - M, ny).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.restore();
  doc.y = ny + 12;
}

// ─── Cover band (page 1) ────────────────────────────────────────
function renderCover(doc, brand, reportDate, sov, prevSov) {
  const { W, M } = geo(doc);
  const bandH = 196;

  // Gradient band, full bleed
  const grad = doc.linearGradient(0, 0, W, bandH);
  grad.stop(0, C.primaryDk).stop(0.55, C.primary).stop(1, C.violet);
  doc.save();
  doc.rect(0, 0, W, bandH).fill(grad);
  // soft decorative circles
  doc.fillOpacity(0.08).fill(C.white);
  doc.circle(W - 60, 36, 120).fill(C.white);
  doc.circle(W - 140, bandH - 10, 70).fill(C.white);
  doc.fillOpacity(1);
  doc.restore();

  // Logo mark + wordmark
  doc.save();
  doc.roundedRect(M, 40, 26, 26, 7).fill(C.white);
  doc.lineWidth(2).strokeColor(C.primary).lineCap('round').lineJoin('round');
  // wave glyph (scaled from the app logo)
  const gx = M + 5, gy = 40 + 5, s = 16 / 14;
  doc.moveTo(gx + 2 * s, gy + 9 * s)
    .lineTo(gx + 4.5 * s, gy + 9 * s)
    .lineTo(gx + 6 * s, gy + 4 * s)
    .lineTo(gx + 8 * s, gy + 11 * s)
    .lineTo(gx + 9.5 * s, gy + 7 * s)
    .lineTo(gx + 12 * s, gy + 7 * s).stroke();
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.white)
    .text(BRANDING.companyName.toLowerCase(), M + 34, 46);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.white).fillOpacity(0.85)
    .text(BRANDING.tagline, M + 34, 65, { characterSpacing: 1.6 });
  doc.fillOpacity(1);

  // Title + brand name
  doc.font('Helvetica').fontSize(10).fillColor(C.white).fillOpacity(0.85)
    .text('Prepared for', M, 104);
  doc.fillOpacity(1);
  doc.font('Helvetica-Bold').fontSize(28).fillColor(C.white)
    .text(brand.name || 'Your Brand', M, 118, { width: W - M * 2 - 150, lineBreak: false, ellipsis: true });

  // Date chip (right)
  doc.font('Helvetica').fontSize(9.5).fillColor(C.white).fillOpacity(0.9)
    .text(reportDate, W - M - 200, 122, { width: 200, align: 'right' });
  doc.fillOpacity(1);

  // Headline SOV pill overlapping the band bottom
  const pillW = W - M * 2, pillY = bandH - 32, pillH = 66;
  doc.save();
  doc.roundedRect(M, pillY, pillW, pillH, 12).fill(C.white);
  doc.restore();
  eyebrow(doc, 'Overall Share of Voice', M + 22, pillY + 13, C.faint);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(sovColor(sov))
    .text(`${sov}%`, M + 22, pillY + 26);
  const afterNumX = M + 22 + doc.widthOfString(`${sov}%`) + 16;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink)
    .text(grade(sov), afterNumX, pillY + 28);
  if (prevSov !== null && prevSov !== undefined) {
    const diff = sov - prevSov;
    const col = diff > 0 ? C.green : diff < 0 ? C.red : C.muted;
    const txt = diff === 0 ? 'No change vs previous run' : `${diff > 0 ? '+' : ''}${diff} pts vs previous run`;
    doc.font('Helvetica').fontSize(9).fillColor(col).text(txt, afterNumX, pillY + 46);
  } else {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('First tracked run', afterNumX, pillY + 46);
  }
  // right: mini SOV bar
  const barW = 150, barX = W - M - barW - 22;
  bar(doc, barX, pillY + 30, barW, 8, sov, sovColor(sov));
  doc.font('Helvetica').fontSize(8).fillColor(C.faint)
    .text('0', barX, pillY + 42).text('100', barX + barW - 16, pillY + 42, { width: 16, align: 'right' });

  doc.y = pillY + pillH + 18;
}

// ─── Executive summary KPI cards ────────────────────────────────
function renderSummary(doc, lastRun) {
  const { M, cw } = geo(doc);
  section(doc, 'Executive Summary', 'Key visibility metrics from your most recent run across all AI engines.');

  const results = (lastRun && Array.isArray(lastRun.allResults)) ? lastRun.allResults : [];
  const valid = results.filter(r => !r.error);
  const total = valid.length || results.length;
  const mentions = valid.filter(r => r.mentioned).length;
  const pos = valid.filter(r => r.sentiment === 'positive').length;
  const neu = valid.filter(r => r.sentiment === 'neutral').length;
  const neg = valid.filter(r => r.sentiment === 'negative').length;
  const sentTotal = pos + neu + neg;
  const posPct = sentTotal > 0 ? Math.round((pos / sentTotal) * 100) : null;
  const activePlats = lastRun && lastRun.platforms ? Object.keys(lastRun.platforms).length : new Set(valid.map(r => r.platform)).size;
  const distinctQ = new Set(valid.map(r => r.query)).size;

  const cards = [
    { label: 'Mentions', value: total ? `${mentions}/${total}` : '—', sub: 'AI answers naming you', color: C.primary },
    { label: 'Positive sentiment', value: posPct !== null ? `${posPct}%` : '—', sub: posPct !== null ? `${pos} positive of ${sentTotal}` : 'no sentiment yet', color: posPct === null ? C.faint : posPct >= 60 ? C.green : posPct >= 40 ? C.amber : C.red },
    { label: 'Engines active', value: `${activePlats}/${PLATFORMS.length}`, sub: 'platforms responding', color: C.blue },
    { label: 'Prompts tracked', value: String(distinctQ || 0), sub: 'unique queries', color: C.violet },
  ];

  const gap = 12;
  const cardW = (cw - gap * (cards.length - 1)) / cards.length;
  const cardH = 78;
  ensure(doc, cardH + 6);
  const y = doc.y;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 10).fill(C.bg);
    doc.roundedRect(x, y, cardW, cardH, 10).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.roundedRect(x, y, 3, cardH, 1.5).fill(c.color); // left accent
    doc.restore();
    eyebrow(doc, c.label, x + 14, y + 13, C.muted);
    doc.font('Helvetica-Bold').fontSize(22).fillColor(c.color).text(c.value, x + 13, y + 26, { width: cardW - 20 });
    doc.font('Helvetica').fontSize(8).fillColor(C.faint).text(c.sub, x + 14, y + 56, { width: cardW - 22 });
  });
  doc.y = y + cardH + 6;
}

// ─── Platform breakdown ─────────────────────────────────────────
function renderPlatforms(doc, lastRun) {
  if (!lastRun || !lastRun.platforms) return;
  const { M, W, cw } = geo(doc);
  section(doc, 'Platform Breakdown', 'Share of Voice within each AI assistant.');

  const platforms = lastRun.platforms || {};
  const labelW = 110, valW = 46;
  const barX = M + labelW + valW;
  const barW = W - M - barX - 20;
  const rowH = 30;

  PLATFORMS.forEach((plat, i) => {
    ensure(doc, rowH + 2);
    const y = doc.y;
    if (i % 2 === 0) { doc.save(); doc.roundedRect(M - 6, y - 4, cw + 12, rowH, 6).fill(C.bg); doc.restore(); }
    const v = platSov(platforms[plat]);
    // dot + name
    doc.save(); doc.circle(M + 5, y + 9, 4).fill(PLATFORM_COLOR[plat] || C.muted); doc.restore();
    doc.font('Helvetica').fontSize(10).fillColor(C.text).text(plat, M + 16, y + 4, { width: labelW - 16 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(sovColor(v)).text(`${v}%`, M + labelW, y + 4, { width: valW });
    bar(doc, barX, y + 6, barW, 9, v, sovColor(v));
    doc.y = y + rowH;
  });
  doc.y += 4;
}

// ─── Top queries table ──────────────────────────────────────────
function renderTopQueries(doc, lastRun) {
  if (!lastRun || !Array.isArray(lastRun.allResults) || !lastRun.allResults.length) return;
  const { M, W, cw } = geo(doc);

  const stats = {};
  lastRun.allResults.filter(r => !r.error).forEach(r => {
    const q = r.query || 'Unknown';
    if (!stats[q]) stats[q] = { total: 0, found: 0 };
    stats[q].total++;
    if (r.mentioned) stats[q].found++;
  });
  const rows = Object.entries(stats)
    .map(([q, s]) => ({ q, ...s, rate: s.total ? Math.round((s.found / s.total) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate).slice(0, 10);
  if (!rows.length) return;

  section(doc, 'Top Performing Queries', 'Where you are most visible — mention rate per tracked prompt.');

  const numW = 22, rateW = 50, foundW = 56;
  const qW = cw - numW - rateW - foundW;
  // header
  let y = doc.y;
  eyebrow(doc, '#', M, y, C.faint);
  eyebrow(doc, 'Query', M + numW, y, C.faint);
  eyebrow(doc, 'Found', M + numW + qW, y, C.faint);
  eyebrow(doc, 'Rate', M + numW + qW + foundW, y, C.faint);
  y += 14;
  doc.save(); doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(C.line).stroke(); doc.restore();
  y += 6;
  doc.y = y;

  rows.forEach((r, i) => {
    ensure(doc, 24);
    const ry = doc.y;
    if (i % 2 === 0) { doc.save(); doc.roundedRect(M - 6, ry - 3, cw + 12, 22, 5).fill(C.bg); doc.restore(); }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.faint).text(String(i + 1), M, ry, { width: numW });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(r.q, M + numW, ry, { width: qW - 8, ellipsis: true, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`${r.found}/${r.total}`, M + numW + qW, ry, { width: foundW });
    // rate chip
    const chipX = M + numW + qW + foundW;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sovColor(r.rate)).text(`${r.rate}%`, chipX, ry, { width: rateW });
    doc.y = ry + 19;
  });
  doc.y += 4;
}

// ─── Competitor comparison ──────────────────────────────────────
function renderCompetitors(doc, brand, lastRun) {
  if (!lastRun || !Array.isArray(lastRun.allResults) || !lastRun.allResults.length) return;
  const { M, W, cw } = geo(doc);

  const brandName = (brand.name || '').toLowerCase();
  const comp = {};
  lastRun.allResults.forEach(r => {
    const text = r.raw || r.context || '';
    if (!text) return;
    const pats = [
      /(?:^|\n)\s*\d+[.)]\s*\*?\*?([A-Z][A-Za-z0-9' &\-.]+)\*?\*?/g,
      /(?:^|\n)\s*[-•]\s*\*?\*?([A-Z][A-Za-z0-9' &\-.]+)\*?\*?/g,
    ];
    pats.forEach(pat => {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const name = m[1].trim().replace(/\*+/g, '').replace(/\s*[-—:].*/, '').trim();
        if (name.length >= 3 && name.length <= 40 && name.toLowerCase() !== brandName &&
          !/^(the|and|for|with|best|top|most|also|here|this|that|these|note)$/i.test(name)) {
          comp[name] = (comp[name] || 0) + 1;
        }
      }
    });
  });
  const brandMentions = lastRun.allResults.filter(r => r.mentioned).length;
  const top = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (!top.length) return;

  section(doc, 'Competitor Comparison', 'How often each brand appears in the same AI answers.');

  const labelW = 150, valW = 40;
  const barX = M + labelW;
  const barW = W - M - barX - valW - 8;
  const maxCount = Math.max(brandMentions, top[0][1], 1);
  const rowH = 26;

  const draw = (name, count, isYou) => {
    ensure(doc, rowH);
    const y = doc.y;
    doc.font(isYou ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
      .fillColor(isYou ? C.primary : C.text)
      .text(isYou ? `${name} (You)` : name, M, y + 2, { width: labelW - 8, ellipsis: true, lineBreak: false });
    bar(doc, barX, y + 4, barW, 9, (count / maxCount) * 100, isYou ? C.primary : C.faint);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(isYou ? C.primary : C.muted)
      .text(`${count}×`, barX + barW + 6, y + 3, { width: valW });
    doc.y = y + rowH;
  };
  draw(brand.name || 'Your brand', brandMentions, true);
  top.forEach(([n, c]) => draw(n, c, false));
  doc.y += 4;
}

// ─── Citation sources ───────────────────────────────────────────
function renderCitations(doc, brand, lastRun) {
  if (!lastRun || !Array.isArray(lastRun.allResults)) return;
  const cites = [];
  lastRun.allResults.forEach(r => (r.citations || r.cites || []).forEach(u => cites.push(u)));
  if (!cites.length) return;
  const { M, W, cw } = geo(doc);

  const counts = {};
  cites.forEach(u => { try { const d = new URL(u).hostname.replace(/^www\./, ''); counts[d] = (counts[d] || 0) + 1; } catch { /* skip */ } });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) return;

  section(doc, 'Citation Sources', `${top.length} domains referenced across ${cites.length} citations in AI answers.`);
  const brandDomain = brand.website ? brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : '';
  const labelW = 230, valW = 36;
  const barX = M + labelW, barW = W - M - barX - valW - 8, max = top[0][1];

  top.forEach(([domain, count]) => {
    ensure(doc, 22);
    const y = doc.y;
    const own = brandDomain && domain.includes(brandDomain);
    let tx = M;
    if (own) { doc.save(); doc.circle(M + 4, y + 6, 3).fill(C.primary); doc.restore(); tx = M + 12; }
    doc.font(own ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(own ? C.primary : C.text)
      .text(domain, tx, y + 1, { width: labelW - (own ? 20 : 8), ellipsis: true, lineBreak: false });
    bar(doc, barX, y + 3, barW, 8, (count / max) * 100, own ? C.primary : C.blue);
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`${count}×`, barX + barW + 6, y + 1, { width: valW });
    doc.y = y + 19;
  });
  doc.y += 4;
}

// ─── Recommendations ────────────────────────────────────────────
function renderRecommendations(doc, brand, lastRun) {
  const { M, W, cw } = geo(doc);
  const tips = [];
  const sov = lastRun ? Math.round(lastRun.sov || 0) : 0;

  if (lastRun && Array.isArray(lastRun.allResults)) {
    const platStats = {}; let mentioned = 0, total = 0, recommended = 0, neg = 0;
    lastRun.allResults.filter(r => !r.error).forEach(r => {
      total++;
      (platStats[r.platform] = platStats[r.platform] || { t: 0, f: 0 }).t++;
      if (r.mentioned) { mentioned++; platStats[r.platform].f++; if (r.recommended) recommended++; if (r.sentiment === 'negative') neg++; }
    });
    const strong = [], weak = [];
    Object.entries(platStats).forEach(([p, s]) => ((s.t > 0 && s.f / s.t >= 0.5) ? strong : weak).push(p));
    if (strong.length && weak.length) tips.push({ t: 'Close platform gaps', d: `You're strong on ${strong.join(', ')} but weak on ${weak.join(', ')}. Different engines pull from different sources — diversify your presence and tailor content per platform.` });
    if (sov === 0 && total > 0) tips.push({ t: 'Build a foundation', d: "AI engines haven't picked up your brand yet. Prioritise structured data, review profiles (Google, Yelp) and authoritative backlinks — the sources models reference." });
    else if (sov > 0 && sov < 30) tips.push({ t: 'Grow visibility', d: `You appear in ${sov}% of queries. Publish FAQ-style content that directly answers buyer questions and fully optimise your Google Business Profile.` });
    if (neg > 0) tips.push({ t: 'Address negative sentiment', d: `${neg} response${neg > 1 ? 's' : ''} show negative sentiment. Review what AI says about you and fix the underlying customer-experience issues.` });
    const recRate = mentioned > 0 ? recommended / mentioned : 0;
    if (mentioned > 0 && recRate < 0.3) tips.push({ t: 'Earn more recommendations', d: 'AI mentions you but rarely recommends you. Grow positive reviews, add testimonials and build authority with case studies.' });
    const cites = []; lastRun.allResults.forEach(r => (r.citations || r.cites || []).forEach(u => cites.push(u)));
    if (cites.length && brand.website) {
      const bd = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      const has = cites.some(u => { try { return new URL(u).hostname.replace(/^www\./, '').includes(bd); } catch { return false; } });
      if (!has) tips.push({ t: 'Earn citations', d: 'AI cites external sources but not your site. Publish authoritative, crawlable content and build domain authority to become a cited source.' });
    }
  }
  if (!tips.length) tips.push({ t: 'Keep monitoring', d: 'Run your prompts regularly to track AI visibility over time and catch changes early.' });

  section(doc, 'Recommendations', 'Prioritised actions to grow your AI share of voice.');

  tips.slice(0, 5).forEach((tip, i) => {
    // measure description height for the card
    doc.font('Helvetica').fontSize(9.5);
    const descH = doc.heightOfString(tip.d, { width: cw - 58 });
    const cardH = Math.max(44, descH + 30);
    ensure(doc, cardH + 8);
    const y = doc.y;
    doc.save();
    doc.roundedRect(M, y, cw, cardH, 9).fill(C.bg);
    doc.roundedRect(M, y, cw, cardH, 9).lineWidth(0.8).strokeColor(C.line).stroke();
    // number badge
    doc.circle(M + 22, y + 22, 12).fill(C.primary);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.white).text(String(i + 1), M + 16, y + 16, { width: 12, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.ink).text(tip.t, M + 44, y + 12, { width: cw - 58 });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(tip.d, M + 44, y + 27, { width: cw - 58 });
    doc.y = y + cardH + 8;
  });
}

// ─── Empty state (no runs yet) ──────────────────────────────────
function renderEmpty(doc) {
  const { M, W, cw } = geo(doc);
  section(doc, 'Executive Summary');
  ensure(doc, 120);
  const y = doc.y;
  doc.save();
  doc.roundedRect(M, y, cw, 96, 10).fill(C.bg);
  doc.roundedRect(M, y, cw, 96, 10).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text('No run data yet', M, y + 28, { width: cw, align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text('Run your prompts across the AI engines to populate this report with real visibility data.', M + 40, y + 50, { width: cw - 80, align: 'center' });
  doc.y = y + 96 + 8;
}

// ─── Footer (all pages) ─────────────────────────────────────────
function renderFooter(doc, idx, count) {
  const { W, M, H } = geo(doc);
  const y = H - 40;
  // Writing into the bottom-margin band makes PDFKit auto-add a page; drop the
  // bottom margin for the duration of the footer draw so it stays on this page.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.faint);
  doc.text(`Generated by ${BRANDING.companyName}`, M, y + 8, { width: 200, lineBreak: false });
  doc.text(new Date().toISOString().split('T')[0], M, y + 8, { width: W - M * 2, align: 'center', lineBreak: false });
  doc.text(`Page ${idx + 1} of ${count}`, W - M - 120, y + 8, { width: 120, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = savedBottom;
}

// ─── Main generator ─────────────────────────────────────────────
function generateReport(brand) {
  const doc = new PDFDocument({
    size: 'A4', margin: 44, autoFirstPage: true, bufferPages: true,
    info: {
      Title: `${brand.name || 'Brand'} — AI Visibility Report`,
      Author: BRANDING.companyName, Subject: 'AI Visibility Report', Creator: BRANDING.companyName,
    },
  });

  const runs = Array.isArray(brand.runs) ? brand.runs : [];
  const lastRun = runs.length ? runs[runs.length - 1] : null;
  const prevRun = runs.length > 1 ? runs[runs.length - 2] : null;
  const sov = lastRun ? Math.round(lastRun.sov || 0) : 0;
  const prevSov = prevRun ? Math.round(prevRun.sov || 0) : null;

  renderCover(doc, brand, fmtDate(Date.now()), sov, prevSov);

  if (!lastRun) {
    renderEmpty(doc);
  } else {
    renderSummary(doc, lastRun);
    renderPlatforms(doc, lastRun);
    renderTopQueries(doc, lastRun);
    renderCompetitors(doc, brand, lastRun);
    renderCitations(doc, brand, lastRun);
    renderRecommendations(doc, brand, lastRun);
  }

  // Footer with page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    renderFooter(doc, i, range.count);
  }

  doc.end();
  return doc;
}

export { generateReport, BRANDING };
