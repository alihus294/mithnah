const adhan = require('adhan');

// Method catalog. `id` is the stable key persisted in prayer-config.json and
// sent over IPC. `factory` returns fresh CalculationParameters (the adhan API
// expects a new object per call so manual adjustments don't leak between
// calculations).
//
// Mithnah is a Shia Ithna Ashari (Twelver) app. The two Jafari methods are
// listed first and are the recommended defaults. Sunni methods remain
// available for mixed-community installations.

// Custom Jafari (Leva Research Institute, Qom). adhan-js has no built-in
// "Jafari" — we build it from CalculationParameters with the angles used
// by the Leva Institute of Qom. Reference: https://www.leva.ir
function jafariLeva() {
  const p = new adhan.CalculationParameters('Jafari', 16, 14);
  p.maghribAngle = 4; // red-sky disappearance ~4° below horizon
  p.ishaInterval = 0;
  return p;
}

// Jafari with the "astronomical fajr" 18° angle. This is the classical
// fajr angle used by many Shia pocket-calendar mobile apps and is ALSO
// what the Qatif Astronomy Society (qasweb.org) labels "الفجر الفلكي"
// — the sun reaching 18° below the horizon. Some marjas and apps use
// this as the displayed fajr; others use a shallower angle that
// corresponds to when fajr is visible to the naked eye. Distinct from
// Leva (16°), Tehran (17.7°), and from the field-measured Qatif
// "intercepted fajr" (~15.5°). At Ahsa (25.43, 49.59) on 2026-04-21
// this yields Fajr 03:54 — the exact value the Ahsa operator's phone
// displays, which is why this method is offered alongside the others.
function jafariWide() {
  const p = new adhan.CalculationParameters('Jafari', 18, 14);
  p.maghribAngle = 4;
  p.ishaInterval = 0;
  return p;
}

// Qatif Astronomy Society field-observed standard (qasweb.org, 20-year
// field survey using naked-eye + MEAD LX 200 GPS 10" telescope). This
// is the empirically-observed Shia "intercepted fajr" (فجر الاعتراض):
//   Fajr:    15.5° below horizon
//   Maghrib: 4° below horizon (ذهاب الحمرة المشرقية)
//   Isha:    90 minutes after sunset (fixed interval, following Umm
//            al-Qura methodology since the society did not publish a
//            distinct Isha angle)
// Documented at https://qasweb.org/qas-standards/?p=210 as the Qatif
// region standard, used by al-fajr.today and derived calendars in
// Qatif, Ahsa, and the Eastern Province of Saudi Arabia.
function qatifShia() {
  const p = new adhan.CalculationParameters('QatifShia', 15.5, 0);
  p.maghribAngle = 4;
  p.ishaInterval = 90; // minutes after maghrib
  return p;
}

