/**
 * Mithnah — Main Process Constants & Config
 *
 * Centralised constants so index.js doesn't have to carry them inline.
 */

const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

const USER_DATA_PATH = app.getPath('userData');
const SETTINGS_FILE = path.join(USER_DATA_PATH, 'window-settings.json');
const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
const RENDERER_DEV_PORT = Number(process.env.MASJID_RENDERER_DEV_PORT || 5173);
const RENDERER_DEV_URL = process.env.MASJID_RENDERER_DEV_URL || `http://localhost:${RENDERER_DEV_PORT}`;
const MOBILE_CONTROL_PORT = 3100;

// 6-digit PIN by default (~19.9 bits entropy vs 13.3 for 4-digit). Operator
// can override via MASJID_REMOTE_PIN. Backwards-compat: if they set a 4-digit
// PIN in env we still honor it.
function defaultPin() {
  // Per-device PIN: derive from sha256(hostname + username + 'mithnah-pin-v1')
  // so two installs on different machines don't share the same PIN by
  // default. The literal "739156" below is only the catch-all if
  // os.hostname() / os.userInfo() throw — kept for backwards-compat with
  // earlier installs where that fallback got baked into operator notes.
  try {
    const os = require('os');
    const hash = crypto.createHash('sha256')
      .update(os.hostname() + os.userInfo().username + 'mithnah-pin-v1')
      .digest('hex');
    // Take first 6 hex digits -> 0..16777215 -> mod 1e6 -> zero-padded.
    const n = parseInt(hash.slice(0, 6), 16) % 1_000_000;
    return String(n).padStart(6, '0');
  } catch (_) {
    // Cryptographically random fallback — never hardcoded.
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}

const MOBILE_CONTROL_PIN = String(process.env.MASJID_REMOTE_PIN || defaultPin());
const REMOTE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

module.exports = {
  USER_DATA_PATH,
  SETTINGS_FILE,
  ZOOM_LEVELS,
  RENDERER_DEV_PORT,
  RENDERER_DEV_URL,
  MOBILE_CONTROL_PORT,
  MOBILE_CONTROL_PIN,
  REMOTE_SESSION_TTL_MS,
};
