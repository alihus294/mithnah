const { listMethods, MADHABS } = require('./methods');
const { calculateForDate, PrayerCalculationError } = require('./calculator');
const { makeCache } = require('./cache');
const { load, save, isFirstRun } = require('./config');
const { defaultConfig } = require('./defaults');

// Lazy singleton — one cache instance per main-process lifetime, attached to
// the current config. Swap the cache when config changes to avoid serving
// stale results keyed under old coordinates.
let _config = null;
let _cache = null;
let _userDataDir = null;
// Subscribers that want notification whenever the config actually changes
// on disk. Used by main/index.js to push a 'config:changed' IPC to the
// renderer so the Dashboard updates in real time instead of waiting for
// its 5-minute polling tick.
const _subscribers = new Set();

function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

function _notify(config) {
  for (const fn of _subscribers) {
    try { fn(config); } catch (err) { console.error('[prayer-times] subscriber failed:', err); }
  }
}

async function init(userDataDir) {
  _userDataDir = userDataDir;
  const firstRun = await isFirstRun(userDataDir);
  _config = await load(userDataDir);
  _cache = makeCache();
  return { ..._config, _isFirstRun: firstRun };
}

function getConfig() {
  assertInitialized();
  return _config;
}

// Undo stack — last N pre-save snapshots so the operator can hit
// "↶ تراجع" within a window after a mistaken change. Kept entirely
// in-memory; restart wipes it (intentional — undoing across reboots
// would be confusing for an elderly user who doesn't remember what
// they changed two weeks ago).
const UNDO_LIMIT = 10;
const _undoStack = [];

