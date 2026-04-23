// Dashboard — the wall view. 4-zone vertical rhythm:
//   1. Header     → mosque name + Hijri · Gregorian dates
//   2. Clock zone → mihrab halo + mihrab silhouette + clock + next-prayer
//   3. Event strip→ today's event OR the nearest upcoming one (never both)
//   4. Prayers    → 6 cells across, active cell glows; salawat underneath

import { useEffect, useState } from 'react';
import { getTodayAndNext, hijriToday, getTodayEvents, getConfig,
         onKioskUnlockRequest, kioskQuit, verifySettingsPin,
         onConfigChanged } from '../lib/ipc.js';
import { toArabicDigits, hhmmLocal, formatCountdown, formatClock,
         PRAYER_NAMES_AR, EVENT_KIND_LABEL_AR } from '../lib/format.js';
import {
  ImamiStar, ArabesqueCorner, MihrabFull, AlayhiSalam,
  TileBand, SalawatLine, StarPatternBg
} from './Ornaments.jsx';
import {
  AnnouncementBanner, RamadanCountdown, QiblaBadge
} from './DashboardFeatures.jsx';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Track viewport width so the prayer row can drop the sunrise cell on
// narrow screens (< 1440px). Below that the five cells become too
// cramped — the operator explicitly flagged this. Only re-renders on
// breakpoint crossings, not on every resize pixel.
function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 1440
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1440);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

function usePrayerTimes() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTodayAndNext(new Date().toISOString());
        if (!cancelled) setState(data);
      } catch (_) { /* silent */ }
    }
    load();
    // When the operator changes method/location/marja/adjustments in
    // F3, the prayer times need to refresh right away — not on the
    // next 60-second tick. Subscribe to config-changed and force a
    // recompute.
    const off = onConfigChanged(() => load());
    const id = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof off === 'function') off();
    };
  }, []);
  return state;
}

function useHijri() {
  const [h, setH] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await hijriToday();
        if (!cancelled) setH(d);
      } catch (_) { /* silent */ }
    }
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return h;
}

function useConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const c = await getConfig();
        if (!cancelled) setCfg(c);
      } catch (_) { /* silent */ }
    }
    load();
    // Subscribe to instant config-changed broadcasts from the main
    // process so F3 edits reflect on the Dashboard the moment they're
    // saved (mosque name, location label, occasion tint, feature
    // toggles, announcement text). The 5-minute poll is the fallback.
    const off = onConfigChanged((c) => { if (!cancelled) setCfg(c); });
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof off === 'function') off();
    };
  }, []);
  return cfg;
}

function useTodayEvents() {
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [hijriEffective, setHijriEffective] = useState(null);
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTodayEvents();
        if (cancelled) return;
        setEvents(data.events || []);
        setUpcoming(data.upcoming || []);
        setHijriEffective(data.hijriEffective || null);
      } catch (_) {}
    }
    load();
    // Refresh every 10 min — the maghrib-pivot rollover flips exactly at
    // sundown, so we need a faster cadence than the 1-hour default to
    // catch the transition without a full day's lag. Still cheap: it's a
    // local IPC call returning <1 KB of JSON.
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  // Cycle through today's events if multiple (rare — typically ≤1).
  useEffect(() => {
    const id = setInterval(() => setCursor((c) => c + 1), 12000);
    return () => clearInterval(id);
  }, []);
  const curEvent = events.length ? events[cursor % events.length] : null;
  // Only the very next upcoming event — sorted nearest-first by the server.
  const nextUpcoming = upcoming.length ? upcoming[0] : null;
  return { event: curEvent, upcoming: nextUpcoming, hijriEffective };
}

function occasionFor(event, override) {
  if (override && override !== 'auto') return override;
  if (!event || !event.kind) return 'normal';
  if (event.kind === 'shahadah') return 'shahadah';
  if (event.kind === 'wiladah')  return 'wiladah';
  if (event.kind === 'eid')      return 'eid';
  return 'normal';
}

function HonorifiedTitle({ title, honorific, starSize }) {
  if (!honorific) return <>{title}</>;
  return <>{title}<AlayhiSalam size={starSize} /></>;
}

// Honorific detector — defined ONCE so the today-event and upcoming-
// event branches can't drift. Earlier copies on lines 155 and 163
// disagreed (the upcoming-event regex was missing `علي`, so an
// upcoming شهادة الإمام علي rendered without the alayhi-salam mark).
const HONORIFIC_RE = /الإمام|الرسول|النبي|فاطمة|الزهراء|الحسن|الحسين|العسكري|المهدي|الهادي|الجواد|الرضا|الكاظم|الصادق|الباقر|السجاد|علي/;

