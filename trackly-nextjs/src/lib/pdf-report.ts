// @ts-nocheck
/**
 * PDF Report Generator - White-label AI Visibility Report
 *
 * Ported from the Express monolith (lib/pdf-report.js) with minimal
 * changes. Types are intentionally opt-in: the module exposes a single
 * `generateReport(brand)` entry point that returns a PDFKit document
 * stream. The `@ts-nocheck` at the top is intentional - strict-mode
 * typing against PDFKit's internal API is low-value for a pure-output
 * module, and deferring it keeps this port reviewable.
 */
import PDFDocument from 'pdfkit';

// ─── WHITE-LABEL BRANDING CONSTANTS ─────────────────────────────
// Customize these to rebrand the report for different clients
const BRANDING = {
  companyName: 'Livesov',
  tagline: 'AI Visibility Report',
  headerBg: '#1a1a2e',
  headerText: '#ffffff',
  accentColor: '#14b8a6',      // Teal accent
  textColor: '#1e293b',
  mutedColor: '#64748b',
  greenColor: '#22c55e',
  amberColor: '#f59e0b',
  redColor: '#ef4444',
  blueColor: '#3b82f6',
  gridColor: '#e2e8f0',
  bgLight: '#f8fafc',
};

const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];

// ─── HELPERS ────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function sovColor(val) {
  if (val >= 70) return BRANDING.greenColor;
  if (val >= 40) return BRANDING.amberColor;
  if (val > 0) return BRANDING.redColor;
  return BRANDING.mutedColor;
}

function trendArrow(diff) {
  if (diff > 0) return `+${diff}%`;
  if (diff < 0) return `${diff}%`;
  return 'No change';
}

function ensurePage(doc, needed) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    return true;
  }
  return false;
}

// ─── SECTION RENDERERS ──────────────────────────────────────────

function renderHeader(doc, brandName, reportDate) {
  const headerHeight = 80;
  doc.save();
  doc.rect(0, 0, doc.page.width, headerHeight).fill(BRANDING.headerBg);

  // Company name
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRANDING.headerText);
  doc.text(BRANDING.companyName, 40, 22, { continued: false });

  // Tagline
  doc.font('Helvetica').fontSize(10).fillColor(BRANDING.headerText);
  doc.text(BRANDING.tagline, 40, 50);

  // Report date (right-aligned)
  doc.font('Helvetica').fontSize(10).fillColor(BRANDING.headerText);
  doc.text(reportDate, doc.page.width - 200, 50, { width: 160, align: 'right' });

  doc.restore();
  doc.y = headerHeight + 20;

  // Brand name below header
  doc.font('Helvetica-Bold').fontSize(18).fillColor(BRANDING.textColor);
  doc.text(brandName, 40, doc.y, { width: doc.page.width - 80 });
  doc.moveDown(0.3);

  // Thin accent line
  doc.save();
  doc.moveTo(40, doc.y).lineTo(200, doc.y).lineWidth(2).strokeColor(BRANDING.accentColor).stroke();
  doc.restore();
  doc.moveDown(1);
}

function renderSectionTitle(doc, title) {
  ensurePage(doc, 40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(BRANDING.headerBg);
  doc.text(title, 40, doc.y, { width: doc.page.width - 80 });
  doc.moveDown(0.2);
  // Subtle underline
  doc.save();
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).lineWidth(0.5).strokeColor(BRANDING.gridColor).stroke();
  doc.restore();
  doc.moveDown(0.5);
}

