import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = process.env.PREVIEW_URL || 'http://localhost:3000/';
const OUT = process.env.OUT_DIR || './docs/preview';

async function shoot(viewport, name) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60_000 });
    // Give animations / fonts a moment
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`✓ ${name} (${viewport.width}x${viewport.height}) → ${OUT}/${name}.png`);
  } finally {
    await browser.close();
  }
}

await mkdir(OUT, { recursive: true });
await shoot({ width: 1440, height: 900 }, 'home-desktop');
await shoot({ width: 768, height: 1024 }, 'home-tablet');
await shoot({ width: 390, height: 844 }, 'home-mobile');
