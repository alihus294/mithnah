// PairingModal — surfaces the phone-remote PIN, QR, and LAN URL without
// requiring the operator to enter the Settings PIN first. The Settings
// overlay's own pairing card lives behind the optional Settings PIN
// gate; if an operator forgets the mobile PIN, that creates a
// circular-discoverability trap (REVIEW F-005). This modal is the
// always-available escape hatch.
//
// Triggered by a `mithnah:request-pairing` window event (dispatched by
// the FloatingMenu) so the modal stays decoupled from the menu's
// open/close lifecycle. Uses `getRemoteStatus()` (no auth) plus the
// `remote-control:status` push channel so a Wi-Fi switch refreshes the
// QR while the modal is still open.
//
// Offline pairing: when no usable LAN is present, the modal switches to
// a guidance mode that walks the operator through enabling Windows
// Mobile Hotspot (192.168.137.1). Capability detection comes from
// `getNetworkCapabilities()`. When the operator turns the hotspot on,
// the main-process IP watcher emits a fresh `remote-control:status`
// with the hotspot URL and the modal flips back to the standard QR
// flow automatically.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getRemoteStatus,
  getNetworkCapabilities,
  openHotspotSettings,
} from '../lib/ipc.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { useModalActive } from '../lib/useModalActive.js';

// Loopback isn't reachable from the phone. Treat as "no LAN".
function isLoopbackUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url || '');
}

// Windows Mobile Hotspot always hands its host adapter 192.168.137.1.
function isHotspotUrl(url) {
  return /^https?:\/\/192\.168\.137\.\d+(:|\/|$)/.test(url || '');
}

function computePairingMode(status, caps) {
  if (!status) return 'loading';
  if (!status.running) return 'stopped';
  const url = status.url || '';
  if (isHotspotUrl(url)) return 'hotspot';
  if (!url || isLoopbackUrl(url)) return 'offline';
  return 'lan';
}

