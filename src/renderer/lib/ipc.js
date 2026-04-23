// Thin, type-documented wrapper around the window.electron IPC surface.
// Keeps the components clean by giving every call a promise that either
// resolves with data or rejects with a helpful error.

const e = () => {
  if (!window.electron) {
    throw new Error('window.electron is missing — renderer is running outside Electron');
  }
  return window.electron;
};

const unwrap = (resp, label) => {
  if (!resp || !resp.ok) {
    const msg = (resp && resp.error) || 'unknown error';
    throw new Error(`${label} failed: ${msg}`);
  }
  return resp.data;
};

export async function getTodayAndNext(isoNow) {
  const resp = await e().prayerTimes.getTodayAndNext(isoNow);
  return unwrap(resp, 'prayer-times:get-today-and-next');
}

export async function getConfig() {
  return await e().prayerTimes.getConfig();
}

export async function setConfig(partial) {
  const resp = await e().prayerTimes.setConfig(partial);
  if (!resp || !resp.ok) {
    throw new Error((resp && resp.error) || 'prayer-times:set-config failed');
  }
  // Fire an in-renderer event alongside the main-process IPC broadcast.
  // The IPC broadcast relies on the main → preload → bindChannel chain;
  // if anything in that chain is slow or drops, the window event still
  // fires synchronously in the same renderer where setConfig was called,
  // so F3 edits reflect on the Dashboard (same window) instantly.
  try {
    window.dispatchEvent(new CustomEvent('mithnah:config-changed', { detail: resp.config }));
  } catch (_) { /* older browsers without CustomEvent — ignore */ }
  return resp.config;
}

// Debounced / coalesced setConfig. Rapid successive dropdown changes
// (e.g. the operator cycling through calculation methods to compare)
// otherwise slam setConfig with N writes — each one snapshots to the
// undo stack and writes prayer-config.json to disk.
//
// Strategy: merge patches into a single pending object, flush it after
// `delayMs` of idleness. Top-level fields are shallow-merged;
// `location`, `adjustmentsMinutes`, and `features` are deep-merged so
// a rapid pair like `{method: X}` + `{adjustmentsMinutes: {fajr: 1}}`
// still composes correctly.
let _pendingPatch = null;
let _pendingTimer = null;
let _pendingResolvers = [];
const DEBOUNCE_MS = 200;

function mergePatches(a, b) {
  const out = { ...(a || {}), ...(b || {}) };
  if (a?.location || b?.location) {
    out.location = { ...(a?.location || {}), ...(b?.location || {}) };
  }
  if (a?.adjustmentsMinutes || b?.adjustmentsMinutes) {
    out.adjustmentsMinutes = { ...(a?.adjustmentsMinutes || {}), ...(b?.adjustmentsMinutes || {}) };
  }
  if (a?.features || b?.features) {
    out.features = { ...(a?.features || {}), ...(b?.features || {}) };
  }
  return out;
}

export function setConfigDebounced(partial) {
  _pendingPatch = mergePatches(_pendingPatch, partial || {});
  return new Promise((resolve, reject) => {
    _pendingResolvers.push({ resolve, reject });
    if (_pendingTimer) clearTimeout(_pendingTimer);
    _pendingTimer = setTimeout(async () => {
      const patch = _pendingPatch;
      const resolvers = _pendingResolvers;
      _pendingPatch = null;
      _pendingTimer = null;
      _pendingResolvers = [];
      try {
        const merged = await setConfig(patch || {});
        resolvers.forEach((r) => r.resolve(merged));
      } catch (err) {
        resolvers.forEach((r) => r.reject(err));
      }
    }, DEBOUNCE_MS);
  });
}

// Flush any pending debounced patch immediately (useful on overlay
// close so the write doesn't race against a re-open).
export async function flushPendingConfig() {
  if (!_pendingTimer) return null;
  clearTimeout(_pendingTimer);
  _pendingTimer = null;
  const patch = _pendingPatch;
  const resolvers = _pendingResolvers;
  _pendingPatch = null;
  _pendingResolvers = [];
  try {
    const merged = await setConfig(patch || {});
    resolvers.forEach((r) => r.resolve(merged));
    return merged;
  } catch (err) {
    resolvers.forEach((r) => r.reject(err));
    throw err;
  }
}

export async function listMethods() {
  return await e().prayerTimes.listMethods();
}

export async function listCalendars() {
  return await e().hijri.listCalendars();
}

export async function hijriToday(opts) {
  const resp = await e().hijri.today(opts || {});
  return unwrap(resp, 'hijri:today');
}

