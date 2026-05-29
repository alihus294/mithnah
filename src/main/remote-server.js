/**
 * Mithnah — Remote Control Server (extracted from main/index.js monolith)
 *
 * Mobile-control HTTP + WebSocket server for phone-based remote control.
 * Handles: LAN discovery, PIN auth, QR code, slideshow commands, session tokens.
 */

const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Dependencies injected at init time
let mainWindow = null;
let slideshow = null;
let prayerTimes = null;
let remoteRendererState = null;
let kioskQuitRequested = false;

// State
let remoteHttpServer = null;
let remoteSocketServer = null;
let remoteControlState = {
  running: false,
  clientCount: 0,
  url: '',
  ipAddress: '',
  port: 0,
  pin: '',
  qrCodeDataUrl: null
};
let remoteSessionTokens = new Map();
let remoteSessionCleanupTimer = null;
let pinFailuresSweeper = null;
let ipRefreshTimer = null;
let pinFailures = new Map();

// Constants (injected)
let MOBILE_CONTROL_PORT = 3456;
let MOBILE_CONTROL_PIN = '0000';
let PROJECT_ROOT = '';
let IS_DEV = false;
let RENDERER_DEV_URL = '';

// Helpers (injected)
let getLanIPv4Addresses = () => [];
let getPreferredLanIPv4Address = () => '127.0.0.1';
let getRemoteControlStaticRoot = () => '';
let emitRemoteControlStatus = () => {};
let emitRemoteControlCommand = () => {};
let getRemoteRendererStatePayload = () => ({});
let normalizeRemoteCommandPayload = () => null;
let pruneExpiredRemoteSessions = () => {};
let adjustZoomStep = () => {};
let getSmartZoomFactor = () => 1.0;
let setGlobalZoom = () => {};
let applyZoom = () => {};

