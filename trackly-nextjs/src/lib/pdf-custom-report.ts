// @ts-nocheck
/**
 * Custom Report generator — a curated PDF built from a user-selected set of
 * mentions and/or queries (the "Add to report" builder output).
 *
 * Entry point: generateCustomReport(brand, selection) → PDFKit doc stream.
 * `selection` = {
 *   title?: string, note?: string,
 *   mentions?: Array<{ platform, query, tag, meta, answer, sources, date }>,
 *   queries?:  Array<{ q, sov, rate, engines }>,
 * }
 *
 * Shares the dashboard's design language (indigo→violet, slate scale,
 * rounded cards) with the standard AI Visibility report.
 */
import PDFDocument from 'pdfkit';

const BRANDING = { companyName: 'Livesov' };

const C = {
  primary: '#6366F1', primaryDk: '#4F46E5', violet: '#8B5CF6',
  ink: '#0F172A', text: '#1E293B', muted: '#64748B', faint: '#94A3B8',
  line: '#E2E8F0', lineSoft: '#EEF2F6', bg: '#F8FAFC', white: '#FFFFFF',
  green: '#16A34A', amber: '#D97706', red: '#DC2626', blue: '#2563EB',
};

const PLATFORM_COLOR = {
  chatgpt: '#10A37F', perplexity: '#20808D', claude: '#D97757', gemini: '#4285F4', grok: '#111827',
};
function platMeta(name) {
  const n = String(name || '').toLowerCase();
  const key = Object.keys(PLATFORM_COLOR).find(k => n.includes(k)) || 'grok';
  const short = { chatgpt: 'GPT', perplexity: 'PRP', claude: 'CLA', gemini: 'GEM', grok: 'GRK' }[key] || (name || '?').slice(0, 3).toUpperCase();
  return { color: PLATFORM_COLOR[key], short };
}
function tagColor(tag) {
  return tag === 'pos' ? C.green : tag === 'neg' ? C.red : tag === 'warn' ? C.amber : C.muted;
}
function sovColor(v) { return v >= 70 ? C.green : v >= 40 ? C.amber : v > 0 ? C.red : C.faint; }
function fmtDate(d) { try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return ''; } }
function clamp(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

function geo(doc) { const W = doc.page.width, H = doc.page.height, M = 44; return { W, H, M, cw: W - M * 2, bottom: H - 56 }; }
function ensure(doc, need) { const { bottom, M } = geo(doc); if (doc.y + need > bottom) { doc.addPage(); doc.y = M; return true; } return false; }
function eyebrow(doc, t, x, y, color = C.faint) { doc.font('Helvetica-Bold').fontSize(8).fillColor(color).text(String(t).toUpperCase(), x, y, { characterSpacing: 1.2 }); }
function bar(doc, x, y, w, h, pct, color) { const p = Math.max(0, Math.min(100, pct)); doc.save(); doc.roundedRect(x, y, w, h, h / 2).fill(C.lineSoft); if (p > 0) doc.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2).fill(color); doc.restore(); }

function section(doc, title, subtitle) {
  const { M, W } = geo(doc);
  ensure(doc, subtitle ? 64 : 52);
  doc.y += 6; const y = doc.y;
  doc.save(); doc.roundedRect(M, y + 1, 4, 16, 2).fill(C.primary); doc.restore();
  doc.font('Helvetica-Bold').fontSize(13.5).fillColor(C.ink).text(title, M + 14, y, { width: W - M * 2 - 14 });
  let ny = doc.y;
  if (subtitle) { doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(subtitle, M + 14, ny + 2, { width: W - M * 2 - 14 }); ny = doc.y; }
  ny += 8; doc.save(); doc.moveTo(M, ny).lineTo(W - M, ny).lineWidth(0.6).strokeColor(C.line).stroke(); doc.restore();
  doc.y = ny + 12;
}

