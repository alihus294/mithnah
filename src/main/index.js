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

// Prevent a second instance from clobbering port 3100 and window. The second
// launch is forwarded (main window focused) rather than opened.
if (!app.requestSingleInstanceLock()) {
  console.log('[Mithnah] another instance is already running — exiting.');
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Keep mosque text crisp on large displays and let Chromium favor GPU-backed rasterization.
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
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
function defaultPin() {
  // Fixed default "739156" is memorable (includes the old 7391 prefix) so
  // existing operators can still recognise it; a fresh install derives
  // from a per-device hash so different deployments don't share PINs.
  try {
    const os = require('os');
    const hash = crypto.createHash('sha256')
      .update(os.hostname() + os.userInfo().username + 'mithnah-pin-v1')
      .digest('hex');
    // Take first 6 hex digits -> 0..16777215 -> mod 1e6 -> zero-padded.
    const n = parseInt(hash.slice(0, 6), 16) % 1_000_000;
    return String(n).padStart(6, '0');
  } catch (_) {
    return '739156';
  }
}
const MOBILE_CONTROL_PIN = String(process.env.MASJID_REMOTE_PIN || defaultPin());
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

let mainWindow;
let remoteHttpServer = null;
let remoteSocketServer = null;
let remoteSessionCleanupTimer = null;
let pinFailuresSweeper = null;
// IP-change watcher: polls network interfaces and regenerates the QR +
// URL when the preferred LAN address changes. Without this the phone
// pairing card shows a stale IP whenever the caretaker joins a new
// Wi-Fi after the app started, and the only workaround was to quit
// and relaunch Mithnah.
let ipRefreshTimer = null;
const remoteSessionTokens = new Map();

// --- ZOOM STATE MANAGEMENT ---
let zoomState = {
  factor: 1.0,
  auto: true
};

let saveSettingsTimer = null;

const remoteControlState = {
  running: false,
  ipAddress: '127.0.0.1',
  port: MOBILE_CONTROL_PORT,
  url: `http://127.0.0.1:${MOBILE_CONTROL_PORT}`,
  qrCodeDataUrl: null,
  pin: MOBILE_CONTROL_PIN,
  clientCount: 0
};
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

  if (remoteSocketServer) {
    remoteRendererState = {
      ...remoteRendererState,
      zoom: {
        factor: zoomState.factor,
        auto: zoomState.auto
      },
      updatedAt: Date.now()
    };
    remoteSocketServer.emit('state', remoteRendererState);
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
  const now = Date.now();
  for (const [token, expiresAt] of remoteSessionTokens.entries()) {
    if (expiresAt <= now) {
      remoteSessionTokens.delete(token);
    }
  }
}

// Max simultaneous valid sessions — anything beyond this is almost
// certainly adversarial or a leak, so we evict the oldest to keep memory
// bounded. A real mosque has <10 connected phones at a time.
const MAX_ACTIVE_SESSIONS = 500;

function createRemoteSessionToken() {
  pruneExpiredRemoteSessions();
  // Bound the map — if a flood of logins tries to exhaust memory, drop
  // the oldest (Map preserves insertion order).
  while (remoteSessionTokens.size >= MAX_ACTIVE_SESSIONS) {
    const oldest = remoteSessionTokens.keys().next().value;
    if (oldest === undefined) break;
    remoteSessionTokens.delete(oldest);
  }
  const token = crypto.randomBytes(24).toString('hex');
  remoteSessionTokens.set(token, Date.now() + REMOTE_SESSION_TTL_MS);
  return token;
}

function isValidRemoteSessionToken(token) {
  if (typeof token !== 'string' || !token) return false;
  const expiresAt = remoteSessionTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    remoteSessionTokens.delete(token);
    return false;
  }
  return true;
}

function getRemoteControlStatusPayload() {
  return {
    running: remoteControlState.running,
    ipAddress: remoteControlState.ipAddress,
    port: remoteControlState.port,
    url: remoteControlState.url,
    qrCodeDataUrl: remoteControlState.qrCodeDataUrl,
    pin: remoteControlState.pin,
    clientCount: remoteControlState.clientCount
  };
}

function emitRemoteControlStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('remote-control:status', getRemoteControlStatusPayload());
}

