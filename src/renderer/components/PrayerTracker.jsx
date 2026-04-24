// Live prayer tracker — F5 opens a fullscreen overlay so anyone
// walking into the mosque mid-prayer can see WHERE THE IMAM IS RIGHT
// NOW. The display is intentionally bare: imam's name, current rakah,
// and at the end the Tasbih al-Zahra count sheet. NO step-by-step
// teaching ("now do qunoot, now do ruku") — the imam doesn't need a
// tutor and the congregation doesn't need a religious-school screen.
// Operator drives it with arrow keys / Space / a Logitech R400 from
// behind the imam.
//
// The earlier 0.8.x builds embedded a 12-step ritual breakdown
// (takbir → fatiha → surah → qunoot → ruku → ...). The Ahsa operator
// pointed out — correctly — that this turned the wall into a teacher
// and added zero value for someone glancing at it from the back row.
// Reduced to: imam name → الركعة الأولى → الركعة الثانية → ... →
// التسليم → تسبيح الزهراء.

import { useEffect, useRef, useState, useCallback } from 'react';
import { ImamiStar, BrandMark, SalawatLine } from './Ornaments.jsx';
import { toArabicDigits } from '../lib/format.js';
import { getConfig, setConfig, getTodayAndNext, onConfigChanged } from '../lib/ipc.js';
import { useModalActive } from '../lib/useModalActive.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Build the simplified tracker sequence. Each entry is one cell the
// operator advances through. For a 4-rakah prayer:
//   ركعة ١ → ركعة ٢ → ركعة ٣ → ركعة ٤ → تسبيح الزهراء
//
// Salam was its own cell in 0.8.16 — the operator removed it
// because it added zero value (the tasbih screen already implies
// the prayer is complete) and the extra step slowed the operator's
// remote work behind the imam.
function buildSequence(rakahs) {
  const seq = [];
  for (let r = 1; r <= rakahs; r++) seq.push({ kind: 'rakah', n: r });
  seq.push({ kind: 'tasbih' });
  return seq;
}

const RAKAH_NAMES_AR = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة'];

// Prayer-name presets. `id` doubles as the rakah count so selecting a
// prayer also locks the sequence length.
const PRAYER_PRESETS = [
  { id: 2, prayer: 'fajr',    label: 'الفجر',      rakahLabel: 'ركعتان' },
  { id: 3, prayer: 'maghrib', label: 'المغرب',     rakahLabel: 'ثلاث ركعات' },
  { id: 4, prayer: 'dhuhr',   label: 'الظهر',      rakahLabel: 'أربع ركعات' },
  { id: 4, prayer: 'asr',     label: 'العصر',      rakahLabel: 'أربع ركعات' },
  { id: 4, prayer: 'isha',    label: 'العشاء',     rakahLabel: 'أربع ركعات' },
];

const PRAYER_NAMES_AR = {
  fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر',
  maghrib: 'المغرب', isha: 'العشاء',
  // Friday jumu'ah — not a daily prayer, shown only in the preset
  // bar between 10:00 and 14:00 on Fridays (local time). Two rakahs
  // like fajr.
  jumuah: 'الجمعة'
};

// Map a prayer key to its default rakah count.
const DEFAULT_RAKAHS = { fajr: 2, maghrib: 3, dhuhr: 4, asr: 4, isha: 4, jumuah: 2 };

// Friday preset — shown only during the jumu'ah window so it's
// always relevant when visible, not a year-round button cluttering
// the bar. Window is 10:00–14:00 local time, the mosque's typical
// setup → khutbah → salah stretch.
function isJumuahWindow(now = new Date()) {
  if (now.getDay() !== 5) return false; // Friday = 5 in JS (Sun=0)
  const h = now.getHours();
  return h >= 10 && h < 14;
}

