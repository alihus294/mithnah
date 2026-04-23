// F1 help overlay. Shows keyboard shortcuts + current config.
//
// The old build also embedded the "connect from phone" block (QR
// code + PIN + print-poster button) on the right column. The operator
// asked to remove it in 0.8.34: the same information already lives in
// F3 → متقدّم → الاتصال من الجوال AND the phone SPA's Settings tab, so
// F1 no longer duplicates it. This keeps the help overlay focused on
// "how do I drive this app" and hides pairing info from anyone
// glancing at the screen.

import { useEffect, useRef, useState } from 'react';
import { getSnapshot } from '../lib/ipc.js';
import { toArabicDigits } from '../lib/format.js';
import { ImamiStar, BrandMark, SalawatLine } from './Ornaments.jsx';

// Help rows must mirror what the app actually does. Previous text
// described F5 as tracking "ركعات / سجدات / تشهد / تسبيح الزهراء" —
// the intermediate ritual steps were removed in 0.8.15, and F5 now
// only advances through ركعات then تسبيح الزهراء. The Ctrl zoom keys
// also behave differently inside the F4 slideshow (they scale the
// dua text, not the whole renderer). These rows capture the real
// contract.
const KBD_ROWS = [
  ['F1',     'المساعدة'],
  ['F3',     'الإعدادات'],
  ['F4',     'مكتبة الأدعية والزيارات'],
  ['F5',     'متابعة الصلاة (اختيار الصلاة، ركعات، تسبيح الزهراء)'],
  ['Esc',    'إغلاق الشاشة الحالية'],
  ['Ctrl+=', 'تكبير الواجهة (أو حجم الدعاء أثناء العرض)'],
  ['Ctrl+-', 'تصغير الواجهة (أو حجم الدعاء)'],
  ['Ctrl+0', 'إعادة الحجم الافتراضي'],
];
const REMOTE_ROWS = [
  ['→ / PgDn / Space', 'التالي'],
  ['← / PgUp',         'السابق'],
  ['B / .',            'إعتام الشاشة'],
  ['Home / End',       'الأولى / الأخيرة'],
  ['Esc',              'إغلاق العرض'],
];

function Section({ title, rows }) {
  return (
    <div>
      <div className="help-section__title">
        <ImamiStar size={16} opacity={0.7} />
        <div className="help-section__title-text">{title}</div>
      </div>
      <dl className="help-section__list">
        {rows.map(([k, v], i) => (
          <div key={i} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function HelpOverlay() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const lastFocusedRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    let cancelled = false;
    async function load() {
      try {
        const snap = await getSnapshot();
        if (cancelled) return;
        setConfig(snap.config);
      } catch (_) {}
    }
    load();
    const id = setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => {
      clearTimeout(id);
      if (lastFocusedRef.current?.focus) {
        try { lastFocusedRef.current.focus(); } catch (_) {}
      }
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const loc = config?.location || {};
  const acc = config?.locationAccuracyMeters;
  let accText = '—';
  if (Number.isFinite(acc)) {
    const q = acc <= 50 ? '✓ ممتازة' : acc <= 200 ? 'جيدة' : acc <= 1000 ? 'متوسطة' : 'ضعيفة';
    accText = `${toArabicDigits(acc)} متر · ${q}`;
  } else if (config?.locationSource) {
    accText = config.locationSource === 'timezone' ? 'مكتشف من المنطقة الزمنية' : config.locationSource;
  }

  // Config rows read live from `prayerTimes.getConfig()`. Removed
  // "المرجع" (marja field itself was retired in 0.8.20) and
  // "تأخير المغرب" (retired in 0.8.33 — adjustmentsMinutes.maghrib
  // covers the use case). Kept every field that remains user-
  // visible and editable.
  const loadOrigin = (() => {
    switch (config?.locationSource) {
      case 'gps':         return 'GPS (الكمبيوتر)';
      case 'phone-gps':   return 'GPS (الجوال)';
      case 'manual':      return 'يدوي';
      case 'timezone':    return 'المنطقة الزمنية';
      default:            return config?.locationSource || '—';
    }
  })();
  const clockFmtLabel = config?.clockFormat === '12' ? '١٢ ساعة' : '٢٤ ساعة';
  const maghribAdj = Number((config?.adjustmentsMinutes || {}).maghrib) || 0;

  const configRows = config ? [
    ['اسم المسجد',    config.mosqueName || 'مئذنة'],
    ['اسم الإمام',    config.imamName || '—'],
    ['طريقة الحساب',  config.method || '—'],
    ['المنطقة',       loc.name || '—'],
    ['الإحداثيات',    Number.isFinite(loc.lat) ? `${toArabicDigits(Number(loc.lat).toFixed(4))}، ${toArabicDigits(Number(loc.lng).toFixed(4))}` : '—'],
    ['دقة GPS',       accText],
    ['مصدر الموقع',   loadOrigin],
    ['التقويم',       config.calendar || '—'],
    ['إزاحة التقويم', (config.calendarDayOffset || 0) > 0 ? `+${toArabicDigits(config.calendarDayOffset)}` : toArabicDigits(config.calendarDayOffset || 0)],
    ['تعديل المغرب',  maghribAdj === 0 ? 'بدون' : (maghribAdj > 0 ? `+${toArabicDigits(maghribAdj)} د` : `${toArabicDigits(maghribAdj)} د`)],
    ['نظام الساعة',   clockFmtLabel],
  ] : [];

  return (
    <div className="help-overlay open" role="dialog" aria-modal="true" dir="rtl">
      <div className="help-overlay__bg" />
      <div className="help-overlay__card">
        <div className="help-overlay__star help-overlay__star--tr"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--tl"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--br"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--bl"><ImamiStar size={20} opacity={0.6} /></div>

        <div className="help-overlay__head">
          <div className="help-overlay__head-title">
            <BrandMark size={48} showWordmark={false} />
            <div>
              <div className="help-overlay__title">مئذنة — المساعدة</div>
              <div className="help-overlay__subtitle">اضغط F1 أو Esc للإغلاق</div>
            </div>
          </div>
          <button ref={closeBtnRef} className="help-overlay__close" onClick={() => setOpen(false)}>
            إغلاق · Esc
          </button>
        </div>

        <div className="help-overlay__body">
          <div className="help-overlay__col">
            <Section title="اختصارات لوحة المفاتيح" rows={KBD_ROWS} />
            <Section title="ريموت العارض للشرائح" rows={REMOTE_ROWS} />
            {config?.supportContact && (
              <div className="help-overlay__support-callout">
                <div className="help-overlay__support-title">📞 للمساعدة الفنية اتصل</div>
                <div className="help-overlay__support-body">{config.supportContact}</div>
              </div>
            )}
          </div>
          <div className="help-overlay__divider" />
          <div className="help-overlay__col">
            <Section title="إعدادات المسجد الحالية" rows={configRows} />
            {/* The "connect from phone" block lived here in pre-0.8.34
                builds. Removed on operator request; the same QR, PIN,
                and print-poster affordance is still available from
                F3 → متقدّم → الاتصال من الجوال. */}
          </div>
        </div>

        <SalawatLine size="sm" style={{ marginTop: 24 }} />
      </div>
    </div>
  );
}
