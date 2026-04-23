const { contextBridge, ipcRenderer } = require('electron');

// Subscribe helper. Returns an unsubscribe fn so renderer code can clean up
// (important for SPAs that mount/unmount views — prevents leaked listeners).
const bindChannel = (channel, callback) => {
  const listener = (_event, payload) => {
    callback(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

// All IPC channels a renderer (React or the mobile-control HTML page) can
// reach. Main-process handlers are registered in:
//   - src/main/index.js                  (zoom, remote-control)
//   - src/main/prayer-times/ipc.js       (prayer-times:*)
//   - src/main/hijri/ipc.js              (hijri:*)
//   - src/main/location/ipc.js           (location:*)
//   - src/main/shia-content/ipc.js       (shia:*)
//   - src/main/slideshow/ipc.js          (slideshow:*)
contextBridge.exposeInMainWorld('electron', {
  zoom: {
    set: (factor) => ipcRenderer.invoke('zoom:set', factor),
    get: () => ipcRenderer.invoke('zoom:get'),
    getSmartLevel: () => ipcRenderer.invoke('zoom:smart-detect'),
  },
  remoteControl: {
    getStatus:    () => ipcRenderer.invoke('remote-control:get-status'),
    onStatus:     (callback) => bindChannel('remote-control:status', callback),
    onCommand:    (callback) => bindChannel('remote-control:command', callback),
    publishState: (state) => ipcRenderer.send('remote-control:publish-state', state),
  },
  prayerTimes: {
    listMethods:     () => ipcRenderer.invoke('prayer-times:list-methods'),
    listMadhabs:     () => ipcRenderer.invoke('prayer-times:list-madhabs'),
    getConfig:       () => ipcRenderer.invoke('prayer-times:get-config'),
    setConfig:       (partial) => ipcRenderer.invoke('prayer-times:set-config', partial),
    getTodayAndNext: (isoNow) => ipcRenderer.invoke('prayer-times:get-today-and-next', isoNow),
    getForDate:      (isoDate) => ipcRenderer.invoke('prayer-times:get-for-date', isoDate),
    onConfigChanged: (callback) => bindChannel('prayer-times:config-changed', callback),
    undoLast:        () => ipcRenderer.invoke('prayer-times:undo-last'),
    listUndoStack:   () => ipcRenderer.invoke('prayer-times:list-undo-stack'),
  },
  hijri: {
    listCalendars: () => ipcRenderer.invoke('hijri:list-calendars'),
    listMonths:    () => ipcRenderer.invoke('hijri:list-months'),
    today:         (opts) => ipcRenderer.invoke('hijri:today', opts || {}),
    convert:       (opts) => ipcRenderer.invoke('hijri:convert', opts || {}),
    fromHijri:     (opts) => ipcRenderer.invoke('hijri:from-hijri', opts || {}),
  },
  location: {
    detect:        () => ipcRenderer.invoke('location:detect'),
    setManual:     (payload) => ipcRenderer.invoke('location:set', payload),
    getTimezone:   () => ipcRenderer.invoke('location:get-timezone'),
    nearestCity:   (payload) => ipcRenderer.invoke('location:nearest-city', payload),
    reverseOnline: (payload) => ipcRenderer.invoke('location:reverse-online', payload),
    nearbyPlaces:  (payload) => ipcRenderer.invoke('location:nearby-places', payload),
    search:        (payload) => ipcRenderer.invoke('location:search', payload),
  },
  shia: {
    listDuas:       () => ipcRenderer.invoke('shia:list-duas'),
    getDua:         (id) => ipcRenderer.invoke('shia:get-dua', { id }),
    listZiyarat:    () => ipcRenderer.invoke('shia:list-ziyarat'),
    getZiyarah:     (id) => ipcRenderer.invoke('shia:get-ziyarah', { id }),
    listTaqibat:    () => ipcRenderer.invoke('shia:list-taqibat'),
    getTasbihZahra: () => ipcRenderer.invoke('shia:get-tasbih-zahra'),
    listEvents:     () => ipcRenderer.invoke('shia:list-events'),
    eventsForDate:  (month, day) => ipcRenderer.invoke('shia:events-for-date', { month, day }),
  },
  slideshow: {
    getState:   () => ipcRenderer.invoke('slideshow:get-state'),
    command:    (command, payload) => ipcRenderer.invoke('slideshow:command', { command, payload }),
    openShia:   (kind, id) => ipcRenderer.invoke('slideshow:open-shia', { kind, id }),
    openCustom: (payload) => ipcRenderer.invoke('slideshow:open-custom', payload || {}),
    onState:    (callback) => bindChannel('slideshow:state', callback),
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    checkNow: () => ipcRenderer.invoke('updater:check-now'),
    onState:  (callback) => bindChannel('updater:state', callback),
  },
  // Wall-bridge: composed snapshot of config + prayer times + Hijri +
  // events. The renderer reads this to populate the dashboard; main
  // process is the single source of truth. See bridge-ipc.js.
  bridge: {
    getSnapshot: () => ipcRenderer.invoke('mithnah-bridge:get-snapshot'),
    todayEvents: () => ipcRenderer.invoke('mithnah-bridge:today-events'),
  },
  marja: {
    list: () => ipcRenderer.invoke('marja:list'),
    get:  () => ipcRenderer.invoke('marja:get'),
    set:  (marjaId) => ipcRenderer.invoke('marja:set', { marjaId }),
  },
  // Feature-related privileged calls — PIN gate, auto-launch registration,
  // config import/export via a native dialog, Qibla computation. Kept on a
  // separate `app.*` namespace to mirror the privilege boundary.
  app: {
    setSettingsPin:    (payload) => ipcRenderer.invoke('app:set-settings-pin', payload),
    verifySettingsPin: (payload) => ipcRenderer.invoke('app:verify-settings-pin', payload),
    setAutoLaunch:     (payload) => ipcRenderer.invoke('app:set-auto-launch', payload),
    exportConfig:      () => ipcRenderer.invoke('app:export-config'),
    importConfig:      () => ipcRenderer.invoke('app:import-config'),
    qibla:             () => ipcRenderer.invoke('app:qibla'),
    kioskQuit:         (payload) => ipcRenderer.invoke('app:kiosk-quit', payload),
    getVersion:        async () => { const r = await ipcRenderer.invoke('app:get-version'); return r?.ok ? r.data : ''; },
    restartAndInstall: () => ipcRenderer.invoke('app:updater-restart-install'),
    onKioskUnlockRequest: (callback) => bindChannel('kiosk:unlock-request', callback),
    // Mobile-control remote commands targeted at the renderer
    // overlays (open the prayer tracker, advance it, etc). Main
    // forwards HTTP /api/tracker/command and socket events here.
    onTrackerCommand: (callback) => bindChannel('tracker:command', callback),
    onPickerCommand:  (callback) => bindChannel('picker:command', callback),
  }
});
