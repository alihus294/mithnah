// First-run onboarding. Shown once per install (until the operator
// completes the location step). Flow:
//
//   1. Try HTML5 geolocation silently (8s timeout).
//   2. If succeeds → reverse-geocode the coordinates and show
//      "نحن رصدنا موقعك كـ X. هل هذا صحيح؟ [نعم] [لا]"
//   3. If the operator confirms → save + mark onboarding complete.
//   4. If "لا" OR GPS fails → show a guided city search with clear
//      Arabic instructions ("اكتب اسم مدينتك ثم اختر من النتائج").
//   5. Always show a دليل بديل / skip option so the operator can
//      never get stuck — the app stays usable with the Najaf default.
//
// The overlay is dismissable (Esc, X button, or تخطّي) but won't
// auto-reappear on the same machine because we flip
// config.onboardingCompleted = true the moment the operator clicks
// anything that isn't "probing". If they skip without saving a
// location, they can still trigger the same flow by resetting via F3.

import { useEffect, useRef, useState } from 'react';
import {
  getConfig, setLocation, reverseGeocodeOnline, searchPlaces,
  detectLocationFromTimezone, setConfig, onConfigChanged
} from '../lib/ipc.js';
import { toArabicDigits } from '../lib/format.js';
import { useModalActive } from '../lib/useModalActive.js';
import { ImamiStar, BrandMark, SalawatLine } from './Ornaments.jsx';

