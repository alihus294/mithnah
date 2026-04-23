// First-run tour — a gentle 4-step walkthrough that fires the FIRST
// time the dashboard renders after onboarding completes. Targeted at
// elderly caretakers who otherwise stare at the wall view and don't
// know what's a button vs decoration.
//
// We persist the "seen" flag to localStorage (not config) because
// the tour is a per-machine onboarding artifact, not a mosque
// setting. Removing the localStorage key shows it again.

import { useEffect, useState } from 'react';
import { getConfig, onConfigChanged } from '../lib/ipc.js';

const TOUR_KEY = 'mithnah:first-run-tour:seen';

const STEPS = [
  {
    title: 'مرحباً بك في مئذنة',
    body: 'هذه نافذة قصيرة لتعريفك بأماكن الأشياء — ٤ خطوات فقط، أقل من دقيقة.',
    highlightSelector: null,
    icon: '🕌',
  },
  {
    title: 'الصلاة القادمة هنا',
    body: 'في وسط الشاشة ترى الساعة وموعد الصلاة القادمة. تتحدّث الأوقات تلقائياً كل دقيقة.',
    highlightSelector: '.dashboard__clock-zone',
    icon: '🕒',
  },
  {
    title: 'صف الصلوات في الأسفل',
    body: 'الفجر · الشروق · الظهر · المغرب · الليل (منتصف الليل الشرعي). الصلاة القادمة تتلوّن بالذهبي.',
    highlightSelector: '.prayer-row',
    icon: '🕋',
  },
  {
    title: 'كل شيء في القائمة',
    body: 'في زاوية الشاشة ترى زر «القائمة». انقر عليه ليفتح: الإعدادات · مكتبة الأدعية · متابعة الصلاة · المساعدة.',
    highlightSelector: '.floating-menu__trigger',
    icon: '✨',
  },
];

