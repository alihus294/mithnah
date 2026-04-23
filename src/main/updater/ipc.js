const updater = require('./index');

const CHANNELS = {
  getState: 'updater:get-state',
  checkNow: 'updater:check-now'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.getState, () => ({ ok: true, data: updater.getState() }));
  ipcMain.handle(CHANNELS.checkNow, async () => {
    try { return await updater.checkNow(logger); }
    catch (err) { return { ok: false, error: err.message }; }
  });
}

module.exports = { register, CHANNELS };