export async function getRemoteStatus() {
  return await e().remoteControl.getStatus();
}

export async function getTodayEvents() {
  const resp = await e().bridge.todayEvents();
  return unwrap(resp, 'bridge:today-events');
}

export async function getSnapshot() {
  const resp = await e().bridge.getSnapshot();
  return unwrap(resp, 'bridge:get-snapshot');
}

export async function listMarjas() {
  const resp = await e().marja.list();
  return unwrap(resp, 'marja:list');
}

export async function setMarja(marjaId) {
  const resp = await e().marja.set(marjaId);
  const data = unwrap(resp, 'marja:set');
  try { window.dispatchEvent(new CustomEvent('mithnah:config-changed', { detail: data })); } catch (_) {}
  return data;
}

export async function setLocation(payload) {
  const resp = await e().location.setManual(payload);
  const data = unwrap(resp, 'location:set');
  try { window.dispatchEvent(new CustomEvent('mithnah:config-changed', { detail: data })); } catch (_) {}
  return data;
}

// Timezone-based location detection — always works offline. Used as
// the fallback when navigator.geolocation refuses (no GPS chip, no
// internet for Google's WiFi-positioning service, or the operator
// denied the permission prompt).
export async function detectLocationFromTimezone() {
  const resp = await e().location.detect();
  return unwrap(resp, 'location:detect');
}

export async function reverseGeocodeOnline(payload) {
  const resp = await e().location.reverseOnline(payload);
  return unwrap(resp, 'location:reverse-online');
}

export async function nearestCity(payload) {
  const resp = await e().location.nearestCity(payload);
  return unwrap(resp, 'location:nearest-city');
}

export async function nearbyPlaces(payload) {
  const resp = await e().location.nearbyPlaces(payload);
  return unwrap(resp, 'location:nearby-places');
}

export async function searchPlaces(payload) {
  const resp = await e().location.search(payload);
  return unwrap(resp, 'location:search');
}

export function onSlideshowState(cb) {
  return e().slideshow.onState(cb);
}

// Dual subscription: the IPC broadcast from main (authoritative, fires
// after the file actually saves) AND the in-renderer window event
// (fires immediately after setConfig returns in the same window, even
// if the IPC chain is briefly slow). Consumers get at most one call
// per actual change because React batches the resulting setState.
export function onConfigChanged(cb) {
  const offIpc = e().prayerTimes.onConfigChanged(cb);
  const onWin = (ev) => cb(ev.detail);
  window.addEventListener('mithnah:config-changed', onWin);
  return () => {
    try { if (typeof offIpc === 'function') offIpc(); } catch (_) {}
    window.removeEventListener('mithnah:config-changed', onWin);
  };
}

export async function undoLastConfig() {
  const resp = await e().prayerTimes.undoLast();
  if (!resp || !resp.ok) {
    throw new Error((resp && resp.error) || 'undo failed');
  }
  // Same custom-event broadcast as setConfig so listeners refresh.
  try { window.dispatchEvent(new CustomEvent('mithnah:config-changed', { detail: resp.config })); } catch (_) {}
  return resp.config;
}

export async function listConfigUndoStack() {
  const resp = await e().prayerTimes.listUndoStack();
  return unwrap(resp, 'prayer-times:list-undo-stack');
}

// Features-related IPC wrappers. Each one targets a dedicated main-process
// handler so renderer code stays declarative.

export async function setSettingsPin(pin) {
  const resp = await e().app.setSettingsPin({ pin });
  return unwrap(resp, 'app:set-settings-pin');
}

export async function verifySettingsPin(pin) {
  const resp = await e().app.verifySettingsPin({ pin });
  return unwrap(resp, 'app:verify-settings-pin');
}

export async function setAutoLaunch(enabled) {
  const resp = await e().app.setAutoLaunch({ enabled: !!enabled });
  return unwrap(resp, 'app:set-auto-launch');
}

export async function exportConfig() {
  const resp = await e().app.exportConfig();
  return unwrap(resp, 'app:export-config');
}

export async function importConfig() {
  const resp = await e().app.importConfig();
  return unwrap(resp, 'app:import-config');
}

export async function getQibla() {
  const resp = await e().app.qibla();
  return unwrap(resp, 'app:qibla');
}

export async function kioskQuit(pin) {
  const resp = await e().app.kioskQuit({ pin });
  return unwrap(resp, 'app:kiosk-quit');
}

export function onKioskUnlockRequest(cb) {
  return e().app.onKioskUnlockRequest(cb);
}