export default function FirstRunTour() {
  const [step, setStep] = useState(-1); // -1 = not started yet, n = step n, STEPS.length = done
  const [onboardingDone, setOnboardingDone] = useState(null); // null = unknown
  // Confirmation modal before skipping. A stray click on "تخطّي" used
  // to dismiss the tour forever — elderly operators tap by accident.
  // This layer gives them a second chance.
  const [confirmSkip, setConfirmSkip] = useState(false);

  // Watch the config so we don't fire the tour ON TOP of the
  // OnboardingOverlay (which always renders first if the operator
  // hasn't completed location setup). The tour only starts AFTER
  // config.onboardingCompleted flips true — so the operator
  // finishes "where am I" first, then sees "what does this app do".
  useEffect(() => {
    let cancelled = false;
    getConfig().then((c) => { if (!cancelled) setOnboardingDone(c?.onboardingCompleted === true); }).catch(() => {});
    const off = onConfigChanged((c) => { if (!cancelled) setOnboardingDone(c?.onboardingCompleted === true); });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  useEffect(() => {
    if (onboardingDone !== true) return; // wait until onboarding completed
    let seen = false;
    try { seen = localStorage.getItem(TOUR_KEY) === 'true'; } catch (_) {}
    if (!seen) {
      // Wait one extra second after onboarding closes — gives the
      // Dashboard time to render the elements we'll highlight, and
      // gives the operator a beat to register that the modal closed.
      const t = setTimeout(() => setStep(0), 1200);
      return () => clearTimeout(t);
    }
  }, [onboardingDone]);

  const finish = () => {
    try { localStorage.setItem(TOUR_KEY, 'true'); } catch (_) {}
    setStep(STEPS.length);
  };

  if (step < 0 || step >= STEPS.length) return null;
  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="first-run-tour" role="dialog" aria-modal="true" dir="rtl">
      {cur.highlightSelector ? (
        // When a highlight is active, render 4 blurred panels that
        // SURROUND the highlighted region — leaving the rectangle
        // itself untouched (sharp + unblurred). The previous
        // backdrop-filter on a single full-screen overlay blurred
        // the highlight too, defeating the purpose.
        <TourHighlight selector={cur.highlightSelector} onDismiss={finish} />
      ) : (
        // No selector → just a full-screen scrim, blurred or not
        // doesn't matter because there's nothing to highlight.
        <div className="first-run-tour__bg first-run-tour__bg--blur" onClick={finish} />
      )}
      <div className="first-run-tour__card">
        <div className="first-run-tour__icon" aria-hidden="true">{cur.icon}</div>
        <div className="first-run-tour__title">{cur.title}</div>
        <div className="first-run-tour__body">{cur.body}</div>
        <div className="first-run-tour__progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`first-run-tour__dot ${i === step ? 'first-run-tour__dot--active' : ''} ${i < step ? 'first-run-tour__dot--done' : ''}`} />
          ))}
        </div>
        <div className="first-run-tour__buttons">
          {step > 0 && (
            <button type="button" className="first-run-tour__btn" onClick={() => setStep(step - 1)}>السابق</button>
          )}
          {isLast ? (
            <button type="button" className="first-run-tour__btn first-run-tour__btn--primary" onClick={finish}>تم! ابدأ الاستخدام</button>
          ) : (
            <button type="button" className="first-run-tour__btn first-run-tour__btn--primary" onClick={() => setStep(step + 1)}>التالي</button>
          )}
          <button type="button" className="first-run-tour__btn first-run-tour__btn--ghost" onClick={() => setConfirmSkip(true)}>تخطّي</button>
        </div>
      </div>

      {confirmSkip && (
        <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl">
          <div className="inline-modal__bg" onClick={() => setConfirmSkip(false)} />
          <div className="inline-modal__card inline-modal__card--narrow">
            <div className="inline-modal__title">هل تريد إخفاء الجولة؟</div>
            <div className="inline-modal__subtitle">
              يمكنك دائماً فتح شاشة المساعدة من القائمة (F1) لاحقاً.
            </div>
            <div className="inline-modal__buttons">
              <button
                type="button"
                className="inline-modal__btn inline-modal__btn--primary"
                onClick={() => { setConfirmSkip(false); finish(); }}
              >نعم، إخفاء</button>
              <button
                type="button"
                className="inline-modal__btn"
                onClick={() => setConfirmSkip(false)}
              >متابعة الجولة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Render four blurred-backdrop panels that SURROUND the targeted
// element, leaving the highlighted region itself sharp + unblurred.
// Pad slightly (4 px) so the highlight outline doesn't overlap the
// element's own border. Recomputes on resize via ResizeObserver.
function TourHighlight({ selector, onDismiss }) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const compute = () => {
      const el = document.querySelector(selector);
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    compute();
    const ro = new ResizeObserver(compute);
    const target = document.querySelector(selector);
    if (target) ro.observe(target);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [selector]);
  if (!box) return null;
  // Pad slightly outside the element so the highlight outline
  // doesn't sit on its border.
  const top = Math.max(0, box.top - 4);
  const left = Math.max(0, box.left - 4);
  const width = box.width + 8;
  const height = box.height + 8;
  const right = left + width;
  const bottom = top + height;
  return (
    <>
      {/* Four blurred panels: above, below, left, right of the
          highlight rectangle. Together they cover the entire
          viewport EXCEPT the highlighted area, so the highlighted
          element renders sharp while everything else is dimmed +
          blurred to focus the operator's eye. */}
      <div className="first-run-tour__panel" onClick={onDismiss}
        style={{ top: 0, left: 0, right: 0, height: top }} aria-hidden="true" />
      <div className="first-run-tour__panel" onClick={onDismiss}
        style={{ top: bottom, left: 0, right: 0, bottom: 0 }} aria-hidden="true" />
      <div className="first-run-tour__panel" onClick={onDismiss}
        style={{ top: top, height: height, left: 0, width: left }} aria-hidden="true" />
      <div className="first-run-tour__panel" onClick={onDismiss}
        style={{ top: top, height: height, left: right, right: 0 }} aria-hidden="true" />
      {/* The accent outline around the highlighted rectangle. Pure
          decoration; pointer-events: none so clicks on the
          highlighted element still register. */}
      <div className="first-run-tour__highlight" aria-hidden="true"
        style={{ top, left, width, height }} />
    </>
  );
}