function emitRemoteControlCommand(commandPayload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('remote-control:command', commandPayload);
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
    ...nextState,
    zoom: {
      factor: zoomState.factor,
      auto: zoomState.auto
    },
    updatedAt: Date.now()
  };

  if (remoteSocketServer) {
    remoteSocketServer.emit('state', remoteRendererState);
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

async function startRemoteControlServer() {
  if (remoteHttpServer) return;

  const lanAddresses = getLanIPv4Addresses();
  const preferredAddress = getPreferredLanIPv4Address();
  remoteControlState.ipAddress = preferredAddress;
  remoteControlState.url = `http://${preferredAddress}:${MOBILE_CONTROL_PORT}`;
  remoteControlState.port = MOBILE_CONTROL_PORT;
  remoteControlState.pin = MOBILE_CONTROL_PIN;
  remoteControlState.qrCodeDataUrl = null;
  remoteControlState.clientCount = 0;
  remoteControlState.running = false;

  const remoteControlStaticRoot = getRemoteControlStaticRoot();
  const remoteControlApp = express();
  remoteControlApp.disable('x-powered-by');

  // Same-origin enforcement for state-changing methods. Rejects cross-origin
  // POSTs that carry a stolen Bearer token — the browser won't add the
  // Authorization header cross-origin without JS access to the token, but
  // this middleware is defense-in-depth against the rare case where the
  // token does leak (malicious extension, MITM on open Wi-Fi, etc).
  //
  // `same-origin` = Origin header absent (same-origin GET or fetch with
  // default credentials mode) OR Origin matches `Host`. Any explicit
  // mismatched Origin gets rejected.
  remoteControlApp.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    // CSRF defense, two layers:
    //   1. Origin must be same-origin (or absent — treated below).
    //   2. On state-changing requests with no Origin, require a custom
    //      header the browser only adds when JS explicitly sets it
    //      (X-Requested-With). HTML form POSTs can't set this, so a
    //      malicious page cannot submit a stolen-token form on our
    //      endpoints even with credentials included.
    const origin = req.headers.origin;
    if (origin) {
      try {
        const u = new URL(origin);
        const host = req.headers.host || '';
        if (u.host === host) return next();
        if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1')
            && host.startsWith(u.hostname)) return next();
        return res.status(403).json({ ok: false, message: 'Cross-origin request refused.' });
      } catch (_) {
        return res.status(400).json({ ok: false, message: 'Malformed Origin header.' });
      }
    }
    // No Origin header — accept only if the client identified itself
    // via X-Requested-With (set by our own fetch() wrappers). A
    // standard HTML form submission cannot add this header.
    const xrw = req.headers['x-requested-with'];
    if (xrw === 'Mithnah') return next();
    return res.status(403).json({ ok: false, message: 'Missing Origin and X-Requested-With.' });
  });

  remoteControlApp.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Security headers. CSP is tightened in packaged builds — unsafe-eval
    // is only kept in dev so Vite's HMR runtime works; packaged builds
    // don't need it. unsafe-inline stays because bundled font CSS uses
    // inline style tricks. Passing through unsafe-eval in prod is an
    // XSS-to-RCE amplifier and was a real audit finding.
    const evalClause = app.isPackaged ? '' : "'unsafe-eval' ";
    res.setHeader('Content-Security-Policy',
      `default-src 'self' 'unsafe-inline' ${evalClause}data: blob:; ` +
      "img-src 'self' data: blob:; " +
      "connect-src 'self' ws: wss:; " +
      "font-src 'self' data:; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  remoteControlApp.use(express.json({ limit: '24kb' }));
  remoteControlApp.use(express.urlencoded({ extended: false }));
  remoteControlApp.use(express.static(remoteControlStaticRoot, { index: false, maxAge: 0 }));

  remoteControlApp.get('/', (req, res) => {
    res.sendFile(path.join(remoteControlStaticRoot, 'mobile-control.html'));
  });

  // PIN rate limit: per-IP counter that blocks after 5 failed PIN attempts
  // for 15 minutes. Successful auth resets the counter. Prevents LAN
  // brute-force (4-digit PIN = 10,000 possibilities; at HTTP speed without
  // limiting, exhausting the keyspace takes minutes).
  const PIN_MAX_FAILURES = 5;
  const PIN_LOCKOUT_MS = 15 * 60 * 1000;
  const PIN_FAILURES_MAX_ENTRIES = 1000; // bound map size — evict oldest on overflow
  const PIN_FAILURE_RETENTION_MS = 60 * 60 * 1000; // drop entries older than 1 h
  const pinFailures = new Map(); // ip -> { count, lastFailure, lockedUntil }

  // Background sweep: drop records whose lockout has expired and whose
  // lastFailure is older than retention. Runs every 5 min. Wrapped in
  // try/catch so one malformed entry can't kill future sweeps.
  if (pinFailuresSweeper) { clearInterval(pinFailuresSweeper); }
  pinFailuresSweeper = setInterval(() => {
    try {
      const now = Date.now();
      for (const [ip, rec] of pinFailures.entries()) {
        if (rec && rec.lockedUntil > now) continue; // still locked
        if (!rec || (rec.lastFailure || 0) + PIN_FAILURE_RETENTION_MS < now) {
          pinFailures.delete(ip);
        }
      }
      // Hard cap too — evict by OLDEST lastFailure (timestamp-based),
      // not Map insertion order. This prevents a flood of fresh junk IPs
      // from evicting the legitimate-but-still-locked entries that got
      // there first.
      if (pinFailures.size > PIN_FAILURES_MAX_ENTRIES) {
        const sorted = [...pinFailures.entries()]
          .sort((a, b) => (a[1]?.lastFailure || 0) - (b[1]?.lastFailure || 0));
        const toDrop = pinFailures.size - PIN_FAILURES_MAX_ENTRIES;
        for (let i = 0; i < toDrop; i++) pinFailures.delete(sorted[i][0]);
      }
    } catch (err) {
      console.warn('[auth] pinFailures sweep failed:', err.message);
    }
  }, 5 * 60 * 1000);
  pinFailuresSweeper.unref?.();

  function clientIp(req) {
    return (req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  }

  remoteControlApp.post('/api/auth', (req, res) => {
    const ip = clientIp(req);
    const record = pinFailures.get(ip) || { count: 0, lockedUntil: 0 };
    if (record.lockedUntil > Date.now()) {
      const retryAfterSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.status(429).json({ ok: false, message: 'Too many attempts. Try again later.', retryAfterSec });
      return;
    }

    const providedPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (providedPin !== MOBILE_CONTROL_PIN) {
      record.count = (record.count || 0) + 1;
      record.lastFailure = Date.now();
      if (record.count >= PIN_MAX_FAILURES) {
        record.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
        console.warn(`[Mobile Control] PIN lockout for ${ip} after ${record.count} failures (${PIN_LOCKOUT_MS / 60000} min)`);
      }
      pinFailures.set(ip, record);
      res.status(401).json({ ok: false, message: 'Invalid PIN.' });
      return;
    }

    pinFailures.delete(ip);
    const token = createRemoteSessionToken();
    res.json({
      ok: true,
      token,
      expiresInMs: REMOTE_SESSION_TTL_MS
    });
  });

  remoteControlApp.get('/api/health', (req, res) => {
    res.json({ ok: true, clients: remoteControlState.clientCount });
  });

  remoteControlApp.get('/api/state', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }

    res.json({
      ok: true,
      state: getRemoteRendererStatePayload()
    });
  });

  // --- Marja + onboarding + config REST endpoints ---
  remoteControlApp.get('/api/config', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      res.json({ ok: true, config: prayerTimes.getConfig() });
    } catch (err) {
      console.error('[config] read failed:', err);
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  // Write a small whitelist of config fields from the mobile page.
  // Only fields the operator reasonably edits from a phone are
  // exposed — things like the prayer-calculation method, kiosk
  // lock, or PIN hash STAY on the wall's F3 panel. An attacker with
  // a valid PIN shouldn't be able to reshape the mosque's fatwa by
  // POSTing a single JSON field from a phone browser.
  const MOBILE_EDITABLE_FIELDS = new Set([
    'announcementText',
    'announcementAutoHideSeconds',
    'mosqueName',
    'imamName',
    'supportContact',
  ]);
  remoteControlApp.post('/api/config', async (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
      const patch = {};
      const rejected = [];
      for (const key of Object.keys(body)) {
        if (!MOBILE_EDITABLE_FIELDS.has(key)) { rejected.push({ key, reason: 'not-in-whitelist' }); continue; }
        const v = body[key];
        if (typeof v === 'string' || typeof v === 'number' || v === null) {
          patch[key] = v;
        } else {
          rejected.push({ key, reason: 'bad-type', type: typeof v });
        }
      }
      if (rejected.length > 0) {
        // Helpful when debugging a misbehaving phone client, and a
        // faint audit trail if someone is fuzzing the endpoint.
        console.warn('[config POST] rejected fields:', rejected);
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ ok: false, message: 'لا يوجد حقل مسموح في الطلب' });
        return;
      }
      const updated = await prayerTimes.setConfig(patch);
      res.json({ ok: true, config: updated });
    } catch (err) {
      console.error('[config] write failed:', err);
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  remoteControlApp.post('/api/marja/list', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    const marja = require('./marja');
    res.json({ ok: true, marjas: marja.listMarjas() });
  });

  remoteControlApp.post('/api/marja/set', async (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      const marja = require('./marja');
      const marjaId = req.body?.marjaId;
      if (!marja.isValidMarjaId(marjaId)) {
        res.status(400).json({ ok: false, message: `Unknown marja: ${marjaId}` });
        return;
      }
      const m = marja.getMarja(marjaId);
      const patch = { marja: marjaId };
      if (m.preset) Object.assign(patch, m.preset);
      const updated = await prayerTimes.setConfig(patch);
      res.json({ ok: true, config: updated });
    } catch (err) {
      console.error('[marja] set failed:', err);
      res.status(500).json({ ok: false, message: 'Marja update failed.' });
    }
  });

  remoteControlApp.post('/api/onboarding/complete', async (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      const updated = await prayerTimes.setConfig({ onboardingCompleted: true });
      res.json({ ok: true, config: updated });
    } catch (err) {
      console.error('[onboarding] complete failed:', err);
      res.status(500).json({ ok: false, message: 'Onboarding failed.' });
    }
  });

  // Phone dashboard snapshot — composes config + next prayer + Hijri +
  // events in one authenticated call so the mobile-control page doesn't
  // have to make four round-trips per refresh.
  remoteControlApp.post('/api/phone-dashboard', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      const cfg = prayerTimes.getConfig();
      const pt  = prayerTimes.getTodayAndNext(new Date());
      const hijriToday = require('./hijri').today(
        cfg.calendar || 'jafari',
        { dayOffset: cfg.calendarDayOffset || 0 }
      );
      // If hijri.today() ever returns null (e.g., an exotic calendar ID
      // slipped through), return a partial payload instead of crashing
      // with "Cannot read property 'year' of null". Phone shows the
      // prayer times; Hijri fields stay blank until next refresh.
      if (!hijriToday || typeof hijriToday !== 'object') {
        res.json({
          ok: true,
          data: { config: cfg, prayerTimes: pt, hijri: null, events: [], upcoming: [] }
        });
        return;
      }
      const events = require('./shia-content').eventsForHijriDate(
        hijriToday.year, hijriToday.month, hijriToday.day
      );
      const upcoming = require('./shia-content').upcomingEvents(
        hijriToday, { daysAhead: 40, limit: 3 }
      );
      res.json({
        ok: true,
        data: {
          config: cfg,
          prayerTimes: pt,
          hijri: hijriToday,
          events,
          upcoming,
          // Include the pairing info so the Settings tab on the phone
          // can show PIN + URL without a second request. Safe because
          // the endpoint itself is PIN-gated — the caller already holds
          // the token needed to see these values.
          connection: {
            pin: remoteControlState.pin,
            url: remoteControlState.url,
            port: remoteControlState.port,
            ipAddress: remoteControlState.ipAddress
          }
        }
      });
    } catch (err) {
      console.error('[phone-dashboard] failed:', err);
      res.status(500).json({ ok: false, message: 'Dashboard failed.' });
    }
  });

  // --- Shia content + slideshow REST endpoints ---
  // Used by the mobile-control slideshow widget. All require a valid PIN
  // token. The same underlying modules back the Electron IPC handlers so
  // there's one source of truth.
  remoteControlApp.post('/api/shia/catalog', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    res.json({
      ok: true,
      catalog: {
        dua:     shiaContent.listDuas(),
        ziyarah: shiaContent.listZiyarat(),
        taqib:   shiaContent.listTaqibat(),
        tasbih:  [shiaContent.getTasbihZahra()]
      }
    });
  });

  remoteControlApp.post('/api/slideshow/state', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    res.json({ ok: true, state: slideshow.getState() });
  });

  remoteControlApp.post('/api/slideshow/open', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    const { kind, id } = req.body || {};
    let deck = null;
    if (kind === 'dua')     deck = shiaContent.getDua(id);
    else if (kind === 'ziyarah') deck = shiaContent.getZiyarah(id);
    else if (kind === 'taqib')   deck = (shiaContent.listTaqibat().find(t => t.id === id) || null);
    else if (kind === 'tasbih') {
      const t = shiaContent.getTasbihZahra();
      if (t && t.id === id) {
        deck = {
          kind: 'tasbih', id: t.id, title: t.title, subtitle: t.subtitle,
          source: t.source, fiqh: 'shia',
          slides: [
            { kind: 'title', ar: t.title, subtitle: t.subtitle },
            ...t.phrases.map((p) => ({
              kind: 'tasbih-phrase',
              heading: `${p.order === 1 ? 'الأولى' : p.order === 2 ? 'الثانية' : 'الثالثة'} — ${p.count} مرة`,
              ar: p.phrase, latin: p.phraseLatin, count: p.count
            })),
            { kind: 'note', heading: 'المجموع', ar: t.note }
          ]
        };
      }
    }
    if (!deck) {
      res.status(404).json({ ok: false, message: `Unknown deck: ${kind}/${id}` });
      return;
    }
    // shia-content returns frozen objects, so in-place `deck.kind = kind`
    // silently fails. Spread into a fresh object and tag the kind there.
    const openable = { ...deck, kind };
    try {
      const state = slideshow.dispatch('OPEN', { deck: openable });
      res.json({ ok: true, state });
    } catch (err) {
      console.error('[slideshow] open failed:', err);
      res.status(400).json({ ok: false, message: 'Open failed.' });
    }
  });

  // Navigation-only slideshow commands (OPEN is deliberately excluded —
  // use /api/slideshow/open with a curated shia-content deck instead).
  // This prevents an authenticated attacker from pushing arbitrary deck
  // content onto the wall display.
  const NAV_COMMANDS = new Set(['NEXT', 'PREV', 'FIRST', 'LAST', 'GOTO', 'BLANK', 'CLOSE']);

  remoteControlApp.post('/api/slideshow/command', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    const raw = req.body?.command;
    const command = typeof raw === 'string' ? raw.toUpperCase() : '';
    if (!NAV_COMMANDS.has(command)) {
      res.status(400).json({ ok: false, message: 'Invalid command.' });
      return;
    }
    try {
      const state = slideshow.dispatch(command, req.body?.payload || {});
      res.json({ ok: true, state });
    } catch (err) {
      console.error('[slideshow] command failed:', err);
      res.status(400).json({ ok: false, message: 'Command refused.' });
    }
  });

  // Mobile-control: drive the F5 prayer tracker overlay from the
  // operator's phone (open / close / next / prev / reset /
  // set-rakahs). Forwarded to the renderer via the
  // `tracker:command` channel which PrayerTracker listens for.
  remoteControlApp.post('/api/tracker/command', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    const allowed = new Set(['open', 'close', 'next', 'prev', 'reset', 'set-rakahs']);
    const action = String(req.body?.action || '').trim();
    if (!allowed.has(action)) {
      res.status(400).json({ ok: false, message: 'Unknown tracker action.' });
      return;
    }
    const payload = { action };
    if (action === 'set-rakahs') {
      const r = Number(req.body?.rakahs);
      if (![2, 3, 4].includes(r)) {
        res.status(400).json({ ok: false, message: 'rakahs must be 2, 3, or 4.' });
        return;
      }
      payload.rakahs = r;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tracker:command', payload);
    }
    res.json({ ok: true, dispatched: payload });
  });

  // Mobile-control: open the F4 dua picker / close it / cycle to
  // a specific dua id. Mirrors the tracker endpoint above so the
  // phone can drive the wall's dua-browsing UI.
  remoteControlApp.post('/api/picker/command', (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    const allowed = new Set(['open', 'close']);
    const action = String(req.body?.action || '').trim();
    if (!allowed.has(action)) {
      res.status(400).json({ ok: false, message: 'Unknown picker action.' });
      return;
    }
    const payload = { action };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('picker:command', payload);
    }
    res.json({ ok: true, dispatched: payload });
  });

  // GPS-based location handoff: the mobile-control page (running in the user's
  // phone browser) calls navigator.geolocation.getCurrentPosition and POSTs the
  // result here. Phone GPS is orders of magnitude more accurate than the
  // offline timezone fallback or a Windows desktop's coarse location service.
  remoteControlApp.post('/api/location/set', async (req, res) => {
    const token = extractRemoteSessionTokenFromRequest(req);
    if (!isValidRemoteSessionToken(token)) {
      res.status(401).json({ ok: false, message: 'Unauthorized.' });
      return;
    }
    try {
      let lat, lng;
      try {
        ({ lat, lng } = locationModule.validateCoordinates(req.body?.lat, req.body?.lng));
      } catch (_) {
        res.status(400).json({ ok: false, message: 'Invalid coordinates.' });
        return;
      }
      const accuracy = Number(req.body?.accuracy);
      // Reject absurdly coarse fixes — anything > 10 km accuracy is almost
      // certainly IP-based geolocation, not real GPS. For a mosque display
      // this is the wrong tool.
      if (Number.isFinite(accuracy) && accuracy > 10000) {
        res.status(400).json({ ok: false, message: 'GPS accuracy too coarse (>10 km). Try outdoors with clear sky.' });
        return;
      }
      const source = typeof req.body?.source === 'string' ? req.body.source : 'gps';

      // Reverse-geocode via the bundled city table. If the caller didn't
      // pass a name — or passed a placeholder like "GPS" — resolve the
      // nearest city (within 200 km of the fix) and use its Arabic name.
      // This turns a raw {lat, lng} into a readable "المدينة المنورة"
      // style label the operator can verify at a glance.
      const callerName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      let name = callerName;
      const nearest = locationModule.nearestCity(lat, lng);
      if (!name || name === 'GPS' || name === 'Custom') {
        if (nearest && nearest.distanceKm <= 200) {
          name = nearest.city.nameAr || nearest.city.name;
        } else {
          name = callerName || 'GPS';
        }
      }

      const patch = {
        location: { lat, lng, name },
        locationAccuracyMeters: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        locationSource: source,
        locationFixedAt: new Date().toISOString()
      };
      if (req.body?.alignMethodToRegion === true) {
        const { defaultMethodFor, defaultFiqhFor } = require('./prayer-times/defaults');
        patch.method = defaultMethodFor(lat, lng);
        patch.fiqh   = defaultFiqhFor(lat, lng);
      }
      const updated = await prayerTimes.setConfig(patch);
      const distStr = nearest ? ` (${nearest.distanceKm.toFixed(1)} km from ${nearest.city.name})` : '';
      console.log(`[location] GPS handoff: ${name} (${lat}, ${lng}) accuracy=${Number.isFinite(accuracy) ? `${accuracy.toFixed(0)}m` : 'n/a'} source=${source}${distStr}`);
      res.json({ ok: true, config: updated, nearest });
    } catch (err) {
      console.error('[location] GPS handoff failed:', err);
      res.status(500).json({ ok: false, message: 'Location update failed.' });
    }
  });

  const server = http.createServer(remoteControlApp);
  // Restrict CORS to same-origin (LAN). Mobile-control JS always calls
  // from the same origin as the page, so `false` is enough; any attempt
  // to call /api/* from a different origin is now rejected rather than
  // reflected.
  const io = new SocketIOServer(server, {
    cors: {
      origin: false,
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    // Header-only — query-string tokens leak via Referer / proxy logs and
    // are inconsistent with the HTTP policy which drops them too.
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    if (!isValidRemoteSessionToken(token)) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    remoteControlState.clientCount = io.engine.clientsCount;
    emitRemoteControlStatus();
    socket.emit('state', getRemoteRendererStatePayload());
    // Push current slideshow state to the newly-connected client so phone
    // UIs that arrive after a deck was already opened catch up immediately.
    socket.emit('slideshow:state', slideshow.getState());

    socket.on('command', (rawPayload) => {
      const normalized = normalizeRemoteCommandPayload(rawPayload);
      if (!normalized) return;
      emitRemoteControlCommand({
        ...normalized,
        source: socket.id,
        receivedAt: Date.now()
      });
    });

    // Presenter-style slideshow commands from phone remote. Each command
    // flows through slideshow.dispatch so the state machine is the sole
    // authority; the subscribe broadcast then relays the new state back.
    socket.on('slideshow-command', (payload) => {
      try {
        const cmd = typeof payload?.command === 'string' ? payload.command.toUpperCase() : '';
        // Socket.io gets the same nav-only whitelist as the HTTP route —
        // OPEN is reachable only via /api/slideshow/open (which routes
        // through curated shia-content).
        if (!NAV_COMMANDS.has(cmd)) return;
        // Sanitize payload — only the handful of numeric fields the nav
        // state machine actually uses. An unbounded object would let a
        // misbehaving client OOM the main process via huge arrays.
        const raw = payload?.payload;
        const safe = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          if (Number.isFinite(raw.index)) safe.index = Math.floor(raw.index);
          if (typeof raw.on === 'boolean') safe.on = raw.on;
        }
        slideshow.dispatch(cmd, safe);
      } catch (err) {
        console.warn('[slideshow] remote command rejected:', err.message);
      }
    });

    socket.on('disconnect', () => {
      remoteControlState.clientCount = io.engine.clientsCount;
      emitRemoteControlStatus();
    });
  });

  // Port fallback: try the preferred port, then the next 10. If all are
  // in use (rare — another Mithnah instance, stale process, actual conflict)
  // we bail and the caller logs the failure. The mobile-control URL reflects
  // the actual bound port so phones get the right number.
  const portsToTry = [];
  for (let i = 0; i < 10; i++) portsToTry.push(MOBILE_CONTROL_PORT + i);
  let boundPort = null;
  let lastErr = null;
  for (const candidate of portsToTry) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(candidate, '0.0.0.0');
      });
      boundPort = candidate;
      break;
    } catch (err) {
      lastErr = err;
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`[Mobile Control] port ${candidate} in use, trying next`);
        continue;
      }
      throw err;
    }
  }
  if (boundPort === null) {
    throw lastErr || new Error('no free port in range');
  }
  remoteControlState.port = boundPort;
  remoteControlState.url  = `http://${preferredAddress}:${boundPort}`;

  remoteHttpServer = server;
  remoteSocketServer = io;
  remoteControlState.running = true;
  remoteControlState.clientCount = io.engine.clientsCount;

  try {
    remoteControlState.qrCodeDataUrl = await QRCode.toDataURL(remoteControlState.url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M'
    });
  } catch (error) {
    console.error('[Mobile Control] Failed to generate QR code:', error);
  }

  if (remoteSessionCleanupTimer) {
    clearInterval(remoteSessionCleanupTimer);
  }
  remoteSessionCleanupTimer = setInterval(pruneExpiredRemoteSessions, 60 * 1000);
  if (typeof remoteSessionCleanupTimer.unref === 'function') {
    remoteSessionCleanupTimer.unref();
  }

  // IP-change watcher. Poll every 8s and if the preferred LAN IPv4
  // address has changed (caretaker joined a different Wi-Fi, switched
  // from Ethernet to Wi-Fi, etc.) rebuild the URL + regenerate the
  // QR then broadcast the new status so the F3 pairing card refreshes
  // live without a restart.
  //
  // Re-entry protection: QRCode.toDataURL is async and can take a
  // handful of ms. Without the `ipRefreshRunning` flag a tick could
  // start while the previous tick was still mid-regeneration, which
  // corrupts the shared remoteControlState. The flag guarantees at
  // most one in-flight refresh at any time, and we additionally
  // check `remoteHttpServer` so a tick firing AFTER stopRemoteControl
  // Server tore it down becomes a no-op instead of mutating a dead
  // state object.
  if (ipRefreshTimer) clearInterval(ipRefreshTimer);
  let ipRefreshRunning = false;
  ipRefreshTimer = setInterval(async () => {
    if (ipRefreshRunning) return;
    if (!remoteHttpServer) return; // server was torn down mid-tick
    ipRefreshRunning = true;
    try {
      const current = getPreferredLanIPv4Address();
      if (current && current !== remoteControlState.ipAddress) {
        const previous = remoteControlState.ipAddress;
        remoteControlState.ipAddress = current;
        remoteControlState.url = `http://${current}:${remoteControlState.port}`;
        try {
          remoteControlState.qrCodeDataUrl = await QRCode.toDataURL(remoteControlState.url, {
            margin: 1,
            width: 320,
            errorCorrectionLevel: 'M'
          });
        } catch (_) {}
        // Re-check the server is still alive before broadcasting —
        // the await above yielded control and stopRemoteControlServer
        // may have run.
        if (remoteHttpServer) {
          console.log(`[Mobile Control] IP changed ${previous} → ${current}; QR refreshed.`);
          emitRemoteControlStatus();
        }
      }
    } catch (err) {
      console.warn('[Mobile Control] IP watcher failed:', err.message);
    } finally {
      ipRefreshRunning = false;
    }
  }, 8 * 1000);
  if (typeof ipRefreshTimer.unref === 'function') ipRefreshTimer.unref();

  console.log('[Mobile Control] Server started.');
  if (lanAddresses.length > 0) {
    console.log('[Mobile Control] Connect from phone using:');
    lanAddresses.forEach((address) => {
      console.log(`  http://${address}:${MOBILE_CONTROL_PORT}`);
    });
  } else {
    console.log(`[Mobile Control] Connect from phone using: ${remoteControlState.url}`);
  }
  // PIN is printed here only in dev-mode because the dev console is visible.
  // In packaged builds the PIN is ALSO rendered on the wall via the bridge
  // widget — that's the channel a mosque caretaker will actually see.
  if (!app.isPackaged) {
    console.log(`[Mobile Control] PIN: ${MOBILE_CONTROL_PIN}`);
  } else {
    console.log(`[Mobile Control] PIN is displayed on the wall badge (not logged).`);
  }
  console.log(`[Mobile Control] Tap the green "GPS" button on the phone to set the mosque location via phone GPS.`);

  emitRemoteControlStatus();
}

