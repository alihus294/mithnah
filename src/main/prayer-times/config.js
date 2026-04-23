const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { defaultConfig, defaultFeatures } = require('./defaults');
const { isValidMethodId } = require('./methods');
const { isValidCalendarId } = require('../hijri/calendars');

// Canonical list of feature flag keys. Anything outside this set is dropped
// on coerce — same strict-mode policy as the top-level config.
const KNOWN_FEATURES = Object.freeze(Object.keys(defaultFeatures()));

// prayer-config.json schema version. Increment when a breaking change to
// the shape is introduced; handle upgrades in `migrate()` below.
const CURRENT_SCHEMA_VERSION = 1;

// Persisted config location is passed in (so tests can point at a temp dir).
// In the app, pass app.getPath('userData').
function configPath(userDataDir) {
  return path.join(userDataDir, 'prayer-config.json');
}

// Known keys — everything else passes through untouched (forward-compat).
const KNOWN_KEYS = new Set([
  'schemaVersion', 'location', 'method', 'madhab', 'fiqh',
  'calendar', 'calendarDayOffset', 'maghribDelayMinutes', 'adjustmentsMinutes',
  'marja', 'onboardingCompleted', 'mosqueName',
  'hideAsr', 'hideIsha', 'occasionOverride', 'clockFormat',
  'locationAccuracyMeters', 'locationSource', 'locationFixedAt',
  'announcementText', 'announcementAutoHideSeconds',
  'settingsPinHash', 'features', 'supportContact', 'imamName',
  // `imamList`: a stored roster of imams the caretaker cycles between.
  // `imamName` still carries the currently-selected imam (so the wall
  // renders what the hall expects right now); `imamList` is the
  // picker's source. Introduced 2026-04-23.
  'imamList'
]);

function coerceFeatures(raw) {
  // Start from defaults and overlay any valid boolean keys from input.
  // Unknown keys are dropped; non-boolean values fall back to the default.
  const base = defaultFeatures();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const key of KNOWN_FEATURES) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

