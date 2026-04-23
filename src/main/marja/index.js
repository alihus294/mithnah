// Marja registry. For each recognised Shia Twelver marja-taqlid, we
// bundle a preset that (a) picks the prayer-time method they're most
// commonly associated with and (b) suggests a default
// `calendarDayOffset` that usually matches their published Hijri
// announcements.
//
// IMPORTANT on Maghrib: the Shia astronomical maghrib (ذهاب الحمرة
// المشرقية) is already baked into the Jafari and Tehran methods via
// `maghribAngle` (4° and 4.5° below horizon respectively, ~16-18 min
// after sunset at typical mosque latitudes). Adding an ADDITIONAL
// `maghribDelayMinutes` on top — as earlier versions of this file did
// with values of 13–17 — effectively double-delays maghrib to ~30 min
// after sunset, which is an astronomical error every Shia operator
// we tested with flagged immediately. All marja presets now set
// `maghribDelayMinutes: 0`. The field is still honoured at the config
// layer so an operator can manually add a few minutes of iqama delay
// on top of the astronomical maghrib if their mosque schedules it.
//
// These are DEFAULTS — real mosques should override when the marja's
// office publishes a specific month's calendar. Marja announcements can
// differ from any calculation by up to a day.
//
// Entries sourced from public statements of each marja's office. Values
// are "best effort", not doctrinal claims. Operators who follow a marja
// whose published calendar consistently differs from these defaults
// should tweak `calendarDayOffset` manually through the settings UI.

const MARJAS = [
  {
    id: 'sistani',
    ar: 'السيد علي السيستاني',
    en: 'Ayatollah al-Sistani',
    office: 'النجف الأشرف',
    // Sistani follows astronomical sighting; `islamic-umalqura` is often
    // close to his announcements for Najaf. Jafari (Leva) angles for
    // prayer with ~15 min Maghrib delay (ذهاب الحمرة المشرقية).
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'khamenei',
    ar: 'السيد علي الخامنئي',
    en: 'Ayatollah Khamenei',
    office: 'طهران',
    // Khamenei's office follows the Iranian official calendar (Institute
    // of Geophysics Tehran for prayer). Maghrib delay typically ~14 min.
    preset: {
      method: 'Tehran',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'sadr',
    ar: 'السيد محمد الصدر (رض)',
    en: 'Ayatollah al-Sadr (ra)',
    office: 'النجف (مقلدوه)',
    // Followers of the late Martyr al-Sadr commonly pair with Leva angles.
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'makarem',
    ar: 'الشيخ ناصر مكارم الشيرازي',
    en: 'Ayatollah Makarem Shirazi',
    office: 'قم',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'wahid',
    ar: 'الشيخ حسين وحيد الخراساني',
    en: 'Ayatollah Wahid Khorasani',
    office: 'قم',
    preset: {
      method: 'Tehran',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'safi',
    ar: 'الشيخ لطف الله صافي الگلپايگاني (رض)',
    en: 'Ayatollah Safi Golpaygani (ra)',
    office: 'قم',
    preset: {
      method: 'Tehran',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'shubairi',
    ar: 'السيد موسى شبيري زنجاني',
    en: 'Ayatollah Shubairi Zanjani',
    office: 'قم',
    preset: {
      method: 'Tehran',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'bashir-najafi',
    ar: 'الشيخ بشير النجفي',
    en: 'Ayatollah Bashir al-Najafi',
    office: 'النجف',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'hakim',
    ar: 'السيد محمد سعيد الحكيم (رض)',
    en: 'Ayatollah Muhammad Saeed al-Hakim (ra)',
    office: 'النجف',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'fayyadh',
    ar: 'الشيخ محمد إسحاق الفياض',
    en: 'Ayatollah Muhammad Ishaq al-Fayyadh',
    office: 'النجف',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'modarresi',
    ar: 'السيد محمد تقي المدرسي',
    en: 'Ayatollah Muhammad Taqi al-Modarresi',
    office: 'كربلاء',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'fadlallah',
    ar: 'السيد محمد حسين فضل الله (رض)',
    en: 'Ayatollah Muhammad Husayn Fadlallah (ra)',
    office: 'بيروت',
    preset: {
      method: 'Jafari',
      maghribDelayMinutes: 0,
      calendar: 'jafari',
      calendarDayOffset: 0,
      fiqh: 'shia'
    }
  },
  {
    id: 'custom',
    ar: 'إعدادات مخصصة (بدون مرجع محدد)',
    en: 'Custom (no specific marja)',
    office: '',
    // Do NOT apply a preset; operator configures fields individually.
    preset: null
  }
];

const MARJA_IDS = new Set(MARJAS.map(m => m.id));

function listMarjas() {
  return MARJAS.map(m => ({ ...m, preset: m.preset ? { ...m.preset } : null }));
}

// Returns a deep copy so callers can't mutate the registry via preset.method etc.
function getMarja(id) {
  const m = MARJAS.find(x => x.id === id);
  if (!m) return null;
  return { ...m, preset: m.preset ? { ...m.preset } : null };
}

function isValidMarjaId(id) {
  return MARJA_IDS.has(id);
}

module.exports = { MARJAS, listMarjas, getMarja, isValidMarjaId };
