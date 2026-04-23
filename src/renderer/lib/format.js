// Arabic-digit and time formatting helpers used across the renderer.

const AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
export const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => AR_DIGITS[Number(d)] || d);

export const hhmmLocal = (isoUtc, format = '24') => {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (format === '12') {
    // Arabic AM/PM: ص (صباحاً) / م (مساءً)
    const suffix = h < 12 ? 'ص' : 'م';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${mm} ${suffix}`;
  }
  return `${String(h).padStart(2, '0')}:${mm}`;
};

// Format the clock (no seconds). Accepts a Date or ISO string.
export const formatClock = (dateOrIso, format = '24') => {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (format === '12') {
    const suffix = h < 12 ? 'ص' : 'م';
    h = h % 12 || 12;
    return { time: `${String(h).padStart(2, '0')}:${mm}`, suffix };
  }
  return { time: `${String(h).padStart(2, '0')}:${mm}`, suffix: '' };
};

export const formatCountdown = (targetIso, nowMs = Date.now()) => {
  if (!targetIso) return '';
  const targetMs = new Date(targetIso).getTime();
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) {
    return `${toArabicDigits(h)} ساعة و ${toArabicDigits(m)} دقيقة`;
  }
  if (m > 0) {
    return `${toArabicDigits(m)} دقيقة و ${toArabicDigits(s)} ثانية`;
  }
  return `${toArabicDigits(s)} ثانية`;
};

export const PRAYER_NAMES_AR = {
  fajr:     'الفجر',
  sunrise:  'الشروق',
  dhuhr:    'الظهر',
  asr:      'العصر',
  maghrib:  'المغرب',
  isha:     'العشاء',
  midnight: 'الليل'
};

export const PRAYER_ICONS = {
  fajr:    'nights_stay',
  sunrise: 'wb_twilight',
  dhuhr:   'light_mode',
  asr:     'wb_sunny',
  maghrib: 'dark_mode',
  isha:    'bedtime'
};

export const EVENT_KIND_LABEL_AR = {
  shahadah:    'شهادة',
  wiladah:     'ولادة',
  eid:         'عيد',
  significant: 'مناسبة'
};
