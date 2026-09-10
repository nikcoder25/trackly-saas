/**
 * Rasterise every blog cover SVG to a 1200x630 PNG for social sharing.
 *
 * WHY: article openGraph/twitter images point at post.image, which is an SVG.
 * X, LinkedIn, Facebook, Slack and iMessage all refuse to render SVG in a link
 * preview, so every blog share was going out as a bare text card. The SVG stays
 * the on-page hero (crisp at any width, a few KB); the PNG exists only to be
 * fetched by scrapers.
 *
 * Run after adding or editing a blog cover:  node scripts/build-blog-og-images.mjs
 * tests/blog-og-images.test.ts fails if a post's PNG is missing.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const BLOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'blog');

// Only the 1200x630 covers become PNGs. The in-body diagrams are authored at
// 800px wide and are never used as an og:image, so rasterising them would just
// add weight to the repo.
const isCover = (svg) => /viewBox="0 0 1200 630"/.test(svg);

const force = process.argv.includes('--force');
let built = 0;
let skipped = 0;

for (const file of readdirSync(BLOG_DIR).filter((f) => f.endsWith('.svg')).sort()) {
  const svgPath = join(BLOG_DIR, file);
  const svg = readFileSync(svgPath, 'utf8');
  if (!isCover(svg)) { skipped++; continue; }

  const pngPath = svgPath.replace(/\.svg$/, '.png');
  if (!force && existsSync(pngPath) && statSync(pngPath).mtimeMs > statSync(svgPath).mtimeMs) {
    skipped++;
    continue;
  }

  await sharp(Buffer.from(svg), { density: 144 })
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(pngPath);
  built++;
  console.log('built', pngPath.replace(process.cwd() + '/', ''));
}

console.log(`\n${built} PNG(s) built, ${skipped} up to date or not a cover.`);
