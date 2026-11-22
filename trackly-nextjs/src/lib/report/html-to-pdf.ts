/**
 * HTML -> PDF with headless Chrome.
 *
 * Production (DigitalOcean App Platform, Linux) uses @sparticuz/chromium: a
 * self-contained Chromium build that needs no system packages, so it runs on
 * the plain node-js buildpack. Set CHROME_EXECUTABLE_PATH to use a local
 * Chrome instead (handy on macOS, where the Sparticuz binary does not run).
 *
 * One render at a time per process: each Chromium needs ~150-250 MB and the
 * pods are 1 GB, so parallel downloads queue instead of racing for memory.
 */

import type { Browser } from 'puppeteer-core';

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function launch(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  const local = process.env.CHROME_EXECUTABLE_PATH;
  if (local) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  }
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--font-render-hinting=none'],
  });
}

export function htmlToPdf(html: string, timeoutMs = 45_000): Promise<Buffer> {
  return serialize(async () => {
    const browser = await launch();
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(timeoutMs);
      // The report is self-contained (inline CSS, base64 fonts); block any network.
      await page.setRequestInterception(true);
      page.on('request', req => (req.url().startsWith('data:') || req.url() === 'about:blank' ? req.continue() : req.abort()));
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}
