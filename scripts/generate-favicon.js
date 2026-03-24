/**
 * Generate favicon.ico and apple-touch-icon.png from scratch using pure Node.js
 * No external dependencies required.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC = path.join(__dirname, '..', 'public');

// Brand color #FF6154
const R = 0xFF, G = 0x61, B = 0x54;

/**
 * Draw a rounded-rect "L" favicon as raw RGBA pixels
 */
function drawFavicon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const cornerRadius = Math.round(size * 0.1875); // ~18.75% radius

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
  }

  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1-x2)**2 + (y1-y2)**2);
  }

  // Draw rounded rectangle background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      const cr = cornerRadius;
      // Check corners
      if (x < cr && y < cr) inside = dist(x, y, cr, cr) <= cr;
      else if (x >= size - cr && y < cr) inside = dist(x, y, size - cr - 1, cr) <= cr;
      else if (x < cr && y >= size - cr) inside = dist(x, y, cr, size - cr - 1) <= cr;
      else if (x >= size - cr && y >= size - cr) inside = dist(x, y, size - cr - 1, size - cr - 1) <= cr;

      if (inside) {
        // Anti-aliasing at edges
        setPixel(x, y, R, G, B, 255);
      }
    }
  }

  // Draw "L" letter in white
  const margin = Math.round(size * 0.22);
  const strokeW = Math.round(size * 0.18);
  const bottomY = size - margin;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let isL = false;
      // Vertical stroke of L
      if (x >= margin && x < margin + strokeW && y >= margin && y <= bottomY) isL = true;
      // Horizontal stroke of L
      if (y > bottomY - strokeW && y <= bottomY && x >= margin && x < size - margin) isL = true;

      if (isL) {
        setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }

  return pixels;
}

/**
 * Create a minimal PNG from RGBA pixel data
 */
function createPNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw pixel data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    iend
  ]);
}

/**
 * Create ICO file with multiple sizes
 */
function createICO(pngBuffers) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(pngBuffers.length, 4); // count

  const dirEntries = [];
  let dataOffset = 6 + pngBuffers.length * 16; // header + directory entries

  for (const { size, png } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of PNG data
    entry.writeUInt32LE(dataOffset, 12); // offset
    dirEntries.push(entry);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.png)]);
}

// Generate sizes
const sizes = [16, 32, 48];
const pngBuffers = sizes.map(size => {
  const pixels = drawFavicon(size);
  const png = createPNG(size, size, pixels);
  return { size, png };
});

// Write favicon.ico
const ico = createICO(pngBuffers);
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico);
console.log('Created favicon.ico (' + ico.length + ' bytes)');

// Write favicon-32x32.png
const png32 = createPNG(32, 32, drawFavicon(32));
fs.writeFileSync(path.join(PUBLIC, 'favicon-32x32.png'), png32);
console.log('Created favicon-32x32.png');

// Write favicon-16x16.png
const png16 = createPNG(16, 16, drawFavicon(16));
fs.writeFileSync(path.join(PUBLIC, 'favicon-16x16.png'), png16);
console.log('Created favicon-16x16.png');

// Write apple-touch-icon.png (180x180)
const png180 = createPNG(180, 180, drawFavicon(180));
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), png180);
console.log('Created apple-touch-icon.png');

// Write android-chrome-192x192.png
const png192 = createPNG(192, 192, drawFavicon(192));
fs.writeFileSync(path.join(PUBLIC, 'android-chrome-192x192.png'), png192);
console.log('Created android-chrome-192x192.png');

// Write android-chrome-512x512.png
const png512 = createPNG(512, 512, drawFavicon(512));
fs.writeFileSync(path.join(PUBLIC, 'android-chrome-512x512.png'), png512);
console.log('Created android-chrome-512x512.png');

console.log('\nAll favicon assets generated successfully!');
