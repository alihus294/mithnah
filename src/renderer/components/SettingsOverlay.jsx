// Settings overlay — F3 toggles it open. Every editable field is a dropdown
// where possible; text input only for mosque name and manual coordinates.
// The QR + PIN card lives here (never on the main wall view) so the
// congregation never sees pairing credentials on the broadcast screen.

import { useEffect, useRef, useState } from 'react';
import {
  getConfig, setConfig, setConfigDebounced, flushPendingConfig,
  listMethods, listCalendars,
  listMarjas, setMarja, setLocation, reverseGeocodeOnline,
  nearbyPlaces, searchPlaces, getRemoteStatus,
  verifySettingsPin, setSettingsPin, setAutoLaunch,
  exportConfig, importConfig, detectLocationFromTimezone,
  undoLastConfig, listConfigUndoStack
} from '../lib/ipc.js';
import { toArabicDigits } from '../lib/format.js';
import { friendlyErrorTitle } from '../lib/errors.js';
import { useModalActive } from '../lib/useModalActive.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { ImamiStar, BrandMark, SalawatLine } from './Ornaments.jsx';
import UpdateSection from './UpdateSection.jsx';

const CITIES = [
  { id: 'najaf',       nameAr: 'النجف',      lat: 32.0256, lng: 44.3269 },
  { id: 'karbala',     nameAr: 'كربلاء',      lat: 32.6163, lng: 44.0242 },
  { id: 'kadhimiya',   nameAr: 'الكاظمية',    lat: 33.3780, lng: 44.3380 },
  { id: 'samarra',     nameAr: 'سامراء',      lat: 34.1983, lng: 43.8742 },
  { id: 'mashhad',     nameAr: 'مشهد',        lat: 36.2974, lng: 59.6062 },
  { id: 'qom',         nameAr: 'قم',          lat: 34.6401, lng: 50.8764 },
  { id: 'tehran',      nameAr: 'طهران',        lat: 35.6892, lng: 51.3890 },
  { id: 'isfahan',     nameAr: 'أصفهان',      lat: 32.6546, lng: 51.6679 },
  { id: 'manama',      nameAr: 'المنامة',     lat: 26.2285, lng: 50.5860 },
  { id: 'damascus',    nameAr: 'دمشق',        lat: 33.5138, lng: 36.2765 },
  { id: 'sayyida_zaynab', nameAr: 'السيدة زينب', lat: 33.4434, lng: 36.3434 },
  { id: 'beirut',      nameAr: 'بيروت',        lat: 33.8938, lng: 35.5018 },
  { id: 'baalbek',     nameAr: 'بعلبك',        lat: 34.0058, lng: 36.2181 },
  { id: 'dearborn',    nameAr: 'ديربورن',      lat: 42.3223, lng: -83.1763 },
  { id: 'qatif',       nameAr: 'القطيف',       lat: 26.5209, lng: 50.0085 },
  { id: 'ahsa',        nameAr: 'الأحساء',      lat: 25.4295, lng: 49.5921 },
  { id: 'custom',      nameAr: 'مخصص — أدخل إحداثيات', lat: null, lng: null },
];

const MAGHRIB_DELAY_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 45, 60];
const DAY_OFFSETS = [-2, -1, 0, 1, 2];
const OCCASION_OPTIONS = [
  { id: 'auto',     label: 'تلقائي (من مناسبة اليوم)' },
  { id: 'normal',   label: 'عادي (ذهب نحاسي)' },
  { id: 'shahadah', label: 'شهادة (عقيق)' },
  { id: 'wiladah',  label: 'ولادة (ذهب دافئ)' },
  { id: 'eid',      label: 'عيد (أخضر طازج)' },
];

const CLOCK_FORMAT_OPTIONS = [
  { id: '24', label: 'نظام ٢٤ ساعة (١٤:٣٠)' },
  { id: '12', label: 'نظام ١٢ ساعة (٢:٣٠ م)' },
];

// Feature-flag list — grouped into 5 sections so the operator doesn't
// stare at a 13-row wall of toggles. Each group is rendered as its own
// labelled block in the Advanced tab; unknown keys are ignored.
// `dangerous: true` surfaces a faint warning colour on the row.
const FEATURE_GROUPS = [
  {
    id: 'accessibility',
    title: 'إمكانية الوصول',
    items: [
      { key: 'largeText', label: 'وضع الخط الكبير (للقراءة من بعيد)' },
    ],
  },
  {
    id: 'fiqh',
    title: 'فقه ومناسبات',
    items: [
      { key: 'maghribPivot', label: 'احتساب المناسبات من المغرب إلى المغرب' },
    ],
  },
  {
    id: 'display',
    title: 'عناصر العرض',
    items: [
      { key: 'announcementBanner', label: 'شريط الإعلانات أعلى الشاشة' },
      { key: 'ramadanCountdown',   label: 'العدّ التنازلي للإفطار في رمضان' },
      { key: 'qiblaDisplay',       label: 'عرض اتجاه القبلة والمسافة إلى مكة' },
    ],
  },
  {
    id: 'behavior',
    title: 'السلوك والإقلاع',
    items: [
      { key: 'autoContentToday', label: 'فتح دعاء اليوم تلقائياً عند الإقلاع' },
      { key: 'autoLaunch',       label: 'تشغيل التطبيق تلقائياً مع ويندوز' },
    ],
  },
  {
    id: 'security',
    title: 'أمان وصيانة',
    items: [
      { key: 'kioskLock',     label: 'قفل التطبيق (يمنع Alt+F4 بدون PIN)', dangerous: true },
      { key: 'settingsPin',   label: 'قفل الإعدادات برمز PIN', dangerous: true },
      { key: 'configBackup',  label: 'زرّ تصدير/استيراد الإعدادات' },
    ],
  },
];

// Flat list preserved for anywhere that still needs "is this a known
// toggle?" lookup.
const FEATURE_TOGGLES = FEATURE_GROUPS.flatMap((g) => g.items);

// Per-prayer minute adjustment. Range chosen to cover all plausible
// operator needs (iqama delay, local cloud-cover calibration) without
// letting them set a 4-hour offset by accident.
const ADJ_OPTIONS = [-15, -10, -5, -3, -1, 0, 1, 3, 5, 10, 15];
const PRAYER_KEYS = [
  { key: 'fajr',    label: 'الفجر' },
  { key: 'sunrise', label: 'الشروق' },
  { key: 'dhuhr',   label: 'الظهر' },
  { key: 'asr',     label: 'العصر' },
  { key: 'maghrib', label: 'المغرب' },
  { key: 'isha',    label: 'العشاء' },
];