function EventStrip({ event, upcoming }) {
  const MONTHS_AR = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
  let kind, title, meta, honorific, isToday;
  if (event) {
    kind = EVENT_KIND_LABEL_AR[event.kind] || 'مناسبة';
    title = event.title_ar || '';
    honorific = HONORIFIC_RE.test(title);
    meta = null;
    isToday = true;
  } else if (upcoming) {
    kind = 'المناسبة القادمة';
    title = upcoming.event?.title_ar || '';
    const m = MONTHS_AR[(upcoming.hijriTarget?.month ?? 1) - 1] || '';
    meta = `${toArabicDigits(upcoming.hijriTarget?.day ?? '')} ${m} · بعد ${toArabicDigits(upcoming.daysAway ?? 0)} يوم`;
    honorific = HONORIFIC_RE.test(title);
    isToday = false;
  } else {
    return null;
  }

  return (
    <div className={`event-strip ${isToday ? 'event-strip--today' : 'event-strip--upcoming'}`}>
      {isToday && <span className="event-strip__dot" />}
      <span className="event-strip__kind">{kind}</span>
      <span className="event-strip__sep" />
      <span className="event-strip__title">
        <HonorifiedTitle title={title} honorific={honorific} starSize={isToday ? 11 : 9} />
      </span>
      {meta && (
        <>
          <span className="event-strip__sep" />
          <span className="event-strip__meta">{meta}</span>
        </>
      )}
    </div>
  );
}

function PrayerCell({ prayerKey, name, time, active }) {
  return (
    <div className={`prayer-cell ${active ? 'prayer-cell--next' : ''}`} data-prayer={prayerKey}>
      {active && <div className="prayer-cell__glow" aria-hidden="true" />}
      {active && (
        <div className="prayer-cell__star" aria-hidden="true">
          <ImamiStar size={13} opacity={0.9} />
        </div>
      )}
      <div className="prayer-cell__name">{name}</div>
      <div className="prayer-cell__time">{time}</div>
    </div>
  );
}

// Kiosk-unlock state controller. Returns the modal-state pair so the
// Dashboard can render an inline modal (native prompt/confirm are
// disabled in packaged Electron kiosk).
//   null                            — modal closed
//   { mode: 'confirm' }             — kiosk lock on, no PIN: yes/no
//   { mode: 'pin', error, pending } — kiosk lock + PIN required
function useKioskUnlockGuard() {
  const [unlock, setUnlock] = useState(null);
  useEffect(() => {
    const probe = async () => {
      const r = await verifySettingsPin('').catch(() => null);
      setUnlock(r?.required ? { mode: 'pin', error: '', pending: false } : { mode: 'confirm' });
    };
    // Main-process kiosk-unlock signal (e.g. Alt+F4 guard).
    const off = window.electron?.app?.onKioskUnlockRequest
      ? onKioskUnlockRequest(probe)
      : undefined;
    // Renderer-initiated exit — FloatingMenu fires this when the
    // operator taps «إغلاق التطبيق». Reuses the same confirm/PIN UI.
    const onWin = () => { probe(); };
    window.addEventListener('mithnah:request-exit', onWin);
    return () => {
      if (typeof off === 'function') off();
      window.removeEventListener('mithnah:request-exit', onWin);
    };
  }, []);
  return [unlock, setUnlock];
}

// Hook: reads the current mosque logo (PNG uploaded by the operator)
// as a data URL, re-fetching whenever main broadcasts `app:logo-changed`.
// null when nothing has been uploaded — Dashboard skips the <img> in
// that case so the masthead falls back to the text-only header.
function useMosqueLogo() {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      window.electron?.app?.getLogo?.()
        .then((r) => { if (!cancelled) setSrc(r?.ok ? (r.data || null) : null); })
        .catch(() => { if (!cancelled) setSrc(null); });
    };
    refresh();
    const off = window.electron?.app?.onLogoChanged?.(refresh);
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);
  return src;
}