function renderVisibilitySummary(doc, lastRun, prevRun) {
  renderSectionTitle(doc, 'AI Visibility Summary');

  const sov = lastRun ? (lastRun.sov || 0) : 0;
  const prevSOV = prevRun ? (prevRun.sov || 0) : null;
  const diff = prevSOV !== null ? sov - prevSOV : null;

  const x = 40;

  // SOV score - large
  doc.font('Helvetica-Bold').fontSize(36).fillColor(sovColor(sov));
  doc.text(`${sov}%`, x, doc.y, { continued: false });

  // Trend indicator
  if (diff !== null && diff !== 0) {
    doc.font('Helvetica').fontSize(12).fillColor(diff > 0 ? BRANDING.greenColor : BRANDING.redColor);
    doc.text(`${trendArrow(diff)} vs previous run`, x, doc.y);
  }

  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(BRANDING.mutedColor);
  doc.text('Overall Share of Voice across all AI platforms', x, doc.y);
  doc.moveDown(0.8);

  // Quick stats row
  if (lastRun) {
    const mentions = (lastRun.mentions || []).length;
    const totalResults = (lastRun.allResults || []).length;
    const activePlats = Object.keys(lastRun.platforms || {}).length;
    const validResults = (lastRun.allResults || []).filter(r => !r.error).length;

    const stats = [
      { label: 'Mentions', value: `${mentions} / ${totalResults}` },
      { label: 'Platforms Active', value: `${activePlats} / ${PLATFORMS.length}` },
      { label: 'Valid Responses', value: `${validResults}` },
    ];

    const colWidth = (doc.page.width - 80) / stats.length;
    const startY = doc.y;
    stats.forEach((s, i) => {
      const cx = x + i * colWidth;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(BRANDING.textColor);
      doc.text(s.value, cx, startY, { width: colWidth - 10 });
      doc.font('Helvetica').fontSize(9).fillColor(BRANDING.mutedColor);
      doc.text(s.label, cx, startY + 18, { width: colWidth - 10 });
    });
    doc.y = startY + 38;
    doc.moveDown(0.5);
  }
}

function renderPlatformBreakdown(doc, lastRun) {
  if (!lastRun || !lastRun.platforms) return;
  renderSectionTitle(doc, 'Platform Breakdown');

  const platforms = lastRun.platforms || {};
  const x = 40;
  const barMaxWidth = 280;
  const rowHeight = 28;

  // Table header
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRANDING.mutedColor);
  doc.text('PLATFORM', x, doc.y, { width: 100 });
  doc.text('SOV', x + 100, doc.y - 11, { width: 50 });
  doc.text('VISIBILITY', x + 160, doc.y - 11, { width: barMaxWidth });
  doc.moveDown(0.5);

  // Subtle header line
  doc.save();
  doc.moveTo(x, doc.y).lineTo(doc.page.width - 40, doc.y).lineWidth(0.3).strokeColor(BRANDING.gridColor).stroke();
  doc.restore();
  doc.moveDown(0.3);

  PLATFORMS.forEach(plat => {
    ensurePage(doc, rowHeight + 5);
    const pSov = platforms[plat] || 0;
    const rowY = doc.y;

    // Platform name
    doc.font('Helvetica').fontSize(10).fillColor(BRANDING.textColor);
    doc.text(plat, x, rowY, { width: 100 });

    // SOV value
    doc.font('Helvetica-Bold').fontSize(10).fillColor(sovColor(pSov));
    doc.text(`${pSov}%`, x + 100, rowY, { width: 50 });

    // Bar background
    const barY = rowY + 2;
    doc.save();
    doc.rect(x + 160, barY, barMaxWidth, 10).fill(BRANDING.bgLight);
    // Bar fill
    if (pSov > 0) {
      doc.rect(x + 160, barY, Math.max(2, barMaxWidth * pSov / 100), 10).fill(sovColor(pSov));
    }
    doc.restore();

    // Grid line
    doc.save();
    doc.moveTo(x, rowY + rowHeight - 5).lineTo(doc.page.width - 40, rowY + rowHeight - 5)
      .lineWidth(0.2).strokeColor(BRANDING.gridColor).stroke();
    doc.restore();

    doc.y = rowY + rowHeight;
  });
  doc.moveDown(0.5);
}

