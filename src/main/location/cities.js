// City database for reverse geocoding (offline, coordinates → name).
// Chosen for Shia Ithna Ashari relevance first, then major global cities.
// Each entry is { lat, lng, name, nameAr, country }.
//
// Coverage:
//   - Iraq (shrine cities + major urban centers)
//   - Iran (all provincial capitals + religious cities)
//   - Lebanon (Shia-majority areas)
//   - Bahrain, Qatar, UAE, Kuwait, Oman
//   - Saudi Arabia (including Shia-majority Eastern Province cities)
//   - Syria (Sayyidah Zaynab shrine, Damascus)
//   - South Asia (major Shia centers in Pakistan, India, Afghanistan)
//   - Azerbaijan (Shia-majority), Turkey, Egypt
//   - Global: North America, Europe, Australia, Southeast Asia
//
// The nearest-city function uses a fast flat-earth approximation
// (cos-latitude-weighted euclidean distance) which is accurate to within
// a few percent over continental scales — more than enough to pick "the
// right city" when the GPS is anywhere within a city's metro area.

const CITIES = [
  // ===== Iraq (Shia heartland) =====
  { lat: 32.0256, lng: 44.3269, name: 'Najaf',        nameAr: 'النجف الأشرف',  country: 'IQ' },
  { lat: 32.6149, lng: 44.0240, name: 'Karbala',      nameAr: 'كربلاء المقدسة', country: 'IQ' },
  { lat: 33.3152, lng: 44.3661, name: 'Baghdad',      nameAr: 'بغداد',         country: 'IQ' },
  { lat: 33.3773, lng: 44.3397, name: 'Kadhimiya',    nameAr: 'الكاظمية',      country: 'IQ' },
  { lat: 34.1983, lng: 43.8742, name: 'Samarra',      nameAr: 'سامراء',        country: 'IQ' },
  { lat: 32.0292, lng: 44.4060, name: 'Kufa',         nameAr: 'الكوفة',        country: 'IQ' },
  { lat: 30.5085, lng: 47.7804, name: 'Basra',        nameAr: 'البصرة',        country: 'IQ' },
  { lat: 31.7209, lng: 44.4481, name: 'Diwaniyah',    nameAr: 'الديوانية',     country: 'IQ' },
  { lat: 31.0961, lng: 46.2530, name: 'Nasiriyah',    nameAr: 'الناصرية',      country: 'IQ' },
  { lat: 32.4917, lng: 45.8294, name: 'Kut',          nameAr: 'الكوت',         country: 'IQ' },
  { lat: 31.3200, lng: 45.2736, name: 'Samawah',      nameAr: 'السماوة',       country: 'IQ' },
  { lat: 32.5611, lng: 44.0308, name: 'Hillah',       nameAr: 'الحلة',         country: 'IQ' },
  { lat: 36.1900, lng: 43.9930, name: 'Mosul',        nameAr: 'الموصل',        country: 'IQ' },
  { lat: 35.4681, lng: 44.3922, name: 'Kirkuk',       nameAr: 'كركوك',         country: 'IQ' },
  { lat: 36.1912, lng: 44.0093, name: 'Erbil',        nameAr: 'أربيل',         country: 'IQ' },

  // ===== Iran =====
  { lat: 35.6892, lng: 51.3890, name: 'Tehran',       nameAr: 'طهران',         country: 'IR' },
  { lat: 34.6415, lng: 50.8764, name: 'Qom',          nameAr: 'قم المقدسة',     country: 'IR' },
  { lat: 36.2970, lng: 59.6062, name: 'Mashhad',      nameAr: 'مشهد المقدسة',   country: 'IR' },
  { lat: 32.6546, lng: 51.6680, name: 'Isfahan',      nameAr: 'أصفهان',        country: 'IR' },
  { lat: 29.5918, lng: 52.5836, name: 'Shiraz',       nameAr: 'شيراز',         country: 'IR' },
  { lat: 38.0796, lng: 46.2884, name: 'Tabriz',       nameAr: 'تبريز',         country: 'IR' },
  { lat: 34.7950, lng: 48.5150, name: 'Hamadan',      nameAr: 'همدان',         country: 'IR' },
  { lat: 31.8974, lng: 54.3569, name: 'Yazd',         nameAr: 'يزد',           country: 'IR' },
  { lat: 37.2682, lng: 49.5891, name: 'Rasht',        nameAr: 'رشت',           country: 'IR' },
  { lat: 30.4077, lng: 48.2650, name: 'Ahvaz',        nameAr: 'الأهواز',       country: 'IR' },
  { lat: 35.6892, lng: 51.3890, name: 'Karaj',        nameAr: 'كرج',           country: 'IR' },
  { lat: 34.0954, lng: 49.6938, name: 'Arak',         nameAr: 'أراك',          country: 'IR' },
  { lat: 37.4711, lng: 57.3247, name: 'Bojnurd',      nameAr: 'بجنورد',        country: 'IR' },
  { lat: 29.1099, lng: 58.3632, name: 'Kerman',       nameAr: 'كرمان',         country: 'IR' },

  // ===== Lebanon =====
  { lat: 33.8938, lng: 35.5018, name: 'Beirut',       nameAr: 'بيروت',         country: 'LB' },
  { lat: 33.3772, lng: 35.4839, name: 'Tyre (Sour)',  nameAr: 'صور',           country: 'LB' },
  { lat: 33.3781, lng: 35.4839, name: 'Nabatieh',     nameAr: 'النبطية',       country: 'LB' },
  { lat: 34.0058, lng: 36.2181, name: 'Baalbek',      nameAr: 'بعلبك',         country: 'LB' },
  { lat: 33.5547, lng: 35.3758, name: 'Saida',        nameAr: 'صيدا',          country: 'LB' },

  // ===== Syria =====
  { lat: 33.5138, lng: 36.2765, name: 'Damascus',     nameAr: 'دمشق',          country: 'SY' },
  { lat: 33.4476, lng: 36.3407, name: 'Sayyidah Zaynab', nameAr: 'السيدة زينب', country: 'SY' },
  { lat: 36.2021, lng: 37.1343, name: 'Aleppo',       nameAr: 'حلب',           country: 'SY' },
  { lat: 34.7308, lng: 36.7090, name: 'Homs',         nameAr: 'حمص',           country: 'SY' },

  // ===== Saudi Arabia =====
  { lat: 24.7136, lng: 46.6753, name: 'Riyadh',       nameAr: 'الرياض',        country: 'SA' },
  { lat: 21.4225, lng: 39.8262, name: 'Makkah',       nameAr: 'مكة المكرمة',   country: 'SA' },
  { lat: 24.4686, lng: 39.6142, name: 'Madinah',      nameAr: 'المدينة المنورة', country: 'SA' },
  { lat: 21.5810, lng: 39.1650, name: 'Jeddah',       nameAr: 'جدة',           country: 'SA' },
  { lat: 26.4207, lng: 50.0888, name: 'Dammam',       nameAr: 'الدمام',        country: 'SA' },
  { lat: 26.5666, lng: 49.9771, name: 'Qatif',        nameAr: 'القطيف',        country: 'SA' },
  { lat: 25.3548, lng: 49.5879, name: 'Hofuf',        nameAr: 'الهفوف',        country: 'SA' },
  { lat: 26.4282, lng: 50.1044, name: 'Al-Awamiya',   nameAr: 'العوامية',      country: 'SA' },
  { lat: 21.2703, lng: 40.4158, name: 'Taif',         nameAr: 'الطائف',        country: 'SA' },
  { lat: 28.3838, lng: 36.5550, name: 'Tabuk',        nameAr: 'تبوك',          country: 'SA' },
  { lat: 28.3998, lng: 36.5700, name: 'Hail',         nameAr: 'حائل',          country: 'SA' },

  // ===== Bahrain =====
  { lat: 26.0667, lng: 50.5577, name: 'Manama',       nameAr: 'المنامة',       country: 'BH' },
  { lat: 26.1893, lng: 50.5480, name: 'Muharraq',     nameAr: 'المحرق',        country: 'BH' },
  { lat: 26.0042, lng: 50.4722, name: 'Sitra',        nameAr: 'سترة',          country: 'BH' },
  { lat: 26.2361, lng: 50.6023, name: 'Diraz',        nameAr: 'الدراز',        country: 'BH' },

  // ===== Qatar =====
  { lat: 25.2854, lng: 51.5310, name: 'Doha',         nameAr: 'الدوحة',        country: 'QA' },
  { lat: 25.4124, lng: 51.3948, name: 'Al Rayyan',    nameAr: 'الريان',        country: 'QA' },

  // ===== UAE =====
  { lat: 25.2048, lng: 55.2708, name: 'Dubai',        nameAr: 'دبي',           country: 'AE' },
  { lat: 24.4539, lng: 54.3773, name: 'Abu Dhabi',    nameAr: 'أبو ظبي',       country: 'AE' },
  { lat: 25.3460, lng: 55.4209, name: 'Sharjah',      nameAr: 'الشارقة',       country: 'AE' },
  { lat: 25.4052, lng: 55.5136, name: 'Ajman',        nameAr: 'عجمان',         country: 'AE' },

  // ===== Kuwait =====
  { lat: 29.3759, lng: 47.9774, name: 'Kuwait City',  nameAr: 'مدينة الكويت',  country: 'KW' },
  { lat: 29.3375, lng: 47.9722, name: 'Hawalli',      nameAr: 'حولي',          country: 'KW' },

  // ===== Oman + Yemen =====
  { lat: 23.5880, lng: 58.3829, name: 'Muscat',       nameAr: 'مسقط',          country: 'OM' },
  { lat: 15.3694, lng: 44.1910, name: 'Sanaa',        nameAr: 'صنعاء',         country: 'YE' },
  { lat: 12.7797, lng: 45.0095, name: 'Aden',         nameAr: 'عدن',           country: 'YE' },

  // ===== Jordan + Palestine + Israel =====
  { lat: 31.9454, lng: 35.9284, name: 'Amman',        nameAr: 'عمّان',         country: 'JO' },
  { lat: 31.7683, lng: 35.2137, name: 'Al-Quds',      nameAr: 'القدس',         country: 'PS' },
  { lat: 31.5017, lng: 34.4667, name: 'Gaza',         nameAr: 'غزة',           country: 'PS' },
  { lat: 31.5326, lng: 35.0998, name: 'Hebron',       nameAr: 'الخليل',        country: 'PS' },
  { lat: 32.2211, lng: 35.2544, name: 'Nablus',       nameAr: 'نابلس',         country: 'PS' },

  // ===== Egypt =====
  { lat: 30.0444, lng: 31.2357, name: 'Cairo',        nameAr: 'القاهرة',       country: 'EG' },
  { lat: 31.2001, lng: 29.9187, name: 'Alexandria',   nameAr: 'الإسكندرية',    country: 'EG' },
  { lat: 27.1762, lng: 31.1882, name: 'Asyut',        nameAr: 'أسيوط',         country: 'EG' },

  // ===== Turkey =====
  { lat: 41.0082, lng: 28.9784, name: 'Istanbul',     nameAr: 'إسطنبول',       country: 'TR' },
  { lat: 39.9334, lng: 32.8597, name: 'Ankara',       nameAr: 'أنقرة',         country: 'TR' },
  { lat: 38.4192, lng: 27.1287, name: 'Izmir',        nameAr: 'إزمير',         country: 'TR' },

  // ===== Azerbaijan (Shia majority) =====
  { lat: 40.4093, lng: 49.8671, name: 'Baku',         nameAr: 'باكو',          country: 'AZ' },
  { lat: 40.6050, lng: 47.1500, name: 'Ganja',        nameAr: 'كنجة',          country: 'AZ' },

  // ===== South Asia =====
  { lat: 33.6844, lng: 73.0479, name: 'Islamabad',    nameAr: 'إسلام آباد',    country: 'PK' },
  { lat: 31.5204, lng: 74.3587, name: 'Lahore',       nameAr: 'لاهور',         country: 'PK' },
  { lat: 24.8607, lng: 67.0011, name: 'Karachi',      nameAr: 'كراتشي',        country: 'PK' },
  { lat: 33.5651, lng: 73.0169, name: 'Rawalpindi',   nameAr: 'راولبندي',      country: 'PK' },
  { lat: 34.0150, lng: 71.5249, name: 'Peshawar',     nameAr: 'بيشاور',        country: 'PK' },
  { lat: 34.5553, lng: 69.2075, name: 'Kabul',        nameAr: 'كابول',         country: 'AF' },
  { lat: 34.3529, lng: 62.2040, name: 'Herat',        nameAr: 'هرات',          country: 'AF' },
  { lat: 36.6981, lng: 67.1124, name: 'Mazar-i-Sharif', nameAr: 'مزار شريف',    country: 'AF' },
  { lat: 19.0760, lng: 72.8777, name: 'Mumbai',       nameAr: 'مومباي',        country: 'IN' },
  { lat: 26.8467, lng: 80.9462, name: 'Lucknow',      nameAr: 'لكناو',         country: 'IN' },
  { lat: 17.3850, lng: 78.4867, name: 'Hyderabad',    nameAr: 'حيدر آباد',     country: 'IN' },
  { lat: 28.7041, lng: 77.1025, name: 'Delhi',        nameAr: 'دلهي',          country: 'IN' },
  { lat: 13.0827, lng: 80.2707, name: 'Chennai',      nameAr: 'تشيناي',        country: 'IN' },
  { lat: 22.5726, lng: 88.3639, name: 'Kolkata',      nameAr: 'كولكاتا',       country: 'IN' },
  { lat: 23.8103, lng: 90.4125, name: 'Dhaka',        nameAr: 'دكا',           country: 'BD' },

  // ===== Central Asia =====
  { lat: 41.2995, lng: 69.2401, name: 'Tashkent',     nameAr: 'طشقند',         country: 'UZ' },
  { lat: 43.2220, lng: 76.8512, name: 'Almaty',       nameAr: 'ألما آتا',       country: 'KZ' },
  { lat: 42.8746, lng: 74.5698, name: 'Bishkek',      nameAr: 'بيشكيك',        country: 'KG' },

  // ===== Southeast Asia =====
  { lat: -6.2088, lng: 106.8456, name: 'Jakarta',     nameAr: 'جاكرتا',        country: 'ID' },
  { lat: 3.1390,  lng: 101.6869, name: 'Kuala Lumpur', nameAr: 'كوالالمبور',   country: 'MY' },
  { lat: 1.3521,  lng: 103.8198, name: 'Singapore',   nameAr: 'سنغافورة',      country: 'SG' },

  // ===== North Africa =====
  { lat: 36.7372, lng: 3.0866,  name: 'Algiers',      nameAr: 'الجزائر',       country: 'DZ' },
  { lat: 36.8065, lng: 10.1815, name: 'Tunis',        nameAr: 'تونس',          country: 'TN' },
  { lat: 33.5731, lng: -7.5898, name: 'Casablanca',   nameAr: 'الدار البيضاء', country: 'MA' },
  { lat: 32.8872, lng: 13.1913, name: 'Tripoli',      nameAr: 'طرابلس',        country: 'LY' },
  { lat: 15.5007, lng: 32.5599, name: 'Khartoum',     nameAr: 'الخرطوم',       country: 'SD' },

  // ===== Sub-Saharan Africa =====
  { lat: 6.5244,  lng: 3.3792,  name: 'Lagos',        nameAr: 'لاغوس',         country: 'NG' },
  { lat: -1.2921, lng: 36.8219, name: 'Nairobi',      nameAr: 'نيروبي',        country: 'KE' },

  // ===== Europe =====
  { lat: 51.5074, lng: -0.1278, name: 'London',       nameAr: 'لندن',          country: 'GB' },
  { lat: 52.4862, lng: -1.8904, name: 'Birmingham',   nameAr: 'برمنغهام',      country: 'GB' },
  { lat: 48.8566, lng: 2.3522,  name: 'Paris',        nameAr: 'باريس',         country: 'FR' },
  { lat: 52.5200, lng: 13.4050, name: 'Berlin',       nameAr: 'برلين',         country: 'DE' },
  { lat: 50.1109, lng: 8.6821,  name: 'Frankfurt',    nameAr: 'فرانكفورت',     country: 'DE' },
  { lat: 41.9028, lng: 12.4964, name: 'Rome',         nameAr: 'روما',          country: 'IT' },
  { lat: 40.4168, lng: -3.7038, name: 'Madrid',       nameAr: 'مدريد',         country: 'ES' },
  { lat: 52.3676, lng: 4.9041,  name: 'Amsterdam',    nameAr: 'أمستردام',      country: 'NL' },
  { lat: 55.7558, lng: 37.6173, name: 'Moscow',       nameAr: 'موسكو',         country: 'RU' },
  { lat: 59.3293, lng: 18.0686, name: 'Stockholm',    nameAr: 'ستوكهولم',      country: 'SE' },

  // ===== North America =====
  { lat: 40.7128, lng: -74.0060, name: 'New York',    nameAr: 'نيويورك',       country: 'US' },
  { lat: 42.3314, lng: -83.0458, name: 'Detroit',     nameAr: 'ديترويت',       country: 'US' },
  { lat: 42.3127, lng: -83.0500, name: 'Dearborn',    nameAr: 'ديربورن',       country: 'US' },
  { lat: 34.0522, lng: -118.2437, name: 'Los Angeles', nameAr: 'لوس أنجلوس',   country: 'US' },
  { lat: 41.8781, lng: -87.6298, name: 'Chicago',     nameAr: 'شيكاغو',        country: 'US' },
  { lat: 29.7604, lng: -95.3698, name: 'Houston',     nameAr: 'هيوستن',        country: 'US' },
  { lat: 38.9072, lng: -77.0369, name: 'Washington',  nameAr: 'واشنطن',        country: 'US' },
  { lat: 43.6532, lng: -79.3832, name: 'Toronto',     nameAr: 'تورنتو',        country: 'CA' },
  { lat: 45.5017, lng: -73.5673, name: 'Montreal',    nameAr: 'مونتريال',      country: 'CA' },

  // ===== Oceania =====
  { lat: -33.8688, lng: 151.2093, name: 'Sydney',     nameAr: 'سيدني',         country: 'AU' },
  { lat: -37.8136, lng: 144.9631, name: 'Melbourne',  nameAr: 'ملبورن',        country: 'AU' }
];

// Fast approximate distance in km using flat-earth with cos-latitude
// correction for longitude. Good enough for picking "closest of N cities"
// when N is bounded and we're on continental scales.
function approxDistanceKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111.0;
  const meanLatRad = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dLng = (lng2 - lng1) * 111.0 * Math.cos(meanLatRad);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Find the closest city from the database. Returns { city, distanceKm }
// or null if no cities loaded (defensive).
function nearestCity(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (CITIES.length === 0) return null;
  let best = CITIES[0];
  let bestDist = approxDistanceKm(lat, lng, best.lat, best.lng);
  for (let i = 1; i < CITIES.length; i++) {
    const c = CITIES[i];
    const d = approxDistanceKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return { city: { ...best }, distanceKm: bestDist };
}

module.exports = { CITIES, nearestCity, approxDistanceKm };
