// Renderer-facing snapshot IPC. Exposes two read-only channels that the
// wall renderer (Dashboard + HelpOverlay) calls to get a composed view of
// config + prayer times + Hijri + events. The main process is the single
// source of truth; the renderer never computes prayer times itself.

const prayerTimes = require('./prayer-times');
const hijri = require('./hijri');
const shiaContent = require('./shia-content');

const CHANNELS = {
  getSnapshot: 'mithnah-bridge:get-snapshot',
  todayEvents: 'mithnah-bridge:today-events'
};

// Compute the Hijri date that should drive EVENT LOOKUPS (not the displayed
// date — that always matches the local Gregorian day). Shia reckoning
// starts the liturgical day at sundown: after today's maghrib, tonight is
// already "the night of tomorrow", so an event falling on tomorrow's
// Hijri date should start showing tonight. When the `maghribPivot`
// feature flag is off, we fall back to plain Gregorian-midnight rollover.
function effectiveHijriForEvents(cfg, todayPrayerTimes, now = new Date()) {
  const calendar = cfg.calendar || 'jafari';
  const dayOffset = cfg.calendarDayOffset || 0;
  const hToday = hijri.toHijri(now, calendar, { dayOffset });
  const pivotOn = cfg?.features?.maghribPivot !== false;
  if (!pivotOn) return hToday;
  const maghribAt = todayPrayerTimes?.times?.maghrib;
  if (!(maghribAt instanceof Date) || Number.isNaN(maghribAt.getTime())) return hToday;
  if (now.getTime() < maghribAt.getTime()) return hToday;
  // After maghrib → shift to tomorrow's Hijri date for event lookups.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return hijri.toHijri(tomorrow, calendar, { dayOffset });
}

function register(ipcMain, _getMainWindow, logger = console) {
  ipcMain.handle(CHANNELS.getSnapshot, () => {
    try {
      const cfg = prayerTimes.getConfig();
      const today = prayerTimes.getTodayAndNext();
      const hijriToday = hijri.today(
        cfg.calendar || 'jafari',
        { dayOffset: cfg.calendarDayOffset || 0 }
      );
      // Also expose the effective (maghrib-pivoted) Hijri date so the
      // renderer can label "tonight's" event without recomputing.
      const hijriEffective = effectiveHijriForEvents(cfg, today.today);
      return {
        ok: true,
        data: {
          today: today.today,
          next:  today.next,
          hijri: hijriToday,
          hijriEffective,
          config: cfg
        }
      };
    } catch (err) {
      logger.error('[bridge] getSnapshot failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(CHANNELS.todayEvents, () => {
    try {
      const cfg = prayerTimes.getConfig();
      const today = prayerTimes.getTodayAndNext();
      const hDisplay = hijri.today(cfg.calendar || 'jafari', { dayOffset: cfg.calendarDayOffset || 0 });
      const hEffective = effectiveHijriForEvents(cfg, today.today);
      const events = shiaContent.eventsForHijriDate(hEffective.year, hEffective.month, hEffective.day);
      const upcoming = shiaContent.upcomingEvents(hEffective, { daysAhead: 40, limit: 3 });
      return {
        ok: true,
        data: {
          hijri: hDisplay,
          hijriEffective: hEffective,
          events,
          upcoming,
          gregorianToday: new Date().toISOString()
        }
      };
    } catch (err) {
      logger.error('[bridge] todayEvents failed:', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register, CHANNELS, effectiveHijriForEvents };
