const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { load, loadSync, save, coerce, configPath } = require('../src/main/prayer-times/config');
const { defaultMethodFor, detectRegion } = require('../src/main/prayer-times/defaults');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mithnah-cfg-'));
}

test('load() on first run writes defaults and returns them', async () => {
  const dir = tmpDir();
  const cfg = await load(dir);
  assert.equal(cfg.method, 'Jafari', 'default method for Najaf is Jafari (Shia Twelver app)');
  assert.equal(cfg.madhab, 'Shafi');
  assert.equal(cfg.fiqh, 'shia');
  assert.equal(cfg.location.name, 'Najaf');
  // File should now exist on disk.
  const raw = await fsp.readFile(configPath(dir), 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.method, 'Jafari');
});

test('save() normalizes and persists', async () => {
  const dir = tmpDir();
  const saved = await save(dir, {
    location: { lat: 24.7136, lng: 46.6753, name: 'Riyadh' },
    method: 'UmmAlQura',
    madhab: 'Hanafi',
    adjustmentsMinutes: { fajr: -3, isha: 7 }
  });
  assert.equal(saved.madhab, 'Hanafi');
  assert.equal(saved.adjustmentsMinutes.fajr, -3);
  const reloaded = await load(dir);
  assert.equal(reloaded.location.name, 'Riyadh');
  assert.equal(reloaded.adjustmentsMinutes.isha, 7);
});

test('coerce drops unknown methods and bad madhab, filling defaults', () => {
  const c = coerce({
    location: { lat: 'bad', lng: 46.7, name: 42 },
    method: 'FakeMethod',
    madhab: 'Something',
    adjustmentsMinutes: { fajr: 'x', dhuhr: 5 }
  });
  // lat fell back to default (NaN was passed so Number() yielded NaN — base Najaf lat).
  // We don't hard-require a specific fallback value, just that the result is finite
  // and madhab+method are valid.
  assert.ok(Number.isFinite(c.location.lat));
  assert.ok(Number.isFinite(c.location.lng));
  assert.equal(typeof c.location.name, 'string');
  assert.equal(c.method, 'Jafari');
  assert.equal(c.madhab, 'Shafi');
  assert.equal(c.fiqh, 'shia');
  assert.equal(c.adjustmentsMinutes.fajr, 0);
  assert.equal(c.adjustmentsMinutes.dhuhr, 5);
});

test('corrupt config on disk is backed up and defaults are written', async () => {
  const dir = tmpDir();
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(configPath(dir), '{ not valid json', 'utf8');
  const cfg = await load(dir);
  assert.equal(cfg.method, 'Jafari', 'loaded defaults after corrupt file');
  // The backup file should exist.
  const entries = await fsp.readdir(dir);
  assert.ok(entries.some(e => e.includes('.corrupt-') && e.endsWith('.bak')),
    'expected a .corrupt-*.bak file');
});

test('loadSync works identically to load', async () => {
  const dir = tmpDir();
  const a = loadSync(dir);
  const b = await load(dir);
  assert.deepEqual(a, b);
});

test('Region auto-detection picks Shia methods (this is a Shia app)', () => {
  // Gulf Shia regions get JafariWide (18° astronomical fajr — matches
  // Qatif/Ahsa/Gulf mobile-app calendars)
  assert.equal(defaultMethodFor(24.7136, 46.6753), 'JafariWide', 'Riyadh (KSA) -> JafariWide');
  assert.equal(defaultMethodFor(21.4225, 39.8262), 'JafariWide', 'Makkah (KSA) -> JafariWide');
  assert.equal(defaultMethodFor(25.4295, 49.5921), 'JafariWide', 'Ahsa (KSA) -> JafariWide');
  assert.equal(defaultMethodFor(25.2048, 55.2708), 'JafariWide', 'Dubai (UAE) -> JafariWide');
  assert.equal(defaultMethodFor(25.2854, 51.5310), 'JafariWide', 'Doha (Qatar) -> JafariWide');
  assert.equal(defaultMethodFor(29.3759, 47.9774), 'JafariWide', 'Kuwait City -> JafariWide');
  assert.equal(defaultMethodFor(26.0667, 50.5577), 'JafariWide', 'Manama (Bahrain) -> JafariWide');
  // Other Shia regions keep their local tradition
  assert.equal(defaultMethodFor(32.0256, 44.3269), 'Jafari', 'Najaf (Iraq) -> Jafari (Leva)');
  assert.equal(defaultMethodFor(32.6149, 44.0240), 'Jafari', 'Karbala (Iraq) -> Jafari (Leva)');
  assert.equal(defaultMethodFor(35.6892, 51.3890), 'Tehran', 'Tehran (Iran) -> Tehran');
  assert.equal(defaultMethodFor(33.8938, 35.5018), 'Jafari', 'Beirut (Lebanon) -> Jafari (Leva)');
  assert.equal(defaultMethodFor(40.4093, 49.8671), 'Jafari', 'Baku (Azerbaijan) -> Jafari (Leva)');
  // Non-Shia-region fallback — Jafari Leva (the Shia Twelver default
  // for the global diaspora). Sunni regional methods are NOT
  // auto-selected because Mithnah is a Shia app; operators in mixed
  // communities can still pick any method manually via F3.
  assert.equal(defaultMethodFor(51.5074, -0.1278), 'Jafari', 'London -> Jafari (global default)');
  assert.equal(defaultMethodFor(30.0444, 31.2357), 'Jafari', 'Cairo (no Shia region entry) -> Jafari (default)');
  assert.equal(defaultMethodFor(40.7128, -74.0060), 'Jafari', 'NY (no Shia region entry) -> Jafari (default)');
});

test('detectRegion returns null for polar/ocean points', () => {
  assert.equal(detectRegion(0, -30), null, 'Atlantic ocean -> no region');
  assert.equal(detectRegion(-85, 0), null, 'Antarctica -> no region');
});
