const shia = require('./index');

const CHANNELS = {
  listDuas:       'shia:list-duas',
  getDua:         'shia:get-dua',
  listZiyarat:    'shia:list-ziyarat',
  getZiyarah:     'shia:get-ziyarah',
  listTaqibat:    'shia:list-taqibat',
  getTasbihZahra: 'shia:get-tasbih-zahra',
  listEvents:     'shia:list-events',
  eventsForDate:  'shia:events-for-date'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.listDuas,       () => ({ ok: true, data: shia.listDuas() }));
  ipcMain.handle(CHANNELS.listZiyarat,    () => ({ ok: true, data: shia.listZiyarat() }));
  ipcMain.handle(CHANNELS.listTaqibat,    () => ({ ok: true, data: shia.listTaqibat() }));
  ipcMain.handle(CHANNELS.getTasbihZahra, () => ({ ok: true, data: shia.getTasbihZahra() }));
  ipcMain.handle(CHANNELS.listEvents,     () => ({ ok: true, data: shia.listEvents() }));

  ipcMain.handle(CHANNELS.getDua, (_event, { id } = {}) => {
    const d = shia.getDua(id);
    return d ? { ok: true, data: d } : { ok: false, error: `Unknown dua: ${id}` };
  });
  ipcMain.handle(CHANNELS.getZiyarah, (_event, { id } = {}) => {
    const z = shia.getZiyarah(id);
    return z ? { ok: true, data: z } : { ok: false, error: `Unknown ziyarah: ${id}` };
  });
  ipcMain.handle(CHANNELS.eventsForDate, (_event, { month, day } = {}) => {
    try {
      if (!Number.isInteger(month) || !Number.isInteger(day)) {
        return { ok: false, error: 'month/day must be integers' };
      }
      return { ok: true, data: shia.eventsForHijriDate(null, month, day) };
    } catch (err) {
      logger.error('[shia] eventsForDate failed:', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register, CHANNELS };