function coerce(obj) {
  // Drop-dead defaults if anything is missing or malformed. This keeps old
  // config files from blocking startup when fields get added later.
  //
  // STRICT MODE: unknown top-level keys are DROPPED, not preserved. The
  // earlier forward-compat design let an authenticated writer plant
  // arbitrary keys that stuck around forever — a minor persistence-level
  // poisoning vector. We trade a tiny bit of forward-compat (future-older
  // build loses new fields it doesn't understand) for a clean config.
  const base = defaultConfig();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    location: {
      lat:  finiteOr(obj?.location?.lat,  base.location.lat),
      lng:  finiteOr(obj?.location?.lng,  base.location.lng),
      name: typeof obj?.location?.name === 'string' ? obj.location.name : base.location.name
    },
    method: isValidMethodId(obj?.method) ? obj.method : base.method,
    madhab: obj?.madhab === 'Hanafi' ? 'Hanafi' : 'Shafi',
    fiqh: obj?.fiqh === 'sunni' ? 'sunni' : 'shia',
    marja: typeof obj?.marja === 'string' ? obj.marja : null,
    onboardingCompleted: obj?.onboardingCompleted === true,
    // GPS provenance — recorded when a phone GPS handoff wins; null otherwise.
    locationAccuracyMeters: (() => {
      const raw = obj?.locationAccuracyMeters;
      if (raw === null || raw === undefined) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    })(),
    locationSource: typeof obj?.locationSource === 'string' ? obj.locationSource : null,
    locationFixedAt: typeof obj?.locationFixedAt === 'string' ? obj.locationFixedAt : null,
    calendar: isValidCalendarId(obj?.calendar) ? obj.calendar : 'jafari',
    calendarDayOffset: intOr(obj?.calendarDayOffset, 0),
    maghribDelayMinutes: clampInt(obj?.maghribDelayMinutes, 0, 60, 0),
    mosqueName: (() => {
      const raw = obj?.mosqueName;
      if (typeof raw !== 'string') return base.mosqueName;
      const trimmed = raw.trim().slice(0, 120);
      return trimmed || base.mosqueName;
    })(),
    hideAsr: obj?.hideAsr === true,
    hideIsha: obj?.hideIsha === true,
    occasionOverride: (() => {
      const raw = obj?.occasionOverride;
      return (raw === 'normal' || raw === 'shahadah' || raw === 'wiladah' || raw === 'eid') ? raw : 'auto';
    })(),
    clockFormat: obj?.clockFormat === '12' ? '12' : '24',
    adjustmentsMinutes: {
      fajr:    intOr(obj?.adjustmentsMinutes?.fajr,    0),
      sunrise: intOr(obj?.adjustmentsMinutes?.sunrise, 0),
      dhuhr:   intOr(obj?.adjustmentsMinutes?.dhuhr,   0),
      asr:     intOr(obj?.adjustmentsMinutes?.asr,     0),
      maghrib: intOr(obj?.adjustmentsMinutes?.maghrib, 0),
      isha:    intOr(obj?.adjustmentsMinutes?.isha,    0)
    },
    // Free-text announcement banner body. Caretaker-editable, shown on the
    // dashboard when `features.announcementBanner` is on. Trim + length cap
    // keeps a stray paste from blowing out the layout.
    announcementText: (() => {
      const raw = obj?.announcementText;
      if (typeof raw !== 'string') return '';
      return raw.trim().slice(0, 240);
    })(),
    // 0 disables auto-hide. Capped at 3600s (1h) because anything
    // longer is effectively "never hide" and the operator should just
    // leave the banner up manually in that case.
    announcementAutoHideSeconds: clampInt(obj?.announcementAutoHideSeconds, 0, 3600, 0),
    // PIN-gate hash for the settings overlay. Never store the PIN itself —
    // we keep only `sha256(salt + pin)` as a hex string plus the salt,
    // formatted as "salt$hash". `null` means PIN gate is disabled even if
    // `features.settingsPin` was flipped on (defensive fallback).
    supportContact: (() => {
      const raw = obj?.supportContact;
      if (typeof raw !== 'string') return '';
      return raw.trim().slice(0, 200);
    })(),
    imamName: (() => {
      const raw = obj?.imamName;
      if (typeof raw !== 'string') return '';
      return raw.trim().slice(0, 120);
    })(),
    // Operator-managed roster of imams. Each entry is a plain string
    // (name only — no credentials or roles since Shia protocol
    // doesn't distinguish among those). Caps at 40 to keep the F5
    // dropdown usable; dedupes case-insensitively so typos don't
    // spawn duplicate rows.
    imamList: (() => {
      const raw = Array.isArray(obj?.imamList) ? obj.imamList : [];
      const seen = new Set();
      const out = [];
      for (const v of raw) {
        if (typeof v !== 'string') continue;
        const s = v.trim().slice(0, 120);
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
        if (out.length >= 40) break;
      }
      return out;
    })(),
    settingsPinHash: (() => {
      const raw = obj?.settingsPinHash;
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      // 16-char salt $ 128-char scrypt hash (64 bytes hex). The
      // previous SHA-256 (64-char) format is intentionally rejected so
      // a config carried over from <=0.8.13 forces the operator to
      // re-set their PIN under the stronger algorithm.
      return /^[0-9a-f]{16,64}\$[0-9a-f]{128}$/i.test(trimmed) ? trimmed : null;
    })(),
    features: coerceFeatures(obj?.features)
  };
}

function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function finiteOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Apply any needed migrations based on the stored schema version.
function migrate(obj) {
  const version = Number(obj?.schemaVersion) || 0;
  if (version === CURRENT_SCHEMA_VERSION) return obj;
  // v0 -> v1: we added fiqh/calendar/maghribDelayMinutes/schemaVersion
  // between v0.1.0 and v0.2.x. `coerce` fills these in with sensible
  // defaults so no explicit migration code is needed yet — but the hook
  // exists for future versions.
  if (version < 1) {
    return { ...obj, schemaVersion: 1 };
  }
  // Newer schema written by a future build, opened by an older one.
  // Refuse to load — silently re-coercing would drop unknown keys
  // and the next save() would overwrite the file, permanently losing
  // whatever the future build wrote. Throw so load() backs up the
  // file (existing path at line ~177) and starts fresh, preserving
  // the original on disk for forensics + rollback.
  throw new Error(`config schemaVersion=${version} is newer than this app (expected ${CURRENT_SCHEMA_VERSION}). Refusing to load to avoid data loss; the file has been backed up.`);
}