function renderCover(doc, brand, selection, mCount, qCount) {
  const { W, M } = geo(doc);
  // Compute title height first so the gradient band can grow to fit a long
  // title without crowding the info pill below it.
  const title = clamp(selection.title || `${brand.name || 'Brand'} — Custom Report`, 64);
  const titleW = W - M * 2 - 150;
  doc.font('Helvetica-Bold').fontSize(22);
  const titleH = doc.heightOfString(title, { width: titleW });
  const pillH = 58;
  const pillY = Math.max(154, 112 + titleH + 14);
  const bandH = pillY + 30;

  const grad = doc.linearGradient(0, 0, W, bandH);
  grad.stop(0, C.primaryDk).stop(0.55, C.primary).stop(1, C.violet);
  doc.save(); doc.rect(0, 0, W, bandH).fill(grad);
  doc.fillOpacity(0.08).fill(C.white); doc.circle(W - 60, 30, 120).fill(C.white); doc.circle(W - 150, bandH, 70).fill(C.white); doc.fillOpacity(1); doc.restore();

  // mark + wordmark
  doc.save(); doc.roundedRect(M, 38, 26, 26, 7).fill(C.white); doc.lineWidth(2).strokeColor(C.primary).lineCap('round').lineJoin('round');
  const gx = M + 5, gy = 38 + 5, s = 16 / 14;
  doc.moveTo(gx + 2 * s, gy + 9 * s).lineTo(gx + 4.5 * s, gy + 9 * s).lineTo(gx + 6 * s, gy + 4 * s).lineTo(gx + 8 * s, gy + 11 * s).lineTo(gx + 9.5 * s, gy + 7 * s).lineTo(gx + 12 * s, gy + 7 * s).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.white).text(BRANDING.companyName.toLowerCase(), M + 34, 44);
  doc.font('Helvetica').fontSize(8.5).fillColor(C.white).fillOpacity(0.85).text('CUSTOM REPORT', M + 34, 63, { characterSpacing: 1.6 }); doc.fillOpacity(1);

  doc.font('Helvetica').fontSize(10).fillColor(C.white).fillOpacity(0.85).text('Prepared for', M, 98); doc.fillOpacity(1);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.white).text(title, M, 112, { width: titleW });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.white).fillOpacity(0.9).text(fmtDate(Date.now()), W - M - 200, 116, { width: 200, align: 'right' }); doc.fillOpacity(1);

  // info pill
  doc.save(); doc.roundedRect(M, pillY, W - M * 2, pillH, 12).fill(C.white); doc.restore();
  eyebrow(doc, 'Included in this report', M + 22, pillY + 13, C.faint);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.ink).text(`${mCount} mention${mCount !== 1 ? 's' : ''}`, M + 22, pillY + 28);
  const x2 = M + 22 + doc.widthOfString(`${mCount} mentions`) + 24;
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.ink).text(`${qCount} quer${qCount !== 1 ? 'ies' : 'y'}`, x2, pillY + 28);
  if (selection.note) doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted).text(clamp(selection.note, 90), W - M - 260, pillY + 30, { width: 248, align: 'right' });
  doc.y = pillY + pillH + 18;
}

function renderSummary(doc, brand, mentions, queries) {
  const { M, cw } = geo(doc);
  const engines = new Set([...mentions.map(m => platMeta(m.platform).short), ...queries.flatMap(q => [])]).size;
  const avgRate = queries.length ? Math.round(queries.reduce((s, q) => s + (q.rate || 0), 0) / queries.length) : null;
  const cards = [
    { label: 'Mentions', value: String(mentions.length), sub: 'AI answers included', color: C.primary },
    { label: 'Queries', value: String(queries.length), sub: 'prompts included', color: C.violet },
    { label: 'Engines covered', value: String(engines || 0), sub: 'across mentions', color: C.blue },
    { label: 'Avg mention rate', value: avgRate !== null ? `${avgRate}%` : '—', sub: 'of included queries', color: avgRate === null ? C.faint : sovColor(avgRate) },
  ];
  const gap = 12, cardW = (cw - gap * 3) / 4, cardH = 74;
  ensure(doc, cardH + 6); const y = doc.y;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    doc.save(); doc.roundedRect(x, y, cardW, cardH, 10).fill(C.bg); doc.roundedRect(x, y, cardW, cardH, 10).lineWidth(0.8).strokeColor(C.line).stroke(); doc.roundedRect(x, y, 3, cardH, 1.5).fill(c.color); doc.restore();
    eyebrow(doc, c.label, x + 14, y + 12, C.muted);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(c.color).text(c.value, x + 13, y + 25, { width: cardW - 20 });
    doc.font('Helvetica').fontSize(8).fillColor(C.faint).text(c.sub, x + 14, y + 53, { width: cardW - 22 });
  });
  doc.y = y + cardH + 6;
}

