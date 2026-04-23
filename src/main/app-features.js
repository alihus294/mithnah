// Feature-related main-process utilities: settings PIN gate, auto-launch
// registration, config export/import, Qibla computation. Kept separate from
// main/index.js so the top-level bootstrapper stays readable.

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

// --- PIN gate ---------------------------------------------------------------

// Rate-limit state for PIN verification. Keyed by "local" since the gate is
// only reachable from the renderer; mobile phone already has its own PIN.
let _pinFailures = [];
const PIN_WINDOW_MS = 10 * 60 * 1000;
const PIN_MAX_FAILURES = 8;

// PIN hashing: scrypt with explicit cost parameters. The Node default
// (N=16384, r=8, p=1) gives ~50ms per hash on a typical mosque-PC CPU,
// which moves a 6-digit PIN from "brute-forced in seconds with plain
// SHA-256" to "tens of minutes per attempt". 64-byte derived key is
// well above what we need to compare. The single-round SHA-256 in the
// previous build was inadequate for low-entropy 4-8 digit secrets.
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN, SCRYPT_OPTS).toString('hex');
}

// Create a fresh salt+hash pair for `pin` formatted as "salt$hash" for
// storage. Stored shape (e.g. "abc123…$ffeedd…") matches the regex in
// prayer-times/config.js coerce so backwards-compat with older configs
// that used the SHA-256 format is intentionally NOT preserved — those
// hashes get rejected by coerce and the operator must re-set the PIN.
function makePinHash(pin) {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4–8 digits');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}$${hashPin(pin, salt)}`;
}

// Constant-time compare of user input against stored "salt$hash". Returns
// true on match. Rate-limits after too many failures in a window.
function verifyPinAgainstHash(pin, stored) {
  if (typeof stored !== 'string' || !stored.includes('$')) return false;
  const now = Date.now();
  _pinFailures = _pinFailures.filter((t) => now - t < PIN_WINDOW_MS);
  if (_pinFailures.length >= PIN_MAX_FAILURES) {
    throw new Error('تم تجاوز عدد المحاولات المسموح به — انتظر قليلاً');
  }
  const [salt, hash] = stored.split('$');
  const candidate = hashPin(String(pin || ''), salt);
  // Buffers must be same length for timingSafeEqual; pad if needed.
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) { _pinFailures.push(now); return false; }
  const ok = crypto.timingSafeEqual(a, b);
  if (!ok) _pinFailures.push(now);
  return ok;
}

function resetPinRateLimit() { _pinFailures = []; }

// --- Qibla ------------------------------------------------------------------

// Compute initial-bearing (great-circle) from (lat, lng) to the Kaaba, plus
// straight-line surface distance. Bearing is 0–360° measured clockwise
// from true north; distance in kilometres.
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;
const EARTH_KM = 6371;

function computeQibla(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('lat/lng must be finite numbers');
  }
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const φ1 = toRad(lat),  φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  // Haversine.
  const Δφ = φ2 - φ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = EARTH_KM * c;
  return { bearingDeg: bearing, distanceKm };
}

// --- Config export/import ---------------------------------------------------

// Write the current prayer-config.json to an operator-chosen file via a
// native Save dialog. Returns { path } or { cancelled: true }.
async function exportConfigTo(dialog, window, configPathOnDisk) {
  const { canceled, filePath } = await dialog.showSaveDialog(window || null, {
    title: 'تصدير إعدادات مئذنة',
    defaultPath: `mithnah-config-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { cancelled: true };
  const raw = await fsp.readFile(configPathOnDisk, 'utf8');
  await fsp.writeFile(filePath, raw, 'utf8');
  return { path: filePath };
}

// Import config from an operator-chosen file and hand the parsed object to
// a caller-supplied applier (which runs it through coerce() + save()).
async function importConfigFrom(dialog, window, applyFn) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window || null, {
    title: 'استيراد إعدادات مئذنة',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths?.length) return { cancelled: true };
  const raw = await fsp.readFile(filePaths[0], 'utf8');
  if (raw.length > 1024 * 1024) throw new Error('config file too large');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  const applied = await applyFn(parsed);
  return { config: applied, path: filePaths[0] };
}

module.exports = {
  makePinHash, verifyPinAgainstHash, resetPinRateLimit,
  computeQibla, KAABA_LAT, KAABA_LNG,
  exportConfigTo, importConfigFrom
};
