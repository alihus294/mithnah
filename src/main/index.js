const { app, BrowserWindow, ipcMain, screen, session, protocol, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const QRCode = require('qrcode');
const fsp = require('fs/promises');
const prayerTimes = require('./prayer-times');
const prayerTimesIpc = require('./prayer-times/ipc');
const hijriIpc = require('./hijri/ipc');
const locationModule = require('./location');
const locationIpc = require('./location/ipc');
const shiaContent = require('./shia-content');
const shiaContentIpc = require('./shia-content/ipc');
const slideshow = require('./slideshow');
const slideshowIpc = require('./slideshow/ipc');
const bridgeIpc = require('./bridge-ipc');
const marjaIpc = require('./marja/ipc');
// Pluggable updater. Disabled by default — operator opts in by setting
// MITHNAH_AUTO_UPDATE=1 env var and configuring a feed (MITHNAH_UPDATE_FEED
// or package.json build.publish). The module itself is always loaded so the
// IPC channels exist; `updater.start()` is gated.
const updater = require('./updater');
const updaterIpc = require('./updater/ipc');
const appFeatures = require('./app-features');
const { configPath: configPathOf } = require('./prayer-times/config');
const frameGuard = require('./frame-guard');
const { createWindow, getMainWindow } = require('./window/window-manager');
const remoteServer = require('./remote-server');
const lifecycle = require('./lifecycle');
const { initIpcHandlers } = require('./ipc-handlers');
// Destructure `isFromMainWindow` up here (right next to the require) so
// every IPC handler below resolves the same binding at module-load
// time. Earlier this lived just before the F3 handlers ~line 1770,
// which worked only because closures over `const` look up the binding
// at call time — moving it up removes that footgun for future readers.
const { isFromMainWindow } = frameGuard;
const networkCapabilities = require('./network-capabilities');
const autoContent = require('./auto-content');
const hijri = require('./hijri');
const { effectiveHijriForEvents } = require('./bridge-ipc');

// Top-level safety nets. A mosque display must NEVER silently die — log
// the cause so operators can collect logs, then let Electron's crash
// handling take over.
process.on('unhandledRejection', (reason) => {
  console.error('[Mithnah] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Mithnah] uncaughtException:', err);
});

// --- Startup clock-skew check vs NTP ---
// Warn if system clock is off by > 5 minutes — prayer times depend on it.
async function checkClockSkew() {
  try {
    const ntpTime = await new Promise((resolve, reject) => {
      const client = require('dgram').createSocket('udp4');
      const buf = Buffer.alloc(48);
      buf[0] = 0x1b; // NTP v3, mode 3 (client)
      const timeout = setTimeout(() => { client.close(); reject(new Error('ntp timeout')); }, 3000);
      client.on('error', (err) => { clearTimeout(timeout); client.close(); reject(err); });
      client.on('message', (msg) => {
        clearTimeout(timeout);
        client.close();
        // NTP timestamp starts at byte 40, 64-bit fixed point
        const secondsSince1900 = msg.readUInt32BE(40);
        const ntpEpoch = new Date('1900-01-01T00:00:00Z').getTime();
        resolve(new Date(ntpEpoch + secondsSince1900 * 1000));
      });
      client.send(buf, 123, 'pool.ntp.org', (err) => {
        if (err) { clearTimeout(timeout); client.close(); reject(err); }
      });
    });
    const skewMs = Date.now() - ntpTime.getTime();
    if (Math.abs(skewMs) > 5 * 60 * 1000) {
      console.warn(`[Mithnah] CLOCK SKEW WARNING: system clock is off by ${Math.round(skewMs / 1000)}s — prayer times will be wrong`);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('app:clock-skew', { skewMs, thresholdMs: 5 * 60 * 1000 });
      }
    } else {
      console.log(`[Mithnah] Clock skew OK: ${Math.round(skewMs / 1000)}s`);
    }
  } catch (err) {
    console.warn('[Mithnah] NTP check failed (offline?):', err.message);
  }
}
// Run once at startup (non-blocking)
checkClockSkew();