export default function PairingModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [caps, setCaps] = useState(null);
  const [hotspotAction, setHotspotAction] = useState('idle'); // idle | opening | error
  const containerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useFocusTrap(containerRef, open);
  useModalActive(open);

  // Listen for FloatingMenu's "open me" event. Decoupled so future
  // call sites (PinBadge first-run, post-onboarding nudge) can fire
  // the same event without touching this component.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('mithnah:request-pairing', onOpen);
    return () => window.removeEventListener('mithnah:request-pairing', onOpen);
  }, []);

  // While open: fetch initial status + capabilities, subscribe to live
  // status pushes (Wi-Fi switch / hotspot toggle / IP change), and
  // capture/restore focus.
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    let cancelled = false;

    const refreshCaps = (force) => {
      getNetworkCapabilities({ force: !!force })
        .then((c) => { if (!cancelled) setCaps(c || null); })
        .catch(() => { if (!cancelled) setCaps(null); });
    };

    getRemoteStatus()
      .then((s) => { if (!cancelled) setStatus(s || null); })
      .catch(() => { if (!cancelled) setStatus(null); });

    refreshCaps(true);

    // Periodic gentle refresh — fallback for the rare case where no
    // `remote-control:status` push arrives after the operator toggled
    // Mobile Hotspot (main-process IP watcher hasn't ticked yet). The
    // 4s cadence used here pre-0.1.6 spawned a PowerShell adapter probe
    // every iteration on machines where the 8s main-side cache
    // expired; bumping to 12s keeps the fallback responsive (operators
    // wait ≤12s for the QR to refresh after enabling hotspot) without
    // a steady-state spawn rate that bites battery-powered laptops.
    // The `onStatus` push below + the explicit re-check after
    // `handleOpenHotspotSettings` give the responsive path; this
    // interval is purely belt-and-braces.
    const capsTimer = setInterval(() => refreshCaps(false), 12_000);

    // Status pushes generally indicate an IP change → re-check caps to
    // refresh the hotspot-vs-lan badge promptly.
    const off = window.electron?.remoteControl?.onStatus
      ? window.electron.remoteControl.onStatus((s) => {
          if (cancelled) return;
          setStatus(s || null);
          refreshCaps(true);
        })
      : undefined;

    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 30);

    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
      clearInterval(capsTimer);
      if (typeof off === 'function') off();
      if (lastFocusedRef.current?.focus) {
        try { lastFocusedRef.current.focus(); } catch (_) {}
      }
    };
  }, [open]);

  const mode = useMemo(() => computePairingMode(status, caps), [status, caps]);

  const handleOpenHotspotSettings = async () => {
    setHotspotAction('opening');
    try {
      const result = await openHotspotSettings();
      if (result && result.ok) {
        setHotspotAction('idle');
        // Operator is about to toggle Mobile Hotspot — force-refresh
        // capabilities a few seconds later so the QR catches up
        // without waiting for the next periodic tick.
        setTimeout(() => {
          getNetworkCapabilities({ force: true }).catch(() => {});
          getRemoteStatus().then((s) => setStatus(s || null)).catch(() => {});
        }, 3500);
      } else {
        setHotspotAction('error');
      }
    } catch (_) {
      setHotspotAction('error');
    }
  };

  if (!open) return null;

  const url = status?.url || '';
  const urlShort = url.replace(/^https?:\/\//, '');
  const pin = status?.pin || '—';
  const qr = status?.qrCodeDataUrl || null;
  const showQrPanel = mode === 'lan' || mode === 'hotspot';
  const isWindows = caps?.platform === 'win32';
  const hotspotLikelyAvailable = !!caps?.hotspotLikelyAvailable;
  const hasWifiAdapter = caps?.hasWifiAdapter;

  return (
    <div
      ref={containerRef}
      className="inline-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairing-title"
      dir="rtl"
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <div className="inline-modal__bg" onClick={() => setOpen(false)} />
      <div className="inline-modal__card pairing-modal__card">
        <div id="pairing-title" className="inline-modal__title">إقران الجوال</div>

        {mode === 'hotspot' && (
          <div className="pairing-modal__badge pairing-modal__badge--hotspot">
            عبر "نقطة الاتصال" من ويندوز · لا يحتاج راوتر ولا إنترنت
          </div>
        )}

        {showQrPanel && (
          <div className="inline-modal__subtitle">
            امسح الرمز بكاميرا الجوال أو افتح الرابط التالي على متصفّح الجوال، ثم أدخل رمز PIN.
          </div>
        )}

        {mode === 'stopped' && (
          <div className="settings__msg settings__msg--err" role="alert" aria-live="assertive" style={{ marginBottom: 16 }}>
            خدمة الإقران غير قيد التشغيل — أعد تشغيل التطبيق.
          </div>
        )}

        {mode === 'offline' && (
          <div className="pairing-modal__offline" role="status" aria-live="polite">
            <div className="pairing-modal__offline-title">
              لا توجد شبكة Wi-Fi تربط الكمبيوتر بالجوال حاليًا
            </div>

            {isWindows && hotspotLikelyAvailable && (
              <>
                <div className="pairing-modal__offline-body">
                  يمكنك جعل الكمبيوتر نفسه نقطة اتصال للجوال — لا حاجة لراوتر ولا للإنترنت.
                </div>
                <ol className="pairing-modal__steps">
                  <li>اضغط الزر التالي لفتح إعدادات "نقطة الاتصال المتنقّلة" في ويندوز.</li>
                  <li>فعّل المفتاح في الإعدادات (Mobile hotspot).</li>
                  <li>على الجوال، انضم إلى شبكة Wi-Fi الجديدة باسم وكلمة المرور المعروضين في ويندوز.</li>
                  <li>عُد إلى هذه الشاشة — سيظهر رمز QR جديد تلقائيًا خلال ثوانٍ.</li>
                </ol>
                <div className="pairing-modal__cta-row">
                  <button
                    type="button"
                    className="inline-modal__btn inline-modal__btn--primary"
                    onClick={handleOpenHotspotSettings}
                    disabled={hotspotAction === 'opening'}
                  >
                    فتح إعدادات Mobile Hotspot
                  </button>
                </div>
                {hotspotAction === 'error' && (
                  <div className="pairing-modal__step-warn">
                    تعذّر فتح الإعدادات تلقائيًا. من ويندوز: Settings → Network &amp; Internet → Mobile hotspot.
                  </div>
                )}
                <div className="pairing-modal__note">
                  ملاحظة: قد يقول الجوال "لا يوجد إنترنت" بعد الانضمام — اختر "البقاء متصلًا" / Stay connected.
                </div>
              </>
            )}

            {isWindows && !hotspotLikelyAvailable && hasWifiAdapter === false && (
              <div className="pairing-modal__offline-body">
                هذا الكمبيوتر لا يحتوي على محوّل Wi-Fi، لذا لا يمكنه تشغيل نقطة اتصال داخلية.
                <br />
                الحل: أوصل محوّل Wi-Fi عبر USB (متوفر بسعر زهيد)، ثم افتح هذه الشاشة من جديد.
              </div>
            )}

            {isWindows && !hotspotLikelyAvailable && hasWifiAdapter !== false && (
              <>
                <div className="pairing-modal__offline-body">
                  لم نتمكّن من التحقّق التلقائي من محوّل Wi-Fi. يمكنك المحاولة يدويًا من إعدادات ويندوز:
                </div>
                <div className="pairing-modal__cta-row">
                  <button
                    type="button"
                    className="inline-modal__btn inline-modal__btn--primary"
                    onClick={handleOpenHotspotSettings}
                    disabled={hotspotAction === 'opening'}
                  >
                    فتح إعدادات Mobile Hotspot
                  </button>
                </div>
                {hotspotAction === 'error' && (
                  <div className="pairing-modal__step-warn">
                    تعذّر فتح الإعدادات تلقائيًا. من ويندوز: Settings → Network &amp; Internet → Mobile hotspot.
                  </div>
                )}
              </>
            )}

            {!isWindows && (
              <div className="pairing-modal__offline-body">
                تفعيل "نقطة الاتصال" من داخل التطبيق غير مدعوم على هذا النظام.
                <br />
                صِل الكمبيوتر والجوال بشبكة Wi-Fi مشتركة (راوتر منزلي أو نقطة اتصال من جوال آخر).
              </div>
            )}
          </div>
        )}

        {showQrPanel && (
          <div className="pairing-modal__row">
            {qr && (
              <div className="pairing-modal__qr-wrap">
                <img className="pairing-modal__qr" src={qr} alt="رمز QR للاتصال من الجوال" />
              </div>
            )}
            <div className="pairing-modal__info">
              <div className="pairing-modal__label">الرابط</div>
              <div className="pairing-modal__url"><bdi>{urlShort || '—'}</bdi></div>
              <div className="pairing-modal__label" style={{ marginTop: 12 }}>رمز PIN</div>
              <div className="pairing-modal__pin"><bdi>{pin}</bdi></div>
            </div>
          </div>
        )}

        {showQrPanel && (
          <div className="pairing-modal__hint">
            هذا الرمز يظهر هنا فقط — لا يُعرض على شاشة القاعة. الرمز يتغيّر عند إعادة تشغيل التطبيق.
          </div>
        )}

        <div className="inline-modal__buttons" style={{ marginTop: 18 }}>
          <button
            ref={closeBtnRef}
            type="button"
            className="inline-modal__btn inline-modal__btn--primary"
            onClick={() => setOpen(false)}
          >إغلاق · Esc</button>
        </div>
      </div>
    </div>
  );
}
