const marja = require('./index');
const prayerTimes = require('../prayer-times');
const { requireMainWindow } = require('../frame-guard');

const CHANNELS = {
  list:  'marja:list',
  set:   'marja:set',
  get:   'marja:get'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.list, () => ({ ok: true, data: marja.listMarjas() }));

  ipcMain.handle(CHANNELS.get, () => {
    try {
      const cfg = prayerTimes.getConfig();
      return { ok: true, data: { marjaId: cfg.marja || null } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // PRIVILEGED — applying a marja preset can change method, calendar,
  // maghrib delay, and fiqh in one shot.
  ipcMain.handle(CHANNELS.set, requireMainWindow(async (_event, { marjaId } = {}) => {
    try {
      if (!marja.isValidMarjaId(marjaId)) {
        return { ok: false, error: `Unknown marja: ${marjaId}` };
      }
      const m = marja.getMarja(marjaId);
      const patch = { marja: marjaId };
      if (m.preset) {
        Object.assign(patch, m.preset);
      }
      const updated = await prayerTimes.setConfig(patch);
      logger.log(`[marja] set to ${marjaId} (preset applied: ${Boolean(m.preset)})`);
      return { ok: true, data: updated };
    } catch (err) {
      logger.error('[marja] set failed:', err);
      return { ok: false, error: err.message };
    }
  }));
}

module.exports = { register, CHANNELS };
