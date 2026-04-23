// Tests for the renderer's pure-JS utility functions. These run under
// the regular node --test runner; no React, no JSDOM needed since the
// format helpers don't touch the DOM.
//
// We dynamically pull the renderer module through a tiny ESM shim
// because it uses `export` syntax that the main-process test harness
// doesn't parse directly. The helpers live in src/renderer/lib/format.js
// which we read as source and eval into a closure.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFormatModule() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'format.js'), 'utf8');
  // Strip ESM export keywords and emit a CommonJS-equivalent module.
  const transpiled = src
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ');
  const exportsAssign = `module.exports = { toArabicDigits, hhmmLocal, formatClock, formatCountdown, PRAYER_NAMES_AR, PRAYER_ICONS, EVENT_KIND_LABEL_AR };`;
  const full = transpiled + '\n' + exportsAssign;
  const ctx = { module: { exports: {} }, exports: {} };
  vm.createContext(ctx);
  vm.runInContext(full, ctx);
  return ctx.module.exports;
}

const { toArabicDigits, hhmmLocal, formatClock, formatCountdown, PRAYER_NAMES_AR } = loadFormatModule();

test('toArabicDigits converts Latin digits to Arabic-Indic', () => {
  assert.equal(toArabicDigits('1234'), '١٢٣٤');
  assert.equal(toArabicDigits(42), '٤٢');
  assert.equal(toArabicDigits('12:30'), '١٢:٣٠');
  assert.equal(toArabicDigits(''), '');
});

test('toArabicDigits leaves non-digit characters alone', () => {
  assert.equal(toArabicDigits('الصلاة القادمة 12'), 'الصلاة القادمة ١٢');
});

test('hhmmLocal 24-hour default formats HH:mm', () => {
  const iso = new Date(2026, 3, 20, 14, 30, 0).toISOString();
  assert.equal(hhmmLocal(iso), '14:30');
});

test('hhmmLocal 12-hour emits Arabic AM/PM suffix', () => {
  const morning = new Date(2026, 3, 20, 5, 15, 0).toISOString();
  const night   = new Date(2026, 3, 20, 22, 45, 0).toISOString();
  assert.equal(hhmmLocal(morning, '12'), '05:15 ص');
  assert.equal(hhmmLocal(night,   '12'), '10:45 م');
});

test('hhmmLocal handles invalid input safely', () => {
  assert.equal(hhmmLocal(null),   '');
  assert.equal(hhmmLocal('nope'), '');
});

test('formatClock returns a {time, suffix} pair', () => {
  const noon = new Date(2026, 3, 20, 12, 0, 0);
  const c24 = formatClock(noon, '24');
  const c12 = formatClock(noon, '12');
  assert.equal(c24.time, '12:00');
  assert.equal(c24.suffix, '');
  assert.equal(c12.time, '12:00');
  assert.equal(c12.suffix, 'م');
});

test('formatCountdown renders relative time with Arabic words', () => {
  const base = Date.now();
  assert.match(formatCountdown(new Date(base + 45_000).toISOString(), base),  /ثانية/);
  assert.match(formatCountdown(new Date(base + 90_000).toISOString(), base),  /دقيقة/);
  assert.match(formatCountdown(new Date(base + 3_700_000).toISOString(), base), /ساعة/);
});

test('formatCountdown clamps at zero for past times', () => {
  const base = Date.now();
  const past = new Date(base - 60_000).toISOString();
  const result = formatCountdown(past, base);
  assert.ok(result.includes('٠') || result.includes('ثانية'), 'past countdown should not error');
});

test('PRAYER_NAMES_AR has the six expected keys', () => {
  for (const k of ['fajr','sunrise','dhuhr','asr','maghrib','isha']) {
    assert.ok(PRAYER_NAMES_AR[k], `missing Arabic name for ${k}`);
  }
});