function renderTopQueries(doc, lastRun) {
  if (!lastRun || !lastRun.allResults || !lastRun.allResults.length) return;
  renderSectionTitle(doc, 'Top Performing Queries');

  const queryStats = {};
  lastRun.allResults.filter(r => !r.error).forEach(r => {
    const q = r.query || 'Unknown';
    if (!queryStats[q]) queryStats[q] = { total: 0, found: 0 };
    queryStats[q].total++;
    if (r.mentioned) queryStats[q].found++;
  });

  const sorted = Object.entries(queryStats)
    .map(([q, s]) => ({ query: q, ...s, rate: s.total > 0 ? Math.round(s.found / s.total * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  if (sorted.length === 0) return;

  const x = 40;

  // Table header
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRANDING.mutedColor);
  doc.text('#', x, doc.y, { width: 20 });
  doc.text('QUERY', x + 20, doc.y - 11, { width: 300 });
  doc.text('FOUND', x + 330, doc.y - 11, { width: 50 });
  doc.text('RATE', x + 390, doc.y - 11, { width: 50 });
  doc.moveDown(0.5);

  doc.save();
  doc.moveTo(x, doc.y).lineTo(doc.page.width - 40, doc.y).lineWidth(0.3).strokeColor(BRANDING.gridColor).stroke();
  doc.restore();
  doc.moveDown(0.3);

  sorted.forEach((s, i) => {
    ensurePage(doc, 22);
    const rowY = doc.y;

    doc.font('Helvetica').fontSize(9).fillColor(BRANDING.mutedColor);
    doc.text(`${i + 1}`, x, rowY, { width: 20 });

    doc.font('Helvetica').fontSize(9).fillColor(BRANDING.textColor);
    doc.text(s.query, x + 20, rowY, { width: 300, ellipsis: true });

    doc.font('Helvetica').fontSize(9).fillColor(BRANDING.mutedColor);
    doc.text(`${s.found}/${s.total}`, x + 330, rowY, { width: 50 });

    doc.font('Helvetica-Bold').fontSize(9).fillColor(sovColor(s.rate));
    doc.text(`${s.rate}%`, x + 390, rowY, { width: 50 });

    doc.y = rowY + 18;
  });
  doc.moveDown(0.5);
}

function renderCompetitorComparison(doc, brand, lastRun) {
  if (!lastRun || !lastRun.allResults || !lastRun.allResults.length) return;
  renderSectionTitle(doc, 'Competitor Comparison');

  const brandName = (brand.name || '').toLowerCase();
  const competitors = {};

  lastRun.allResults.forEach(r => {
    if (!r.raw && !r.context) return;
    const text = r.raw || r.context || '';
    const patterns = [
      /(?:^|\n)\s*\d+[.)]\s*\*?\*?([A-Z][A-Za-z0-9' &\-.]+)\*?\*?/g,
      /(?:^|\n)\s*[-\u2022]\s*\*?\*?([A-Z][A-Za-z0-9' &\-.]+)\*?\*?/g
    ];
    patterns.forEach(pat => {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const name = m[1].trim().replace(/\*+/g, '').replace(/\s*[-\u2014:].*/,'').trim();
        if (name.length >= 3 && name.length <= 50 && name.toLowerCase() !== brandName &&
            !/^(the|and|for|with|best|top|most|also|here|this|that|these|note)$/i.test(name)) {
          competitors[name] = (competitors[name] || 0) + 1;
        }
      }
    });
  });

  // Also count brand mentions
  const brandMentions = (lastRun.allResults || []).filter(r => r.mentioned).length;

  const topComp = Object.entries(competitors).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topComp.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(BRANDING.mutedColor);
    doc.text('No competitors detected in AI responses yet.', 40, doc.y);
    doc.moveDown(0.5);
    return;
  }

  const x = 40;
  const maxCount = Math.max(brandMentions, topComp[0][1]);
  const barMaxWidth = 200;

  // Show brand first
  ensurePage(doc, 22);
  let rowY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRANDING.accentColor);
  doc.text(`${brand.name} (You)`, x, rowY, { width: 180 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRANDING.accentColor);
  doc.text(`${brandMentions}x`, x + 400, rowY, { width: 50 });

  // Bar for brand
  doc.save();
  doc.rect(x + 190, rowY + 2, barMaxWidth, 10).fill(BRANDING.bgLight);
  if (brandMentions > 0 && maxCount > 0) {
    doc.rect(x + 190, rowY + 2, Math.max(2, barMaxWidth * brandMentions / maxCount), 10).fill(BRANDING.accentColor);
  }
  doc.restore();
  doc.y = rowY + 22;

  // Competitors
  topComp.forEach(([name, count]) => {
    ensurePage(doc, 22);
    rowY = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(BRANDING.textColor);
    doc.text(name, x, rowY, { width: 180, ellipsis: true });
    doc.font('Helvetica').fontSize(10).fillColor(BRANDING.mutedColor);
    doc.text(`${count}x`, x + 400, rowY, { width: 50 });

    doc.save();
    doc.rect(x + 190, rowY + 2, barMaxWidth, 10).fill(BRANDING.bgLight);
    if (count > 0 && maxCount > 0) {
      doc.rect(x + 190, rowY + 2, Math.max(2, barMaxWidth * count / maxCount), 10).fill(BRANDING.mutedColor);
    }
    doc.restore();
    doc.y = rowY + 22;
  });
  doc.moveDown(0.5);
}

function renderCitationSources(doc, brand, lastRun) {
  if (!lastRun || !lastRun.allResults) return;

  const allCites = [];
  lastRun.allResults.forEach(r => {
    const citeArr = r.citations || r.cites || [];
    citeArr.forEach(url => allCites.push(url));
  });
  if (allCites.length === 0) return;

  renderSectionTitle(doc, 'Citation Sources');

  const domainCounts = {};
  allCites.forEach(url => {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    } catch (e) { /* skip malformed */ }
  });

  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const brandDomain = brand.website ? brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : '';

  const x = 40;
  doc.font('Helvetica').fontSize(9).fillColor(BRANDING.mutedColor);
  doc.text(`${topDomains.length} domains cited across ${allCites.length} total citations`, x, doc.y);
  doc.moveDown(0.5);

  topDomains.forEach(([domain, count]) => {
    ensurePage(doc, 18);
    const rowY = doc.y;
    const isOwn = brandDomain && domain.includes(brandDomain);

    doc.font(isOwn ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .fillColor(isOwn ? BRANDING.accentColor : BRANDING.textColor);
    doc.text(`${isOwn ? '\u2605 ' : ''}${domain}`, x, rowY, { width: 250 });

    doc.font('Helvetica').fontSize(9).fillColor(BRANDING.mutedColor);
    doc.text(`${count}x`, x + 400, rowY, { width: 40 });

    // Bar
    const barMax = 150;
    doc.save();
    doc.rect(x + 260, rowY + 1, barMax, 8).fill(BRANDING.bgLight);
    doc.rect(x + 260, rowY + 1, Math.max(1, barMax * count / topDomains[0][1]), 8)
      .fill(isOwn ? BRANDING.accentColor : BRANDING.blueColor);
    doc.restore();

    doc.y = rowY + 16;
  });
  doc.moveDown(0.5);
}

function renderRecommendations(doc, brand, lastRun) {
  renderSectionTitle(doc, 'Recommendations');

  const tips = [];
  const sov = lastRun ? (lastRun.sov || 0) : 0;

  if (lastRun && lastRun.allResults) {
    // Analyze platform performance
    const platStats = {};
    let mentioned = 0, total = 0, recommended = 0, negCount = 0;

    lastRun.allResults.filter(r => !r.error).forEach(r => {
      total++;
      if (!platStats[r.platform]) platStats[r.platform] = { total: 0, found: 0 };
      platStats[r.platform].total++;
      if (r.mentioned) {
        mentioned++;
        platStats[r.platform].found++;
        if (r.recommended) recommended++;
        if (r.sentiment === 'negative') negCount++;
      }
    });

    const strongPlats = [];
    const weakPlats = [];
    Object.entries(platStats).forEach(([p, s]) => {
      const rate = s.total > 0 ? s.found / s.total : 0;
      if (rate >= 0.5) strongPlats.push(p);
      else weakPlats.push(p);
    });

    // Tip 1: Platform gaps
    if (strongPlats.length > 0 && weakPlats.length > 0) {
      tips.push(`Platform Gap: Strong on ${strongPlats.join(', ')} but weak on ${weakPlats.join(', ')}. Different AI platforms pull from different sources - diversify your online presence and optimize content for each.`);
    }

    // Tip 2: Low SOV
    if (sov === 0 && total > 0) {
      tips.push('Build Foundation: AI platforms haven\'t picked up your brand yet. Focus on structured data, review profiles (Google, Yelp), and authoritative backlinks - these are what AI models reference.');
    } else if (sov > 0 && sov < 30) {
      tips.push(`Grow Visibility: You appear in ${sov}% of queries. Create FAQ-style content that directly answers common questions, and ensure your Google Business Profile is fully optimized.`);
    }

    // Tip 3: Negative sentiment
    if (negCount > 0) {
      tips.push(`Address Negative Sentiment: ${negCount} AI response${negCount > 1 ? 's' : ''} show negative sentiment. Review what AI platforms say about your brand and address underlying issues through customer experience improvements.`);
    }

    // Tip 4: Low recommendation rate
    const recRate = mentioned > 0 ? recommended / mentioned : 0;
    if (mentioned > 0 && recRate < 0.3) {
      tips.push('Boost Recommendations: AI mentions your brand but rarely recommends it. Earn more positive reviews, add customer testimonials, and build authority with case studies and industry awards.');
    }

    // Tip 5: Citation optimization
    const allCites = [];
    lastRun.allResults.forEach(r => {
      (r.citations || r.cites || []).forEach(url => allCites.push(url));
    });
    if (allCites.length > 0 && brand.website) {
      const brandDomain = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      const hasBrandCite = allCites.some(url => {
        try { return new URL(url).hostname.replace(/^www\./, '').includes(brandDomain); } catch (e) { return false; }
      });
      if (!hasBrandCite) {
        tips.push(`Earn Citations: AI platforms cite external sources but not your website. Create authoritative, AI-crawlable content and build domain authority to become a cited source.`);
      }
    }
  }

  if (tips.length === 0) {
    tips.push('Keep monitoring your AI visibility and run queries regularly to track changes over time.');
  }

  const x = 40;
  tips.slice(0, 5).forEach((tip, i) => {
    ensurePage(doc, 35);
    const rowY = doc.y;

    // Numbered bullet
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRANDING.accentColor);
    doc.text(`${i + 1}.`, x, rowY, { width: 18 });

    doc.font('Helvetica').fontSize(9.5).fillColor(BRANDING.textColor);
    doc.text(tip, x + 20, rowY, { width: doc.page.width - 100 });
    doc.moveDown(0.4);
  });
}

function renderFooter(doc) {
  const y = doc.page.height - 35;
  doc.save();
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).lineWidth(0.3).strokeColor(BRANDING.gridColor).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(BRANDING.mutedColor);
  doc.text(`Generated by ${BRANDING.companyName} · ${new Date().toISOString().split('T')[0]}`, 40, y + 8, { width: doc.page.width - 80, align: 'center' });
  doc.restore();
}

// ─── MAIN GENERATOR ─────────────────────────────────────────────

function generateReport(brand) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `${brand.name} - AI Visibility Report`,
      Author: BRANDING.companyName,
      Subject: 'AI Visibility Report',
      Creator: BRANDING.companyName,
    },
    autoFirstPage: true,
    bufferPages: true,
  });

  const lastRun = brand.runs && brand.runs.length ? brand.runs[brand.runs.length - 1] : null;
  const prevRun = brand.runs && brand.runs.length > 1 ? brand.runs[brand.runs.length - 2] : null;
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Render sections
  renderHeader(doc, brand.name, reportDate);
  renderVisibilitySummary(doc, lastRun, prevRun);
  renderPlatformBreakdown(doc, lastRun);
  renderTopQueries(doc, lastRun);
  renderCompetitorComparison(doc, brand, lastRun);
  renderCitationSources(doc, brand, lastRun);
  renderRecommendations(doc, brand, lastRun);

  // Add footer to all pages
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    renderFooter(doc);
  }

  doc.end();
  return doc;
}

export { generateReport, BRANDING };