async function stopRemoteControlServer() {
  if (remoteSessionCleanupTimer) {
    clearInterval(remoteSessionCleanupTimer);
    remoteSessionCleanupTimer = null;
  }
  if (pinFailuresSweeper) {
    clearInterval(pinFailuresSweeper);
    pinFailuresSweeper = null;
  }
  if (ipRefreshTimer) {
    clearInterval(ipRefreshTimer);
    ipRefreshTimer = null;
  }

  remoteSessionTokens.clear();

  if (remoteSocketServer) {
    await new Promise((resolve) => {
      remoteSocketServer.close(() => resolve());
    });
    remoteSocketServer = null;
  }

  if (remoteHttpServer) {
    await new Promise((resolve) => {
      remoteHttpServer.close(() => resolve());
    });
    remoteHttpServer = null;
  }

  remoteControlState.running = false;
  remoteControlState.clientCount = 0;
  emitRemoteControlStatus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Mithnah',
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: true,
    fullscreen: true,
    focusable: true,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // webSecurity stays ON. The earlier `false` was a workaround
      // for cross-origin font/image loads that the offline network
      // policy now handles via main-process redirects, so the SOP
      // exception is no longer needed and removing it shuts the door
      // on file-URL XSS exfiltration.
      webSecurity: true,
      // Block protocols Chromium would normally allow window.open to
      // route through. We only need file:// for the bundled renderer
      // and http://localhost for dev mode.
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  let startUrl;
  if (IS_DEV) {
    startUrl = RENDERER_DEV_URL;
  } else {
    startUrl = url.format({
      pathname: path.join(RENDERER_DIST_ROOT, 'index.html'),
      protocol: 'file:',
      slashes: true
    });
  }
  console.log(`[Main] Loading renderer from: ${startUrl} (IS_DEV=${IS_DEV})`);

  mainWindow.loadURL(startUrl);

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // --- CRITICAL ZOOM HANDLERS ---

  // A. Apply zoom immediately when content loads
  mainWindow.webContents.on('did-finish-load', () => {
    applyZoom(mainWindow);
    emitRemoteControlStatus();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Renderer] Failed to load:', { errorCode, errorDescription, validatedURL });
  });

  // Block all window.open / target="_blank" attempts. The wall display
  // is a single-window kiosk; nothing should ever spawn a child window.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Refuse navigation away from our own startUrl. A renderer XSS that
  // tries to navigate the main window to an external origin would
  // otherwise drop the slideshow and load attacker-controlled content
  // even after the offline network policy strips the request.
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (!navUrl) return;
    const allowed = navUrl.startsWith('file://')
      || navUrl.startsWith(RENDERER_DEV_URL)
      || navUrl.startsWith('about:blank');
    if (!allowed) {
      console.warn('[Renderer] blocked navigation to', navUrl);
      event.preventDefault();
    }
  });

  // Reload-on-renderer-crash. A blank wall display is exactly what
  // mosques call about — without this, a Chromium OOM or WebGL fault
  // leaves the screen frozen until someone reboots the PC. We retry
  // a few times then give up so a real bug doesn't put us in a tight
  // crash-reload loop.
  let _crashReloadCount = 0;
  let _crashReloadWindowStart = Date.now();
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] render-process-gone:', details);
    if (Date.now() - _crashReloadWindowStart > 10 * 60 * 1000) {
      _crashReloadCount = 0;
      _crashReloadWindowStart = Date.now();
    }
    _crashReloadCount++;
    if (_crashReloadCount > 3) {
      console.error('[Renderer] >3 crashes in 10 min — giving up to avoid a tight loop');
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.reload(); } catch (err) { console.error('[Renderer] reload failed:', err); }
    }
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU') {
      console.warn('[GPU] process gone:', details.reason, '— letting Chromium recover internally');
    }
  });

  // Kiosk lock — when `features.kioskLock` is on, the caretaker cannot
  // close the window with Alt+F4 / the X button without confirming via a
  // PIN prompt. We intercept `close` rather than using `closable: false`
  // on the BrowserWindow so the normal quit path (through before-quit +
  // our SIGINT handlers) still works when the app legitimately shuts down.
  mainWindow.on('close', (event) => {
    // Legitimate quit path (PIN-verified via app:kiosk-quit, or app shutdown
    // with lock disabled): let the close go through.
    if (kioskQuitRequested) return;
    const cfg = (() => { try { return prayerTimes.getConfig(); } catch (_) { return null; } })();
    if (!cfg?.features?.kioskLock) return;
    event.preventDefault();
    try {
      mainWindow.webContents.send('kiosk:unlock-request');
    } catch (_) {}
  });

  // B. Native Keyboard Shortcuts (RTL-native + Presenter-Remote mapping)
  //
  // Arrow keys follow ARABIC READING DIRECTION — the app is RTL, and
  // operators (sheikhs, caretakers) read right-to-left, so their mental
  // model is:
  //   ← / PageDown → NEXT slide (the eye moves LEFT when reading Arabic)
  //   → / PageUp   → PREV slide (the eye moves RIGHT to re-read)
  //
  // For physical presenter remotes (Logitech R400 / Spotlight), we also
  // accept:
  //   Space         → NEXT (universal "advance" on every remote)
  //   PageDown      → NEXT, PageUp → PREV (the remote-standard mapping)
  //   B / .         → toggle BLANK (black screen)
  //   Esc           → CLOSE slideshow
  // The PageUp/PageDown pair keeps the R400 working — operators who want
  // "right = next" can hold their remote however they like; the arrow
  // keys themselves prioritise the reader's natural direction.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.control) {
      // Ctrl +/- / 0 handling: when the slideshow is active the
      // SlideshowOverlay component owns these keys (font-size scale
      // for dua readability — elderly operator's top request).
      // Outside the slideshow they adjust renderer zoom. Without the
      // gate here main would preventDefault the event before the
      // renderer ever saw it, so Ctrl++ inside the slideshow did
      // nothing visible.
      const slideActive = slideshow.getState().active;
      // Zoom In (Ctrl +/=, Ctrl NumpadAdd/Equal)
      if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd' || input.code === 'Equal') {
        if (slideActive) return; // let renderer handle
        event.preventDefault();
        adjustZoomStep(1);
        return;
      }
      // Zoom Out (Ctrl -, NumpadSubtract, Minus)
      if (input.key === '-' || input.code === 'NumpadSubtract' || input.code === 'Minus') {
        if (slideActive) return;
        event.preventDefault();
        adjustZoomStep(-1);
        return;
      }
      // Reset Zoom (Ctrl 0)
      if (input.key === '0') {
        if (slideActive) return;
        event.preventDefault();
        const smart = getSmartZoomFactor();
        setGlobalZoom(smart, true);
        return;
      }
    }

    // Slideshow presenter shortcuts — only when a deck is active
    // AND no other modal is owning the keyboard. The renderer
    // publishes `modalActive` via remote-control:publish-state when
    // PrayerTracker / SettingsOverlay / DuaPicker / OnboardingOverlay
    // are open — those have priority for arrow + Esc handling, so we
    // bail early here and let the keydown reach the renderer.
    const slideState = slideshow.getState();
    if (!slideState.active) return;
    if (remoteRendererState && remoteRendererState.modalActive) return;

    const handle = (cmd, payload) => {
      event.preventDefault();
      try { slideshow.dispatch(cmd, payload || {}); }
      catch (err) { console.error('[slideshow] keyboard dispatch failed:', err); }
    };

    // RTL-native: in Arabic reading, LEFT is forward. Space and PageDown
    // stay on NEXT (remote-standard + universal), but the arrow keys map
    // to the reader's direction.
    if (input.key === 'ArrowLeft'  || input.key === 'PageDown' || input.code === 'Space') return handle('NEXT');
    if (input.key === 'ArrowRight' || input.key === 'PageUp')                              return handle('PREV');
    if (input.key === 'Home')                                                              return handle('FIRST');
    if (input.key === 'End')                                                               return handle('LAST');
    if (input.key === 'b' || input.key === 'B' || input.key === '.')                       return handle('BLANK');
    if (input.key === 'Escape')                                                            return handle('CLOSE');
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// --- APP LIFECYCLE ---

