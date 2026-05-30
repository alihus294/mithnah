/**
 * Mithnah — App Lifecycle (extracted from main/index.js monolith)
 *
 * Handles: app.whenReady(), graceful shutdown, second-instance,
 * activate, window-all-closed, before-quit.
 */

const { app } = require('electron');

// IPC modules
const prayerTimesIpc = require('./prayer-times/ipc');
const hijriIpc = require('./hijri/ipc');
const locationIpc = require('./location/ipc');
const shiaContentIpc = require('./shia-content/ipc');
const slideshowIpc = require('./slideshow/ipc');
const updaterIpc = require('./updater/ipc');
const bridgeIpc = require('./bridge/ipc');
const marjaIpc = require('./marja/ipc');

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
      // Wait for prayer-times init before anything else
      if (deps.prayerTimesReady) {
        const ptResult = await deps.prayerTimesReady;
        if (!ptResult.ok) {
          console.error('[Mithnah] prayer-times init failed — continuing with defaults:', ptResult.error);
        }
      }
      await deps.loadSettings();

      // Register IPC handlers BEFORE creating the window so the renderer
      // can call them immediately after loadURL without a race.
      try {
        const { ipcMain } = require('electron');
        prayerTimesIpc.register(ipcMain);
        hijriIpc.register(ipcMain);
        locationIpc.register(ipcMain);
        shiaContentIpc.register(ipcMain);
        slideshowIpc.register(ipcMain);
        updaterIpc.register(ipcMain);
        bridgeIpc.register(ipcMain, () => deps.getMainWindow());
        marjaIpc.register(ipcMain);
        // Register frame guard with main window getter
        const frameGuard = require('./frame-guard');
        frameGuard.register(() => deps.getMainWindow());
      } catch (err) {
        console.error('[Mithnah] IPC registration failed — aborting startup:', err);
        app.exit(1);
        return;
      }

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

      deps.emitRemoteControlStatus();

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
