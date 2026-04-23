// Hijri calendar conversion. Gregorian -> Hijri via Intl.DateTimeFormat
// (available in V8/Electron). Reverse conversion is implemented via
// binary search on the forward function — accurate to the day and fast
// enough for UI use (dozens of iterations for a single lookup).

const { CALENDARS, listCalendars, isValidCalendarId, getCalendar, getMonthName, HIJRI_MONTHS } = require('./calendars');

const GREG_PARTS_FORMATTER = new Intl.DateTimeFormat('en-u-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
});

function hijriFormatter(intlCalendar) {
  return new Intl.DateTimeFormat(`en-u-ca-${intlCalendar}-nu-latn`, {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
  });
}

// Cache one formatter per calendar — creating them is relatively expensive.
const FORMATTER_CACHE = new Map();
function getFormatter(intlCalendar) {
  if (!FORMATTER_CACHE.has(intlCalendar)) {
    FORMATTER_CACHE.set(intlCalendar, hijriFormatter(intlCalendar));
  }
  return FORMATTER_CACHE.get(intlCalendar);
}

function toPartsMap(parts) {
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

function rawToHijri(date, intlCalendar) {
  const fmt = getFormatter(intlCalendar);
  const parts = toPartsMap(fmt.formatToParts(date));
  // Node/V8 returns "year" value like "1447" (ISO-style) or "1447 AH" for
  // relatedYear. Strip any non-digits defensively.
  const year = parseInt(String(parts.year).replace(/\D/g, ''), 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Intl.DateTimeFormat returned unparseable parts for calendar ${intlCalendar}`);
  }
  return { year, month, day };
}

function applyOffset(date, dayOffset) {
  if (!dayOffset) return date;
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + dayOffset);
  return copy;
}

// Public API: convert a Gregorian Date (or ISO string) to Hijri using the
// named calendar variant. Returns { year, month, day, monthAr, monthEn,
// calendarId, gregorianIso }.
function toHijri(date, calendarId = 'jafari', options = {}) {
  if (!isValidCalendarId(calendarId)) {
    throw new Error(`Unknown Hijri calendar id: ${calendarId}`);
  }
  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) {
    throw new Error(`Invalid date passed to toHijri: ${date}`);
  }
  const cal = getCalendar(calendarId);
  const offset = typeof options.dayOffset === 'number' ? options.dayOffset : (cal.dayOffset || 0);
  const shifted = applyOffset(when, offset);
  const { year, month, day } = rawToHijri(shifted, cal.intlCalendar);
  return {
    year, month, day,
    monthAr: getMonthName(month, 'ar'),
    monthEn: getMonthName(month, 'en'),
    calendarId,
    dayOffset: offset,
    gregorianIso: when.toISOString()
  };
}

// Reverse conversion via binary search over UTC days. Returns null if the
// target Hijri date cannot be realized within +/- 60 years of today.
function fromHijri(hijriYear, hijriMonth, hijriDay, calendarId = 'jafari', options = {}) {
  if (!isValidCalendarId(calendarId)) {
    throw new Error(`Unknown Hijri calendar id: ${calendarId}`);
  }
  if (!Number.isInteger(hijriYear) || !Number.isInteger(hijriMonth) || !Number.isInteger(hijriDay)) {
    throw new Error('hijri date parts must be integers');
  }
  if (hijriMonth < 1 || hijriMonth > 12) throw new Error(`hijri month out of range: ${hijriMonth}`);
  if (hijriDay < 1 || hijriDay > 30) throw new Error(`hijri day out of range: ${hijriDay}`);

  const cal = getCalendar(calendarId);
  const offset = typeof options.dayOffset === 'number' ? options.dayOffset : (cal.dayOffset || 0);

  // Rough Gregorian anchor for Hijri year using the 33-year average. This
  // gets us to within a few months, then we step day-by-day to the exact date.
  const approxGregYear = Math.round(hijriYear * 0.970224 + 621.5774);
  let lo = Date.UTC(approxGregYear - 2, 0, 1);
  let hi = Date.UTC(approxGregYear + 2, 11, 31);
  const DAY = 86400 * 1000;

  function cmp(ts) {
    const shifted = applyOffset(new Date(ts), offset);
    const h = rawToHijri(shifted, cal.intlCalendar);
    if (h.year !== hijriYear) return h.year < hijriYear ? -1 : 1;
    if (h.month !== hijriMonth) return h.month < hijriMonth ? -1 : 1;
    if (h.day !== hijriDay) return h.day < hijriDay ? -1 : 1;
    return 0;
  }

  // Binary search to find a matching day.
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / (2 * DAY)) * DAY;
    const c = cmp(mid);
    if (c === 0) return new Date(mid);
    if (c < 0) lo = mid + DAY; else hi = mid - DAY;
  }
  return null;
}

function today(calendarId = 'jafari', options = {}) {
  return toHijri(new Date(), calendarId, options);
}

module.exports = {
  toHijri,
  fromHijri,
  today,
  listCalendars,
  isValidCalendarId,
  getCalendar,
  HIJRI_MONTHS,
  getMonthName
};
