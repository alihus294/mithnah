// Region auto-detection for prayer-time defaults. Uses a coarse bounding-box
// check — good enough to pick a sensible default method; the user can always
// override in prayer-config.json.
//
// Mithnah is a Shia Ithna Ashari (Twelver) app. The global fallback is the
// Jafari (Leva Institute) method. Geofences for Shia-majority or large Shia
// minority areas keep Jafari; Sunni-majority areas with an established
// national method get that method so the app plays nicely in mixed contexts.

const REGIONS = [
  // Shia-Jafari regions — Mithnah is a Shia Twelver app, so EVERY
  // regional default is a Shia method. The Gulf entries pick
  // `JafariWide` (Fajr 18° astronomical) because that's the angle the
  // Qatif Astronomy Society publishes as the regional standard and
  // what the local mobile Shia calendars (تقويم الأحساء والقطيف)
  // display. The other Shia regions keep Leva (Qom, 16°) or Tehran
  // (Iran, 17.7°) matching their local marja tradition.
  { id: 'iran',          method: 'Tehran',     fiqh: 'shia', latMin: 25.0, latMax: 39.8, lngMin: 44.0, lngMax: 63.5 },
  { id: 'iraq',          method: 'Jafari',     fiqh: 'shia', latMin: 29.0, latMax: 37.5, lngMin: 38.5, lngMax: 48.8 },
  { id: 'lebanon',       method: 'Jafari',     fiqh: 'shia', latMin: 33.0, latMax: 34.7, lngMin: 35.0, lngMax: 36.6 },
  { id: 'bahrain',       method: 'JafariWide', fiqh: 'shia', latMin: 25.7, latMax: 26.4, lngMin: 50.3, lngMax: 50.8 },
  { id: 'azerbaijan',    method: 'Jafari',     fiqh: 'shia', latMin: 38.3, latMax: 41.9, lngMin: 44.7, lngMax: 50.5 },
  // Saudi Arabia, Kuwait, Qatar, UAE — these are Sunni-majority
  // nationally but the app's users are Shia communities (Ahsa, Qatif,
  // Kuwaiti Shia, Bahrain-adjacent, Gulf diaspora). Default to the
  // astronomical-fajr Shia method used by local calendars.
  { id: 'saudi_arabia',  method: 'JafariWide', fiqh: 'shia', latMin: 16.0, latMax: 32.5, lngMin: 34.0, lngMax: 56.5 },
  { id: 'qatar',         method: 'JafariWide', fiqh: 'shia', latMin: 24.4, latMax: 26.2, lngMin: 50.7, lngMax: 51.7 },
  { id: 'uae',           method: 'JafariWide', fiqh: 'shia', latMin: 22.5, latMax: 26.5, lngMin: 51.0, lngMax: 56.5 },
  { id: 'kuwait',        method: 'JafariWide', fiqh: 'shia', latMin: 28.5, latMax: 30.2, lngMin: 46.5, lngMax: 48.5 },
];

// Priority: tightest bounding boxes first so small states win over large
// neighbours they overlap with. E.g. UAE (4°×5.5°) sits inside Iran's
// latitude band across the Gulf — UAE must be checked first. Likewise
// Iraq (Najaf, Karbala) overlaps Iran's western edge — Iraq first so
// Najaf detects as Jafari (Leva), not Tehran.
const REGION_PRIORITY = [
  // Small Gulf states — tightest boxes, checked first
  'bahrain', 'qatar', 'lebanon', 'kuwait', 'uae',
  // Iraq before Saudi: Najaf (32.02, 44.33) sits inside BOTH Iraq and
  // Saudi's bounding boxes, and we want Najaf → Jafari (Leva).
  'iraq',
  // Saudi before Iran: Iran's lat box (25–39.8) extends south into
  // the Saudi Eastern Province coast (Ahsa 25.4, Qatif 26.5). Without
  // this ordering Ahsa would detect as Iran → Tehran (17.7°) instead
  // of Saudi → JafariWide (18°) which is the local schedule.
  'saudi_arabia',
  // Azerbaijan's box doesn't overlap Iran's northern extent, but
  // keeping it before Iran is harmless and clearer.
  'azerbaijan', 'iran'
];