const PLACE_LABEL = {
  city: 'مدينة',
  town: 'بلدة',
  village: 'قرية',
  hamlet: 'هجرة',
  suburb: 'حي',
  neighbourhood: 'حي صغير',
  isolated_dwelling: 'مسكن نائي',
};

function Field({ label, children, hint }) {
  return (
    <div className="settings__field">
      <label className="settings__label">{label}</label>
      {children}
      {hint && <div className="settings__hint">{hint}</div>}
    </div>
  );
}

export default function SettingsOverlay() {
  const [open, setOpen] = useState(false);
  const [config, setCfg] = useState(null);
  const [methods, setMethods] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [marjas, setMarjas] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState('info');
  const [nearby, setNearby] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [methodFilter, setMethodFilter] = useState('');
  const [marjaFilter, setMarjaFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // `pinGate` tri-state: null (not required), 'waiting' (overlay is open
  // but awaiting PIN entry before showing settings), 'ok' (verified).
  // Moved into the overlay's own render tree so the F3 keydown handler
  // can stay purely synchronous — async work there was suspected of
  // contributing to React error #310 (too many re-renders) on open.
  const [pinGate, setPinGate] = useState(null);
  const [pinInput, setPinInput] = useState('');
  // Bumped by the retry button; re-runs the heavy loader effect.
  const [reloadNonce, setReloadNonce] = useState(0);

  const lastFocusedRef = useRef(null);
  const closeBtnRef = useRef(null);
  // Container ref for the focus trap — Tab / Shift+Tab stay inside
  // the overlay instead of leaking back to the dashboard.
  const containerRef = useRef(null);
  useFocusTrap(containerRef, open);
  // openRef: declared at the top of the component (never after any
  // early return) so the hook count is stable across renders. The
  // earlier layout placed it AFTER `if (!open) return null` and
  // `if (!config) return <skeleton/>`, which caused a hook-count
  // mismatch between renders and a runtime crash.
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  // Take keyboard ownership away from the slideshow while F3 is open.
  useModalActive(open);

  // On overlay close, flush any pending debounced config write so the
  // last-touched value is persisted even if the operator hits Esc
  // immediately after changing a dropdown.
  useEffect(() => {
    if (open) return; // only run on close
    flushPendingConfig().catch(() => {});
  }, [open]);

  // Refresh the undo stack whenever the overlay opens or whenever
  // `config` changes (which it does after every successful save via
  // setCfg). MUST live with the other top-level hooks — placing it
  // after the early returns crashed the component with React error
  // #310 in 0.8.15.
  const [undoStackInternal, setUndoStackInternal] = useState([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listConfigUndoStack()
      .then((s) => { if (!cancelled) setUndoStackInternal(s || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, config]);

  // Inline modals — replace native window.prompt/confirm which are
  // disabled in Electron kiosk mode (a tap silently returned null
  // and the operator never saw a prompt). These are sub-states of
  // the overlay that render nested modal cards.
  const [pinSetState, setPinSetState] = useState(null); // null | { stage:'enter'|'confirm', firstPin, error }
  const [coordsState, setCoordsState] = useState(null); // null | { lat:'', lng:'', error }
  // Tabbed sections — splits the previous 2-column megaform into
  // bite-size groups so an elderly operator opens F3 and sees ONE
  // small focused page instead of 20 fields. Default tab is
  // 'basics' which holds mosque name + marja + clock + occasion.
  const [tab, setTab] = useState('basics');

  // F3 handler stays synchronous — no awaits, no IPC. We just toggle
  // open. Any required PIN gate is handled by the overlay itself in
  // its render tree (pinGate === 'waiting'), which avoids the async
  // race between keypress → IPC → state update that was suspected in
  // the "F3 crashes with React error #310" report.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setOpen((v) => !v);
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

  // When the overlay opens, decide whether a PIN gate is required. The
  // IPC call is fire-and-forget from a single effect run; a cancelled
  // flag keeps us from writing state after unmount. Default is null
  // (no gate) so a failing IPC doesn't lock the caretaker out.
  useEffect(() => {
    if (!open) { setPinGate(null); setPinInput(''); return; }
    let cancelled = false;
    verifySettingsPin('').then((probe) => {
      if (cancelled) return;
      setPinGate(probe?.required ? 'waiting' : 'ok');
    }).catch(() => {
      if (!cancelled) setPinGate('ok'); // don't lock out on IPC failure
    });
    return () => { cancelled = true; };
  }, [open]);

  // Debounced Nominatim search — triggers 400 ms after the last
  // keystroke. MUST live at the top with the other hooks; earlier
  // versions placed it after `if (!open) return null`, which gave
  // the component a different hook count between the closed render
  // (16 hooks) and the open render (17 hooks) and crashed with
  // React error #310 every time F3 was pressed.
  useEffect(() => {
    if (!open) return;
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await searchPlaces({ q, limit: 10 });
        if (cancelled || !openRef.current) return;
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (_) {
        if (cancelled || !openRef.current) return;
        setSearchResults([]);
      } finally {
        if (!cancelled && openRef.current) setSearchLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [open, searchQ]);

  // Load heavy settings data only AFTER the PIN gate passes. This
  // prevents the load effect from firing on an overlay that hasn't
  // been authenticated yet, and simplifies the re-render sequence on
  // first open (one effect at a time, not five kicking off in
  // parallel the moment F3 is pressed).
  useEffect(() => {
    if (!open || pinGate !== 'ok') return;
    lastFocusedRef.current = document.activeElement;
    let cancelled = false;

    const withTimeout = (name, promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after 3s`)), 3000)),
    ]);

    setMsg('جاري تحميل الإعدادات...'); setMsgKind('info');

    // Run each loader in its own try block so one failure doesn't
    // abort the rest. No shared state updates between loaders —
    // each one only writes its own slice.
    const loaders = [
      withTimeout('config',    getConfig()).then((v) => !cancelled && setCfg(v)).catch((err) => {
        if (!cancelled) console.warn('[settings] config load failed:', err.message);
      }),
      withTimeout('methods',   listMethods()).then((v) => !cancelled && setMethods(v || [])).catch(() => {}),
      withTimeout('calendars', listCalendars()).then((v) => !cancelled && setCalendars(v || [])).catch(() => {}),
      withTimeout('marjas',    listMarjas()).then((v) => !cancelled && setMarjas(v || [])).catch(() => {}),
      withTimeout('status',    getRemoteStatus()).then((v) => !cancelled && setStatus(v)).catch(() => {}),
    ];
    Promise.all(loaders).then(() => {
      if (!cancelled) setMsg('');
    });
    const id = setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => {
      clearTimeout(id);
      cancelled = true;
      if (lastFocusedRef.current?.focus) {
        try { lastFocusedRef.current.focus(); } catch (_) {}
      }
    };
  }, [open, pinGate, reloadNonce]);

  if (!open) return null;

  // PIN gate — if the overlay is open but a PIN is required, show a
  // small entry card instead of the full settings. The rest of the
  // component (hooks, state) already ran, so this conditional return
  // is safe AFTER all hook declarations.
  if (pinGate === 'waiting') {
    const onSubmit = async (ev) => {
      ev.preventDefault();
      try {
        const res = await verifySettingsPin(pinInput);
        if (res?.verified) {
          setPinGate('ok');
          setPinInput('');
          setMsg('');
        } else {
          setMsg('رمز غير صحيح');
          setMsgKind('err');
        }
      } catch (err) {
        setMsg(friendlyErrorTitle(err));
        setMsgKind('err');
      }
    };
    return (
      <div className="settings-overlay open" role="dialog" aria-modal="true" dir="rtl">
        <div className="settings-overlay__bg" onClick={() => setOpen(false)} />
        <div className="settings-overlay__card" style={{ padding: 40, maxWidth: 460, textAlign: 'center' }}>
          <div className="help-overlay__title" style={{ marginBottom: 8 }}>الإعدادات مُقفلة</div>
          <div className="help-overlay__subtitle" style={{ marginBottom: 20 }}>أدخل رمز PIN لفتح الإعدادات</div>
          <form onSubmit={onSubmit}>
            <input
              type="password"
              className="settings__input"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
              style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: 24 }}
              inputMode="numeric"
              pattern="\d{4,8}"
            />
            {msg && <div className={`settings__msg settings__msg--${msgKind}`} style={{ marginTop: 12 }}>{msg}</div>}
            <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="submit" className="settings__btn">فتح</button>
              <button type="button" className="settings__btn" onClick={() => setOpen(false)}>إلغاء · Esc</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // While config hasn't loaded yet, show a skeleton card with a live
  // close button so the operator can always dismiss — never a black
  // overlay that looks frozen. If an IPC actually fails, `msg` carries
  // the reason.
  if (!config) {
    return (
      <div className="settings-overlay open" role="dialog" aria-modal="true" dir="rtl">
        <div className="settings-overlay__bg" onClick={() => setOpen(false)} />
        <div className="settings-overlay__card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="help-overlay__head">
            <div className="help-overlay__head-title">
              <BrandMark size={44} showWordmark={false} />
              <div>
                <div className="help-overlay__title">مئذنة — الإعدادات</div>
                <div className="help-overlay__subtitle">{msg || 'جاري تحميل الإعدادات...'}</div>
              </div>
            </div>
            <button ref={closeBtnRef} className="help-overlay__close" onClick={() => setOpen(false)}>
              إغلاق · Esc
            </button>
          </div>
          {msg && msgKind === 'err' && (
            <div className="settings__msg settings__msg--err" style={{ marginTop: 20, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{msg}</span>
              <button
                type="button"
                className="settings__btn"
                onClick={() => setReloadNonce((n) => n + 1)}
              >↻ إعادة المحاولة</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // openRef/useEffect moved to the top of the component with the other
  // hooks — declaring them here (after `if (!open) return null` and
  // `if (!config) return <skeleton/>`) caused the hook count to differ
  // between renders, which React flags as an error.

  // Optimistically reflect the patch in local state immediately so the
  // form feels responsive, then let the debounced IPC coalesce rapid
  // dropdown changes into a single write. The returned merged config
  // wins — it comes back validated + fully populated from the main
  // process, which catches invalid inputs that the UI didn't guard.
  const apply = async (patch, kind = 'info', message = '') => {
    setSaving(true);
    // Optimistic local merge — same shallow+location+adjustments+
    // features shape the main-process merge uses.
    setCfg((prev) => prev ? ({
      ...prev,
      ...patch,
      location: { ...(prev.location || {}), ...(patch.location || {}) },
      adjustmentsMinutes: { ...(prev.adjustmentsMinutes || {}), ...(patch.adjustmentsMinutes || {}) },
      features: { ...(prev.features || {}), ...(patch.features || {}) },
    }) : prev);
    if (message) { setMsg(message); setMsgKind(kind); }
    try {
      const merged = await setConfigDebounced(patch);
      if (!openRef.current) return;
      setCfg(merged);
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  const onMosqueName = (e) => setCfg({ ...config, mosqueName: e.target.value });
  const commitMosqueName = () => apply({ mosqueName: config.mosqueName }, 'info', 'اسم المسجد محفوظ');

  const onMethod = (id) => apply({ method: id }, 'info', 'تم تغيير طريقة الحساب');

  const onMarja = async (id) => {
    setSaving(true);
    try {
      // Flush any pending debounced setConfig FIRST so the
      // main-process merge order is deterministic: user's previous
      // dropdown edits → then marja's preset → then future edits.
      // Without this, a pending 200ms patch could land AFTER
      // setMarja() and silently overwrite the marja-applied fields.
      await flushPendingConfig().catch(() => {});
      await setMarja(id);
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      setMsg('تم اختيار المرجع وتطبيق إعداداته'); setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  const onCalendar = (id) => apply({ calendar: id }, 'info', 'تم تغيير التقويم الهجري');
  const onDayOffset = (v) => apply({ calendarDayOffset: Number(v) }, 'info', 'تم ضبط إزاحة التقويم');
  const onMaghribDelay = (v) => apply({ maghribDelayMinutes: Number(v) }, 'info', 'تم ضبط تأخير المغرب');
  // onHideAsr/onHideIsha removed — the Dashboard always renders the
  // Shia 5-cell layout (fajr/sunrise/dhuhr/maghrib/midnight) so the
  // toggles don't affect anything visible.
  const onOccasion = (v) => apply({ occasionOverride: v }, 'info', 'تم ضبط وضع المناسبة');
  const onClockFormat = (v) => apply({ clockFormat: v }, 'info', v === '12' ? 'تم التبديل إلى نظام ١٢ ساعة' : 'تم التبديل إلى نظام ٢٤ ساعة');
  const onAdjustment = (prayer, minutes) => apply(
    { adjustmentsMinutes: { ...(config.adjustmentsMinutes || {}), [prayer]: Number(minutes) } },
    'info',
    `تم ضبط ${PRAYER_KEYS.find(p => p.key === prayer)?.label || prayer}`
  );

  const onFeatureToggle = async (key, nextOn) => {
    // Destructive flags need explicit confirm + dependent state setup.
    if (key === 'settingsPin' && nextOn) {
      // Open the inline PIN-set modal — the native prompt() returns
      // null in packaged Electron kiosk and the previous flow
      // silently failed to set a PIN.
      setPinSetState({ stage: 'enter', firstPin: '', error: '' });
      return; // the modal completes the flag-flip via finishPinSetup()
    }
    if (key === 'settingsPin' && !nextOn) {
      try { await setSettingsPin(''); } catch (_) {}
    }
    if (key === 'autoLaunch') {
      try {
        await setAutoLaunch(nextOn);
      } catch (err) {
        setMsg(friendlyErrorTitle(err)); setMsgKind('err');
        return;
      }
    }
    await apply(
      { features: { [key]: nextOn } },
      'info',
      `${FEATURE_TOGGLES.find(f => f.key === key)?.label || key} — ${nextOn ? 'مُفعَّل' : 'معطَّل'}`
    );
  };

  const onAnnouncementText = (e) => setCfg({ ...config, announcementText: e.target.value });
  const commitAnnouncementText = () => apply({ announcementText: config.announcementText || '' }, 'info', 'نص الإعلان محفوظ');

  const onSupportContact = (e) => setCfg({ ...config, supportContact: e.target.value });
  const commitSupportContact = () => apply({ supportContact: config.supportContact || '' }, 'info', 'بيانات الدعم محفوظة');
  const onImamName = (e) => setCfg({ ...config, imamName: e.target.value });
  const commitImamName = () => apply({ imamName: config.imamName || '' }, 'info', 'اسم الإمام محفوظ');

  // (undo-stack refresh useEffect moved to the top of the component
  //  with the other hooks — declaring it here, AFTER the two early
  //  returns above, was the React error #310 bug that crashed F3
  //  in 0.8.15.)

  const onUndo = async () => {
    try { await undoLastConfig(); }
    catch (err) { setMsg(friendlyErrorTitle(err)); setMsgKind('err'); }
  };

  const onExportConfig = async () => {
    try {
      const result = await exportConfig();
      if (!openRef.current) return;
      if (result?.cancelled) { setMsg('تم إلغاء التصدير'); setMsgKind('info'); return; }
      setMsg(`تم التصدير إلى: ${result?.path || '—'}`); setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    }
  };
  const onImportConfig = async () => {
    try {
      const result = await importConfig();
      if (!openRef.current) return;
      if (result?.cancelled) { setMsg('تم إلغاء الاستيراد'); setMsgKind('info'); return; }
      setCfg(result.config);
      setMsg('تم استيراد الإعدادات بنجاح'); setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    }
  };

  const onCityChange = async (id) => {
    const city = CITIES.find((c) => c.id === id);
    if (!city || city.id === 'custom') return;
    setSaving(true);
    try {
      // Flush any pending debounced config write so it can't land
      // after setLocation and stomp the new coordinates.
      await flushPendingConfig().catch(() => {});
      await setLocation({ lat: city.lat, lng: city.lng, name: city.nameAr, alignMethodToRegion: false });
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      setMsg(`تم ضبط الموقع إلى ${city.nameAr}`); setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  // Auto-detect the location with progressive fallback:
  //   1. HTML5 geolocation (works on laptops with a GPS chip or when
  //      Google's WiFi positioning is reachable)
  //   2. System timezone → mapped city (always works offline; the
  //      timezone table covers every major Shia-majority region)
  //
  // The earlier build relied only on #1, which silently failed on a
  // desktop Electron instance that can't reach the Google endpoint
  // the offline-network policy blocks. The fallback guarantees a
  // result the operator can visibly verify, even without any network.
  const onDetectGps = async () => {
    setSaving(true);
    setMsg('جاري تحديد الموقع...'); setMsgKind('info');
    // Same race-protection as the other location mutators.
    await flushPendingConfig().catch(() => {});
    const apply = async (lat, lng, name, source, accuracy) => {
      await setLocation({ lat, lng, name, alignMethodToRegion: false });
      await setConfig({
        locationAccuracyMeters: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        locationSource: source,
        locationFixedAt: new Date().toISOString()
      });
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      const accText = Number.isFinite(accuracy) ? ` (دقة ${Math.round(accuracy)} م)` : '';
      const srcText = source === 'gps' ? 'GPS' : source === 'timezone' ? 'المنطقة الزمنية' : source;
      setMsg(`تم ضبط الموقع — ${name} · ${srcText}${accText}`); setMsgKind('info');
    };

    // Step 1 — HTML5 geolocation with a short timeout. If the desktop
    // has no GPS chip AND the WiFi-positioning network call is
    // blocked, this rejects quickly and we move on.
    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('GPS timeout')), 8000);
          navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(t); resolve(p); },
            (e) => { clearTimeout(t); reject(e); },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
          );
        });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || null;
        let name = 'موقع GPS';
        try {
          const geo = await reverseGeocodeOnline({ lat, lng });
          if (geo?.name) name = geo.name;
        } catch (_) {}
        await apply(lat, lng, name, 'gps', accuracy);
        setSaving(false);
        return;
      } catch (err) {
        console.warn('[settings] HTML5 geolocation failed, falling back to timezone:', err?.message);
        setMsg('تعذّر GPS — جاري المحاولة عبر المنطقة الزمنية...'); setMsgKind('info');
      }
    }

    // Step 2 — we DO NOT auto-apply a timezone fallback. Timezone
    // detection for Saudi Arabia returns Riyadh for every Saudi city,
    // which dropped the Ahsa operator 400 km off. Instead we tell the
    // operator to pick their city from the search box above; the
    // timezone hint can seed that box but the operator confirms.
    setMsg('تعذّر GPS — يرجى كتابة اسم مدينتك في مربع البحث أعلاه');
    setMsgKind('err');
    try {
      const tz = await detectLocationFromTimezone();
      if (tz?.name) setSearchQ(tz.name); // seed the search box only
    } catch (_) {}
    if (openRef.current) setSaving(false);
  };

  const onCustomCoords = () => {
    // Open the inline coordinates modal — native prompt() doesn't
    // work in packaged Electron kiosk so the operator never saw the
    // dialog. The modal renders as part of the overlay tree (search
    // for `coordsState` in the JSX below).
    setCoordsState({
      lat: String(config.location?.lat || ''),
      lng: String(config.location?.lng || ''),
      error: ''
    });
  };

  // Two-stage PIN entry. Stage 1 collects the first PIN; stage 2
  // collects a confirmation. Only when both match do we save and
  // flip the feature flag.
  const finishPinSetup = async (typed) => {
    if (!pinSetState) return;
    if (pinSetState.stage === 'enter') {
      if (!/^\d{4,8}$/.test(typed)) {
        setPinSetState({ ...pinSetState, error: 'الرمز يجب أن يكون ٤–٨ أرقام' });
        return;
      }
      setPinSetState({ stage: 'confirm', firstPin: typed, error: '' });
      return;
    }
    // confirm stage
    if (typed !== pinSetState.firstPin) {
      setPinSetState({ stage: 'enter', firstPin: '', error: 'الرمزان غير متطابقين — أدخل من جديد' });
      return;
    }
    try {
      await setSettingsPin(typed);
      setPinSetState(null);
      // Now actually flip the feature flag.
      await apply({ features: { settingsPin: true } }, 'info', 'تم تفعيل قفل الإعدادات بنجاح');
    } catch (err) {
      setPinSetState({ ...pinSetState, error: friendlyErrorTitle(err) });
    }
  };

  const finishCustomCoords = async () => {
    const lat = Number(coordsState.lat);
    const lng = Number(coordsState.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordsState((s) => ({ ...s, error: 'خط العرض غير صالح (-٩٠ إلى ٩٠)' }));
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setCoordsState((s) => ({ ...s, error: 'خط الطول غير صالح (-١٨٠ إلى ١٨٠)' }));
      return;
    }
    setSaving(true);
    setCoordsState(null);
    try {
      await flushPendingConfig().catch(() => {});
      let name = 'Custom';
      const geo = await reverseGeocodeOnline({ lat, lng }).catch(() => null);
      if (geo && geo.name) name = geo.name;
      await setLocation({ lat, lng, name, alignMethodToRegion: false });
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      setMsg(`تم ضبط الموقع — ${name}`); setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  const onFindNearby = async () => {
    if (!config.location) return;
    setNearbyLoading(true);
    setMsg('جاري البحث عن أقرب المواقع (مدن/قرى/هجر/أحياء)...');
    setMsgKind('info');
    try {
      const places = await nearbyPlaces({ lat: config.location.lat, lng: config.location.lng, radiusKm: 15 });
      if (!openRef.current) return;
      setNearby(places || []);
      setMsg(places && places.length ? `وُجد ${toArabicDigits(places.length)} موقع — اختر من القائمة` : 'لم يُعثر على مواقع قريبة — تحقق من الاتصال');
      setMsgKind(places && places.length ? 'info' : 'err');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err));
      setMsgKind('err');
    } finally {
      if (openRef.current) setNearbyLoading(false);
    }
  };

  const onPickNearby = async (value) => {
    if (!value) return;
    const place = nearby.find((p) => p.id === value);
    if (!place) return;
    setSaving(true);
    try {
      await flushPendingConfig().catch(() => {});
      await setLocation({ lat: place.lat, lng: place.lng, name: place.nameAr || place.name, alignMethodToRegion: false });
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      setMsg(`تم ضبط الموقع إلى ${place.nameAr || place.name}`);
      setMsgKind('info');
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err));
      setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  // Nominatim search useEffect moved to the top of the component
  // (with the other hooks) — declaring it here, AFTER two early
  // returns, was the hook-count mismatch that produced React error
  // #310 ("Rendered more hooks than during the previous render")
  // every time F3 was pressed. Left as a comment marker for code
  // readers.

  const onPickSearch = async (place) => {
    setSaving(true);
    try {
      await flushPendingConfig().catch(() => {});
      await setLocation({ lat: place.lat, lng: place.lng, name: place.name, alignMethodToRegion: false });
      const cfg = await getConfig();
      if (!openRef.current) return;
      setCfg(cfg);
      setMsg(`تم ضبط الموقع إلى ${place.name}`);
      setMsgKind('info');
      setSearchQ('');
      setSearchResults([]);
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err));
      setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  const onOnlineNameRefresh = async () => {
    if (!config.location) return;
    setSaving(true); setMsg('جاري استعلام OpenStreetMap...'); setMsgKind('info');
    try {
      const geo = await reverseGeocodeOnline({ lat: config.location.lat, lng: config.location.lng });
      if (!openRef.current) return;
      if (geo && geo.name) {
        await flushPendingConfig().catch(() => {});
        await setLocation({ lat: config.location.lat, lng: config.location.lng, name: geo.name });
        const cfg = await getConfig();
        if (!openRef.current) return;
        setCfg(cfg);
        setMsg(`الاسم محدَّث: ${geo.name}${geo.source === 'offline-fallback' ? ' (أقرب مدينة)' : ''}`);
        setMsgKind('info');
      } else {
        setMsg('لم يُعثر على اسم — لا إنترنت أو منطقة نائية'); setMsgKind('err');
      }
    } catch (err) {
      if (!openRef.current) return;
      setMsg(friendlyErrorTitle(err)); setMsgKind('err');
    } finally {
      if (openRef.current) setSaving(false);
    }
  };

  const urlShort = (status?.url || '').replace(/^https?:\/\//, '');
  const pin = status?.pin || '';
  const qr = status?.qrCodeDataUrl || null;
  const loc = config.location || {};

  return (
    <div ref={containerRef} className="settings-overlay open" role="dialog" aria-modal="true" dir="rtl">
      <div className="settings-overlay__bg" onClick={() => setOpen(false)} />
      <div className="settings-overlay__card">
        <div className="help-overlay__star help-overlay__star--tr"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--tl"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--br"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--bl"><ImamiStar size={20} opacity={0.6} /></div>

        <div className="help-overlay__head">
          <div className="help-overlay__head-title">
            <BrandMark size={44} showWordmark={false} />
            <div>
              <div className="help-overlay__title">مئذنة — الإعدادات</div>
              <div className="help-overlay__subtitle">F3 أو Esc للإغلاق · كل التغييرات تُحفظ فوراً</div>
            </div>
          </div>
          <button ref={closeBtnRef} className="help-overlay__close" onClick={() => setOpen(false)}>
            إغلاق · Esc
          </button>
        </div>

        {msg && (
          <div className={`settings__msg settings__msg--${msgKind}`}>{saving ? '... ' : ''}{msg}</div>
        )}

        {/* Tab bar — split the megaform into 4 focused tabs so an
            elderly operator opens F3 and sees a small page instead
            of 20 fields. Default tab is الأساسية. */}
        <div className="settings__tabs" role="tablist">
          {[
            { id: 'basics',   label: 'الأساسية',  icon: '✦' },
            { id: 'prayer',   label: 'الصلاة',    icon: '☪' },
            { id: 'location', label: 'الموقع',    icon: '◎' },
            { id: 'advanced', label: 'متقدّم',    icon: '⚙' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`settings__tab ${tab === t.id ? 'settings__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="settings__tab-icon" aria-hidden="true">{t.icon}</span>
              <span className="settings__tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="settings__tab-panel" role="tabpanel" key={tab}>

        {/* "What is currently saved" summary — shown at the top of every
            tab so the operator sees their live configuration even if
            the input fields themselves are blank (search boxes, etc.).
            Rows that would duplicate the tab's main content are hidden
            per-tab (e.g. the Location tab's own field already shows
            `loc.name` prominently, so we omit it from the summary). */}
        <div className="settings__summary">
          <div className="settings__summary-title">القيم الحاليّة</div>
          <div className="settings__summary-grid">
            {tab !== 'basics' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">المسجد</span>
                <span className="settings__summary-val">{config.mosqueName || '—'}</span>
              </div>
            )}
            {tab !== 'basics' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">الإمام</span>
                <span className="settings__summary-val">{config.imamName || '—'}</span>
              </div>
            )}
            {tab !== 'location' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">الموقع</span>
                <span className="settings__summary-val">{loc.name || '—'}</span>
              </div>
            )}
            {tab !== 'prayer' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">طريقة الحساب</span>
                <span className="settings__summary-val">{(methods.find(m => m.id === config.method)?.ar) || config.method || '—'}</span>
              </div>
            )}
            {tab !== 'prayer' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">التقويم</span>
                <span className="settings__summary-val">{(calendars.find(c => c.id === config.calendar)?.ar) || config.calendar || '—'}</span>
              </div>
            )}
            {tab !== 'basics' && (
              <div className="settings__summary-row">
                <span className="settings__summary-key">الساعة</span>
                <span className="settings__summary-val">{config.clockFormat === '12' ? '١٢ ساعة' : '٢٤ ساعة'}</span>
              </div>
            )}
          </div>
        </div>

        {tab === 'basics' && (
          <>
            <Field label="اسم المسجد">
              <input
                type="text" className="settings__input"
                value={config.mosqueName || ''}
                onChange={onMosqueName}
                onBlur={commitMosqueName}
                maxLength={120}
                placeholder="مثال: مسجد الإمام علي، ديربورن"
              />
            </Field>

            <Field label="اسم الإمام" hint="يظهر في شاشة متابعة الصلاة (F5) ليعرف الجمهور من يصلّي بهم.">
              <input
                type="text" className="settings__input"
                value={config.imamName || ''}
                onChange={onImamName}
                onBlur={commitImamName}
                maxLength={120}
                placeholder="مثال: الشيخ محمد البوعلي"
              />
            </Field>

            {/* Marja field removed — operator-requested simplification.
                Choosing a method directly (in the الصلاة tab) gives the
                same outcome without forcing the caretaker to pick a
                scholar they may not follow. */}

            <Field label="نظام عرض الساعة">
              <select className="settings__select" value={config.clockFormat || '12'} onChange={(e) => onClockFormat(e.target.value)}>
                {CLOCK_FORMAT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="وضع المناسبة (لون المناسبة)">
              <select className="settings__select" value={config.occasionOverride || 'auto'} onChange={(e) => onOccasion(e.target.value)}>
                {OCCASION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </Field>

            {(config.features || {}).announcementBanner && (
              <>
                <Field label="نص الإعلان" hint="يظهر كشريط متحرك أعلى الشاشة — أفرغ النص لإخفائه مؤقتاً بدون إيقاف الميزة.">
                  <input
                    type="text" className="settings__input"
                    value={config.announcementText || ''}
                    onChange={onAnnouncementText}
                    onBlur={commitAnnouncementText}
                    maxLength={240}
                    placeholder="مثال: صلاة الجماعة اليوم بعد المغرب بعشر دقائق"
                  />
                </Field>
                <Field label="إخفاء الإعلان تلقائياً" hint="اختر 'بدون' لإبقاء الإعلان دائماً، أو مدّة لإخفائه تلقائياً — ويمكن دائماً إخفاؤه يدوياً بزرّ × على الشاشة.">
                  <select
                    className="settings__select"
                    value={Number(config.announcementAutoHideSeconds) || 0}
                    onChange={(e) => apply({ announcementAutoHideSeconds: Number(e.target.value) }, 'info', 'تم ضبط مدّة الإعلان')}
                  >
                    <option value="0">بدون (يبقى حتى يُغلق يدوياً)</option>
                    <option value="30">بعد {toArabicDigits(30)} ثانية</option>
                    <option value="60">بعد دقيقة</option>
                    <option value="120">بعد دقيقتين</option>
                    <option value="300">بعد {toArabicDigits(5)} دقائق</option>
                    <option value="600">بعد {toArabicDigits(10)} دقائق</option>
                    <option value="1800">بعد نصف ساعة</option>
                    <option value="3600">بعد ساعة</option>
                  </select>
                </Field>
              </>
            )}
          </>
        )}

        {tab === 'prayer' && (
          <>
            <Field label="طريقة الحساب">
              <input
                type="search" className="settings__input"
                placeholder="بحث في الطرق..." value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <select className="settings__select" value={config.method} onChange={(e) => onMethod(e.target.value)}>
                {methods
                  .filter((m) => !methodFilter || (m.ar + ' ' + (m.en || '') + ' ' + m.id).toLowerCase().includes(methodFilter.toLowerCase()))
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.ar} {m.fiqh === 'auto' ? '✦' : ''}</option>
                  ))
                }
              </select>
            </Field>

            <Field label="التقويم الهجري">
              <select className="settings__select" value={config.calendar} onChange={(e) => onCalendar(e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.ar || c.name || c.id}</option>
                ))}
              </select>
            </Field>

            <Field label="إزاحة التقويم (يوم)" hint="استخدمها إذا مرجعك يُعلن الرؤية يوماً عن الحساب الفلكي">
              <select className="settings__select" value={config.calendarDayOffset || 0} onChange={(e) => onDayOffset(e.target.value)}>
                {DAY_OFFSETS.map((d) => (
                  <option key={d} value={d}>{d > 0 ? `+${toArabicDigits(d)}` : d < 0 ? `${toArabicDigits(d)}` : toArabicDigits(0)}</option>
                ))}
              </select>
            </Field>

            {/* "تأخير المغرب" field retired in 0.8.33 — operator
                pointed out it duplicates the per-prayer adjustment
                below. A single source of truth (adjustmentsMinutes.
                maghrib) is cleaner; legacy `maghribDelayMinutes` is
                still honoured by prayer-times/index.js on load but
                no longer editable from the UI. */}

            <Field label="تعديل أوقات الصلاة (بالدقيقة)" hint="ضبط يدوي يُضاف إلى حساب المكتبة — للتعويض عن عوامل محلية كالسحب أو جدول الإقامة">
              <div className="settings__adjust-grid">
                {PRAYER_KEYS.map((p) => {
                  const cur = (config.adjustmentsMinutes || {})[p.key] || 0;
                  return (
                    <label key={p.key} className="settings__adjust-row">
                      <span className="settings__adjust-label">{p.label}</span>
                      <select
                        className="settings__select settings__adjust-select"
                        value={cur}
                        onChange={(e) => onAdjustment(p.key, e.target.value)}
                      >
                        {ADJ_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v > 0 ? `+${toArabicDigits(v)}` : v === 0 ? toArabicDigits(0) : toArabicDigits(v)} د</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </Field>
          </>
        )}

        {tab === 'location' && (
          <Field label="الموقع الحالي" hint={loc.name || '—'}>
            {typeof navigator !== 'undefined' && navigator.onLine === false && (
              <div className="settings__msg settings__msg--err" style={{ marginBottom: 10 }}>
                لا يوجد اتصال بالإنترنت — البحث وتحديث الاسم لن يعمل. يرجى الاتصال بشبكة ثم إعادة المحاولة.
              </div>
            )}
            <input
              type="search" className="settings__input"
              placeholder="ابحث عن دولة/منطقة/مدينة/قرية/حي..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {searchLoading && <div className="settings__hint" style={{ marginTop: 6, marginBottom: 6 }}>جاري البحث...</div>}
            {searchResults.length > 0 && (
              <div className="settings__search-results">
                {searchResults.map((r) => (
                  <button key={r.id} type="button" className="settings__search-result" onClick={() => onPickSearch(r)}>
                    <div className="settings__search-result-name">{r.name}</div>
                    <div className="settings__search-result-detail">{r.displayName}</div>
                  </button>
                ))}
              </div>
            )}
            <input
              type="search" className="settings__input"
              placeholder="أو اختر من قائمة المدن الشيعية المحفوظة..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={{ marginTop: 10, marginBottom: 6 }}
            />
            <select className="settings__select" value="" onChange={(e) => onCityChange(e.target.value)}>
              <option value="">— اختر من القائمة —</option>
              {CITIES
                .filter((c) => !cityFilter || c.nameAr.includes(cityFilter))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.nameAr}</option>
                ))
              }
            </select>
            <div className="settings__location-row">
              <button className="settings__btn" type="button" onClick={onDetectGps} disabled={saving}>
                تحديد الموقع بـ GPS
              </button>
              <button className="settings__btn" type="button" onClick={onFindNearby} disabled={nearbyLoading}>
                {nearbyLoading ? 'جاري البحث...' : 'أقرب الأماكن (مدن/قرى/هجر/أحياء)'}
              </button>
              <button className="settings__btn" type="button" onClick={onCustomCoords}>إحداثيات يدوية</button>
              <button className="settings__btn" type="button" onClick={onOnlineNameRefresh}>تحديث الاسم</button>
            </div>
            {nearby.length > 0 && (
              <select
                className="settings__select"
                style={{ marginTop: 10 }}
                value=""
                onChange={(e) => onPickNearby(e.target.value)}
              >
                <option value="">— اختر من {toArabicDigits(nearby.length)} موقع قريب —</option>
                {nearby.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.nameAr || p.name)} — {PLACE_LABEL[p.place] || p.place} · {toArabicDigits(p.distanceKm.toFixed(1))} كم
                  </option>
                ))}
              </select>
            )}
            <div className="settings__hint">
              {toArabicDigits(Number(loc.lat).toFixed(4))}، {toArabicDigits(Number(loc.lng).toFixed(4))}
              {Number.isFinite(config.locationAccuracyMeters) && ` · دقة ${toArabicDigits(config.locationAccuracyMeters)} م`}
            </div>
          </Field>
        )}

        {tab === 'advanced' && (
          <>
            <UpdateSection />

            <Field label="الميزات — تشغيل/إيقاف" hint="كل ميزة تعمل مستقلّة؛ الإيقاف يُخفيها فوراً بدون إعادة تشغيل. الميزات مجمّعة حسب الغرض لتسهيل الفحص.">
              <div className="settings__feature-groups">
                {FEATURE_GROUPS.map((group) => (
                  <div key={group.id} className="settings__feature-group">
                    <div className="settings__feature-group-title">{group.title}</div>
                    <div className="settings__features">
                      {group.items.map((f) => {
                        const on = (config.features || {})[f.key] === true;
                        return (
                          <label key={f.key} className={`settings__feature-row${f.dangerous ? ' settings__feature-row--warn' : ''}`}>
                            <span className="settings__feature-label">{f.label}</span>
                            <select
                              className="settings__select settings__feature-select"
                              value={on ? 'on' : 'off'}
                              onChange={(e) => onFeatureToggle(f.key, e.target.value === 'on')}
                            >
                              <option value="off">معطَّل</option>
                              <option value="on">مُفعَّل</option>
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Field>

            <Field label="جهة الدعم (الاسم والرقم)" hint="يظهر في شاشة المساعدة F1 ليتذكّر القائم على المسجد بمن يتصل عند الحاجة.">
              <input
                type="text" className="settings__input"
                value={config.supportContact || ''}
                onChange={onSupportContact}
                onBlur={commitSupportContact}
                maxLength={200}
                placeholder="مثال: محمد العلي · ٠٥٠١٢٣٤٥٦٧"
              />
            </Field>

            {(config.features || {}).configBackup && (
              <Field label="النسخ الاحتياطي" hint="احفظ/استرجع ملف الإعدادات كاملاً — مفيد قبل إعادة تنصيب ويندوز.">
                <div className="settings__location-row">
                  <button className="settings__btn" type="button" onClick={onExportConfig}>تصدير الإعدادات</button>
                  <button className="settings__btn" type="button" onClick={onImportConfig}>استيراد الإعدادات</button>
                </div>
              </Field>
            )}

            {/* "آخر التغييرات" — visible journal of the last 10 config
                writes since the app started. The operator can scan
                what changed and tap "تراجع آخر تغيير" to roll back. */}
            <Field label="آخر التغييرات" hint="آخر ١٠ تعديلات منذ تشغيل التطبيق. يمكنك التراجع عن آخر تغيير بنقرة واحدة.">
              {undoStackInternal.length === 0 ? (
                <div className="settings__hint" style={{ padding: '8px 0' }}>لا تغييرات بعد.</div>
              ) : (
                <div className="settings__changelog">
                  <button type="button" className="settings__btn" onClick={onUndo}>↶ تراجع آخر تغيير</button>
                  <ol className="settings__changelog-list">
                    {[...undoStackInternal].reverse().map((entry, i) => {
                      const changes = entry.summary?.changes || [];
                      return (
                        <li key={entry.ts + ':' + i}>
                          <span className="settings__changelog-when">
                            {new Date(entry.ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          {changes.length > 0 ? (
                            <ul className="settings__changelog-changes">
                              {changes.map((c, j) => (
                                <li key={j} className="settings__changelog-change">{c}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="settings__changelog-summary">حفظ بدون تغييرات ظاهرة</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </Field>

            <div className="settings__connect">
              <div className="settings__connect-title">الاتصال من الجوال</div>
              <div className="settings__connect-row">
                {qr && (
                  <div className="settings__qr-wrap">
                    <img className="settings__qr" src={qr} alt="QR للاتصال" />
                  </div>
                )}
                <div className="settings__connect-info">
                  <div className="settings__connect-label">الرابط</div>
                  <div className="settings__connect-url">{urlShort}</div>
                  <div className="settings__connect-label" style={{ marginTop: 10 }}>رمز الدخول</div>
                  {/* bdi keeps the digits as a single LTR run (so "8725"
                      reads left-to-right as a number) without affecting
                      the surrounding flex alignment. Previously `dir="ltr"`
                      on the div itself shifted the whole block within the
                      RTL flex parent — operator asked for the number to
                      stay at its old position on the right. */}
                  <div className="settings__connect-pin"><bdi>{pin}</bdi></div>
                </div>
              </div>
              <div className="settings__hint">هذا الكود يظهر هنا فقط — لا يُعرض على شاشة القاعة</div>
            </div>
          </>
        )}

        </div>

        <SalawatLine size="sm" style={{ marginTop: 16 }} />
      </div>

      {/* Inline PIN-set modal — replaces native prompt() which doesn't
          render in packaged Electron kiosk. Two-stage entry; on
          mismatch we reset to stage 1 and message the operator. */}
      {pinSetState && (
        <InlinePromptModal
          title={pinSetState.stage === 'enter' ? 'أدخل رمز PIN جديداً' : 'أكّد الرمز'}
          subtitle={pinSetState.stage === 'enter' ? '٤–٨ أرقام · سيُطلب لفتح الإعدادات' : 'أعد كتابة نفس الرمز'}
          inputType="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          autoFocus
          error={pinSetState.error}
          onSubmit={finishPinSetup}
          onCancel={() => setPinSetState(null)}
          submitLabel="متابعة"
        />
      )}

      {/* Inline custom-coordinates modal — same reasoning. Two number
          inputs in a single submit. */}
      {coordsState && (
        <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl">
          <div className="inline-modal__bg" onClick={() => setCoordsState(null)} />
          <div className="inline-modal__card">
            <div className="inline-modal__title">إحداثيات يدوية</div>
            <div className="inline-modal__subtitle">أدخل خط العرض والطول بالأرقام العشرية</div>
            <div className="inline-modal__field">
              <label className="inline-modal__label">خط العرض (Latitude)</label>
              <input
                type="number" step="0.00001" inputMode="decimal"
                className="inline-modal__input"
                value={coordsState.lat}
                onChange={(e) => setCoordsState({ ...coordsState, lat: e.target.value, error: '' })}
                autoFocus
              />
            </div>
            <div className="inline-modal__field">
              <label className="inline-modal__label">خط الطول (Longitude)</label>
              <input
                type="number" step="0.00001" inputMode="decimal"
                className="inline-modal__input"
                value={coordsState.lng}
                onChange={(e) => setCoordsState({ ...coordsState, lng: e.target.value, error: '' })}
              />
            </div>
            {coordsState.error && <div className="inline-modal__error">{coordsState.error}</div>}
            <div className="inline-modal__buttons">
              <button type="button" className="inline-modal__btn inline-modal__btn--primary" onClick={finishCustomCoords}>حفظ</button>
              <button type="button" className="inline-modal__btn" onClick={() => setCoordsState(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight reusable single-input prompt modal. Used inside
// SettingsOverlay for PIN entry (replacing native window.prompt which
// is disabled in packaged Electron). Self-contained: keeps its own
// input state so the parent's flow is just "open with title, await
// onSubmit(value)".
function InlinePromptModal({ title, subtitle, inputType = 'text', inputMode, pattern, autoFocus, error, onSubmit, onCancel, submitLabel = 'حفظ' }) {
  const [value, setValue] = useState('');
  const onKeyDown = (e) => { if (e.key === 'Escape') onCancel(); };
  return (
    <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl" onKeyDown={onKeyDown}>
      <div className="inline-modal__bg" onClick={onCancel} />
      <div className="inline-modal__card inline-modal__card--narrow">
        <div className="inline-modal__title">{title}</div>
        {subtitle && <div className="inline-modal__subtitle">{subtitle}</div>}
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); setValue(''); }}>
          <input
            type={inputType}
            inputMode={inputMode}
            pattern={pattern}
            className="inline-modal__input inline-modal__input--center"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={autoFocus}
            autoComplete="off"
          />
          {error && <div className="inline-modal__error">{error}</div>}
          <div className="inline-modal__buttons">
            <button type="submit" className="inline-modal__btn inline-modal__btn--primary">{submitLabel}</button>
            <button type="button" className="inline-modal__btn" onClick={onCancel}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
