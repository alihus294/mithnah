// Day-keyed cache so the main process doesn't recalculate on every tick.
// In-memory only; disk persistence isn't useful because the calculation is
// ~instant and the cached result invalidates at midnight anyway.

const { calculateForDate } = require('./calculator');
const { detectRegion } = require('./defaults');

// When config.method === 'Auto' we resolve it per-calculation via
// detectRegion(lat, lng). Outside recognized regions we fall back to Jafari
// (Leva, Qom) — the Shia Twelver global default.
function resolveMethod(method, lat, lng) {
  if (method !== 'Auto') return method;
  const region = detectRegion(lat, lng);
  return (region && region.method) ? region.method : 'Jafari';
}

function dayKey(config, date) {
  // Use UTC parts to match adhan-js (which treats the input Date's UTC
  // calendar day as the compute day). Otherwise DST transitions can cause
  // the cache key and adhan's notion of "today" to disagree for the first
  // or last hour of local time.
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const adj = config.adjustmentsMinutes || {};
  // For 'Auto' we key by the resolved method so a GPS move that changes the
  // region invalidates the cache entry.
  const resolved = resolveMethod(config.method, config.location.lat, config.location.lng);
  return [
    y, m, day,
    config.location.lat.toFixed(4),
    config.location.lng.toFixed(4),
    resolved,
    config.madhab,
    config.maghribDelayMinutes || 0,
    adj.fajr || 0, adj.sunrise || 0, adj.dhuhr || 0, adj.asr || 0, adj.maghrib || 0, adj.isha || 0
  ].join('|');
}

function makeCache(maxEntries = 60) {
  const map = new Map();

  function get(config, date) {
    const key = dayKey(config, date);
    if (map.has(key)) {
      // LRU: move to end.
      const v = map.get(key);
      map.delete(key);
      map.set(key, v);
      return v;
    }
    const resolved = resolveMethod(config.method, config.location.lat, config.location.lng);
    const result = calculateForDate({
      lat: config.location.lat,
      lng: config.location.lng,
      date,
      method: resolved,
      madhab: config.madhab,
      adjustmentsMinutes: config.adjustmentsMinutes,
      maghribDelayMinutes: config.maghribDelayMinutes || 0
    });
    map.set(key, result);
    if (map.size > maxEntries) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
    return result;
  }

  function clear() {
    map.clear();
  }

  function size() {
    return map.size;
  }

  return { get, clear, size };
}

module.exports = { makeCache, dayKey };
