/**
 * Mithnah — Zoom State & Remote Control
 *
 * Window zoom management, LAN discovery, remote session tokens, and
 * mobile-control server state.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { BrowserWindow, screen } = require('electron');
const {
  ZOOM_LEVELS,
  MOBILE_CONTROL_PORT,
  MOBILE_CONTROL_PIN,
  REMOTE_SESSION_TTL_MS,
} = require('../config/constants');

// ── Zoom State ──────────────────────────────────────────────────────────────
let zoomState = { factor: 1.0, auto: true };

const remoteControlState = {
  running: false,
  ipAddress: '127.0.0.1',
  port: MOBILE_CONTROL_PORT,
  url: `http://127.0.0.1:${MOBILE_CONTROL_PORT}`,
  qrCodeDataUrl: null,
  pin: MOBILE_CONTROL_PIN,
  clientCount: 0,
};

let remoteRendererState = { updatedAt: 0 };

// Session token store: token → expiresAt (timestamp)
const remoteSessionTokens = new Map();

// Max simultaneous valid sessions — anything beyond this is almost
// certainly adversarial or a leak, so we evict the oldest to keep memory
// bounded. A real mosque has <10 connected phones at a time.
const MAX_ACTIVE_SESSIONS = 500;

// These are injected from index.js after the module loads
let mainWindowRef = null;
let remoteSocketServerRef = null;
let remoteHttpServerRef = null;
let IS_DEV = false;
let PUBLIC_ROOT = '';
let RENDERER_DIST_ROOT = '';
let BUILD_OUTPUT_ROOT = '';
let REMOTE_COMMAND_SET = new Set();
let saveSettingsFn = () => {};

function setZoomDependencies(deps) {
  if (deps.mainWindow !== undefined) mainWindowRef = deps.mainWindow;
  if (deps.remoteSocketServer !== undefined) remoteSocketServerRef = deps.remoteSocketServer;
  if (deps.remoteHttpServer !== undefined) remoteHttpServerRef = deps.remoteHttpServer;
  if (deps.IS_DEV !== undefined) IS_DEV = deps.IS_DEV;
  if (deps.PUBLIC_ROOT !== undefined) PUBLIC_ROOT = deps.PUBLIC_ROOT;
  if (deps.RENDERER_DIST_ROOT !== undefined) RENDERER_DIST_ROOT = deps.RENDERER_DIST_ROOT;
  if (deps.BUILD_OUTPUT_ROOT !== undefined) BUILD_OUTPUT_ROOT = deps.BUILD_OUTPUT_ROOT;
  if (deps.REMOTE_COMMAND_SET !== undefined) REMOTE_COMMAND_SET = deps.REMOTE_COMMAND_SET;
  if (deps.saveSettingsFn !== undefined) saveSettingsFn = deps.saveSettingsFn;
}

// ── Smart Screen Detection ──────────────────────────────────────────────────
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

// ── Apply Zoom to A Window ──────────────────────────────────────────────────
function applyZoom(win) {
  if (win && !win.isDestroyed()) {
    win.webContents.setZoomFactor(zoomState.factor);
  }
}

// ── Global Zoom Setter ──────────────────────────────────────────────────────
function setGlobalZoom(factor, isAuto = false) {
  zoomState.factor = factor;
  zoomState.auto = isAuto;

  saveSettingsFn();

  // Apply to ALL windows (Main + Children)
  BrowserWindow.getAllWindows().forEach(applyZoom);

  if (remoteSocketServerRef) {
    remoteRendererState = {
      ...remoteRendererState,
      zoom: { factor: zoomState.factor, auto: zoomState.auto },
      updatedAt: Date.now(),
    };
    remoteSocketServerRef.emit('state', remoteRendererState);
  }
}

// ── Calculate Next/Prev Zoom Step ───────────────────────────────────────────
// The current factor may sit exactly on a step (common after Ctrl+0) —
// in that case we want to move FORWARD from it on a "+" press, not stay
// put. So for direction > 0 we find the first step strictly greater than
// `factor`; for direction < 0 we find the last step strictly less than it.
function adjustZoomStep(direction) {
  const current = zoomState.factor;
  let newIndex;
  if (direction > 0) {
    newIndex = ZOOM_LEVELS.findIndex((z) => z > current);
    if (newIndex === -1) newIndex = ZOOM_LEVELS.length - 1;
  } else {
    newIndex = -1;
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
      if (ZOOM_LEVELS[i] < current) { newIndex = i; break; }
    }
    if (newIndex === -1) newIndex = 0;
  }
  setGlobalZoom(ZOOM_LEVELS[newIndex], false);
}

// ── LAN Discovery ───────────────────────────────────────────────────────────
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
    const match = value.match(/^\.(\d+)\./);
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

// ── Remote Control Static Root ──────────────────────────────────────────────
function getRemoteControlStaticRoot() {
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

// ── Remote Session Tokens ───────────────────────────────────────────────────
function pruneExpiredRemoteSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of remoteSessionTokens.entries()) {
    if (expiresAt <= now) {
      remoteSessionTokens.delete(token);
    }
  }
}

function createRemoteSessionToken() {
  pruneExpiredRemoteSessions();
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

// ── Remote Control Payloads ─────────────────────────────────────────────────
function getRemoteControlStatusPayload() {
  return {
    running: remoteControlState.running,
    ipAddress: remoteControlState.ipAddress,
    port: remoteControlState.port,
    url: remoteControlState.url,
    qrCodeDataUrl: remoteControlState.qrCodeDataUrl,
    pin: null,  // Never expose PIN in IPC payload; renderer shows QR only
    clientCount: remoteControlState.clientCount,
  };
}

function emitRemoteControlStatus() {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('remote-control:status', getRemoteControlStatusPayload());
}

function emitRemoteControlCommand(commandPayload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('remote-control:command', commandPayload);
}

function getRemoteRendererStatePayload() {
  return {
    ...remoteRendererState,
    zoom: { factor: zoomState.factor, auto: zoomState.auto },
  };
}

function setRemoteRendererState(nextState) {
  if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) return;
  remoteRendererState = {
    ...remoteRendererState,
    ...nextState,
    zoom: { factor: zoomState.factor, auto: zoomState.auto },
    updatedAt: Date.now(),
  };
  if (remoteSocketServerRef) {
    remoteSocketServerRef.emit('state', remoteRendererState);
  }
}

// ── Request Helpers ─────────────────────────────────────────────────────────
function extractRemoteSessionTokenFromRequest(req) {
  // Header-only. We intentionally DROP query-string and body tokens —
  // tokens in query strings end up in server logs, browser history, and
  // Referer headers; that's a leak vector for a LAN Bearer token.
  const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function normalizeRemoteCommandPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const command = typeof rawPayload.command === 'string' ? rawPayload.command.trim().toUpperCase() : '';
  if (!REMOTE_COMMAND_SET.has(command)) return null;
  const basePayload =
    rawPayload.payload && typeof rawPayload.payload === 'object' && !Array.isArray(rawPayload.payload)
      ? { ...rawPayload.payload }
      : {};
  return { command, payload: basePayload };
}

// ── Module Exports ──────────────────────────────────────────────────────────
module.exports = {
  // State
  zoomState,
  remoteControlState,
  remoteRendererState,
  remoteSessionTokens,
  MAX_ACTIVE_SESSIONS,

  // Dependency injection
  setZoomDependencies,

  // Zoom
  getSmartZoomFactor,
  applyZoom,
  setGlobalZoom,
  adjustZoomStep,

  // Network
  getLanIPv4Addresses,
  getPreferredLanIPv4Address,
  getRemoteControlStaticRoot,

  // Sessions
  pruneExpiredRemoteSessions,
  createRemoteSessionToken,
  isValidRemoteSessionToken,

  // Payloads / Emitters
  getRemoteControlStatusPayload,
  emitRemoteControlStatus,
  emitRemoteControlCommand,
  getRemoteRendererStatePayload,
  setRemoteRendererState,

  // Request helpers
  extractRemoteSessionTokenFromRequest,
  normalizeRemoteCommandPayload,
};
