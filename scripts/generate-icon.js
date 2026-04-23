#!/usr/bin/env node
// Generates the Mithnah Windows .ico from scratch — no image libraries,
// just raw pixels + zlib + PNG encoding. Produces a 12-point Imami star
// in Najaf gold on Karbala teal, with a small gold dome at the centre.
// Matches the brand identity used throughout the renderer.
//
// Run:  node scripts/generate-icon.js
// Writes src/public/icon.ico with sizes 16/24/32/48/64/128/256.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GOLD   = [0xe2, 0xb7, 0x6a, 0xff];   // #e2b76a (Najaf gold)
const BRIGHT = [0xf0, 0xcf, 0x8c, 0xff];   // #f0cf8c
const BG     = [0x0f, 0x1e, 0x20, 0xff];   // #0f1e20 (Karbala teal)
const DARK   = [0x08, 0x12, 0x14, 0xff];   // ring shadow

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  // Paint background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Radial gradient: slightly lighter at centre
      const dx = x - size / 2, dy = y - size / 2;
      const d = Math.sqrt(dx * dx + dy * dy) / (size / 2);
      const lighten = Math.max(0, 1 - d) * 0.15;
      buf[i]   = Math.round(BG[0] + lighten * (64 - BG[0]));
      buf[i+1] = Math.round(BG[1] + lighten * (80 - BG[1]));
      buf[i+2] = Math.round(BG[2] + lighten * (82 - BG[2]));
      buf[i+3] = 0xff;
    }
  }

  // Outer frame — thin gold ring near the edge
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.48;
  const frameT = Math.max(1, Math.round(size * 0.012));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > outerR - frameT && r < outerR) {
        const i = (y * size + x) * 4;
        buf[i] = GOLD[0]; buf[i+1] = GOLD[1]; buf[i+2] = GOLD[2]; buf[i+3] = 0xff;
      }
    }
  }

  // 12-point Imami star — outer radius Ro, inner radius Ri
  // Each point is a vertex; between every pair, an inner vertex.
  const Ro = size * 0.40;
  const Ri = size * 0.20;
  const points = [];
  for (let k = 0; k < 24; k++) {
    const angle = (k * 15 - 90) * Math.PI / 180;
    const r = (k % 2 === 0) ? Ro : Ri;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  // Fill star using even-odd ray-casting against the polygon
  function pointInPoly(px, py) {
    let inside = false;
    for (let j = 0, m = points.length - 1; j < points.length; m = j++) {
      const [xi, yi] = points[j], [xj, yj] = points[m];
      const crosses = ((yi > py) !== (yj > py)) &&
                      (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  // Draw star filled with a soft teal-tinted gold (so the points stay
  // visible against the teal background without being garish).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!pointInPoly(x, y)) continue;
      // Radial darkening at the tips
      const dx = x - cx, dy = y - cy;
      const rd = Math.sqrt(dx * dx + dy * dy) / Ro;
      const mix = Math.min(1, rd);
      const i = (y * size + x) * 4;
      buf[i]   = Math.round(BRIGHT[0] * (1 - mix * 0.5) + GOLD[0] * (mix * 0.5));
      buf[i+1] = Math.round(BRIGHT[1] * (1 - mix * 0.5) + GOLD[1] * (mix * 0.5));
      buf[i+2] = Math.round(BRIGHT[2] * (1 - mix * 0.5) + GOLD[2] * (mix * 0.5));
      buf[i+3] = 0xff;
    }
  }

  // Inner dark circle — gives the star a "centre jewel" feel; big
  // enough to host a small accent disc.
  const innerR = size * 0.09;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < innerR) {
        const i = (y * size + x) * 4;
        buf[i] = DARK[0]; buf[i+1] = DARK[1]; buf[i+2] = DARK[2]; buf[i+3] = 0xff;
      }
      if (r < innerR * 0.35) {
        const i = (y * size + x) * 4;
        buf[i] = BRIGHT[0]; buf[i+1] = BRIGHT[1]; buf[i+2] = BRIGHT[2]; buf[i+3] = 0xff;
      }
    }
  }

  return buf;
}