// Offline-first network policy + geolocation permission handler live in
// their own module. See src/main/network-policy.js for details.
const VENDOR_ROOT = path.join(PROJECT_ROOT, 'build-output', 'vendor');
const { installGeolocationPermission, installOfflineNetworkPolicy, installContentSecurityPolicy } = require('./network-policy');

app.whenReady().then(async () => {
  // Don't log the PIN in packaged builds — crash reports and shared logs
  // leak it. Dev mode still logs for operator convenience.
  if (app.isPackaged) {
    console.log(`[Mithnah] v${app.getVersion()} — Port=${MOBILE_CONTROL_PORT}, PIN set`);
  } else {
    console.log(`[Mithnah] v${app.getVersion()} — PIN=${MOBILE_CONTROL_PIN}, Port=${MOBILE_CONTROL_PORT}`);
  }
  installGeolocationPermission();
  installOfflineNetworkPolicy(VENDOR_ROOT);
  installContentSecurityPolicy(IS_DEV);
  // Register the frame guard so privileged IPC handlers in other
  // modules can reject calls from any frame other than the trusted
  // main-window renderer.
  frameGuard.register(() => mainWindow);
  await loadSettings(); // Load zoom before window creates

  try {
    const cfg = await prayerTimes.init(USER_DATA_PATH);
    // The reopen callback rehydrates slides from the live shia-content
    // registry when restoring a persisted pointer — slides aren't
    // serialized to disk; we only store deck identity + index.
    slideshow.init(path.join(USER_DATA_PATH, 'slideshow-state.json'), (kind, id) => {
      try {
        if (kind === 'dua')     return shiaContent.getDua(id);
        if (kind === 'ziyarah') return shiaContent.getZiyarah(id);
        if (kind === 'taqib')   return (shiaContent.listTaqibat().find(t => t.id === id) || null);
      } catch (_) { /* fall through */ }
      return null;
    });
    prayerTimesIpc.register(ipcMain);
    hijriIpc.register(ipcMain);
    locationIpc.register(ipcMain);
    shiaContentIpc.register(ipcMain);
    slideshowIpc.register(ipcMain);
    updaterIpc.register(ipcMain);
    bridgeIpc.register(ipcMain, () => mainWindow);
    marjaIpc.register(ipcMain);

    // Bridge slideshow state changes to the renderer + mobile-control clients.
    slideshow.subscribe((state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('slideshow:state', state);
      }
      if (remoteSocketServer) {
        remoteSocketServer.emit('slideshow:state', state);
      }
    });

    // Bridge config changes to the renderer so F3 edits apply to the
    // Dashboard instantly (no more waiting on the 5-minute polling
    // tick for mosque name, location, occasion, feature flags, etc).
    prayerTimes.subscribe((cfg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('prayer-times:config-changed', cfg);
      }
      if (remoteSocketServer) {
        remoteSocketServer.emit('config-changed', cfg);
      }
    });

    // First-run auto-detect: if this is a brand-new install and the system
    // timezone maps to a known city, set the location to that city. We
    // deliberately do NOT override the default method/fiqh — a Shia Twelver
    // app defaults to Jafari everywhere, even in Sunni-majority regions. A
    // user who actually wants the regional Sunni method can flip it via
    // prayer-times:set-config with { method: defaultMethodFor(lat, lng) }.
    if (cfg._isFirstRun) {
      const detected = locationModule.detectFromTimezone();
      if (detected.source === 'timezone') {
        await prayerTimes.setConfig({
          location: { lat: detected.lat, lng: detected.lng, name: detected.name }
        });
        console.log(`[Mithnah] first-run auto-detect: ${detected.name} via timezone ${detected.timezone} (method stays Jafari)`);
      } else {
        console.log(`[Mithnah] first-run: no timezone match for ${detected.timezone || 'unknown'}; using Najaf default`);
      }
    }

    const current = prayerTimes.getConfig();
    console.log(`[Mithnah] prayer-times ready — method=${current.method}, madhab=${current.madhab}, fiqh=${current.fiqh}, calendar=${current.calendar}, loc=${current.location.lat},${current.location.lng} (${current.location.name})`);

    // Auto-content — open today's recommended deck on the wall if the
    // feature is enabled AND nothing is already open (so we don't
    // clobber a deck the restore-on-boot flow just rehydrated).
    try {
      if (current?.features?.autoContentToday && !slideshow.getState().active) {
        const todayPrayer = prayerTimes.getTodayAndNext().today;
        const hEffective = effectiveHijriForEvents(current, todayPrayer);
        const events = shiaContent.eventsForHijriDate(hEffective.year, hEffective.month, hEffective.day);
        const pick = autoContent.pickAutoDeck(events);
        if (pick) {
          let deck = null;
          if (pick.kind === 'dua')     deck = shiaContent.getDua(pick.id);
          else if (pick.kind === 'ziyarah') deck = shiaContent.getZiyarah(pick.id);
          else if (pick.kind === 'taqib')   deck = (shiaContent.listTaqibat().find(t => t.id === pick.id) || null);
          if (deck) {
            const openable = { ...deck, kind: pick.kind };
            slideshow.dispatch('OPEN', { deck: openable });
            console.log(`[Mithnah] auto-content opened ${pick.kind}/${pick.id} for today's event`);
          }
        }
      }
    } catch (err) {
      console.warn('[Mithnah] auto-content failed:', err.message);
    }
  } catch (error) {
    console.error('[Mithnah] prayer-times init failed:', error);
  }

  try {
    await startRemoteControlServer();
  } catch (error) {
    console.error(`[Mobile Control] Failed to start server on port ${MOBILE_CONTROL_PORT}:`, error);
  }
  createWindow();

  // Auto-updater starts only when explicitly enabled and the app is packaged.
  // Default OFF so a fresh install never phones home until the operator
  // opts in. Two ways to enable:
  //   (1) MITHNAH_AUTO_UPDATE=1 env var + MITHNAH_UPDATE_FEED or a
  //       real GitHub owner in package.json build.publish.
  //   (2) Future UI toggle (stored in prayer-config as autoUpdate.enabled).
  // The updater itself verifies the feed isn't a placeholder and refuses
  // to check otherwise — see src/main/updater/index.js detectPlaceholderConfig.
  if (app.isPackaged && process.env.MITHNAH_AUTO_UPDATE === '1') {
    updater.start({ getMainWindow: () => mainWindow, enabled: true });
  } else {
    console.log('[Mithnah] auto-update: disabled (set MITHNAH_AUTO_UPDATE=1 + configure feed to enable)');
  }
}).catch((error) => {
  console.error('[Mithnah] fatal init failure — exiting:', error);
  app.exit(1);
});

