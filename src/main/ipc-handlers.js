/**
 * Mithnah — IPC Handlers (extracted from main/index.js monolith)
 *
 * All ipcMain.handle/on registrations in one place.
 * Frame-guarded where state-changing.
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fsp = require('fs/promises');
const { resolveBrowserWindow, isLiveBrowserWindow } = require('./frame-guard');

// Dependencies injected at init time
let mainWindow = null;
let isFromMainWindow = null;
let zoomState = null;
let setGlobalZoom = null;
let getSmartZoomFactor = null;
let getRemoteControlStatusPayload = null;
let remoteSocketServer = null;
let setRemoteRendererState = null;
let networkCapabilities = null;
let prayerTimes = null;
let appFeatures = null;
let configPathOf = null;
let USER_DATA_PATH = null;
let updater = null;

function initIpcHandlers(deps) {
  mainWindow = deps.mainWindow;
  isFromMainWindow = deps.isFromMainWindow;
  zoomState = deps.zoomState;
  setGlobalZoom = deps.setGlobalZoom;
  getSmartZoomFactor = deps.getSmartZoomFactor;
  getRemoteControlStatusPayload = deps.getRemoteControlStatusPayload;
  remoteSocketServer = deps.remoteSocketServer;
  setRemoteRendererState = deps.setRemoteRendererState;
  networkCapabilities = deps.networkCapabilities;
  prayerTimes = deps.prayerTimes;
  appFeatures = deps.appFeatures;
  configPathOf = deps.configPathOf;
  USER_DATA_PATH = deps.USER_DATA_PATH;
  updater = deps.updater;

  // ── Zoom ───────────────────────────────────────────────────────────────

  ipcMain.handle('zoom:get', () => zoomState.factor);

  ipcMain.handle('zoom:set', (event, factor) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    setGlobalZoom(factor, false);
    return zoomState.factor;
  });

  ipcMain.handle('zoom:smart-detect', () => getSmartZoomFactor());

  // ── Remote Control ─────────────────────────────────────────────────────

  ipcMain.handle('remote-control:get-status', () => getRemoteControlStatusPayload());

  ipcMain.handle('remote-control:get-network-capabilities', async (_event, payload = {}) => {
    try {
      const force = !!(payload && payload.force);
      const caps = await networkCapabilities.getNetworkCapabilities({ force });
      return { ok: true, data: caps };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('remote-control:open-hotspot-settings', async (event) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      return await networkCapabilities.openHotspotSettings();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.on('remote-control:publish-state', (event, state) => {
    const win = resolveBrowserWindow(mainWindow);
    if (!isLiveBrowserWindow(win)) return;
    if (event.sender.id !== win.webContents.id) return;
    setRemoteRendererState(state);
  });

  // ── App Features ───────────────────────────────────────────────────────

  ipcMain.handle('app:set-settings-pin', async (event, { pin } = {}) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      if (pin === '' || pin == null) {
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
        return { ok: false, error: 'الإقلاع التلقائي غير مدعوم على هذا النظام' };
      }
      const { app } = require('electron');
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
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
      const result = await appFeatures.exportConfigTo(dialog, resolveBrowserWindow(mainWindow), configPathOf(USER_DATA_PATH));
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:import-config', async (event) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      const result = await appFeatures.importConfigFrom(dialog, resolveBrowserWindow(mainWindow), async (parsed) => {
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

  // ── Kiosk Quit ─────────────────────────────────────────────────────────

  let kioskQuitRequested = false;

  ipcMain.handle('app:kiosk-quit', (event, { pin } = {}) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      const cfg = prayerTimes.getConfig();
      if (cfg.settingsPinHash) {
        const ok = appFeatures.verifyPinAgainstHash(String(pin || ''), cfg.settingsPinHash);
        if (!ok) return { ok: false, error: 'رمز غير صحيح' };
      }
      kioskQuitRequested = true;
      const { app } = require('electron');
      setImmediate(() => app.quit());
      return { ok: true, data: { quitting: true } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── Version ────────────────────────────────────────────────────────────

  ipcMain.handle('app:get-version', () => {
    try {
      const { app } = require('electron');
      return { ok: true, data: app.getVersion() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── Updater Restart ────────────────────────────────────────────────────

  ipcMain.handle('app:updater-restart-install', () => {
    try {
      const mod = require('electron-updater');
      if (!mod || !mod.autoUpdater) return { ok: false, error: 'updater unavailable' };
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

  // ── Logo Upload / Remove / Get ─────────────────────────────────────────

  const LOGO_PATH = path.join(USER_DATA_PATH, 'mosque-logo.png');
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;

  ipcMain.handle('app:upload-logo', async (event) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(resolveBrowserWindow(mainWindow) || null, {
        title: 'اختر شعار المسجد — PNG بخلفية شفافة',
        properties: ['openFile'],
        filters: [{ name: 'PNG', extensions: ['png'] }]
      });
      if (canceled || !filePaths?.length) return { ok: true, data: { cancelled: true } };
      const src = filePaths[0];
      const stat = await fsp.stat(src);
      if (!stat.isFile()) return { ok: false, error: 'ليس ملفّاً صالحاً' };
      if (stat.size > LOGO_MAX_BYTES) {
        return { ok: false, error: 'حجم الصورة يتجاوز ٢ ميجا — اختر صورة أصغر' };
      }
      const head = Buffer.alloc(8);
      const fd = await fsp.open(src, 'r');
      try { await fd.read(head, 0, 8, 0); } finally { await fd.close(); }
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (!head.equals(pngMagic)) {
        return { ok: false, error: 'الملف ليس PNG صالحاً' };
      }
      await fsp.copyFile(src, LOGO_PATH);
      const win = resolveBrowserWindow(mainWindow);
      if (isLiveBrowserWindow(win)) {
        try { win.webContents.send('app:logo-changed'); } catch (_) {}
      }
      return { ok: true, data: { path: LOGO_PATH, sizeBytes: stat.size } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:remove-logo', async (event) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      await fsp.rm(LOGO_PATH, { force: true });
      const win = resolveBrowserWindow(mainWindow);
      if (isLiveBrowserWindow(win)) {
        try { win.webContents.send('app:logo-changed'); } catch (_) {}
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:get-logo', async (event) => {
    if (!isFromMainWindow(event)) return { ok: false, error: 'forbidden' };
    try {
      const buf = await fsp.readFile(LOGO_PATH);
      return { ok: true, data: 'data:image/png;base64,' + buf.toString('base64') };
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: true, data: null };
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { initIpcHandlers };
