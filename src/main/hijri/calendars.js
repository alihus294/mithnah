// Hijri calendar variants supported by Mithnah.
//
// The heavy lifting is done by ECMAScript Intl.DateTimeFormat, which supports
// several Islamic calendars via Unicode BCP-47 extensions (-u-ca-...). We
// wrap those and expose a consistent API plus a Shia-specific "jafari"
// variant that can apply a configurable day offset so communities whose
// marja announces sightings a day off from pure astronomical can still pin
// their calendar to the right day.
//
// Variants:
//   - jafari           Shia Ithna Ashari default. Astronomical calendar with
//                      optional day offset (dayOffset field on the variant).
//                      Suitable for most Shia Twelver communities; some
//                      marjas (Sistani, Khamenei) announce sightings that
//                      can differ from pure astronomical by 0-1 day.
//   - umm-al-qura      Saudi Arabia official (tabulated). Widely used.
//   - islamic-civil    Tabular civil Hijri (1/1/1 AH = 16 July 622 CE).
//                      Arithmetic; can be off by 1-2 days from sighting.
//   - islamic-tbla     Tabular astronomical base (15 July 622 CE).
//   - astronomical     Pure astronomical ("islamic" in Intl).

const CALENDARS = [
  {
    id: 'jafari',
    en: 'Jafari (Shia Ithna Ashari)',
    ar: 'الجعفري (الشيعي الإثنا عشري)',
    intlCalendar: 'islamic',
    dayOffset: 0,
    // Honest description: ICU's 'islamic' calendar is tabular-civil on every
    // Electron we currently ship against (Electron 28 / Chromium 120). The
    // "Shia" aspect of this variant is really the `dayOffset` — which
    // defaults to 0 but is set per-marja by the marja picker (Sistani/
    // Khamenei/etc). Actual moon-sighting announcements still diverge from
    // any pure calculation; operators whose marja publishes a different
    // calendar should set `calendarDayOffset` to match.
    description: 'تقويم ICU الإسلامي الحسابي مع إزاحة يومية قابلة للضبط حسب إعلان المرجع (السيستاني/الخامنئي/غيرهم).',
    isDefault: true
  },
  {
    id: 'umm-al-qura',
    en: 'Umm al-Qura (Saudi Arabia)',
    ar: 'أم القرى (السعودي)',
    intlCalendar: 'islamic-umalqura',
    description: 'Official Saudi calendar (tabulated). Used in most Sunni-majority countries.'
  },
  {
    id: 'islamic-civil',
    en: 'Tabular Islamic Civil',
    ar: 'الإسلامي الحسابي (مدني)',
    intlCalendar: 'islamic-civil',
    description: 'Arithmetic tabular Hijri (1/1/1 AH = 16 July 622 CE). Deterministic, never needs sighting.'
  },
  {
    id: 'islamic-tbla',
    en: 'Tabular Islamic (astronomical base)',
    ar: 'الإسلامي الحسابي (فلكي)',
    intlCalendar: 'islamic-tbla',
    description: 'Arithmetic tabular Hijri with astronomical epoch (1/1/1 AH = 15 July 622 CE).'
  },
  {
    id: 'intl-islamic',
    en: 'Intl "islamic" (tabular-civil on current Electron)',
    ar: 'تقويم Intl الإسلامي (جدولي مدني في Electron الحالي)',
    intlCalendar: 'islamic',
    // On modern V8 / ICU, the `islamic` calendar is tabular-civil with a
    // Thursday epoch — NOT astronomical despite its name in older docs.
    // We keep it as a variant for transparency but no longer claim
    // "astronomical" in the label.
    description: 'تقويم ICU المُسمّى "islamic" — يستخدم حساب جدولي مع بداية يوم الخميس.'
  }
];

const CALENDAR_IDS = new Set(CALENDARS.map(c => c.id));

function isValidCalendarId(id) {
  return CALENDAR_IDS.has(id);
}

function getCalendar(id) {
  return CALENDARS.find(c => c.id === id) || null;
}

function listCalendars() {
  return CALENDARS.map(({ ...c }) => c);
}

const HIJRI_MONTHS = [
  { index: 1,  ar: 'محرم',              en: 'Muharram' },
  { index: 2,  ar: 'صفر',               en: 'Safar' },
  { index: 3,  ar: 'ربيع الأول',        en: 'Rabi al-Awwal' },
  { index: 4,  ar: 'ربيع الآخر',        en: 'Rabi al-Thani' },
  { index: 5,  ar: 'جمادى الأولى',      en: 'Jumada al-Awwal' },
  { index: 6,  ar: 'جمادى الآخرة',      en: 'Jumada al-Thani' },
  { index: 7,  ar: 'رجب',               en: 'Rajab' },
  { index: 8,  ar: 'شعبان',             en: 'Shaʿban' },
  { index: 9,  ar: 'رمضان',             en: 'Ramadan' },
  { index: 10, ar: 'شوال',              en: 'Shawwal' },
  { index: 11, ar: 'ذو القعدة',         en: 'Dhul-Qaʿdah' },
  { index: 12, ar: 'ذو الحجة',          en: 'Dhul-Hijjah' }
];

function getMonthName(index, lang = 'ar') {
  const m = HIJRI_MONTHS.find(x => x.index === index);
  if (!m) return null;
  return lang === 'en' ? m.en : m.ar;
}

module.exports = {
  CALENDARS,
  listCalendars,
  isValidCalendarId,
  getCalendar,
  HIJRI_MONTHS,
  getMonthName
};