// Graceful shutdown: on window-all-closed and before-quit we want the
// settings flushed and the Express/socket.io servers cleanly torn down so
// port 3100 is released before the process exits. `before-quit` gets
// `event.preventDefault()` + an async cleanup dance that re-issues quit
// once cleanup resolves.
let isQuitting = false;

async function gracefulShutdown() {
  if (isQuitting) return;
  isQuitting = true;
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = null;
  }
  try { updater.stop(); } catch (e) { console.error('[Mithnah] updater.stop failed:', e); }
  try { await persistSettings(); } catch (e) { console.error('[Mithnah] persist on quit failed:', e); }
  try { await stopRemoteControlServer(); } catch (e) { console.error('[Mithnah] stop server on quit failed:', e); }
}

app.on('window-all-closed', async () => {
  await gracefulShutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    gracefulShutdown().finally(() => app.quit());
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// --- IPC HANDLERS ---

ipcMain.handle('zoom:get', () => {
  return zoomState.factor;
});

ipcMain.handle('zoom:set', (event, factor) => {
  setGlobalZoom(factor, false);
  return zoomState.factor;
});

ipcMain.handle('zoom:smart-detect', () => {
  return getSmartZoomFactor();
});

ipcMain.handle('remote-control:get-status', () => {
  return getRemoteControlStatusPayload();
});

ipcMain.on('remote-control:publish-state', (event, state) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender.id !== mainWindow.webContents.id) return;
  setRemoteRendererState(state);
});