// ─────────────────────────────────────────────────────────────────
//  PNG encoding (no external deps)
// ─────────────────────────────────────────────────────────────────
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodePNG(rgba, width, height) {
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines: each row prefixed with filter byte 0 (None)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0;
    rgba.copy(raw, (stride + 1) * y + 1, y * stride, (y + 1) * stride);
  }
  const idatData = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────────────────────────────────────────
//  BMP/DIB encoding for ICO entries (≤256 reliable across all Windows
//  shell versions). The earlier all-PNG ICO rendered correctly inside
//  the running app but Win10/Win11 desktop SHORTCUTs intermittently
//  refused to draw the small (16/24/32/48) PNG-format entries — they
//  fell back to the generic "blank document" icon. Switching the
//  small sizes to classic DIB fixes that.
//
//  ICO-DIB layout per entry:
//    1. 40-byte BITMAPINFOHEADER with biHeight = 2 × image height
//       (the doubled height accounts for the XOR + AND masks).
//    2. XOR mask = pixel data, BOTTOM-UP, BGRA per pixel, W × H × 4 bytes.
//    3. AND mask = 1 bit per pixel, BOTTOM-UP, padded to 4-byte
//       row boundary. We set every bit to 0 (= "show pixel") since
//       the BGRA alpha channel already conveys transparency.
function encodeBMPInICO(rgba, width, height) {
  const xorRowBytes = width * 4;
  const xorBytes = xorRowBytes * height;
  // AND-mask row is 1 bit per pixel, padded to 4-byte boundary.
  const andRowBytes = Math.ceil(width / 32) * 4;
  const andBytes = andRowBytes * height;

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);              // biSize
  header.writeInt32LE(width, 4);            // biWidth
  header.writeInt32LE(height * 2, 8);       // biHeight × 2 (XOR + AND)
  header.writeUInt16LE(1, 12);              // biPlanes
  header.writeUInt16LE(32, 14);             // biBitCount
  header.writeUInt32LE(0, 16);              // biCompression = BI_RGB
  header.writeUInt32LE(xorBytes + andBytes, 20); // biSizeImage
  // biXPelsPerMeter / biYPelsPerMeter / biClrUsed / biClrImportant = 0

  // XOR mask — BGRA, bottom-up.
  const xor = Buffer.alloc(xorBytes);
  for (let y = 0; y < height; y++) {
    const srcY = (height - 1 - y) * width * 4;  // flip vertically
    for (let x = 0; x < width; x++) {
      const dst = y * xorRowBytes + x * 4;
      const src = srcY + x * 4;
      xor[dst]     = rgba[src + 2];   // B
      xor[dst + 1] = rgba[src + 1];   // G
      xor[dst + 2] = rgba[src];       // R
      xor[dst + 3] = rgba[src + 3];   // A
    }
  }

  // AND mask — all zeros (alpha channel handles transparency).
  const and = Buffer.alloc(andBytes); // already zero-filled

  return Buffer.concat([header, xor, and]);
}

// ─────────────────────────────────────────────────────────────────
//  ICO encoding — hybrid: BMP/DIB for sizes ≤ 48 (rock-solid in
//  Windows shell shortcuts), PNG for 256 (smaller file, supported
//  by Windows Vista+).
// ─────────────────────────────────────────────────────────────────
function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);  // type = 1 (ICO)
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = header.length + dirSize;

  const dirEntries = [];
  const dataBlobs = [];
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;      // palette count
    entry[3] = 0;      // reserved
    entry.writeUInt16LE(1, 4);        // color planes
    entry.writeUInt16LE(32, 6);       // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    dirEntries.push(entry);
    dataBlobs.push(data);
  }

  return Buffer.concat([header, ...dirEntries, ...dataBlobs]);
}

// ─────────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────────
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const entries = SIZES.map((size) => {
  const rgba = drawIcon(size);
  // Sizes ≤ 48 use classic DIB (XOR + AND mask) for maximum
  // shell-shortcut compatibility; larger sizes use PNG to keep the
  // file size sane (256-px PNG is ~7 KB, 256-px DIB is ~263 KB).
  const data = size <= 48 ? encodeBMPInICO(rgba, size, size) : encodePNG(rgba, size, size);
  return { size, data };
});

const ico = encodeICO(entries);
const out = path.resolve(__dirname, '..', 'src', 'public', 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`Wrote ${out} — ${ico.length} bytes, ${SIZES.length} sizes (DIB ≤48, PNG ≥64)`);
