const adhan = require('adhan');
const { getMethod, isValidMethodId } = require('./methods');

const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

class PrayerCalculationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PrayerCalculationError';
    this.code = code;
  }
}

// Methods that tolerate polar / near-polar latitudes because they include
// seasonal adjustment rules. Other methods will silently return NaN times
// near the poles so we reject those inputs up front.
const POLAR_SAFE_METHODS = new Set(['MoonsightingCommittee']);

function assertValidLocation(lat, lng, method) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new PrayerCalculationError('lat and lng must be finite numbers', 'BAD_LOCATION');
  }
  if (lat < -90 || lat > 90) {
    throw new PrayerCalculationError(`lat out of range: ${lat}`, 'BAD_LOCATION');
  }
  if (lng < -180 || lng > 180) {
    throw new PrayerCalculationError(`lng out of range: ${lng}`, 'BAD_LOCATION');
  }
  if (Math.abs(lat) > 65 && !POLAR_SAFE_METHODS.has(method)) {
    // adhan can fail silently (NaN) near polar circles for the angle-based
    // methods. Reject up front unless the method explicitly handles it.
    throw new PrayerCalculationError(
      `Polar/near-polar latitude ${lat}° not supported by method ${method}; use MoonsightingCommittee for high latitudes`,
      'POLAR_LAT'
    );
  }
}

function buildParameters(methodId, madhab, adjustmentsMinutes) {
  const method = getMethod(methodId);
  if (!method) throw new PrayerCalculationError(`Unknown method: ${methodId}`, 'BAD_METHOD');
  const params = method.factory();
  params.madhab = madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  if (adjustmentsMinutes) {
    // adhan's .adjustments applies in minutes per prayer. Default to 0.
    params.adjustments = {
      fajr:    adjustmentsMinutes.fajr    || 0,
      sunrise: adjustmentsMinutes.sunrise || 0,
      dhuhr:   adjustmentsMinutes.dhuhr   || 0,
      asr:     adjustmentsMinutes.asr     || 0,
      maghrib: adjustmentsMinutes.maghrib || 0,
      isha:    adjustmentsMinutes.isha    || 0
    };
  }
  return params;
}

function calculateForDate({ lat, lng, date, method, madhab, adjustmentsMinutes, maghribDelayMinutes }) {
  assertValidLocation(lat, lng, method);
  if (!isValidMethodId(method)) {
    throw new PrayerCalculationError(`Unknown method: ${method}`, 'BAD_METHOD');
  }
  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) {
    throw new PrayerCalculationError('date could not be parsed', 'BAD_DATE');
  }
  const coords = new adhan.Coordinates(lat, lng);
  const params = buildParameters(method, madhab, adjustmentsMinutes);
  const pt = new adhan.PrayerTimes(coords, when, params);

  const times = {};
  for (const key of PRAYER_KEYS) {
    const t = pt[key];
    if (!(t instanceof Date) || Number.isNaN(t.getTime())) {
      throw new PrayerCalculationError(
        `Calculation produced invalid ${key} time at ${lat},${lng} on ${when.toISOString()}`,
        'INVALID_RESULT'
      );
    }
    times[key] = t;
  }

  // Shar'i midnight (منتصف الليل الشرعي) — the midpoint between today's
  // maghrib and tomorrow's fajr. Used in Shia jurisprudence as the
  // cutoff for Isha (the obligatory prayer must be finished before
  // midnight) and the start of the "late-night" devotional window.
  // We compute it before any custom maghribDelayMinutes so the midpoint
  // stays astronomically true to (sunset + dawn)/2 rather than drifting
  // with a mosque-specific iqama delay.
  try {
    const tomorrow = new Date(when);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDayPt = new adhan.PrayerTimes(coords, tomorrow, params);
    if (nextDayPt.fajr instanceof Date && !Number.isNaN(nextDayPt.fajr.getTime())) {
      const midnightMs = (times.maghrib.getTime() + nextDayPt.fajr.getTime()) / 2;
      times.midnight = new Date(midnightMs);
    }
  } catch (_) { /* midnight is optional — skip on any error */ }

  // Optional Shia-specific Maghrib delay in minutes (ذهاب الحمرة المشرقية):
  // some marjas (Sistani, Khamenei) prescribe a fixed minute delay past
  // astronomical sunset (~13-17 min for hadar regions) rather than an
  // angle-based computation. Applied AFTER the angle-based maghrib, so a
  // Jafari user can also add minutes on top. Negative values are clamped
  // to zero to avoid pulling maghrib before sunset.
  if (maghribDelayMinutes && Number.isFinite(maghribDelayMinutes) && maghribDelayMinutes > 0) {
    const shift = Math.max(0, Math.round(maghribDelayMinutes)) * 60 * 1000;
    times.maghrib = new Date(times.maghrib.getTime() + shift);
  }

  // Include midnight in the ISO payload only when the calculation
  // succeeded, so downstream consumers can tell "not computed" from
  // "epoch zero".
  const isoEntries = PRAYER_KEYS.map(k => [k, times[k].toISOString()]);
  if (times.midnight instanceof Date && !Number.isNaN(times.midnight.getTime())) {
    isoEntries.push(['midnight', times.midnight.toISOString()]);
  }

  return {
    date: startOfDay(when).toISOString(),
    location: { lat, lng },
    method,
    madhab: madhab === 'Hanafi' ? 'Hanafi' : 'Shafi',
    times,
    timesIso: Object.fromEntries(isoEntries)
  };
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

module.exports = { calculateForDate, PRAYER_KEYS, PrayerCalculationError };