// --- Feature-related IPC (PIN gate, auto-launch, config I/O, Qibla) ---

// Use the shared frame-guard helper so other IPC modules can reach
// the same predicate (registered in app.whenReady once mainWindow
// exists).
const { isFromMainWindow } = frameGuard;

ipcMain.handle('app:set-settings-pin', async (event, { pin } = {}) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    if (pin === '' || pin == null) {
      // Disable gate — wipe the stored hash.
      await prayerTimes.setConfig({ settingsPinHash: null });
      appFeatures.resetPinRateLimit();
      return { ok: true, data: { cleared: true } };
    }
    const stored = appFeatures.makePinHash(String(pin));
    await prayerTimes.setConfig({ settingsPinHash: stored });
    appFeatures.resetPinRateLimit();
    return { ok: true, data: { set: true } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:verify-settings-pin', (event, { pin } = {}) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    const cfg = prayerTimes.getConfig();
    const stored = cfg.settingsPinHash;
    if (!stored) return { ok: true, data: { verified: true, required: false } };
    const verified = appFeatures.verifyPinAgainstHash(String(pin || ''), stored);
    return { ok: true, data: { verified, required: true } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:set-auto-launch', (event, { enabled } = {}) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      // Linux + unknown: not wired (desktop entry handling varies by distro).
      return { ok: false, error: 'الإقلاع التلقائي غير مدعوم على هذا النظام' };
    }
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      // On Windows, start minimised so the display springs up without
      // flashing UI chrome. openAsHidden is macOS-only (ignored on Win).
      openAsHidden: true,
      args: ['--hidden']
    });
    const settings = app.getLoginItemSettings();
    return { ok: true, data: { openAtLogin: settings.openAtLogin === true } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:export-config', async (event) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    const result = await appFeatures.exportConfigTo(dialog, mainWindow, configPathOf(USER_DATA_PATH));
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:import-config', async (event) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    const result = await appFeatures.importConfigFrom(dialog, mainWindow, async (parsed) => {
      // Route imported blob through setConfig so it passes coerce() and
      // bad/unknown keys get stripped before they touch persistent state.
      return await prayerTimes.setConfig(parsed);
    });
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:qibla', (event) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    const cfg = prayerTimes.getConfig();
    const { lat, lng } = cfg.location || {};
    const q = appFeatures.computeQibla(Number(lat), Number(lng));
    return { ok: true, data: q };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Kiosk quit — renderer calls this after the operator has verified the