function detectRegion(lat, lng) {
  for (const id of REGION_PRIORITY) {
    const r = REGIONS.find(x => x.id === id);
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) {
      return r;
    }
  }
  return null;
}

function defaultMethodFor(lat, lng) {
  const region = detectRegion(lat, lng);
  // Global fallback for a Shia Twelver app: Jafari (Leva), not MWL.
  return region ? region.method : 'Jafari';
}

function defaultFiqhFor(lat, lng) {
  const region = detectRegion(lat, lng);
  return region ? region.fiqh : 'shia';
}

// Default location is Najaf, Iraq — major Shia religious center. Overridden
// on first run once location detection (phase 5) resolves the actual device
// location, so this is only the pre-detection fallback.
function defaultConfig(lat = 32.0256, lng = 44.3269) {
  return {
    schemaVersion: 1,
    location: { lat, lng, name: 'Najaf' },
    method: defaultMethodFor(lat, lng),
    madhab: 'Shafi',
    fiqh: defaultFiqhFor(lat, lng),
    marja: null,
    onboardingCompleted: false,
    locationAccuracyMeters: null,
    locationSource: null,
    locationFixedAt: null,
    calendar: 'jafari',
    calendarDayOffset: 0,
    maghribDelayMinutes: 0,
    mosqueName: 'مئذنة',
    hideAsr: false,
    hideIsha: false,
    occasionOverride: 'auto',
    clockFormat: '12',
    adjustmentsMinutes: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    announcementText: '',
    // Announcement auto-hide. 0 = keep showing until manually dismissed
    // or the text is cleared; any positive integer is seconds until the
    // banner auto-hides. Re-shown whenever the text changes.
    announcementAutoHideSeconds: 0,
    settingsPinHash: null,
    // Free-form contact for the person the caretaker should call
    // when something breaks. Surfaced inside the Help overlay so an
    // operator who's stuck always sees who to phone. Empty by
    // default; the technician filling out the install writes their
    // own name + number here.
    supportContact: '',
    // Imam's name shown on the F5 prayer tracker so anyone walking
    // into the mosque mid-prayer can see who's leading and which
    // rakah they've reached. Free text; the technician sets it once
    // and updates if the imam changes.
    imamName: '',
    features: defaultFeatures()
  };
}

// Feature toggles — every user-facing feature with runtime behavior gets a
// boolean here, default true except destructive/sensitive ones (kiosk lock,
// PIN, announcement banner, auto-launch). Keep in sync with the UI list in
// SettingsOverlay.jsx and the KNOWN_FEATURES set in prayer-times/config.js.
function defaultFeatures() {
  return {
    maghribPivot: true,
    announcementBanner: false,
    ramadanCountdown: true,
    fridayKhutbahTimer: true,
    // Qibla default OFF per operator request (0.8.33). The Mithnah
     // mosque audience already faces qibla during prayer and the
     // badge was adding visual noise to the wall. Users who want it
     // can still enable it from F3 → متقدّم → عناصر العرض.
    qiblaDisplay: false,
    infalliblesRotator: true,
    // dhikrCounter removed — wall-display use case didn't justify it;
    // operator asked to remove it in 0.8.16 and the last traces were
    // swept in 0.8.28.
    autoContentToday: false,
    autoLaunch: false,
    kioskLock: false,
    settingsPin: false,
    configBackup: true,
    // Large-text accessibility mode. Aimed at elderly caretakers
    // with presbyopia. Scales every visible font ~1.25× via a CSS
    // selector on <html>[data-large-text="true"]. Default OFF so
    // the wall display stays at its design size for younger
    // operators or larger displays.
    largeText: false
  };
}

module.exports = { detectRegion, defaultMethodFor, defaultFiqhFor, defaultConfig, defaultFeatures, REGIONS };
