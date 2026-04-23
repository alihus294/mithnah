// Placeholder — full Shia content registry assembled in Phase B. Re-exports
// concrete data modules (duas, ziyarat, taqibat, hijri events, tasbih).
const duas       = require('./duas');
const ziyarat    = require('./ziyarat');
const taqibat    = require('./taqibat');
const tasbih     = require('./tasbih');
const events     = require('./hijri-events');

// Public API. All lists are read-only — return frozen copies so a misbehaving
// IPC caller can't mutate the in-process data.
function listDuas()    { return duas.ALL.map(d => deepFreeze(clone(d))); }
function getDua(id)    { const d = duas.ALL.find(x => x.id === id); return d ? deepFreeze(clone(d)) : null; }
function listZiyarat() { return ziyarat.ALL.map(z => deepFreeze(clone(z))); }
function getZiyarah(id){ const z = ziyarat.ALL.find(x => x.id === id); return z ? deepFreeze(clone(z)) : null; }
function listTaqibat() { return taqibat.ALL.map(t => deepFreeze(clone(t))); }
function getTasbihZahra() { return deepFreeze(clone(tasbih.TASBIH_ZAHRA)); }

function listEvents()  { return events.ALL.map(e => deepFreeze(clone(e))); }
function eventsForHijriDate(year, month, day) {
  return events.ALL.filter(e => e.month === month && e.day === day).map(e => deepFreeze(clone(e)));
}

// Returns up to `limit` upcoming Shia events within `daysAhead` calendar
// days from the given today-in-Hijri { year, month, day }. Each result
// carries { event, hijriTarget, daysAway }.
//
// We don't try to convert Hijri→Gregorian for exact day counting (that
// needs the same calendar variant the caller uses); instead we reason
// in Hijri days assuming 29.5-day average months. Good enough for a
// "next few weeks" display; the caller can get an exact Gregorian date
// separately via the hijri module if needed.
function upcomingEvents(today, { daysAhead = 40, limit = 3 } = {}) {
  if (!today || !Number.isInteger(today.month) || !Number.isInteger(today.day)) return [];
  // Reject out-of-range month/day — Hijri months are 1-12, days 1-30.
  // Without this guard, month=13 silently produces hijriTarget with a
  // month=13 field, and callers trust the output.
  if (today.month < 1 || today.month > 12) return [];
  if (today.day < 1 || today.day > 30) return [];
  const todayIdx  = monthDayIndex(today.month, today.day);
  const results = [];
  for (const e of events.ALL) {
    const evIdx = monthDayIndex(e.month, e.day);
    let delta = evIdx - todayIdx;
    // If the event has already passed this Hijri year, roll it over to
    // next year (avg 354 days).
    if (delta < 0) delta += 354;
    if (delta === 0) continue; // today's events are a separate query
    if (delta > daysAhead) continue;
    const hijriTarget = advanceHijri(today, delta);
    results.push({ event: deepFreeze(clone(e)), hijriTarget, daysAway: delta });
  }
  results.sort((a, b) => a.daysAway - b.daysAway);
  return results.slice(0, limit);
}

function monthDayIndex(month, day) {
  // Approximate day-of-Hijri-year. 12 months × 29.5 average days — close
  // enough for ordering within a single year.
  return (month - 1) * 29.5 + day;
}

function advanceHijri(today, days) {
  // Step forward `days` from {month, day} in the same Hijri year (or
  // next). Uses alternating 30/29-day months (Muharram 30, Safar 29,
  // Rabi 30, Rabi II 29, …). Close enough for the display label.
  const MONTH_LENGTHS = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  let year  = today.year;
  let month = today.month;
  let day   = today.day + days;
  while (day > MONTH_LENGTHS[month - 1]) {
    day -= MONTH_LENGTHS[month - 1];
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month, day };
}

function clone(obj)     { return JSON.parse(JSON.stringify(obj)); }
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

module.exports = {
  listDuas, getDua,
  listZiyarat, getZiyarah,
  listTaqibat, getTasbihZahra,
  listEvents, eventsForHijriDate, upcomingEvents
};