function renderMentions(doc, mentions) {
  if (!mentions.length) return;
  const { M, W, cw } = geo(doc);
  section(doc, 'Selected Mentions', 'The specific AI answers you chose to include, with the verbatim response.');

  mentions.forEach(m => {
    const meta = platMeta(m.platform);
    const answer = clamp(m.answer, 340);
    doc.font('Helvetica').fontSize(9);
    const aH = answer ? doc.heightOfString(answer, { width: cw - 28 }) : 12;
    const srcH = (m.sources && m.sources.length) ? 14 : 0;
    const cardH = 40 + Math.min(aH, 52) + srcH + 16;
    ensure(doc, cardH + 8);
    const y = doc.y;
    doc.save();
    doc.roundedRect(M, y, cw, cardH, 9).fill(C.white);
    doc.roundedRect(M, y, cw, cardH, 9).lineWidth(0.8).strokeColor(C.line).stroke();
    // platform tag
    doc.roundedRect(M + 14, y + 14, 30, 18, 5).fill(meta.color);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white).text(meta.short, M + 14, y + 19, { width: 30, align: 'center' });
    // query
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(clamp(m.query, 70), M + 52, y + 14, { width: cw - 52 - 120, lineBreak: false, ellipsis: true });
    // verdict badge (right)
    const badge = String(m.tag || 'neu').toUpperCase();
    const bw = doc.widthOfString(badge) + 16;
    doc.save(); doc.roundedRect(W - M - 14 - bw, y + 13, bw, 16, 8).fill(tagColor(m.tag)); doc.restore();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white).text(badge, W - M - 14 - bw, y + 17, { width: bw, align: 'center' });
    // meta line
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text([m.meta, m.date ? fmtDate(m.date) : ''].filter(Boolean).join('  ·  '), M + 52, y + 28, { width: cw - 60, lineBreak: false });
    // answer
    let ay = y + 40;
    if (answer) { doc.font('Helvetica').fontSize(9).fillColor(C.text).text(answer, M + 14, ay, { width: cw - 28, height: 52, ellipsis: true }); ay += Math.min(aH, 52); }
    // sources
    if (srcH) { doc.font('Helvetica').fontSize(8).fillColor(C.faint).text('Sources: ' + m.sources.slice(0, 4).join('  ·  '), M + 14, ay + 4, { width: cw - 28, lineBreak: false, ellipsis: true }); }
    doc.y = y + cardH + 8;
  });
}

function renderQueries(doc, queries) {
  if (!queries.length) return;
  const { M, W, cw } = geo(doc);
  section(doc, 'Selected Queries', 'Mention rate and reach for the prompts you included.');
  const numW = 22, sovW = 60, engW = 64, rateW = 56;
  const qW = cw - numW - sovW - engW - rateW;
  let y = doc.y;
  eyebrow(doc, '#', M, y); eyebrow(doc, 'Query', M + numW, y); eyebrow(doc, 'SOV', M + numW + qW, y); eyebrow(doc, 'Engines', M + numW + qW + sovW, y); eyebrow(doc, 'Rate', M + numW + qW + sovW + engW, y);
  y += 14; doc.save(); doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(C.line).stroke(); doc.restore(); y += 6; doc.y = y;
  queries.forEach((q, i) => {
    ensure(doc, 24); const ry = doc.y;
    if (i % 2 === 0) { doc.save(); doc.roundedRect(M - 6, ry - 3, cw + 12, 22, 5).fill(C.bg); doc.restore(); }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.faint).text(String(i + 1), M, ry, { width: numW });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(clamp(q.q, 64), M + numW, ry, { width: qW - 8, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sovColor(q.sov || 0)).text(`${q.sov || 0}%`, M + numW + qW, ry, { width: sovW });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`${q.engines || 0}/5`, M + numW + qW + sovW, ry, { width: engW });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sovColor(q.rate || 0)).text(`${q.rate || 0}%`, M + numW + qW + sovW + engW, ry, { width: rateW });
    doc.y = ry + 19;
  });
  doc.y += 4;
}

function renderFooter(doc, idx, count) {
  const { W, M, H } = geo(doc);
  const y = H - 40;
  const savedBottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
  doc.save();
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.faint);
  doc.text(`Generated by ${BRANDING.companyName}`, M, y + 8, { width: 200, lineBreak: false });
  doc.text(new Date().toISOString().split('T')[0], M, y + 8, { width: W - M * 2, align: 'center', lineBreak: false });
  doc.text(`Page ${idx + 1} of ${count}`, W - M - 120, y + 8, { width: 120, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = savedBottom;
}

function generateCustomReport(brand, selection) {
  selection = selection || {};
  const mentions = Array.isArray(selection.mentions) ? selection.mentions : [];
  const queries = Array.isArray(selection.queries) ? selection.queries : [];
  const doc = new PDFDocument({
    size: 'A4', margin: 44, autoFirstPage: true, bufferPages: true,
    info: { Title: selection.title || `${brand.name || 'Brand'} — Custom Report`, Author: BRANDING.companyName, Subject: 'Custom AI Visibility Report', Creator: BRANDING.companyName },
  });

  renderCover(doc, brand, selection, mentions.length, queries.length);
  if (!mentions.length && !queries.length) {
    const { M, cw } = geo(doc);
    section(doc, 'Nothing selected yet');
    doc.font('Helvetica').fontSize(10).fillColor(C.muted).text('Add mentions or queries to this report from the dashboard, then download it here.', M, doc.y, { width: cw });
  } else {
    renderSummary(doc, brand, mentions, queries);
    renderMentions(doc, mentions);
    renderQueries(doc, queries);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) { doc.switchToPage(range.start + i); renderFooter(doc, i, range.count); }
  doc.end();
  return doc;
}

export { generateCustomReport };
