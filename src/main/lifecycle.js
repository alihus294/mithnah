/**
 * Mithnah — App Lifecycle (extracted from main/index.js monolith)
 *
 * Handles: app.whenReady(), graceful shutdown, second-instance,
 * activate, window-all-closed, before-quit.
 */

const { app } = require('electron');

// ── State ──────────────────────────────────────────────────────────────────

let isQuitting = false;
let deps = null;

// ── Init ───────────────────────────────────────────────────────────────────

function initLifecycle(lifecycleDeps) {
  deps = lifecycleDeps;

  // Prevent a second instance from clobbering port 3100 and window.
  if (!app.requestSingleInstanceLock()) {
    console.log('[Mithnah] another instance is already running — exiting.');
    app.quit();
    process.exit(0);
  }

  app.on('second-instance', () => {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Keep mosque text crisp on large displays and let Chromium favor GPU-backed rasterization.
  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  app.whenReady().then(async () => {
    try {
      await deps.loadSettings();
      const win = await deps.createWindow();

      // Start remote control server
      try {
        await deps.remoteServer.startRemoteControlServer();
      } catch (err) {
        console.error('[Mithnah] remote server failed to start:', err);
      }

      // Start updater (gated by env)
      if (process.env.MITHNAH_AUTO_UPDATE === '1') {
        try { deps.updater.start(); } catch (_) {}
      }

      // Start auto-content scheduler
      try { deps.autoContent.start(); } catch (_) {}

      // Emit initial remote control status
      deps.emitRemoteControlStatus();

      // Set up IP refresh timer
      const timer = setInterval(() => {
        const addresses = deps.getLanIPv4Addresses();
        const preferred = deps.getPreferredLanIPv4Address();
        if (preferred !== deps.remoteControlState.ipAddress) {
          deps.remoteControlState.ipAddress = preferred;
          deps.remoteControlState.url = `http://${preferred}:${deps.MOBILE_CONTROL_PORT}`;
          deps.QRCode.toDataURL(deps.remoteControlState.url, { width: 256, margin: 2 }).then((qr) => {
            deps.remoteControlState.qrCodeDataUrl = qr;
            deps.emitRemoteControlStatus();
          }).catch(() => {});
        }
      }, 30000);
      deps.setIpRefreshTimer(timer);

      // Session cleanup timer
      const cleanupTimer = setInterval(() => {
        try {
          deps.pruneExpiredRemoteSessions();
        } catch (_) {}
      }, 600000);
      deps.setRemoteSessionCleanupTimer(cleanupTimer);

    } catch (error) {
      console.error('[Mithnah] fatal init failure — exiting:', error);
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => {
    if (isQuitting) return;
    isQuitting = true;
    app.quit();
  });

  app.on('before-quit', async (event) => {
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;
      await gracefulShutdown();
      app.quit();
    }
  });

  app.on('activate', () => {
    const win = deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      deps.createWindow().catch(() => {});
    }
  });
}

async function gracefulShutdown() {
  if (!deps) return;

  const timers = [
    deps.ipRefreshTimer(),
    deps.remoteSessionCleanupTimer(),
    deps.pinFailuresSweeper()
  ];

  for (const timer of timers) {
    if (timer) clearInterval(timer);
  }

  deps.setIpRefreshTimer(null);
  deps.setRemoteSessionCleanupTimer(null);
  deps.setPinFailuresSweeper(null);

  try {
    await deps.remoteServer.stopRemoteControlServer();
  } catch (err) {
    console.error('[Mithnah] stop server on quit failed:', err);
  }

  try { deps.autoContent.stop(); } catch (_) {}
}

function getIsQuitting() {
  return isQuitting;
}

function setIsQuitting(val) {
  isQuitting = val;
}

module.exports = {
  initLifecycle,
  getIsQuitting,
  setIsQuitting
};
