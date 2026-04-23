const prayerTimes = require('./index');
const { requireMainWindow } = require('../frame-guard');

// IPC channel prefix. The renderer and mobile-control UI both read
// authoritative prayer times from the main process through these channels.
// Config + cache logic lives here; callers just consume the result.
const CHANNELS = {
  listMethods:     'prayer-times:list-methods',
  listMadhabs:     'prayer-times:list-madhabs',
  getConfig:       'prayer-times:get-config',
  setConfig:       'prayer-times:set-config',
  getTodayAndNext: 'prayer-times:get-today-and-next',
  getForDate:      'prayer-times:get-for-date',
  undoLast:        'prayer-times:undo-last',
  listUndoStack:   'prayer-times:list-undo-stack'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.listMethods, () => prayerTimes.listMethods());
  ipcMain.handle(CHANNELS.listMadhabs, () => prayerTimes.MADHABS);
  ipcMain.handle(CHANNELS.getConfig, () => prayerTimes.getConfig());

  // setConfig is a PRIVILEGED write — only the trusted main-window
  // renderer should be able to mutate prayer-time configuration. The
  // frame guard rejects any other caller (future iframe, webview, or
  // a compromised subresource) so a renderer XSS can't quietly shift
  // the mosque's fajr time.
  ipcMain.handle(CHANNELS.setConfig, requireMainWindow(async (_event, partial) => {
    try {
      const updated = await prayerTimes.setConfig(partial || {});
      logger.log('[prayer-times] config updated:', {
        method: updated.method,
        madhab: updated.madhab,
        location: updated.location
      });
      return { ok: true, config: updated };
    } catch (err) {
      logger.error('[prayer-times] setConfig failed:', err);
      return { ok: false, error: err.message, code: err.code || 'UNKNOWN' };
    }
  }));

  ipcMain.handle(CHANNELS.getTodayAndNext, (_event, isoNow) => {
    try {
      const when = isoNow ? new Date(isoNow) : new Date();
      return { ok: true, data: prayerTimes.getTodayAndNext(when) };
    } catch (err) {
      logger.error('[prayer-times] getTodayAndNext failed:', err);
      return { ok: false, error: err.message, code: err.code || 'UNKNOWN' };
    }
  });

  ipcMain.handle(CHANNELS.getForDate, (_event, isoDate) => {
    try {
      const when = isoDate ? new Date(isoDate) : new Date();
      return { ok: true, data: prayerTimes.getForDate(when) };
    } catch (err) {
      logger.error('[prayer-times] getForDate failed:', err);
      return { ok: false, error: err.message, code: err.code || 'UNKNOWN' };
    }
  });

  // Undo last config change. PRIVILEGED — restoring an older config
  // can change prayer times / location. Same frame guard as setConfig.
  ipcMain.handle(CHANNELS.undoLast, requireMainWindow(async () => {
    try {
      const restored = await prayerTimes.undoLast();
      if (!restored) return { ok: false, error: 'لا يوجد تغيير سابق للتراجع عنه' };
      logger.log('[prayer-times] undoLast restored config');
      return { ok: true, config: restored };
    } catch (err) {
      logger.error('[prayer-times] undoLast failed:', err);
      return { ok: false, error: err.message };
    }
  }));

  // Read-only — list the in-memory undo stack so the UI can offer a
  // "آخر التغييرات" panel.
  ipcMain.handle(CHANNELS.listUndoStack, () => {
    try { return { ok: true, data: prayerTimes.listUndoStack() }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
}

module.exports = { register, CHANNELS };