// PIN inside an unlock modal. We re-verify here (defense-in-depth) and
// only then allow the app to close.
ipcMain.handle('app:kiosk-quit', (event, { pin } = {}) => {
  if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
  try {
    const cfg = prayerTimes.getConfig();
    if (cfg.settingsPinHash) {
      const ok = appFeatures.verifyPinAgainstHash(String(pin || ''), cfg.settingsPinHash);
      if (!ok) return { ok: false, error: 'رمز غير صحيح' };
    }
    // Temporarily disable kiosk lock for this quit, then call app.quit().
    // We don't persist the flag change — only set a module-scoped escape hatch.
    kioskQuitRequested = true;
    // Defer so the IPC handler returns first.
    setImmediate(() => app.quit());
    return { ok: true, data: { quitting: true } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

let kioskQuitRequested = false;

// Installed app version — surfaced to the renderer's UpdateSection so
// the caretaker can read it aloud to a support contact. Reading the
// value from `app.getVersion()` (not package.json) matches what
// electron-updater compares against — avoids the "lock file says X,
// app reports Y" discrepancy if a dev ever edits only one.
ipcMain.handle('app:get-version', () => {
  try { return { ok: true, data: app.getVersion() }; }
  catch (err) { return { ok: false, error: err.message }; }
});

// "Restart now and install" — renderer calls this after the updater
// has reached `ready` state, so the caretaker's tap on the big button
// in F3 actually relaunches into the new build instead of waiting for
// the next natural quit. Guarded against running before the download
// finished.
ipcMain.handle('app:updater-restart-install', () => {
  try {
    const mod = require('electron-updater');
    if (!mod || !mod.autoUpdater) return { ok: false, error: 'updater unavailable' };
    // First arg: `isSilent` — keep the classic installer UI so the
    // operator sees the progress dialog. Second: `isForceRunAfter` —
    // relaunch once install is done.
    kioskQuitRequested = true;
    setImmediate(() => {
      try { mod.autoUpdater.quitAndInstall(false, true); }
      catch (err) { console.error('[updater] quitAndInstall failed:', err); }
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
