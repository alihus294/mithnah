// Dashboard feature components — each one is standalone, gated by a
// `features.*` flag from config, and renders null when off. Kept in a
// separate file so Dashboard.jsx remains legible.

import { useEffect, useState } from 'react';
import { toArabicDigits, formatCountdown, PRAYER_NAMES_AR } from '../lib/format.js';
import { getQibla } from '../lib/ipc.js';

// --- Announcement banner ---------------------------------------------------
//
// Large, clearly visible marquee strip at the top of the wall. The old
// single-line 18px banner was invisible from the back of the hall —
// the operator specifically asked for big, animated, dismissable.
//
// Accepts optional auto-dismiss (autoHideSeconds): when > 0, the banner
// schedules itself to hide that many seconds after the text last
// changed. Pass 0 (or omit) to keep it up until the operator clicks
// the × button or clears the text via F3.

// Pick banner direction by *dominance*, not mere presence — an Arabic
// announcement that includes "WhatsApp" or a phone number shouldn't
// flip to LTR just because the Latin regex fires. Count strong Arabic
// vs strong Latin characters; whichever wins sets the direction.
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_RE = /[A-Za-z]/g;
function detectScriptDir(text) {
  const arabic = (text.match(ARABIC_RE) || []).length;
  const latin = (text.match(LATIN_RE) || []).length;
  return arabic >= latin ? 'rtl' : 'ltr';
}

export function AnnouncementBanner({ text, autoHideSeconds = 0 }) {
  const t = (text || '').trim();
  const [hidden, setHidden] = useState(false);
  // Reset the hidden flag whenever the text changes — a fresh
  // announcement should reappear even if the previous one was
  // dismissed. Using the text as the effect dependency is cheap; the
  // strings are always short.
  useEffect(() => { setHidden(false); }, [t]);
  // Auto-hide timer. Cleared if the text changes or the component
  // unmounts. 0 / NaN disables the timer entirely.
  useEffect(() => {
    const secs = Number(autoHideSeconds);
    if (!t || !Number.isFinite(secs) || secs <= 0) return;
    const h = setTimeout(() => setHidden(true), secs * 1000);
    return () => clearTimeout(h);
  }, [t, autoHideSeconds]);
  if (!t || hidden) return null;
  // Scroll duration scales with text length — short messages travel
  // slowly (so they're readable), long messages speed up a bit so the
  // congregation doesn't wait forever.
  const durationSeconds = Math.min(60, Math.max(14, Math.round(t.length / 3)));
  // Direction is script-aware: Arabic scrolls right→left (text enters
  // from the right edge, the expected reading flow for RTL readers),
  // Latin scrolls left→right (text enters from the left edge, matching
  // LTR reading). The old code always scrolled R→L regardless, which
  // felt backwards for English announcements.
  const dir = detectScriptDir(t);
  return (
    <div
      className={`announcement-banner announcement-banner--${dir}`}
      aria-live="polite"
      dir={dir}
      style={{ '--announcement-scroll-duration': `${durationSeconds}s` }}
    >
      <div className="announcement-banner__track">
        {/* Two copies are required for a seamless loop: the CSS
            animation translates the track by exactly one copy's
            width, so when copy #1 exits the viewport copy #2 has
            already taken its place. The operator sees a single
            continuous stream of text, not "duplicated". */}
        <span className="announcement-banner__text">{t}</span>
        <span className="announcement-banner__text" aria-hidden="true">{t}</span>
      </div>
      <button
        type="button"
        className="announcement-banner__close"
        aria-label="إخفاء الإعلان"
        title="إخفاء الإعلان (يظهر مجدداً إذا غُيِّر النص)"
        onClick={() => setHidden(true)}
      >×</button>
    </div>
  );
}

// --- Ramadan countdown -----------------------------------------------------

