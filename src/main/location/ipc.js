const location = require('./index');
const prayerTimes = require('../prayer-times');
const { defaultMethodFor, defaultFiqhFor } = require('../prayer-times/defaults');
const { requireMainWindow } = require('../frame-guard');

// IPC channels for location detection and manual override. The renderer
// (or mobile-control web UI) can:
//   - ask for the current system timezone guess
//   - push precise coordinates from HTML5 geolocation
//   - reset to the timezone default
const CHANNELS = {
  detect:       'location:detect',
  setManual:    'location:set',
  getTimezone:  'location:get-timezone',
  nearestCity:  'location:nearest-city',
  reverseOnline:'location:reverse-online',
  nearbyPlaces: 'location:nearby-places',
  search:       'location:search'
};

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.detect, () => {
    try {
      return { ok: true, data: location.detectFromTimezone() };
    } catch (err) {
      logger.error('[location] detect failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(CHANNELS.getTimezone, () => {
    return { ok: true, data: location.getSystemTimezone() };
  });

  ipcMain.handle(CHANNELS.nearestCity, (_event, { lat, lng } = {}) => {
    try {
      const result = location.nearestCity(Number(lat), Number(lng));
      return result ? { ok: true, data: result } : { ok: false, error: 'No match' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Free-text place search (Country / Region / City / Village / Neighbourhood).
  // Text-based fallback when GPS is unreliable or unavailable — the operator
  // types "القطيف" or "هجرة الشراع" and gets a list of matches with full
  // address components. Same online-only, offline-default-preserved contract
  // as the other Nominatim/Overpass handlers.
  ipcMain.handle(CHANNELS.search, async (_event, { q, limit } = {}) => {
    try {
      const results = await location.searchPlacesNominatim(String(q || ''), { limit: Number(limit) || 10 });
      return { ok: true, data: results };
    } catch (err) {
      logger.error('[location] search failed:', err);
      return { ok: false, error: err.message };
    }
  });

  // List of nearby populated places (villages/hamlets/neighbourhoods) within
  // a radius via Overpass. Only called when the operator explicitly asks
  // in Settings; offline-first default preserved.
  ipcMain.handle(CHANNELS.nearbyPlaces, async (_event, { lat, lng, radiusKm } = {}) => {
    try {
      // Fall through to the module's own default (currently 25 km)
      // when the renderer doesn't pass an explicit radius. Previously
      // hardcoded 10 km here overrode any bump upstream.
      const passthrough = Number(radiusKm);
      const places = await location.nearbyPlacesOverpass(Number(lat), Number(lng),
        Number.isFinite(passthrough) && passthrough > 0 ? { radiusKm: passthrough } : {});
      return { ok: true, data: places };
    } catch (err) {
      logger.error('[location] nearby-places failed:', err);
      return { ok: false, error: err.message };
    }
  });

  // Online village-level reverse geocoding via OpenStreetMap Nominatim.
  // Only invoked when the operator explicitly toggles "high-accuracy
  // naming" in Settings — NOT called automatically, so the offline-first
  // default is preserved. Falls back to nearestCity() on any failure so
  // the UI always gets a name.
  ipcMain.handle(CHANNELS.reverseOnline, async (_event, { lat, lng } = {}) => {
    try {
      const nom = await location.reverseGeocodeNominatim(Number(lat), Number(lng));
      if (nom && nom.name) return { ok: true, data: nom };
      const near = location.nearestCity(Number(lat), Number(lng));
      if (near) return { ok: true, data: { name: near.nameAr || near.name, components: {}, source: 'offline-fallback', nearest: near } };
      return { ok: false, error: 'no result' };
    } catch (err) {
      logger.error('[location] reverse-online failed:', err);
      return { ok: false, error: err.message };
    }
  });

  // PRIVILEGED — silently changing the mosque's lat/lng would shift
  // every prayer time the wall displays. Frame guard ensures only the
  // trusted main-window renderer can call this; the mobile-control
  // HTTP plane has its own PIN-gated /api/location route which is
  // separately audited.
  ipcMain.handle(CHANNELS.setManual, requireMainWindow(async (_event, payload = {}) => {
    try {
      const { lat, lng } = location.validateCoordinates(payload.lat, payload.lng);
      const name = typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : 'Custom';
      // By default only the coordinates change — the method and fiqh stay
      // whatever the user picked (Jafari by default). If the caller passes
      // `alignMethodToRegion: true`, we additionally switch to the regional
      // method (e.g. JafariWide in Gulf, Tehran in Iran).
      const patch = { location: { lat, lng, name } };
      if (payload.alignMethodToRegion === true) {
        patch.method = defaultMethodFor(lat, lng);
        patch.fiqh   = defaultFiqhFor(lat, lng);
      }
      const updated = await prayerTimes.setConfig(patch);
      logger.log(`[location] set to ${name} (${lat}, ${lng})${patch.method ? ` — aligned to method=${patch.method}, fiqh=${patch.fiqh}` : ''}`);
      return { ok: true, data: updated };
    } catch (err) {
      logger.error('[location] setManual failed:', err);
      return { ok: false, error: err.message };
    }
  }));
}

module.exports = { register, CHANNELS };