export default function OnboardingOverlay() {
  const [config, setCfg] = useState(null);
  // Stages: 'probing' | 'confirm' | 'search' | 'saving' | 'done'
  const [stage, setStage] = useState('probing');
  const [detected, setDetected] = useState(null); // { lat, lng, name, source, accuracy }
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [msg, setMsg] = useState('جاري تحديد الموقع...');
  const [msgKind, setMsgKind] = useState('info');
  // Live online/offline flag. Without internet the search + reverse-
  // geocoding APIs silently fail and the operator is left with a
  // spinning onboarding card — surfacing this up-front tells them to
  // connect first. navigator.onLine is a hint (false positives on
  // captive-portal Wi-Fi) so treat it as best-effort.
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const runOnceRef = useRef(false);

  // Load config once on mount + listen for changes (so if the operator
  // runs through F3 manually, we auto-dismiss).
  useEffect(() => {
    let cancelled = false;
    getConfig().then((c) => { if (!cancelled) setCfg(c); }).catch(() => {});
    const off = onConfigChanged((c) => { if (!cancelled) setCfg(c); });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  const needsOnboarding = config && config.onboardingCompleted === false;
  // Take keyboard ownership so any active slideshow underneath
  // doesn't grab the arrow keys away from the search/result list.
  useModalActive(!!needsOnboarding);

  // Probe for location once, after we know the operator needs it.
  useEffect(() => {
    if (!needsOnboarding || runOnceRef.current) return;
    runOnceRef.current = true;
    let cancelled = false;

    (async () => {
      // Step 1: HTML5 geolocation (8s max).
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), 8000);
            navigator.geolocation.getCurrentPosition(
              (p) => { clearTimeout(t); resolve(p); },
              (e) => { clearTimeout(t); reject(e); },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          });
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          let name = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
          try {
            const geo = await reverseGeocodeOnline({ lat, lng });
            if (geo?.name) name = geo.name;
          } catch (_) {}
          if (cancelled) return;
          setDetected({ lat, lng, name, source: 'gps', accuracy });
          setStage('confirm');
          setMsg('هل هذا موقعك؟');
          setMsgKind('info');
          return;
        } catch (_) { /* fall through */ }
      }

      // Step 2: Timezone-based (offline-safe) — but we DON'T pre-apply
      // it because the user said auto-detection lands them 400km off
      // when it just defaults to the timezone capital. We use it only
      // to pre-populate the search box with a hint.
      if (cancelled) return;
      try {
        const tz = await detectLocationFromTimezone();
        if (tz?.name) {
          setSearchQ(tz.name);
        }
      } catch (_) {}
      if (cancelled) return;
      setStage('search');
      setMsg('لم نستطع تحديد موقعك تلقائياً — ابحث عن مدينتك:');
      setMsgKind('info');
    })();

    return () => { cancelled = true; };
  }, [needsOnboarding]);

  // Debounced Nominatim search when in the 'search' stage.
  useEffect(() => {
    if (stage !== 'search') return;
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        const r = await searchPlaces({ q, limit: 10 });
        if (!cancelled) setSearchResults(Array.isArray(r) ? r : []);
      } catch (_) {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(h); };
  }, [stage, searchQ]);

  const finish = async (lat, lng, name, source, accuracy) => {
    setStage('saving');
    setMsg('جاري الحفظ...');
    try {
      // alignMethodToRegion: true so first-run picks the regional
      // Shia method automatically (JafariWide 18° for Saudi/Gulf,
      // Leva 16° for Iraq/Lebanon, Tehran 17.7° for Iran). The
      // operator can still switch via F3 afterwards.
      await setLocation({ lat, lng, name, alignMethodToRegion: true });
      await setConfig({
        onboardingCompleted: true,
        locationAccuracyMeters: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        locationSource: source,
        locationFixedAt: new Date().toISOString()
      });
      setStage('done');
    } catch (err) {
      setStage('search');
      setMsg('فشل الحفظ: ' + err.message);
      setMsgKind('err');
    }
  };

  const skipOnboarding = async () => {
    // Don't swallow the failure silently — if setConfig errors, the
    // onboardingCompleted flag doesn't persist and the overlay fires
    // again on next boot. Surface the error so the operator either
    // retries or knows to finish via F3 → الموقع later.
    try {
      await setConfig({ onboardingCompleted: true });
      setStage('done');
    } catch (err) {
      setStage('search');
      setMsg('تعذّر حفظ حالة الإعداد: ' + (err?.message || 'خطأ غير معروف') + ' — يمكنك المتابعة باختيار مدينة، أو إغلاق التطبيق وإعادة المحاولة.');
      setMsgKind('err');
    }
  };

  // Only render when the operator actually needs to onboard.
  if (!needsOnboarding || stage === 'done') return null;

  return (
    <div className="onboarding-overlay open" role="dialog" aria-modal="true" dir="rtl">
      <div className="onboarding-overlay__bg" />
      <div className="onboarding-overlay__card">
        <div className="help-overlay__star help-overlay__star--tr"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--tl"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--br"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--bl"><ImamiStar size={20} opacity={0.6} /></div>

        <div className="onboarding-overlay__head">
          <BrandMark size={56} showWordmark={false} />
          <div className="onboarding-overlay__title">مرحباً بك في مئذنة</div>
          <div className="onboarding-overlay__subtitle">نحتاج تحديد موقع المسجد ليحسب أوقات الصلاة بدقة</div>
        </div>

        {!online && (
          <div className="onboarding-overlay__offline" role="alert">
            <strong>لا يوجد اتصال بالإنترنت.</strong>
            <span> للحصول على أفضل دقة ولبحث المدن يرجى توصيل الكمبيوتر بشبكة واي‑فاي أو إيثرنت، ثم إعادة المحاولة. يمكنك أيضاً المتابعة بإدخال إحداثيات يدوياً.</span>
          </div>
        )}

        {stage === 'probing' && (
          <div className="onboarding-overlay__body onboarding-overlay__body--center">
            <div className="onboarding-overlay__spinner" aria-hidden="true" />
            <div className="onboarding-overlay__msg">{msg}</div>
            <div className="onboarding-overlay__hint">قد تظهر رسالة من ويندوز لطلب الإذن — اقبلها للاستمرار</div>
          </div>
        )}

        {stage === 'confirm' && detected && (
          <div className="onboarding-overlay__body">
            <div className="onboarding-overlay__confirm">
              <div className="onboarding-overlay__confirm-label">رصدنا موقعك في:</div>
              <div className="onboarding-overlay__confirm-name">{detected.name}</div>
              <div className="onboarding-overlay__confirm-coords">
                {toArabicDigits(detected.lat.toFixed(4))}°، {toArabicDigits(detected.lng.toFixed(4))}°
                {detected.accuracy && ` · دقة ${toArabicDigits(Math.round(detected.accuracy))} م`}
              </div>
            </div>
            <div className="onboarding-overlay__buttons">
              <button
                type="button"
                className="onboarding-overlay__btn onboarding-overlay__btn--primary"
                onClick={() => finish(detected.lat, detected.lng, detected.name, detected.source, detected.accuracy)}
              >
                ✓ نعم، هذا موقعي
              </button>
              <button
                type="button"
                className="onboarding-overlay__btn"
                onClick={() => { setStage('search'); setMsg('ابحث عن مدينتك بالاسم — مثال: النجف، القطيف، الأحساء، ديربورن'); setMsgKind('info'); setDetected(null); }}
              >
                ✗ لا، اختر يدوياً
              </button>
            </div>
          </div>
        )}

        {stage === 'search' && (
          <div className="onboarding-overlay__body">
            <div className={`onboarding-overlay__msg onboarding-overlay__msg--${msgKind}`}>{msg}</div>

            <ol className="onboarding-overlay__guide">
              <li>اكتب اسم مدينتك بالعربي في المربع (مثال: «النجف» أو «القطيف»)</li>
              <li>انتظر ثانية ثم انقر المدينة من قائمة النتائج</li>
              <li>لو ما لقيت مدينتك، جرّب اسم منطقة قريبة</li>
            </ol>

            <input
              type="search"
              className="onboarding-overlay__search"
              placeholder="ابحث عن مدينتك..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              autoFocus
            />
            {searchLoading && <div className="onboarding-overlay__hint">جاري البحث...</div>}
            {searchResults.length > 0 && (
              <div className="onboarding-overlay__results">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="onboarding-overlay__result"
                    onClick={() => finish(r.lat, r.lng, r.name, 'manual', null)}
                  >
                    <div className="onboarding-overlay__result-name">{r.name}</div>
                    <div className="onboarding-overlay__result-detail">{r.displayName}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="onboarding-overlay__buttons">
              {/* Manual coords — a lifeline for offline setup. The
                  city search above needs Nominatim (online). Without
                  this, an offline operator is forced onto the
                  "تخطّي" → Najaf default. Paste lat/lng from any
                  phone GPS app instead. */}
              <button
                type="button"
                className="onboarding-overlay__btn"
                onClick={() => setStage('coords')}
              >
                ✎ إدخال إحداثيات يدوياً
              </button>
              <button type="button" className="onboarding-overlay__btn" onClick={skipOnboarding}>
                تخطّي (ستعمل بإعدادات افتراضية — النجف)
              </button>
            </div>
          </div>
        )}

        {stage === 'coords' && (
          <CoordsStage onCancel={() => setStage('search')} onSubmit={finish} />
        )}

        {stage === 'saving' && (
          <div className="onboarding-overlay__body onboarding-overlay__body--center">
            <div className="onboarding-overlay__spinner" aria-hidden="true" />
            <div className="onboarding-overlay__msg">{msg}</div>
          </div>
        )}

        <SalawatLine size="sm" style={{ marginTop: 24 }} />
      </div>
    </div>
  );
}

// Manual-coords entry — two number fields + submit. Validates range
// ±90 / ±180 client-side and passes (lat, lng, name, 'manual', null)
// through the same finish() pipeline used by the city-search results.
// Name is derived from lat/lng so the operator at least sees their
// coordinates on the wall until they go online and reverse-geocode.
function CoordsStage({ onCancel, onSubmit }) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const flat = Number(lat), flng = Number(lng);
    if (!Number.isFinite(flat) || flat < -90 || flat > 90) {
      setErr('خط العرض غير صالح (−٩٠ إلى ٩٠)'); return;
    }
    if (!Number.isFinite(flng) || flng < -180 || flng > 180) {
      setErr('خط الطول غير صالح (−١٨٠ إلى ١٨٠)'); return;
    }
    const name = `${flat.toFixed(3)}°، ${flng.toFixed(3)}°`;
    onSubmit(flat, flng, name, 'manual', null);
  };
  return (
    <form className="onboarding-overlay__body" onSubmit={submit}>
      <div className="onboarding-overlay__msg">
        أدخل خطّي العرض والطول من أي تطبيق GPS على جوالك (مثل Google Maps: اضغط على موقعك مطوّلاً).
      </div>
      <label className="onboarding-overlay__hint" htmlFor="ob-coords-lat">خط العرض (Latitude)</label>
      <input
        id="ob-coords-lat"
        type="number" step="0.00001" inputMode="decimal"
        className="onboarding-overlay__search"
        value={lat}
        onChange={(e) => { setLat(e.target.value); setErr(''); }}
        placeholder="مثال: 25.4295"
        autoFocus
      />
      <label className="onboarding-overlay__hint" htmlFor="ob-coords-lng">خط الطول (Longitude)</label>
      <input
        id="ob-coords-lng"
        type="number" step="0.00001" inputMode="decimal"
        className="onboarding-overlay__search"
        value={lng}
        onChange={(e) => { setLng(e.target.value); setErr(''); }}
        placeholder="مثال: 49.5921"
      />
      {err && <div className="onboarding-overlay__msg onboarding-overlay__msg--err">{err}</div>}
      <div className="onboarding-overlay__buttons">
        <button type="submit" className="onboarding-overlay__btn onboarding-overlay__btn--primary">
          ✓ حفظ الموقع
        </button>
        <button type="button" className="onboarding-overlay__btn" onClick={onCancel}>
          رجوع للبحث
        </button>
      </div>
    </form>
  );
}
