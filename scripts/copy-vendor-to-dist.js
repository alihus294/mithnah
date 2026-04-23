#!/usr/bin/env node
// Post-build step: copy build-output/vendor/ into dist/renderer/vendor/
// so the renderer's <link> tags resolve under file:// protocol when the
// packaged app loads dist/renderer/index.html.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'build-output', 'vendor');
const DST = path.resolve(__dirname, '..', 'dist', 'renderer', 'vendor');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`[copy-vendor-to-dist] source missing: ${SRC}`);
  process.exit(1);
}

copyDir(SRC, DST);
const count = (function countFiles(p) {
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(p, e.name));
    else n += 1;
  }
  return n;
})(DST);
console.log(`[copy-vendor-to-dist] copied ${count} files to ${path.relative(process.cwd(), DST)}`);
