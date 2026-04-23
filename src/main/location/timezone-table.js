// IANA timezone -> representative city coordinates. Used as an offline
// fallback when the app can't get a precise location (no HTML5 geolocation,
// no IP lookup, since we're offline-first).
//
// Coordinates are the timezone's canonical/largest city. For Shia-majority
// areas we prefer a Shia-significant city (Najaf over Baghdad for Asia/Baghdad)
// so that Shia Twelver defaults work well even before the user confirms.
//
// Not exhaustive — covers the timezones a Shia mosque-display deployment is
// most likely to be installed in, plus general fallbacks for major Muslim
// communities worldwide. Missing timezones fall through to the global default.

const TIMEZONES = {
  // Arab world + Middle East
  'Asia/Baghdad':    { lat: 32.0256, lng: 44.3269, name: 'Najaf',      nameAr: 'النجف',      country: 'IQ' },
  'Asia/Tehran':     { lat: 35.6892, lng: 51.3890, name: 'Tehran',     nameAr: 'طهران',      country: 'IR' },
  'Asia/Riyadh':     { lat: 24.7136, lng: 46.6753, name: 'Riyadh',     nameAr: 'الرياض',     country: 'SA' },
  'Asia/Dubai':      { lat: 25.2048, lng: 55.2708, name: 'Dubai',      nameAr: 'دبي',        country: 'AE' },
  'Asia/Qatar':      { lat: 25.2854, lng: 51.5310, name: 'Doha',       nameAr: 'الدوحة',     country: 'QA' },
  'Asia/Bahrain':    { lat: 26.0667, lng: 50.5577, name: 'Manama',     nameAr: 'المنامة',    country: 'BH' },
  'Asia/Kuwait':     { lat: 29.3759, lng: 47.9774, name: 'Kuwait City', nameAr: 'مدينة الكويت', country: 'KW' },
  'Asia/Beirut':     { lat: 33.8938, lng: 35.5018, name: 'Beirut',     nameAr: 'بيروت',      country: 'LB' },
  'Asia/Damascus':   { lat: 33.5138, lng: 36.2765, name: 'Damascus',   nameAr: 'دمشق',       country: 'SY' },
  'Asia/Amman':      { lat: 31.9454, lng: 35.9284, name: 'Amman',      nameAr: 'عمّان',      country: 'JO' },
  'Asia/Muscat':     { lat: 23.5880, lng: 58.3829, name: 'Muscat',     nameAr: 'مسقط',       country: 'OM' },
  'Asia/Aden':       { lat: 12.7797, lng: 45.0095, name: 'Aden',       nameAr: 'عدن',        country: 'YE' },
  'Asia/Jerusalem':  { lat: 31.7683, lng: 35.2137, name: 'Al-Quds',    nameAr: 'القدس',      country: 'PS' },
  'Asia/Gaza':       { lat: 31.5017, lng: 34.4667, name: 'Gaza',       nameAr: 'غزة',        country: 'PS' },
  'Asia/Hebron':     { lat: 31.5326, lng: 35.0998, name: 'Hebron',     nameAr: 'الخليل',     country: 'PS' },
  'Africa/Cairo':    { lat: 30.0444, lng: 31.2357, name: 'Cairo',      nameAr: 'القاهرة',    country: 'EG' },
  'Africa/Khartoum': { lat: 15.5007, lng: 32.5599, name: 'Khartoum',   nameAr: 'الخرطوم',    country: 'SD' },
  'Africa/Algiers':  { lat: 36.7372, lng: 3.0866,  name: 'Algiers',    nameAr: 'الجزائر',    country: 'DZ' },
  'Africa/Tunis':    { lat: 36.8065, lng: 10.1815, name: 'Tunis',      nameAr: 'تونس',       country: 'TN' },
  'Africa/Casablanca': { lat: 33.5731, lng: -7.5898, name: 'Casablanca', nameAr: 'الدار البيضاء', country: 'MA' },
  'Africa/Tripoli':  { lat: 32.8872, lng: 13.1913, name: 'Tripoli',    nameAr: 'طرابلس',     country: 'LY' },

  // South and central Asia
  'Asia/Karachi':    { lat: 24.8607, lng: 67.0011, name: 'Karachi',    nameAr: 'كراتشي',     country: 'PK' },
  'Asia/Kabul':      { lat: 34.5553, lng: 69.2075, name: 'Kabul',      nameAr: 'كابول',      country: 'AF' },
  'Asia/Baku':       { lat: 40.4093, lng: 49.8671, name: 'Baku',       nameAr: 'باكو',       country: 'AZ' },
  'Asia/Yerevan':    { lat: 40.1792, lng: 44.4991, name: 'Yerevan',    nameAr: 'يريفان',     country: 'AM' },
  'Asia/Tashkent':   { lat: 41.2995, lng: 69.2401, name: 'Tashkent',   nameAr: 'طشقند',      country: 'UZ' },
  'Asia/Dushanbe':   { lat: 38.5598, lng: 68.7870, name: 'Dushanbe',   nameAr: 'دوشنبه',     country: 'TJ' },
  'Asia/Ashgabat':   { lat: 37.9601, lng: 58.3261, name: 'Ashgabat',   nameAr: 'عشق آباد',   country: 'TM' },
  'Asia/Almaty':     { lat: 43.2220, lng: 76.8512, name: 'Almaty',     nameAr: 'ألما آتا',    country: 'KZ' },
  'Asia/Bishkek':    { lat: 42.8746, lng: 74.5698, name: 'Bishkek',    nameAr: 'بيشكيك',     country: 'KG' },
  'Asia/Kolkata':    { lat: 19.0760, lng: 72.8777, name: 'Mumbai',     nameAr: 'مومباي',     country: 'IN' },
  'Asia/Dhaka':      { lat: 23.8103, lng: 90.4125, name: 'Dhaka',      nameAr: 'دكا',        country: 'BD' },
  'Asia/Colombo':    { lat: 6.9271,  lng: 79.8612, name: 'Colombo',    nameAr: 'كولومبو',    country: 'LK' },

  // Turkey + Europe
  'Europe/Istanbul': { lat: 41.0082, lng: 28.9784, name: 'Istanbul',   nameAr: 'إسطنبول',    country: 'TR' },
  'Europe/London':   { lat: 51.5074, lng: -0.1278, name: 'London',     nameAr: 'لندن',       country: 'GB' },
  'Europe/Paris':    { lat: 48.8566, lng: 2.3522,  name: 'Paris',      nameAr: 'باريس',      country: 'FR' },
  'Europe/Berlin':   { lat: 52.5200, lng: 13.4050, name: 'Berlin',     nameAr: 'برلين',      country: 'DE' },
  'Europe/Rome':     { lat: 41.9028, lng: 12.4964, name: 'Rome',       nameAr: 'روما',       country: 'IT' },
  'Europe/Madrid':   { lat: 40.4168, lng: -3.7038, name: 'Madrid',     nameAr: 'مدريد',      country: 'ES' },
  'Europe/Moscow':   { lat: 55.7558, lng: 37.6173, name: 'Moscow',     nameAr: 'موسكو',      country: 'RU' },
  'Europe/Amsterdam': { lat: 52.3676, lng: 4.9041, name: 'Amsterdam',  nameAr: 'أمستردام',   country: 'NL' },
  'Europe/Brussels': { lat: 50.8503, lng: 4.3517,  name: 'Brussels',   nameAr: 'بروكسل',     country: 'BE' },
  'Europe/Stockholm': { lat: 59.3293, lng: 18.0686, name: 'Stockholm', nameAr: 'ستوكهولم',   country: 'SE' },

  // Southeast Asia
  'Asia/Jakarta':    { lat: -6.2088, lng: 106.8456, name: 'Jakarta',   nameAr: 'جاكرتا',     country: 'ID' },
  'Asia/Kuala_Lumpur': { lat: 3.1390, lng: 101.6869, name: 'Kuala Lumpur', nameAr: 'كوالالمبور', country: 'MY' },
  'Asia/Singapore':  { lat: 1.3521,  lng: 103.8198, name: 'Singapore', nameAr: 'سنغافورة',   country: 'SG' },

  // Americas
  'America/New_York': { lat: 40.7128, lng: -74.0060, name: 'New York', nameAr: 'نيويورك',    country: 'US' },
  'America/Los_Angeles': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles', nameAr: 'لوس أنجلوس', country: 'US' },
  'America/Chicago': { lat: 41.8781, lng: -87.6298, name: 'Chicago',   nameAr: 'شيكاغو',     country: 'US' },
  'America/Toronto': { lat: 43.6532, lng: -79.3832, name: 'Toronto',   nameAr: 'تورنتو',     country: 'CA' },
  'America/Vancouver': { lat: 49.2827, lng: -123.1207, name: 'Vancouver', nameAr: 'فانكوفر', country: 'CA' },

  // Africa
  'Africa/Lagos':    { lat: 6.5244,  lng: 3.3792,  name: 'Lagos',      nameAr: 'لاغوس',      country: 'NG' },
  'Africa/Nairobi':  { lat: -1.2921, lng: 36.8219, name: 'Nairobi',    nameAr: 'نيروبي',     country: 'KE' },
  'Africa/Johannesburg': { lat: -26.2041, lng: 28.0473, name: 'Johannesburg', nameAr: 'جوهانسبرغ', country: 'ZA' },

  // Oceania
  'Australia/Sydney': { lat: -33.8688, lng: 151.2093, name: 'Sydney', nameAr: 'سيدني',       country: 'AU' }
};

// Global fallback — Najaf (Shia Twelver center). Used when we can't match
// the system timezone.
const GLOBAL_FALLBACK = { lat: 32.0256, lng: 44.3269, name: 'Najaf', nameAr: 'النجف', country: 'IQ' };

function lookup(timezone) {
  if (!timezone || typeof timezone !== 'string') return null;
  return TIMEZONES[timezone] || null;
}

module.exports = { TIMEZONES, GLOBAL_FALLBACK, lookup };