export default function PrayerTracker() {
  const [open, setOpen] = useState(false);
  const [rakahs, setRakahs] = useState(4);
  const [index, setIndex] = useState(0);
  // Currently-selected prayer name. Auto-set from the nearest prayer
  // time whenever the tracker opens, but the operator can override with
  // the preset buttons if the imam starts a non-scheduled jamaah.
  const [prayer, setPrayer] = useState('dhuhr');
  // display-only mode — renders just the prayer name + imam badge
  // without rakah tracking. Useful when the operator just wants to
  // announce "الإمام فلان يصلّي الظهر" without driving the remote.
  const [displayOnly, setDisplayOnly] = useState(false);
  // Imam name read from config so the technician sets it once via F3
  // and the wall reflects whoever is leading. Auto-refreshes when
  // the config changes mid-session. imamList carries the F3-managed
  // roster that feeds the picker dropdown below — a caretaker with
  // three rotating imams picks from the list instead of retyping
  // "الشيخ فلان" every prayer.
  const [imamName, setImamName] = useState('');
  const [imamList, setImamList] = useState([]);
  const [imamSaveError, setImamSaveError] = useState('');
  // Tell main to STOP swallowing arrow keys while this tracker is
  // visible — without this, an active slideshow underneath would
  // capture arrows before they reach our keydown handler below.
  useModalActive(open);
  const containerRef = useRef(null);
  useFocusTrap(containerRef, open);

  // Re-evaluate the Jumu'ah window every minute so the button
  // appears at 10:00 sharp on Friday and disappears at 14:00. Using
  // a state-driven flag instead of reading the date in render lets
  // React re-render the preset bar when the window transitions.
  const [showJumuah, setShowJumuah] = useState(isJumuahWindow());
  useEffect(() => {
    const id = setInterval(() => setShowJumuah(isJumuahWindow()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Control bar (header + presets) auto-hide. We manage the visible
  // state in React rather than pure CSS :hover because the hidden
  // controls have pointer-events: none — they can't be hovered to
  // reveal themselves. Any mouse movement (or touch) inside the
  // tracker reveals them; a 2.5 s idle hides them again.
  // :focus-within on the tracker root also keeps them visible for
  // keyboard-only operators.
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2500);
  }, []);
  // On open: surface the controls for 4 s so the operator can see
  // the prayer picker + modes without having to move the mouse.
  useEffect(() => {
    if (!open) return;
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    return () => {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    getConfig().then((c) => {
      if (cancelled) return;
      setImamName(c?.imamName || '');
      setImamList(Array.isArray(c?.imamList) ? c.imamList : []);
    }).catch(() => {});
    const off = onConfigChanged((c) => {
      if (cancelled) return;
      setImamName(c?.imamName || '');
      setImamList(Array.isArray(c?.imamList) ? c.imamList : []);
    });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  // When the tracker opens, guess the current prayer from today's
  // schedule so the operator rarely needs to tap a preset. We pick the
  // most-recent prayer whose time has already started — that's the one
  // the imam is leading in jamaah right now. Sunrise is ignored
  // because there's no jamaah for it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getTodayAndNext(new Date().toISOString()).then((state) => {
      if (cancelled) return;
      const times = state?.today?.timesIso;
      if (!times) return;
      const now = Date.now();
      const order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
      let best = null;
      for (const k of order) {
        const t = times[k] ? new Date(times[k]).getTime() : null;
        if (t && t <= now) best = k; // latest prayer whose time has passed
      }
      if (best) {
        setPrayer(best);
        setRakahs(DEFAULT_RAKAHS[best] || 4);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const sequence = buildSequence(rakahs);
  const step = sequence[Math.max(0, Math.min(index, sequence.length - 1))] || null;

  const close = useCallback(() => { setOpen(false); setIndex(0); }, []);
  const reset = useCallback(() => setIndex(0), []);
  const next  = useCallback(() => setIndex((i) => Math.min(i + 1, sequence.length - 1)), [sequence.length]);
  const prev  = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setOpen((v) => !v);
        if (!open) setIndex(0);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      // In display-only mode the stage shows "prayer name + imam" and
      // hides the rakah cell / progress panel entirely. Step-advance
      // keys would silently mutate the hidden `index`, so when the
      // operator flipped back to tracking mode the UI jumped mid-way
      // through the sequence. Lock step advancement out here.
      if (displayOnly) return;
      if (e.key === 'Home')   { e.preventDefault(); reset(); return; }
      if (e.key === 'End')    { e.preventDefault(); setIndex(sequence.length - 1); return; }
      // RTL-native: ArrowLeft = NEXT, ArrowRight = PREV. Same map as
      // the slideshow keyboard handler in main/index.js.
      if (e.key === 'ArrowLeft'  || e.key === 'PageDown' || e.code === 'Space') {
        e.preventDefault(); next(); return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageUp') {
        e.preventDefault(); prev(); return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, displayOnly, next, prev, close, reset, sequence.length]);

  // Mobile control: react to tracker:command messages forwarded by
  // main from the phone control plane. Commands: open / close /
  // next / prev / reset / set-rakahs (payload.rakahs).
  useEffect(() => {
    if (!window.electron?.app?.onTrackerCommand) return;
    const off = window.electron.app.onTrackerCommand((cmd) => {
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.action === 'open')  { setOpen(true); setIndex(0); return; }
      if (cmd.action === 'close') { close(); return; }
      if (cmd.action === 'next')  { next(); return; }
      if (cmd.action === 'prev')  { prev(); return; }
      if (cmd.action === 'reset') { reset(); return; }
      if (cmd.action === 'set-rakahs' && [2, 3, 4].includes(cmd.rakahs)) {
        setRakahs(cmd.rakahs); setIndex(0);
      }
    });
    return off;
  }, [close, next, prev, reset]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className={`prayer-tracker open ${controlsVisible ? 'prayer-tracker--reveal-controls' : ''}`}
      role="dialog" aria-modal="true" dir="rtl"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
    >
      <div className="prayer-tracker__bg" />

      {/* Top strip — brand + close ALWAYS visible so the operator
          has a permanent exit even while the hideable bars below are
          tucked away. The strip itself stays translucent so it reads
          as frame rather than content. */}
      <header className="prayer-tracker__head">
        <div className="prayer-tracker__brand"><BrandMark size={36} /></div>
        <button type="button" className="help-overlay__close" onClick={close}>إغلاق · Esc</button>
      </header>

      {/* Auto-hide band — mode toggle above, prayer presets below.
          Both tucked inside a single absolute-positioned wrapper so
          the two strips stack naturally via flex column instead of
          depending on hard-coded top offsets that drifted out of
          sync when button heights changed. */}
      <div className="prayer-tracker__controls-band">
        <div className="prayer-tracker__modes-bar">
          <div className="prayer-tracker__modes">
            <button
              type="button"
              className={`prayer-tracker__mode-btn ${!displayOnly ? 'prayer-tracker__mode-btn--active' : ''}`}
              onClick={() => setDisplayOnly(false)}
            >
              تتبّع الركعات
            </button>
            <button
              type="button"
              className={`prayer-tracker__mode-btn ${displayOnly ? 'prayer-tracker__mode-btn--active' : ''}`}
              onClick={() => setDisplayOnly(true)}
              title="يعرض اسم الصلاة والإمام بدون تتبّع ركعات"
            >
              عرض فقط
            </button>
          </div>
          {imamList.length > 0 && (
            <div className="prayer-tracker__imam-picker">
              <label className="prayer-tracker__imam-picker-label" htmlFor="imam-picker-select">الإمام:</label>
              <select
                id="imam-picker-select"
                className="prayer-tracker__imam-picker-select"
                value={imamName || ''}
                onChange={(e) => {
                  const name = e.target.value;
                  const prev = imamName;
                  setImamName(name); // optimistic paint
                  // If the IPC write fails (config.json locked by
                  // antivirus, transient disk error), revert the
                  // optimistic value and surface an error so the
                  // operator isn't left staring at a UI-only change
                  // that never reached the wall. Previously the
                  // .catch(()=>{}) silently swallowed failures.
                  setConfig({ imamName: name }).catch((err) => {
                    setImamName(prev);
                    console.error('[PrayerTracker] imam write failed:', err);
                    setImamSaveError('تعذّر حفظ اختيار الإمام — حاول مرة أخرى');
                    setTimeout(() => setImamSaveError(''), 4000);
                  });
                }}
              >
                <option value="">— اختر الإمام —</option>
                {imamList.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                {/* Current value may not be in the list (e.g. the
                    caretaker just typed a new name in F3). Show it
                    anyway so the selection doesn't silently switch. */}
                {imamName && !imamList.includes(imamName) && (
                  <option key={imamName} value={imamName}>{imamName} (غير محفوظ)</option>
                )}
              </select>
              {imamSaveError && (
                <span className="prayer-tracker__imam-picker-error" role="status">
                  {imamSaveError}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="prayer-tracker__presets">
          <span className="prayer-tracker__presets-label">اختر الصلاة:</span>
          {showJumuah && (
            <button
              key="jumuah"
              type="button"
              className={`prayer-tracker__rakah-btn prayer-tracker__rakah-btn--jumuah ${prayer === 'jumuah' ? 'prayer-tracker__rakah-btn--active' : ''}`}
              onClick={() => { setPrayer('jumuah'); setRakahs(2); setIndex(0); }}
              title="صلاة الجمعة — ركعتان"
            >
              الجمعة
              <span className="prayer-tracker__rakah-btn-sub">ركعتان</span>
            </button>
          )}
          {PRAYER_PRESETS.map((p) => (
            <button
              key={p.prayer}
              type="button"
              className={`prayer-tracker__rakah-btn ${prayer === p.prayer ? 'prayer-tracker__rakah-btn--active' : ''}`}
              onClick={() => { setPrayer(p.prayer); setRakahs(p.id); setIndex(0); }}
              title={p.rakahLabel}
            >
              {p.label}
              <span className="prayer-tracker__rakah-btn-sub">{p.rakahLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stage — mode-aware, single source of truth per mode.
       *
       *   tracking (default):  [prayer+imam on right]  |  [rakah hero centred]
       *   tasbih:              3-tile grid spans full width
       *   display-only:        prayer name + imam in a single centred
       *                        block — no wasted side columns
       *
       * Operator feedback from 0.8.32:
       *   - "امسح التقدم و رتبها عشان ما يكون فيه مساحة فاضية"
       *     (remove progress, tidy so no empty space) → progress panel
       *     retired entirely.
       *   - "عرض الصلاة فقط، فيه مساحة كبيييييييييره ضايعه"
       *     (display-only has huge wasted space) → collapse to a
       *     centred block instead of the 2-col grid.
       */}
      <section className={`prayer-tracker__stage prayer-tracker__stage--${displayOnly ? 'display-only' : (step?.kind === 'tasbih' ? 'tasbih' : 'tracking')}`}>

        {step?.kind === 'tasbih' && !displayOnly && (
          <div className="prayer-tracker__tasbih">
            <div className="prayer-tracker__cell-eyebrow">تسبيح السيدة الزهراء عليها السلام</div>
            <div className="prayer-tracker__tasbih-grid">
              <div className="prayer-tracker__tasbih-tile">
                <div className="prayer-tracker__tasbih-count">{toArabicDigits(34)}</div>
                <div className="prayer-tracker__tasbih-phrase">اللهُ أَكْبَر</div>
              </div>
              <div className="prayer-tracker__tasbih-tile">
                <div className="prayer-tracker__tasbih-count">{toArabicDigits(33)}</div>
                <div className="prayer-tracker__tasbih-phrase">الْحَمْدُ للهِ</div>
              </div>
              <div className="prayer-tracker__tasbih-tile">
                <div className="prayer-tracker__tasbih-count">{toArabicDigits(33)}</div>
                <div className="prayer-tracker__tasbih-phrase">سُبْحانَ اللهِ</div>
              </div>
            </div>
            {/* Authenticated Shia hadith on the virtue of this tasbih.
                Shown under the count tiles so the congregation reads
                WHY this dhikr is recited after every prayer, not just
                what the counts are. Chain: Imam al-Sadiq via Zurarah
                in al-Kafi vol. 3 p. 343. */}
            <figure className="prayer-tracker__tasbih-hadith" aria-label="حديث شريف في فضل تسبيح الزهراء">
              <blockquote className="prayer-tracker__tasbih-hadith-text">
                «تَسْبِيحُ فاطِمَةَ الزَّهْراءِ عَلَيْها السَّلامُ في كُلِّ يَوْمٍ في دُبُرِ كُلِّ صَلاةٍ أَحَبُّ إِلَيَّ مِنْ صَلاةِ أَلْفِ رَكْعَةٍ في كُلِّ يَوْمٍ.»
              </blockquote>
              <figcaption className="prayer-tracker__tasbih-hadith-cite">
                — الإمام جعفر الصادق عليه السلام · الكافي، ج٣ ص٣٤٣
              </figcaption>
            </figure>
          </div>
        )}

        {displayOnly && (
          /* A single centred column — no side panels, no empty grid
             cells. Prayer name on top, imam underneath, salawat
             ribbon below. The content fills the viewport naturally. */
          <div className="prayer-tracker__display">
            <div className="prayer-tracker__prayer-badge">
              <div className="prayer-tracker__prayer-label">صلاة</div>
              <div className="prayer-tracker__prayer-name">{PRAYER_NAMES_AR[prayer] || 'الصلاة'}</div>
            </div>
            <div className="prayer-tracker__imam">
              {imamName ? (
                <>
                  <div className="prayer-tracker__imam-label">الإمام</div>
                  <div className="prayer-tracker__imam-name">{imamName}</div>
                </>
              ) : (
                <div className="prayer-tracker__imam-empty">
                  ضع اسم الإمام من F3 → الأساسية
                </div>
              )}
            </div>
            <SalawatLine size="lg" style={{ marginTop: 28 }} />
          </div>
        )}

        {!displayOnly && step?.kind === 'rakah' && (
          <>
            {/* Metadata column — right side in RTL. Sits alongside the
                giant rakah cell so the screen always shows "which
                prayer / whose imam" next to the current rakah. */}
            <aside className="prayer-tracker__meta">
              <div className="prayer-tracker__prayer-badge">
                <div className="prayer-tracker__prayer-label">صلاة</div>
                <div className="prayer-tracker__prayer-name">{PRAYER_NAMES_AR[prayer] || 'الصلاة'}</div>
              </div>
              <div className="prayer-tracker__imam">
                {imamName ? (
                  <>
                    <div className="prayer-tracker__imam-label">الإمام</div>
                    <div className="prayer-tracker__imam-name">{imamName}</div>
                  </>
                ) : (
                  <div className="prayer-tracker__imam-empty">
                    ضع اسم الإمام من F3 → الأساسية
                  </div>
                )}
              </div>
            </aside>

            {/* Giant rakah headline. The eyebrow "الركعة ١ من ٥" was
                removed per operator request 2026-04-23: the progress
                dots below (now retired as of the same pass) already
                conveyed "how many" and the caretaker only cares
                about "which one NOW". The step name now takes the
                whole hero space so it reads from across the hall. */}
            <div className="prayer-tracker__hero">
              <div className="prayer-tracker__cell" key={index}>
                <div className="prayer-tracker__cell-headline">{RAKAH_NAMES_AR[step.n - 1] || toArabicDigits(step.n)}</div>
              </div>
            </div>
          </>
        )}

        {/* Step-dots row retired 2026-04-23 — operator feedback
            explicitly asked to remove the rakah-remaining indicator,
            and with no eyebrow either we can let the هيرو cell fill
            the full vertical space of the stage. */}
      </section>

      <footer className="prayer-tracker__foot">
        {!displayOnly && (
          <>
            <div className="prayer-tracker__on-screen-controls">
              <button type="button" className="prayer-tracker__nav-btn" onClick={prev} disabled={index === 0} aria-label="السابق">
                → السابق
              </button>
              <button type="button" className="prayer-tracker__nav-btn prayer-tracker__nav-btn--primary" onClick={next} disabled={index >= sequence.length - 1} aria-label="التالي">
                التالي ←
              </button>
              <button type="button" className="prayer-tracker__nav-btn" onClick={reset} aria-label="إعادة من البداية">
                ⟲ إعادة
              </button>
            </div>
            <div className="prayer-tracker__help">→ السابق · التالي ← · Home إعادة · Esc إغلاق</div>
          </>
        )}
        <SalawatLine size="sm" style={{ marginTop: 10 }} />
      </footer>
    </div>
  );
}