// Prevent a second instance from clobbering port 3100 and window. The second
// launch is forwarded (main window focused) rather than opened.
if (!app.requestSingleInstanceLock()) {
  console.log('[Mithnah] another instance is already running — exiting.');
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// Keep mosque text crisp on large displays.
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- CONSTANTS & CONFIG ---
const USER_DATA_PATH = app.getPath('userData');
const SETTINGS_FILE = path.join(USER_DATA_PATH, 'window-settings.json');
const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
const RENDERER_DEV_PORT = Number(process.env.MASJID_RENDERER_DEV_PORT || 5173);
const RENDERER_DEV_URL = process.env.MASJID_RENDERER_DEV_URL || `http://localhost:${RENDERER_DEV_PORT}`;
const MOBILE_CONTROL_PORT = 3100;
// 6-digit PIN by default (~19.9 bits entropy vs 13.3 for 4-digit). Operator
// can override via MASJID_REMOTE_PIN. Backwards-compat: if they set a 4-digit
// PIN in env we still honor it.
// Per-device PIN: derive from sha256(hostname + username + 'mithnah-pin-v1')
// so two installs on different machines don't share the same PIN by
// default. The literal "739156" below is only the catch-all if
// os.hostname() / os.userInfo() throw — kept for backwards-compat with
// earlier installs where that fallback got baked into operator notes.
const PIN_SALT_FILE = path.join(USER_DATA_PATH, 'pin-salt.json');

async function getOrCreatePinSalt() {
  try {
    const raw = await fsp.readFile(PIN_SALT_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data.salt === 'string') return data.salt;
  } catch (_) {}
  const salt = crypto.randomBytes(8).toString('hex');
  await fsp.writeFile(PIN_SALT_FILE, JSON.stringify({ salt, createdAt: Date.now() }), 'utf8');
  return salt;
}

async function defaultPin() {
  try {
    const os = require('os');
    const base = os.hostname() + os.userInfo().username + 'mithnah-pin-v1';
    // Add a persisted random salt so the derived PIN isn't deterministic across
    // reinstalls on the same machine (defence-in-depth against an
    // attacker who knows the hostname+username).
    const salt = await getOrCreatePinSalt();
    const hash = crypto.createHash('sha256')
      .update(base + salt)
      .digest('hex');
    // Take first 6 hex digits -> 0..16777215 -> mod 1e6 -> zero-padded.
    const n = parseInt(hash.slice(0, 6), 16) % 1_000_000;
    return String(n).padStart(6, '0');
  } catch (_) {
    return '739156';
  }
}
// Resolve PIN asynchronously at startup (top-level await not available in CJS)
let MOBILE_CONTROL_PIN = '739156';
(async () => {
  MOBILE_CONTROL_PIN = String(process.env.MASJID_REMOTE_PIN || await defaultPin());
})();
const REMOTE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// --- RUNTIME MODES & PATHS ---
// Two modes of loading the renderer:
//   NODE_ENV=development -> load Vite dev server at RENDERER_DEV_URL
//   otherwise            -> load dist/renderer/index.html (Vite build from src/renderer)
const IS_DEV = process.env.NODE_ENV === 'development';

const PROJECT_ROOT       = path.join(__dirname, '..', '..');
const RENDERER_DIST_ROOT = path.join(PROJECT_ROOT, 'dist', 'renderer');
const PUBLIC_ROOT        = path.join(PROJECT_ROOT, 'src', 'public');
// build-output/ contains the mobile-control phone UI + shared vendor assets
// (fonts, textures, widget JS). It is NOT a generated build artifact; the
// name is historical. The renderer build is in dist/renderer/.
const BUILD_OUTPUT_ROOT  = path.join(PROJECT_ROOT, 'build-output');

function resolveFirstExisting(candidates) {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return candidates.find(Boolean) || null;
}

// Resolve the icon. In a packaged build, asarUnpack copies
// src/public/icon.ico out of the .asar archive and into
// `resources/app.asar.unpacked/src/public/icon.ico`. BrowserWindow's
// `icon:` option must point at a real on-disk file, not an asar-
// virtual path, or Windows silently falls back to a generic icon on
// the taskbar. We probe the unpacked location first, then the
// in-repo path (dev mode), then dist/renderer.
const APP_ICON_PATH = resolveFirstExisting([
  path.join(PROJECT_ROOT, '..', 'app.asar.unpacked', 'src', 'public', 'icon.ico'),
  path.join(PUBLIC_ROOT, 'icon.ico'),
  path.join(RENDERER_DIST_ROOT, 'icon.ico')
]);
// Generic wall-level remote commands. The slideshow has its own whitelist
// (NAV_COMMANDS) — see the slideshow-command socket handler below.
const REMOTE_COMMAND_SET = new Set([
  'SET_APP_ZOOM'
]);

// --- ZOOM STATE MANAGEMENT ---
let zoomState = {
  factor: 1.0,
  auto: true
};

let saveSettingsTimer = null;

let remoteRendererState = {
  updatedAt: 0
};

// In-memory snapshot of everything we persist to window-settings.json. The
// file is read once at startup into `persistedSettings`, callers mutate
// specific keys (e.g. zoom) and `persistSettings` writes the full object
// back atomically. This preserves unknown fields across upgrades instead
// of nuking them on every save.
let persistedSettings = { zoom: { factor: 1.0, auto: true } };

async function loadSettings() {
  try {
    const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
    // Refuse to parse pathologically large files — a JSON-bomb in
    // window-settings.json would OOM the main process. Cap at 256 KB
    // (real settings are ~50 bytes; 256 KB is generous).
    if (content.length > 256 * 1024) {
      throw new Error(`settings file too large (${content.length} bytes)`);
    }
    const data = JSON.parse(content);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      persistedSettings = { ...persistedSettings, ...data };
    }
    if (persistedSettings.zoom && typeof persistedSettings.zoom === 'object') {
      zoomState = { ...zoomState, ...persistedSettings.zoom };
      console.log(`[Zoom] Loaded saved zoom: ${zoomState.factor} (Auto: ${zoomState.auto})`);
    }
    // One-time reset: 0.8.30 disabled smart-auto upscaling because the
    // CSS clamp(vw) already handles high-DPI screens. Installs that
    // persisted an auto=true 1.25/1.5 factor from an older build stay
    // stuck zoomed-in and the next-prayer countdown hides off-screen.
    // If the saved factor is auto AND greater than 1.0, reset it to
    // 1.0 exactly once (tracked by a schema flag so we don't fight
    // the operator's manual zoom preference).
    if (!persistedSettings.zoomResetV030 && zoomState.auto && zoomState.factor > 1.0) {
      console.log(`[Zoom] Upgrade reset: auto factor ${zoomState.factor} → 1.0 (0.8.30 CSS handles scaling natively)`);
      zoomState.factor = 1.0;
      persistedSettings.zoomResetV030 = true;
      await persistSettings();
    } else if (!persistedSettings.zoomResetV030) {
      persistedSettings.zoomResetV030 = true;
      await persistSettings();
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      zoomState.factor = getSmartZoomFactor();
      zoomState.auto = true;
      await persistSettings();
      return;
    }
    console.error('[Zoom] Failed to load settings:', e);
    zoomState.factor = 1.0;
  }
}