const METHODS = [
  {
    id: 'Jafari',
    en: 'Jafari — Leva Institute (Qom)',
    ar: 'الجعفري — مؤسسة ليوا للأبحاث (قم)',
    region: 'Shia Ithna Ashari — global default',
    fiqh: 'shia',
    description: 'Fajr 16°, Isha 14°, Maghrib 4° below horizon. Recommended for Shia Twelver communities worldwide.',
    factory: jafariLeva
  },
  {
    id: 'JafariWide',
    en: 'Jafari — Ahsa / Qatif Astronomical (Fajr 18°)',
    ar: 'الجعفري — تقويم الأحساء والقطيف (الفجر الفلكي ١٨°)',
    region: 'Ahsa, Qatif, Eastern Saudi Arabia',
    fiqh: 'shia',
    description: 'Fajr 18° (الفجر الفلكي), Isha 14°, Maghrib 4° below horizon. Matches the "Jafari Ithna Ashari" preset in Gulf Shia phone apps and the astronomical-fajr value published by Qatif Astronomy Society.',
    factory: jafariWide
  },
  {
    id: 'QatifShia',
    en: 'Qatif Astronomy Society — field-observed Shia',
    ar: 'جمعية الفلك بالقطيف — الرصد الميداني',
    region: 'Qatif, Ahsa, Bahrain, Eastern Saudi Arabia',
    fiqh: 'shia',
    description: 'Fajr 15.5° (field-observed intercepted fajr, فجر الاعتراض), Isha 90 min after sunset, Maghrib 4° below horizon. Published standard of جمعية الفلك بالقطيف after a 20-year observational study of fajr in the Eastern Province.',
    factory: qatifShia
  },
  {
    id: 'Tehran',
    en: 'Jafari — Institute of Geophysics (Tehran)',
    ar: 'الجعفري — مؤسسة الجيوفيزياء (طهران)',
    region: 'Iran, Shia communities',
    fiqh: 'shia',
    description: 'Fajr 17.7°, Isha 14°, Maghrib 4.5° below horizon. Official method in Iran.',
    factory: () => adhan.CalculationMethod.Tehran()
  },
  {
    id: 'UmmAlQura',
    en: 'Umm al-Qura (Makkah)',
    ar: 'أم القرى (مكة المكرمة)',
    region: 'Saudi Arabia and surrounding region',
    fiqh: 'sunni',
    description: 'Official method of Saudi Arabia. Fajr 18.5°, Isha 90 min fixed after maghrib (120 min in Ramadan).',
    factory: () => adhan.CalculationMethod.UmmAlQura()
  },
  {
    id: 'MuslimWorldLeague',
    en: 'Muslim World League',
    ar: 'رابطة العالم الإسلامي',
    region: 'Europe, Far East, parts of US',
    fiqh: 'sunni',
    description: 'Fajr 18°, Isha 17°. Common default when region is uncertain.',
    factory: () => adhan.CalculationMethod.MuslimWorldLeague()
  },
  {
    id: 'Egyptian',
    en: 'Egyptian General Authority',
    ar: 'الهيئة المصرية العامة للمساحة',
    region: 'Egypt, Syria, Iraq, Lebanon, Malaysia',
    fiqh: 'sunni',
    description: 'Fajr 19.5°, Isha 17.5°.',
    factory: () => adhan.CalculationMethod.Egyptian()
  },
  {
    id: 'Karachi',
    en: 'University of Islamic Sciences, Karachi',
    ar: 'جامعة العلوم الإسلامية، كراتشي',
    region: 'Pakistan, Bangladesh, India, Afghanistan',
    fiqh: 'sunni',
    description: 'Fajr 18°, Isha 18°.',
    factory: () => adhan.CalculationMethod.Karachi()
  },
  {
    id: 'Dubai',
    en: 'UAE — Dubai',
    ar: 'الإمارات — دبي',
    region: 'UAE',
    fiqh: 'sunni',
    description: 'Fajr 18.2°, Isha 18.2°.',
    factory: () => adhan.CalculationMethod.Dubai()
  },
  {
    id: 'Qatar',
    en: 'Qatar',
    ar: 'قطر',
    region: 'Qatar',
    fiqh: 'sunni',
    description: 'Fajr 18°, Isha 90 min fixed after maghrib.',
    factory: () => adhan.CalculationMethod.Qatar()
  },
  {
    id: 'Kuwait',
    en: 'Kuwait',
    ar: 'الكويت',
    region: 'Kuwait',
    fiqh: 'sunni',
    description: 'Fajr 18°, Isha 17.5°.',
    factory: () => adhan.CalculationMethod.Kuwait()
  },
  {
    id: 'Singapore',
    en: 'Majlis Ugama Islam Singapura',
    ar: 'مجلس العلماء الإسلامي — سنغافورة',
    region: 'Singapore, Malaysia, Indonesia',
    fiqh: 'sunni',
    description: 'Fajr 20°, Isha 18°.',
    factory: () => adhan.CalculationMethod.Singapore()
  },
  {
    id: 'Turkey',
    en: 'Diyanet İşleri Başkanlığı',
    ar: 'رئاسة الشؤون الدينية — تركيا',
    region: 'Turkey',
    fiqh: 'sunni',
    description: 'Turkish Presidency of Religious Affairs. Fajr 18°, Isha 17°.',
    factory: () => adhan.CalculationMethod.Turkey()
  },
  {
    id: 'NorthAmerica',
    en: 'ISNA (Islamic Society of North America)',
    ar: 'الجمعية الإسلامية لأمريكا الشمالية',
    region: 'North America',
    fiqh: 'sunni',
    description: 'Fajr 15°, Isha 15°. Widely used in US/Canada.',
    factory: () => adhan.CalculationMethod.NorthAmerica()
  },
  {
    id: 'MoonsightingCommittee',
    en: 'Moonsighting Committee Worldwide',
    ar: 'لجنة رؤية الهلال العالمية',
    region: 'Global',
    fiqh: 'sunni',
    description: 'Fajr 18°, Isha 18°, with seasonal adjustments for high latitudes.',
    factory: () => adhan.CalculationMethod.MoonsightingCommittee()
  }
];

const METHOD_IDS = new Set(METHODS.map(m => m.id));

// "Auto" is not a real method — it's a sentinel telling the calculator to
// resolve the right method from the current GPS coordinates via
// detectRegion() each time. Treated as valid for config purposes; the cache
// resolves it to a concrete method before handing to adhan-js.
const AUTO_METHOD = {
  id: 'Auto',
  en: 'Auto — detect from GPS',
  ar: 'تلقائي — من موقع GPS',
  region: 'Auto-detected per location',
  fiqh: 'auto',
  description: 'Automatically selects the regionally-appropriate calculation method from the current GPS coordinates. Falls back to Jafari (Leva, Qom) outside recognized regions.'
};

function getMethod(id) {
  if (id === 'Auto') return AUTO_METHOD;
  return METHODS.find(m => m.id === id) || null;
}

function isValidMethodId(id) {
  return id === 'Auto' || METHOD_IDS.has(id);
}

function listMethods() {
  const real = METHODS.map(({ factory, ...meta }) => meta);
  return [{ ...AUTO_METHOD }, ...real];
}

const MADHABS = [
  { id: 'Shafi', en: 'Standard (Shia Jafari / Shafi / Maliki / Hanbali)', ar: 'الجعفري والشافعي والمالكي والحنبلي (العصر الأول)' },
  { id: 'Hanafi', en: 'Hanafi (later Asr)', ar: 'الحنفي (العصر الثاني)' }
];

module.exports = { METHODS, listMethods, getMethod, isValidMethodId, MADHABS };