// Shown only when the effective (maghrib-pivoted) Hijri month is 9, and
// we are still before today's maghrib. After maghrib the effective Hijri
// day has already rolled forward, so the countdown disappears naturally.
export function RamadanCountdown({ hijriEffective, todayPrayerTimes, now }) {
  if (!hijriEffective || hijriEffective.month !== 9) return null;
  const maghrib = todayPrayerTimes?.timesIso?.maghrib;
  if (!maghrib) return null;
  const maghribMs = new Date(maghrib).getTime();
  if (!Number.isFinite(maghribMs)) return null;
  if (now.getTime() >= maghribMs) return null; // iftar passed for today
  return (
    <div className="countdown-ribbon">
      <span className="countdown-ribbon__label">الإفطار بعد</span>
      <span>{formatCountdown(maghrib, now.getTime())}</span>
    </div>
  );
}

// --- Friday khutbah timer --------------------------------------------------

// On Friday, before dhuhr, show "الخطبة بعد — ..." counting down to dhuhr.
// We use the local Gregorian weekday (Friday = 5) since the weekly schedule
// is Gregorian-driven even in Muslim-majority weeks.
export function FridayKhutbahTimer({ todayPrayerTimes, now }) {
  if (now.getDay() !== 5) return null;
  const dhuhr = todayPrayerTimes?.timesIso?.dhuhr;
  if (!dhuhr) return null;
  const dhuhrMs = new Date(dhuhr).getTime();
  if (!Number.isFinite(dhuhrMs)) return null;
  if (now.getTime() >= dhuhrMs) return null;
  // Only show within the last 2 hours before dhuhr to avoid all-day clutter.
  if (dhuhrMs - now.getTime() > 2 * 60 * 60 * 1000) return null;
  return (
    <div className="countdown-ribbon">
      <span className="countdown-ribbon__label">خطبة الجمعة بعد</span>
      <span>{formatCountdown(dhuhr, now.getTime())}</span>
    </div>
  );
}

// --- Qibla badge -----------------------------------------------------------

export function QiblaBadge() {
  const [qibla, setQibla] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const q = await getQibla();
        if (!cancelled) setQibla(q);
      } catch (_) { /* silent */ }
    }
    load();
    // Location rarely changes; re-query every 10 min in case the caretaker
    // updated coords via F3 settings.
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  if (!qibla || !Number.isFinite(qibla.bearingDeg)) return null;
  const deg = Math.round(qibla.bearingDeg);
  const km = Math.round(qibla.distanceKm);
  return (
    <div className="qibla-badge" aria-label={`اتجاه القبلة ${deg} درجة، ${km} كيلومتر`}>
      <span className="qibla-badge__arrow" style={{ transform: `rotate(${deg}deg)` }}>↑</span>
      <span>القبلة · {toArabicDigits(deg)}° · {toArabicDigits(km)} كم</span>
    </div>
  );
}

// --- 14 Infallibles rotator ------------------------------------------------

const MASUMIN = [
  'النبي محمد ﷺ',
  'الإمام علي بن أبي طالب عليه السلام',
  'السيدة فاطمة الزهراء عليها السلام',
  'الإمام الحسن المجتبى عليه السلام',
  'الإمام الحسين الشهيد عليه السلام',
  'الإمام علي زين العابدين عليه السلام',
  'الإمام محمد الباقر عليه السلام',
  'الإمام جعفر الصادق عليه السلام',
  'الإمام موسى الكاظم عليه السلام',
  'الإمام علي الرضا عليه السلام',
  'الإمام محمد الجواد عليه السلام',
  'الإمام علي الهادي عليه السلام',
  'الإمام الحسن العسكري عليه السلام',
  'الإمام المهدي المنتظر عجّل الله فرجه الشريف',
];

export function InfalliblesRotator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % MASUMIN.length), 8000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="infallibles-rotator" key={idx} aria-live="off">
      {MASUMIN[idx]}
    </div>
  );
}

// --- Dhikr counter removed ------------------------------------------------
//
// The wall-display use case doesn't justify a dhikr counter and the
// operator explicitly asked to remove it. The component, its F7
// handler, the `.dhikr-overlay` CSS, and the `dhikrCounter` feature
// flag were retired in sequence across 0.8.16 → 0.8.28. This comment
// is the tombstone so a future maintainer doesn't rewrite it.
