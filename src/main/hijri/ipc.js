const hijri = require('./index');

// IPC channels for the renderer and mobile-control UI to query Hijri dates
// without duplicating the conversion logic.
const CHANNELS = {
  listCalendars: 'hijri:list-calendars',
  listMonths:    'hijri:list-months',
  today:         'hijri:today',
  convert:       'hijri:convert',
  fromHijri:     'hijri:from-hijri'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.listCalendars, () => hijri.listCalendars());
  ipcMain.handle(CHANNELS.listMonths,    () => hijri.HIJRI_MONTHS);

  ipcMain.handle(CHANNELS.today, (_event, { calendarId, dayOffset } = {}) => {
    try {
      return { ok: true, data: hijri.today(calendarId || 'jafari', { dayOffset }) };
    } catch (err) {
      logger.error('[hijri] today failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(CHANNELS.convert, (_event, { isoDate, calendarId, dayOffset } = {}) => {
    try {
      const when = isoDate ? new Date(isoDate) : new Date();
      return { ok: true, data: hijri.toHijri(when, calendarId || 'jafari', { dayOffset }) };
    } catch (err) {
      logger.error('[hijri] convert failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(CHANNELS.fromHijri, (_event, { year, month, day, calendarId, dayOffset } = {}) => {
    try {
      const g = hijri.fromHijri(year, month, day, calendarId || 'jafari', { dayOffset });
      return { ok: true, data: g ? g.toISOString() : null };
    } catch (err) {
      logger.error('[hijri] fromHijri failed:', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register, CHANNELS };