function _pushUndo(snapshot) {
  _undoStack.push({ ts: Date.now(), config: JSON.parse(JSON.stringify(snapshot)) });
  while (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
}

// Compute a short per-entry description of WHAT actually changed
// between two config snapshots. Entry N's "before" is the snapshot;
// "after" is entry N+1's snapshot (or the live config for the most
// recent entry). The operator sees human phrases like "اسم المسجد:
// جامع الإمام ← مسجد الإمام" instead of the old row which only
// showed mosqueName+locationName whether or not they changed.
const FIELD_LABELS_AR = {
  mosqueName:      'اسم المسجد',
  imamName:        'اسم الإمام',
  'location.name': 'الموقع',
  method:          'طريقة الحساب',
  calendar:        'التقويم الهجري',
  marja:           'المرجعية',
  hijriShift:      'إزاحة التقويم',
  clockFormat:     'صيغة الساعة',
  announcementText: 'نصّ الإعلان',
  announcementAutoHideSeconds: 'مدّة الإعلان',
  supportContact:  'جهة الدعم',
};
const PRAYER_LABELS_AR = {
  fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر',
  maghrib: 'المغرب', isha: 'العشاء', sunrise: 'الشروق'
};
const FEATURE_LABELS_AR = {
  announcementBanner: 'شريط الإعلانات',
  ramadanCountdown:   'عدّاد الإفطار',
  qiblaDisplay:       'عرض القبلة',
  maghribPivot:       'محور المغرب',
  autoContentToday:   'فتح دعاء اليوم تلقائياً',
  autoLaunch:         'التشغيل التلقائي مع ويندوز',
  kioskLock:          'قفل العرض',
  settingsPin:        'PIN الإعدادات',
  configBackup:       'النسخ الاحتياطي',
  largeText:          'خط كبير للعرض',
};

function formatVal(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (v === true) return 'مُفعَّل';
  if (v === false) return 'معطَّل';
  return String(v);
}

function summarizeDiff(before, after) {
  if (!before || !after) return [];
  const changes = [];
  // Top-level scalars
  for (const k of Object.keys(FIELD_LABELS_AR)) {
    if (k.startsWith('location.')) continue;
    const bv = before[k];
    const av = after[k];
    if (bv !== av) changes.push(`${FIELD_LABELS_AR[k]}: ${formatVal(bv)} ← ${formatVal(av)}`);
  }
  // Nested: location.name (other lat/lng fields are noise — the
  // display name already conveys "moved location" in a readable way)
  const bl = before.location?.name;
  const al = after.location?.name;
  if (bl !== al) changes.push(`${FIELD_LABELS_AR['location.name']}: ${formatVal(bl)} ← ${formatVal(al)}`);
  // Prayer-time adjustments — surface each minute tweak individually
  // so "Fajr +1" is distinguishable from "Maghrib -2".
  const badj = before.adjustmentsMinutes || {};
  const aadj = after.adjustmentsMinutes || {};
  const adjKeys = new Set([...Object.keys(badj), ...Object.keys(aadj)]);
  for (const k of adjKeys) {
    if (badj[k] !== aadj[k]) {
      const name = PRAYER_LABELS_AR[k] || k;
      changes.push(`تعديل ${name}: ${formatVal(badj[k] || 0)} ← ${formatVal(aadj[k] || 0)} د`);
    }
  }
  // Feature flags
  const bf = before.features || {};
  const af = after.features || {};
  const flagKeys = new Set([...Object.keys(bf), ...Object.keys(af)]);
  for (const k of flagKeys) {
    if (bf[k] !== af[k]) {
      const name = FEATURE_LABELS_AR[k] || k;
      changes.push(`${name}: ${formatVal(bf[k])} ← ${formatVal(af[k])}`);
    }
  }
  return changes;
}

function listUndoStack() {
  // For each snapshot compute what changed relative to the NEXT
  // snapshot (or the live config for the most recent entry). The
  // result is an array of { ts, summary: { changes: [...] } }.
  return _undoStack.map((entry, i) => {
    const before = entry.config;
    const after  = (i + 1 < _undoStack.length) ? _undoStack[i + 1].config : _config;
    const changes = summarizeDiff(before, after);
    return {
      ts: entry.ts,
      summary: {
        changes,
        // Retained for backwards-compat with any UI still reading
        // these flat fields directly.
        mosqueName: before.mosqueName,
        locationName: before.location?.name
      }
    };
  });
}

async function undoLast() {
  assertInitialized();
  // Pop the latest snapshot (the state BEFORE the most recent save)
  // and restore it. Don't re-push it onto the undo stack — undo of
  // undo is a redo, which we deliberately don't ship to keep the
  // mental model dead simple.
  const last = _undoStack.pop();
  if (!last) return null;
  _config = await save(_userDataDir, last.config);
  _cache = makeCache();
  _notify(_config);
  return _config;
}

async function setConfig(partial) {
  assertInitialized();
  // Snapshot the CURRENT config before applying the patch so the
  // operator can revert with one click. Snapshot is independent of
  // the partial-merge logic that follows.
  _pushUndo(_config);
  const merged = {
    ..._config,
    ...partial,
    location: { ..._config.location, ...(partial.location || {}) },
    adjustmentsMinutes: { ..._config.adjustmentsMinutes, ...(partial.adjustmentsMinutes || {}) },
    // Merge feature flags shallowly so a partial write like
    // `{features: {kioskLock: true}}` doesn't wipe every other toggle.
    features: { ...(_config.features || {}), ...(partial.features || {}) }
  };
  _config = await save(_userDataDir, merged);
  _cache = makeCache(); // invalidate stale entries
  _notify(_config);
  return _config;
}

function getForDate(date = new Date()) {
  assertInitialized();
  return _cache.get(_config, date);
}

function getTodayAndNext(nowOrDate = new Date()) {
  assertInitialized();
  const today = _cache.get(_config, nowOrDate);
  // Next-prayer pointer so renderer doesn't have to duplicate the loop logic.
  // We use `>=` so that when `now === prayer_time` we treat it as "current"
  // (not skip to the one after). The sequence is the five obligatory prayers
  // plus sunrise (useful for the Fajr window). Imsak and midnight are
  // deliberately excluded per product decision — this is a mosque display,
  // not a household app, and neither is relevant to the hall-of-prayer view.
  const now = new Date(nowOrDate);
  // Shia 5-cell "next prayer" sequence — dhuhr/asr and maghrib/isha
  // are commonly combined in Shia practice, so Asr and Isha are not
  // announced as distinct "next" markers on the wall. Midnight
  // (منتصف الليل الشرعي) is included so the wall can count down to it
  // during the late-night window.
  const sequence = ['fajr', 'sunrise', 'dhuhr', 'maghrib', 'midnight'];
  let next = null;
  for (const key of sequence) {
    const t = today.times[key];
    if (t && t.getTime() >= now.getTime()) {
      next = { name: key, at: t.toISOString() };
      break;
    }
  }
  if (!next) {
    // All of today's prayers have passed — roll to tomorrow's Fajr.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDay = _cache.get(_config, tomorrow);
    next = { name: 'fajr', at: nextDay.times.fajr.toISOString(), nextDay: true };
  }
  return { today, next, now: now.toISOString() };
}

function assertInitialized() {
  if (!_config) {
    throw new Error('Prayer-times module not initialized. Call init(userDataDir) first.');
  }
}

module.exports = {
  init,
  getConfig,
  setConfig,
  subscribe,
  getForDate,
  getTodayAndNext,
  listMethods,
  MADHABS,
  defaultConfig,
  PrayerCalculationError,
  undoLast,
  listUndoStack,
  // for tests
  _reset: () => { _config = null; _cache = null; _userDataDir = null; _subscribers.clear(); _undoStack.length = 0; }
};