export default function Dashboard() {
  const now = useClock();
  const state = usePrayerTimes();
  const hijri = useHijri();
  const config = useConfig();
  const { event, upcoming, hijriEffective } = useTodayEvents();
  const [unlock, setUnlock] = useKioskUnlockGuard();
  const [unlockPin, setUnlockPin] = useState('');
  const logoSrc = useMosqueLogo();

  const submitKioskQuit = async (pin) => {
    setUnlock((u) => u && { ...u, pending: true, error: '' });
    try {
      const res = await kioskQuit(pin);
      if (!res?.quitting) {
        setUnlock((u) => u && { ...u, pending: false, error: 'رمز غير صحيح' });
      } else {
        setUnlock(null);
      }
    } catch (err) {
      setUnlock((u) => u && { ...u, pending: false, error: 'فشل: ' + err.message });
    }
  };

  const today = state?.today;
  const next  = state?.next;
  const occasion = occasionFor(event, config?.occasionOverride);
  const mosqueName = (config?.mosqueName || 'مئذنة').trim();
  const clockFmt = config?.clockFormat === '12' ? '12' : '24';
  // Features live on `config.features`; we default each to its "sensible
  // default" (matching defaults.js::defaultFeatures) so the UI is correct
  // while config is still loading.
  const features = config?.features || {};
  const featureOn = (key, fallback = true) => (features[key] === undefined ? fallback : !!features[key]);

  useEffect(() => {
    document.documentElement.setAttribute('data-occasion', occasion);
  }, [occasion]);

  // Toggle the html[data-large-text] selector when the operator
  // flips the largeText feature flag in F3. CSS does the actual
  // scaling — this just flips a single attribute.
  useEffect(() => {
    const on = featureOn('largeText', false);
    document.documentElement.setAttribute('data-large-text', on ? 'true' : 'false');
  }, [features.largeText]);

  const clk = formatClock(now, clockFmt);
  const clock = toArabicDigits(clk.time);
  const clockSuffix = clk.suffix;
  const hijriText = hijri
    ? `${toArabicDigits(hijri.day)} ${hijri.monthAr} ${toArabicDigits(hijri.year)} هـ`
    : '';
  const greg = now.toLocaleDateString('ar-u-ca-gregory-nu-arab', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  // Shia 5-cell layout: fajr, sunrise, dhuhr, maghrib, midnight.
  // Asr is valid to pray after dhuhr but isn't announced as its own
  // cell in Shia practice (dhuhr/asr are typically combined). Isha is
  // replaced by midnight (منتصف الليل الشرعي), which is the Shia
  // jurisprudential cutoff for the night prayer window and more useful
  // on a wall display than showing isha as a fourth evening marker.
  // On narrow screens drop sunrise (informational, not a prayer
  // itself) so the other four cells can breathe.
  const isNarrow = useIsNarrow();
  const prayerOrder = isNarrow
    ? ['fajr', 'dhuhr', 'maghrib', 'midnight']
    : ['fajr', 'sunrise', 'dhuhr', 'maghrib', 'midnight'];

  // Reserve vertical space for the announcement banner when it's on
  // AND has text to show; otherwise the banner would float over the
  // masthead since it's absolute-positioned.
  const bannerActive = featureOn('announcementBanner', false) && !!(config?.announcementText || '').trim();

  return (
    <div className={`dashboard ${bannerActive ? 'dashboard--with-banner' : ''}`} dir="rtl">
      <StarPatternBg opacity={0.05} />
      {featureOn('announcementBanner', false) && (
        <AnnouncementBanner
          text={config?.announcementText}
          autoHideSeconds={Number(config?.announcementAutoHideSeconds) || 0}
        />
      )}
      {featureOn('qiblaDisplay', true) && <QiblaBadge />}
      {/* InfalliblesRotator retired 2026-04-23 per operator request —
          the 14-name rotator competed with the prayer cells for
          attention and offered no actionable information. Feature
          flag deleted from defaults in the same pass. */}
      <div className="dashboard__frame" aria-hidden="true" />
      <div className="dashboard__frame dashboard__frame--inner" aria-hidden="true" />

      <div className="dashboard__corner dashboard__corner--tr"><ArabesqueCorner size={78} opacity={0.55} rotate={0} /></div>
      <div className="dashboard__corner dashboard__corner--tl"><ArabesqueCorner size={78} opacity={0.55} rotate={90} /></div>
      <div className="dashboard__corner dashboard__corner--br"><ArabesqueCorner size={78} opacity={0.55} rotate={270} /></div>
      <div className="dashboard__corner dashboard__corner--bl"><ArabesqueCorner size={78} opacity={0.55} rotate={180} /></div>

      <div className="dashboard__grid">
        {/* ZONE 1 — header */}
        <header className="dashboard__header">
          <div className="masthead">
            <span className="masthead__rule masthead__rule--start" />
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="شعار المسجد"
                className="masthead__logo"
                /* Loaded from APPDATA via an IPC-delivered data URL so
                   cached across upgrades per the installer.nsh data-
                   preservation policy. A missing / corrupted file
                   falls back to the text header below. */
              />
            ) : (
              <span className="masthead__star"><ImamiStar size={16} opacity={0.7} /></span>
            )}
            <h1 className="masthead__title">{mosqueName}</h1>
            {logoSrc ? (
              <img src={logoSrc} alt="" aria-hidden="true" className="masthead__logo masthead__logo--mirror" />
            ) : (
              <span className="masthead__star"><ImamiStar size={16} opacity={0.7} /></span>
            )}
            <span className="masthead__rule masthead__rule--end" />
          </div>
          {config?.location?.name && (
            <div className="masthead__location">{config.location.name}</div>
          )}
          {hijriText && (
            <div className="dashboard__dates">
              <div className="dashboard__hijri">{hijriText}</div>
              <span className="dashboard__dates-dot" aria-hidden="true" />
              <div className="dashboard__greg">{greg}</div>
            </div>
          )}
        </header>

        {/* ZONE 2 — clock + mihrab + next prayer */}
        <section className="dashboard__clock-zone">
          <div className="dashboard__mihrab-halo" aria-hidden="true" />
          <div className="dashboard__mihrab" aria-hidden="true">
            <MihrabFull opacity={0.40} strokeWidth={1.35} />
          </div>

          <div className="clock">
            {clock}
            {clockSuffix && <span className="clock__suffix">{clockSuffix}</span>}
          </div>

          {next && (
            <div className="next">
              <div className="next__label-row">
                <span className="next__rule next__rule--start" />
                <ImamiStar size={12} opacity={0.8} />
                <span className="next__label">الصلاة القادمة</span>
                <ImamiStar size={12} opacity={0.8} />
                <span className="next__rule next__rule--end" />
              </div>
              <div className="next__pair">
                <div className="next__name">{PRAYER_NAMES_AR[next.name] || next.name}</div>
                <div className="next__time">{toArabicDigits(hhmmLocal(next.at, clockFmt))}</div>
              </div>
              <div className="next__countdown">بعد {formatCountdown(next.at, now.getTime())}</div>
            </div>
          )}
        </section>

        {/* ZONE 3 — event strip */}
        <div className="dashboard__event-strip">
          <EventStrip event={event} upcoming={upcoming} />
        </div>

        {/* ZONE 4 — prayer row + salawat */}
        <footer className="dashboard__footer">
          <TileBand height={14} opacity={0.35} />
          {featureOn('ramadanCountdown', true) && (
            <div style={{ textAlign: 'center' }}>
              <RamadanCountdown hijriEffective={hijriEffective} todayPrayerTimes={today} now={now} />
            </div>
          )}
          {/* FridayKhutbahTimer retired 2026-04-23 — the countdown to
              the Friday khutbah is interesting for ~90 minutes once a
              week and purely noise otherwise. The dashboard's
              upcoming-event strip already surfaces Jumu'ah when it's
              today, which is enough signal. */}
          {today?.timesIso && (
            <div className="prayer-row" style={{ gridTemplateColumns: `repeat(${prayerOrder.length}, 1fr)` }}>
              {prayerOrder.map((key) => {
                const iso = today.timesIso[key];
                return (
                  <PrayerCell
                    key={key}
                    prayerKey={key}
                    name={PRAYER_NAMES_AR[key]}
                    time={toArabicDigits(hhmmLocal(iso, clockFmt))}
                    active={next && next.name === key}
                  />
                );
              })}
            </div>
          )}
          <SalawatLine size="md" style={{ marginTop: 6 }} />
        </footer>
      </div>

      {/* Kiosk-unlock modal — replaces native confirm()/prompt(). */}
      {unlock && (
        <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl">
          <div className="inline-modal__bg" />
          <div className="inline-modal__card inline-modal__card--narrow">
            {unlock.mode === 'confirm' ? (
              <>
                <div className="inline-modal__title">إغلاق التطبيق</div>
                <div className="inline-modal__subtitle">هل تريد إيقاف التطبيق؟</div>
                <div className="inline-modal__buttons">
                  <button
                    type="button"
                    className="inline-modal__btn inline-modal__btn--primary"
                    onClick={() => submitKioskQuit('')}
                  >نعم، إيقاف</button>
                  <button
                    type="button"
                    className="inline-modal__btn"
                    onClick={() => setUnlock(null)}
                  >إلغاء</button>
                </div>
              </>
            ) : (
              <>
                <div className="inline-modal__title">قفل التطبيق</div>
                <div className="inline-modal__subtitle">أدخل رمز PIN لإيقاف التطبيق</div>
                <form
                  onSubmit={(e) => { e.preventDefault(); submitKioskQuit(unlockPin); setUnlockPin(''); }}
                >
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    className="inline-modal__input inline-modal__input--center"
                    value={unlockPin}
                    onChange={(e) => setUnlockPin(e.target.value)}
                    autoFocus
                    autoComplete="off"
                    disabled={unlock.pending}
                  />
                  {unlock.error && <div className="inline-modal__error">{unlock.error}</div>}
                  <div className="inline-modal__buttons">
                    <button
                      type="submit"
                      className="inline-modal__btn inline-modal__btn--primary"
                      disabled={unlock.pending}
                    >إيقاف</button>
                    <button
                      type="button"
                      className="inline-modal__btn"
                      onClick={() => { setUnlock(null); setUnlockPin(''); }}
                    >إلغاء</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
