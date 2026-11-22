import { describe, it, expect } from 'vitest';
import { buildReportData, isListingHost, band } from '@/lib/report/ai-visibility-data';
import { renderReportHtml, questionPages } from '@/lib/report/ai-visibility-render';
import { questionSummary, competitorSummary, sourceSummary } from '@/lib/mcp/summarize';
import { isWinningPrompt } from '@/lib/prompt-status';
import { nestadu, lowSov, fewQuestions } from '../scripts/report-fixtures/fixtures';

describe('AI visibility report data', () => {
  const b = nestadu();
  const d = buildReportData(b);

  it('shows every engine in the scan, high to low (bugs 1 and 2)', () => {
    expect(d.engines.map(e => e.engine)).toEqual(['Google AI Overview', 'Google AI Mode', 'Gemini', 'Perplexity', 'ChatGPT', 'Claude', 'Grok']);
    expect(d.engines[0]).toMatchObject({ sov: 72, change: -3, band: 'hi' });
    expect(d.columns).toHaveLength(7);
  });

  it('uses the real number of engines that answered each question (bug 3)', () => {
    for (const q of d.questions) {
      const s = questionSummary(b).questions.find(x => x.question === q.question)!;
      expect(q.answered.length).toBe(new Set([...s.enginesNamingBrand, ...s.enginesNotNamingBrand]).size);
    }
  });

  it('uses the same competitor numbers as the dashboard and MCP (bug 4)', () => {
    const c = competitorSummary(b);
    expect(d.competitors.map(r => [r.name, r.share])).toEqual(c.rows.slice(0, 4).map(r => [r.name, r.share]));
    expect(d.competitors.map(r => r.share)).toEqual([52, 23, 14, 11]);
    expect(d.leader).toBe(true);
  });

  it('reports the top 10 of the real citation total (bug 5)', () => {
    expect(d.sources).toHaveLength(10);
    expect(d.citationsTotal).toBe(sourceSummary(b).totalCitations);
    expect(d.citationsTotal).toBe(410);
    expect(d.citationsOwn).toBe(75);
    expect(d.listingCitations).toBe(70);
  });

  it('classifies winning questions with the dashboard rule (bug 6)', () => {
    for (const q of d.questions) expect(q.group === 'win').toBe(isWinningPrompt(q.named.length, q.answered.length));
    expect(d.questions.filter(q => q.group === 'miss')).toHaveLength(5);
  });

  it('builds five plan steps from real numbers', () => {
    expect(d.steps).toHaveLength(5);
    expect(d.steps[0].title).toBe('Answer the 5 buying questions AI gives to rivals');
    expect(d.steps[1].title).toBe('Close the Claude and Grok gap');
    expect(d.steps[1].why).toContain('against 43% overall');
    expect(d.steps[4].why).toBe('15 answers name Nestadu without citing the website.');
  });

  it('matches the cover numbers of the reference design', () => {
    expect([d.sov, d.named, d.total, d.goal]).toEqual([43, 50, 117, 70]);
    expect(d.dots).toEqual({ perDot: 1, filled: 50, count: 117 });
    expect(d.engineNotes.map(n => n.title)).toEqual(['Google is your home ground', 'Perplexity woke up', 'Claude and Grok are blind spots']);
  });
});

describe('AI visibility report edge cases', () => {
  it('scales the dot field past 156 answers and pages long question lists', () => {
    const d = buildReportData(lowSov());
    expect(d.total).toBe(424);
    expect(Math.ceil(d.dots.count / 13)).toBeLessThanOrEqual(12);
    expect(questionPages(d)).toHaveLength(5);
    expect(d.leader).toBe(false);
    const html = renderReportHtml(d);
    expect(html).toContain('9 / 9');
    expect(html).toContain('Where you stand');
  });

  it('handles no goal and a first scan', () => {
    const d = buildReportData(fewQuestions());
    expect(d.goal).toBeNull();
    const html = renderReportHtml(d);
    expect(html).toContain('Mentions in this scan');
    expect(html).toContain('5 / 5');
    expect(html).not.toContain('{{');
  });

  it('renders an empty report for a brand with no scans', () => {
    const html = renderReportHtml(buildReportData({ name: 'New', runs: [] }));
    expect(html).toContain('No scan yet');
  });

  it('bands and listing hosts', () => {
    expect([band(60), band(59), band(20), band(19)]).toEqual(['hi', 'md', 'lo', 'vl']);
    expect(['angi.com', 'yelp.com', 'theprefablist.com', 'buildzoom.com', 'clutch.co'].every(isListingHost)).toBe(true);
    expect(['google.com', 'facebook.com', 'nestadu.com'].some(isListingHost)).toBe(false);
  });
});