async function persistSettings() {
  try {
    persistedSettings.zoom = { factor: zoomState.factor, auto: zoomState.auto };
    // Unique tmp filename per call — avoids the ENOENT collision seen
    // under parallel setConfig fuzz testing. Prevents half-written files
    // if the process crashes mid-write.
    const tmp = `${SETTINGS_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(persistedSettings, null, 2), 'utf8');
    try {
      await fsp.rename(tmp, SETTINGS_FILE);
    } catch (err) {
      try { await fsp.unlink(tmp); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('[Zoom] Failed to save settings:', e);
  }
}

function saveSettings() {
  if (saveSettingsTimer) clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(() => {
    void persistSettings();
  }, 120);
}

// 2. Smart Screen Detection
//
// Historically this upscaled the renderer on 2K/4K screens and
// downscaled on small laptops because the CSS used fixed px sizes
// that looked tiny on high-DPI panels. After 0.8.24 every dashboard
// element switched to clamp(min, vw, max) so the visual scale now
// tracks the viewport natively. A non-1.0 smart zoom on top of that
// multiplies the clamp's max cap and pushes the next-prayer
// countdown off the screen. Operator complaint from 0.8.29:
//   "بعد التثبيت مباشرة صايره zoom in لدرجة الوقت المتبقي مختفي"
// → ship 1.0 as the default and let CSS handle responsive sizing.
// The operator can still override via Ctrl+/−; the factor is
// persisted so their preference survives restarts.
function getSmartZoomFactor() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  console.log(`[Zoom] Detected screen width: ${width}px (auto = 1.0; CSS clamp handles responsive sizing)`);
  return 1.0;
}

// 3. Apply Zoom to A Window
function applyZoom(win) {
  if (win && !win.isDestroyed()) {
    win.webContents.setZoomFactor(zoomState.factor);
  }
}

// 4. Global Zoom Setter
function setGlobalZoom(factor, isAuto = false) {
  // If manual adjustment is very precise (slider), use it. If keyboard, use snapped.
  zoomState.factor = factor;
  zoomState.auto = isAuto;

  saveSettings();

  // Apply to ALL windows (Main + Children)
  BrowserWindow.getAllWindows().forEach(applyZoom);

  const socket = remoteServer.getSocketServer();
  if (socket) {
    remoteRendererState = {
      ...remoteRendererState,
      zoom: {
        factor: zoomState.factor,
        auto: zoomState.auto
      },
      updatedAt: Date.now()
    };
    socket.emit('state', remoteRendererState);
  }
}

// 5. Calculate Next/Prev Zoom Step. The current factor may sit exactly on a
// step (common after Ctrl+0) — in that case we want to move FORWARD from it
// on a "+" press, not stay put. So for direction > 0 we find the first step
// strictly greater than `factor`; for direction < 0 we find the last step
// strictly less than it.
function adjustZoomStep(direction) {
  const current = zoomState.factor;
  let newIndex;
  if (direction > 0) {
    newIndex = ZOOM_LEVELS.findIndex((z) => z > current);
    if (newIndex === -1) newIndex = ZOOM_LEVELS.length - 1;
  } else {
    // last step < current
    newIndex = -1;
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
      if (ZOOM_LEVELS[i] < current) { newIndex = i; break; }
    }
    if (newIndex === -1) newIndex = 0;
  }
  setGlobalZoom(ZOOM_LEVELS[newIndex], false);
}

function getLanIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const collected = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry) return;
      if (entry.family !== 'IPv4') return;
      if (entry.internal) return;
      if (entry.address.startsWith('169.254.')) return;
      collected.push(entry.address);
    });
  });

  const scoreAddress = (value) => {
    if (value.startsWith('192.168.')) return 1;
    if (value.startsWith('10.')) return 2;
    const match = value.match(/^172\.(\d+)\./);
    if (match) {
      const subnet = Number(match[1]);
      if (subnet >= 16 && subnet <= 31) return 3;
    }
    return 9;
  };

  return [...new Set(collected)].sort((left, right) => scoreAddress(left) - scoreAddress(right));
}

function getPreferredLanIPv4Address() {
  const addresses = getLanIPv4Addresses();
  return addresses[0] || '127.0.0.1';
}

function getRemoteControlStaticRoot() {
  // First candidate that actually contains mobile-control.html wins. In
  // development we serve from src/public (live-edited files); otherwise
  // from dist/renderer (Vite build). BUILD_OUTPUT_ROOT is a universal fallback.
  const candidates = IS_DEV
    ? [PUBLIC_ROOT, RENDERER_DIST_ROOT, BUILD_OUTPUT_ROOT]
    : [RENDERER_DIST_ROOT, BUILD_OUTPUT_ROOT, PUBLIC_ROOT];

  for (const root of candidates) {
    if (root && fs.existsSync(path.join(root, 'mobile-control.html'))) {
      return root;
    }
  }
  return candidates[0];
}

function pruneExpiredRemoteSessions() {
  remoteServer.pruneExpiredRemoteSessions();
}

// Max simultaneous valid sessions — anything beyond this is almost
// certainly adversarial or a leak, so we evict the oldest to keep memory
// bounded. A real mosque has <10 connected phones at a time.
const MAX_ACTIVE_SESSIONS = 500;

function createRemoteSessionToken() {
  remoteServer.pruneExpiredRemoteSessions();
  const tokens = remoteServer.getSessionTokens();
  while (tokens.size >= MAX_ACTIVE_SESSIONS) {
    const oldest = tokens.keys().next().value;
    if (oldest === undefined) break;
    tokens.delete(oldest);
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + REMOTE_SESSION_TTL_MS);
  return token;
}

function isValidRemoteSessionToken(token) {
  if (typeof token !== 'string' || !token) return false;
  const tokens = remoteServer.getSessionTokens();
  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    tokens.delete(token);
    return false;
  }
  return true;
}

function getRemoteControlStatusPayload() {
  return remoteServer.getState();
}

function emitRemoteControlStatus() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('remote-control:status', getRemoteControlStatusPayload());
}

function emitRemoteControlCommand(commandPayload) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('remote-control:command', commandPayload);
}

function getRemoteRendererStatePayload() {
  return {
    ...remoteRendererState,
    zoom: {
      factor: zoomState.factor,
      auto: zoomState.auto
    }
  };
}

function setRemoteRendererState(nextState) {
  if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) return;
  remoteRendererState = {
    ...remoteRendererState,
    ...nextState,
    zoom: {
      factor: zoomState.factor,
      auto: zoomState.auto
    },
    updatedAt: Date.now()
  };

  const socket = remoteServer.getSocketServer();
  if (socket) {
    socket.emit('state', remoteRendererState);
  }
}

function extractRemoteSessionTokenFromRequest(req) {
  // Header-only. We intentionally DROP query-string and body tokens —
  // tokens in query strings end up in server logs, browser history, and
  // Referer headers; that's a leak vector for a LAN Bearer token. If a
  // future client needs body-token, accept it explicitly per-route.
  const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function normalizeRemoteCommandPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;

  const command = typeof rawPayload.command === 'string' ? rawPayload.command.trim().toUpperCase() : '';
  if (!REMOTE_COMMAND_SET.has(command)) {
    return null;
  }

  const basePayload =
    rawPayload.payload && typeof rawPayload.payload === 'object' && !Array.isArray(rawPayload.payload)
      ? { ...rawPayload.payload }
      : {};

  return {
    command,
    payload: basePayload
  };
}

// ── Bootstrap: wire IPC handlers and lifecycle ───────────────────────────

// Initialize prayer-times module before registering IPC handlers
// (async init — awaited during lifecycle startup)
let prayerTimesReady = prayerTimes.init(USER_DATA_PATH)
  .then(() => ({ ok: true }))
  .catch((err) => {
    console.error('[Mithnah] prayer-times init failed:', err);
    return { ok: false, error: err };
  });

initIpcHandlers({
  mainWindow: getMainWindow,
  isFromMainWindow,
  zoomState,
  setGlobalZoom,
  getSmartZoomFactor,
  getRemoteControlStatusPayload,
  remoteSocketServer: () => remoteServer.getSocketServer(),
  setRemoteRendererState,
  networkCapabilities,
  prayerTimes,
  appFeatures,
  configPathOf,
  USER_DATA_PATH,
  updater
});

// Initialize remote-server module with all dependencies before lifecycle
remoteServer.initRemoteServer({
  mainWindow: getMainWindow,
  slideshow,
  prayerTimes,
  remoteRendererState,
  kioskQuitRequested: () => lifecycle.getIsQuitting(),
  MOBILE_CONTROL_PORT,
  MOBILE_CONTROL_PIN,
  PROJECT_ROOT,
  IS_DEV,
  RENDERER_DEV_URL,
  getLanIPv4Addresses,
  getPreferredLanIPv4Address,
  getRemoteControlStaticRoot,
  emitRemoteControlStatus,
  emitRemoteControlCommand,
  getRemoteRendererStatePayload,
  normalizeRemoteCommandPayload,
  pruneExpiredRemoteSessions,
  adjustZoomStep,
  getSmartZoomFactor,
  setGlobalZoom,
  applyZoom
});

lifecycle.initLifecycle({
  mainWindow: getMainWindow,
  createWindow,
  getMainWindow,
  loadSettings,
  remoteServer,
  updater,
  autoContent,
  getRemoteControlStatusPayload: () => remoteServer.getState(),
  emitRemoteControlStatus,
  getLanIPv4Addresses,
  getPreferredLanIPv4Address,
  getRemoteControlStaticRoot,
  prayerTimesReady,
  MOBILE_CONTROL_PORT,
  MOBILE_CONTROL_PIN,
  QRCode,
  applyZoom
});