async function load(userDataDir) {
  const p = configPath(userDataDir);
  try {
    const raw = await fsp.readFile(p, 'utf8');
    // Refuse to parse pathologically large files — prevents OOM from a
    // malicious or corrupt config.
    if (raw.length > 1024 * 1024) {
      throw new Error(`config file too large (${raw.length} bytes)`);
    }
    return coerce(migrate(JSON.parse(raw)));
  } catch (err) {
    if (err.code === 'ENOENT') {
      // First run — write out defaults.
      const cfg = defaultConfig();
      await save(userDataDir, cfg);
      return cfg;
    }
    // Parse error or oversized file: back up the broken file and start fresh.
    const backup = p + `.corrupt-${Date.now()}.bak`;
    try { await fsp.rename(p, backup); } catch (_) { /* best-effort */ }
    console.warn(`[prayer-times] config unreadable (${err.message}); backed up to ${path.basename(backup)} and regenerated defaults.`);
    const cfg = defaultConfig();
    await save(userDataDir, cfg);
    return cfg;
  }
}

// True when no prayer-config.json exists yet at the given userDataDir. Must
// be checked BEFORE calling load() since load() creates the file on ENOENT.
async function isFirstRun(userDataDir) {
  try {
    await fsp.access(configPath(userDataDir));
    return false;
  } catch (err) {
    return err.code === 'ENOENT';
  }
}

function loadSync(userDataDir) {
  const p = configPath(userDataDir);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.length > 1024 * 1024) throw new Error('config too large');
    return coerce(migrate(JSON.parse(raw)));
  } catch (err) {
    if (err.code === 'ENOENT') {
      // First-run write — atomic via tmp + rename, same strategy as
      // `save()`. The earlier non-atomic writeFileSync left a
      // truncated config on disk if the operator yanked power during
      // first boot, and the next read parsed `{` → corrupt-backup
      // path → first-run UI re-triggered.
      const cfg = defaultConfig();
      fs.mkdirSync(userDataDir, { recursive: true });
      const tmp = `${p}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
      fs.renameSync(tmp, p);
      return cfg;
    }
    console.warn(`[prayer-times] loadSync fallback (${err.message}); using defaults in memory.`);
    return defaultConfig();
  }
}

async function save(userDataDir, config) {
  const p = configPath(userDataDir);
  await fsp.mkdir(userDataDir, { recursive: true });
  const normalized = coerce(config);
  // Atomic write with a UNIQUE tmp name per call so concurrent writers
  // don't collide on the same `.tmp` path. Each writer produces its own
  // complete file and renames into place — last rename wins, but none of
  // them see ENOENT from a peer that already renamed.
  const tmp = `${p}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(normalized, null, 2), 'utf8');
  try {
    await fsp.rename(tmp, p);
  } catch (err) {
    // Best-effort cleanup; don't leave stale .tmp on disk.
    try { await fsp.unlink(tmp); } catch (_) {}
    throw err;
  }
  // Opportunistic sweep — if previous crashes left orphan .tmp files
  // in the user-data dir, clean up any older than 1 h. Silent on error.
  try {
    const now = Date.now();
    const base = path.basename(p);
    const entries = await fsp.readdir(userDataDir);
    for (const name of entries) {
      if (!name.startsWith(base + '.') || !name.endsWith('.tmp')) continue;
      const full = path.join(userDataDir, name);
      try {
        const st = await fsp.stat(full);
        if (now - st.mtimeMs > 60 * 60 * 1000) {
          await fsp.unlink(full);
        }
      } catch (_) { /* best-effort */ }
    }
  } catch (_) { /* best-effort */ }
  return normalized;
}

module.exports = { load, loadSync, save, coerce, migrate, configPath, isFirstRun, CURRENT_SCHEMA_VERSION, KNOWN_FEATURES };