// Nav commands whitelist
const NAV_COMMANDS = new Set(['NEXT', 'PREV', 'FIRST', 'LAST', 'BLANK', 'CLOSE']);

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

  // Same-origin enforcement for state-changing methods.
  // Rejects cross-origin POSTs and requests with missing Origin header.
  remoteControlApp.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin) {
      console.warn(`[Mobile Control] Blocked request with missing Origin header`);
      return res.status(403).json({ error: 'origin header required' });
    }
    if (origin === `http://${host}` || origin === `https://${host}`) {
      return next();
    }
    console.warn(`[Mobile Control] Blocked cross-origin ${req.method} from ${origin}`);
    res.status(403).json({ error: 'cross-origin request rejected' });
  });

  // Body parser for JSON commands
  remoteControlApp.use(express.json({ limit: '16kb' }));

  // Static files for mobile UI
  if (fs.existsSync(remoteControlStaticRoot)) {
    remoteControlApp.use('/mobile', express.static(remoteControlStaticRoot));
  }

  // Health check
  remoteControlApp.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: require('../package.json').version });
  });

  // State endpoint
  remoteControlApp.get('/api/state', (_req, res) => {
    res.json(getRemoteRendererStatePayload());
  });

  // PIN verification with rate limiting
  const MAX_PIN_ATTEMPTS = 5;
  const PIN_LOCKOUT_MS = 30000;

  remoteControlApp.post('/api/pin', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const failures = pinFailures.get(clientIp);
    if (failures) {
      if (failures.count >= MAX_PIN_ATTEMPTS && now - failures.lastAttempt < PIN_LOCKOUT_MS) {
        return res.status(429).json({ success: false, error: 'too many attempts, try again later' });
      }
      if (now - failures.lastAttempt >= PIN_LOCKOUT_MS) {
        pinFailures.delete(clientIp);
      }
    }

    const { pin } = req.body || {};
    if (pin === MOBILE_CONTROL_PIN) {
      pinFailures.delete(clientIp);
      const token = crypto.randomBytes(32).toString('hex');
      remoteSessionTokens.set(token, { createdAt: Date.now(), lastUsed: Date.now() });
      res.json({ success: true, token });
    } else {
      const current = pinFailures.get(clientIp) || { count: 0, lastAttempt: 0 };
      current.count++;
      current.lastAttempt = now;
      pinFailures.set(clientIp, current);
      res.status(401).json({ success: false, error: 'invalid pin' });
    }
  });

  // Command endpoint (with token auth)
  remoteControlApp.post('/api/command', (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!remoteSessionTokens.has(token)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const session = remoteSessionTokens.get(token);
    session.lastUsed = Date.now();

    const normalized = normalizeRemoteCommandPayload(req.body);
    if (!normalized) {
      return res.status(400).json({ error: 'invalid command' });
    }
    emitRemoteControlCommand({
      ...normalized,
      source: 'http-api',
      receivedAt: Date.now()
    });
    res.json({ success: true });
  });

  // Slideshow commands
  remoteControlApp.post('/api/slideshow/:cmd', (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!remoteSessionTokens.has(token)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const cmd = req.params.cmd.toUpperCase();
    if (!NAV_COMMANDS.has(cmd)) {
      return res.status(400).json({ error: 'unknown command' });
    }
    try {
      slideshow.dispatch(cmd, req.body || {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = http.createServer(remoteControlApp);
  const io = new SocketIOServer(server, {
    cors: { origin: '*' }, // LAN-only, no sensitive data
    pingTimeout: 10000,
    pingInterval: 5000
  });

  io.on('connection', (socket) => {
    remoteControlState.clientCount = io.engine.clientsCount;
    emitRemoteControlStatus();
    socket.emit('state', getRemoteRendererStatePayload());
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

    socket.on('slideshow-command', (payload) => {
      try {
        const cmd = typeof payload?.command === 'string' ? payload.command.toUpperCase() : '';
        if (!NAV_COMMANDS.has(cmd)) return;
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

  // Port fallback
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
  remoteControlState.url = `http://${preferredAddress}:${boundPort}`;

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

  // IP-change watcher
  if (ipRefreshTimer) clearInterval(ipRefreshTimer);
  let ipRefreshRunning = false;
  ipRefreshTimer = setInterval(async () => {
    if (ipRefreshRunning) return;
    if (!remoteHttpServer) return;
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
  if (!IS_DEV) {
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

// --- Module API ---

function initRemoteServer(deps) {
  mainWindow = deps.mainWindow;
  slideshow = deps.slideshow;
  prayerTimes = deps.prayerTimes;
  remoteRendererState = deps.remoteRendererState;
  kioskQuitRequested = deps.kioskQuitRequested;
  MOBILE_CONTROL_PORT = deps.MOBILE_CONTROL_PORT;
  MOBILE_CONTROL_PIN = deps.MOBILE_CONTROL_PIN;
  PROJECT_ROOT = deps.PROJECT_ROOT;
  IS_DEV = deps.IS_DEV;
  RENDERER_DEV_URL = deps.RENDERER_DEV_URL;
  getLanIPv4Addresses = deps.getLanIPv4Addresses;
  getPreferredLanIPv4Address = deps.getPreferredLanIPv4Address;
  getRemoteControlStaticRoot = deps.getRemoteControlStaticRoot;
  emitRemoteControlStatus = deps.emitRemoteControlStatus;
  emitRemoteControlCommand = deps.emitRemoteControlCommand;
  getRemoteRendererStatePayload = deps.getRemoteRendererStatePayload;
  normalizeRemoteCommandPayload = deps.normalizeRemoteCommandPayload;
  pruneExpiredRemoteSessions = deps.pruneExpiredRemoteSessions;
  adjustZoomStep = deps.adjustZoomStep;
  getSmartZoomFactor = deps.getSmartZoomFactor;
  setGlobalZoom = deps.setGlobalZoom;
  applyZoom = deps.applyZoom;
}

module.exports = {
  initRemoteServer,
  startRemoteControlServer,
  stopRemoteControlServer,
  getState: () => ({ ...remoteControlState }),
  getServer: () => remoteHttpServer,
  getSocketServer: () => remoteSocketServer,
  getSessionTokens: () => remoteSessionTokens
};
