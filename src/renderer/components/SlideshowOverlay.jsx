// Fullscreen slideshow overlay. Activates when slideshow:state.active flips
// true; otherwise renders null. Driven entirely by the main-process state
// machine; no local state besides an "enter" animation class.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toArabicDigits } from '../lib/format.js';
import {
  ImamiStar, ArabesqueCorner, AlayhiSalam, SalawatLine, StarPatternBg
} from './Ornaments.jsx';
import { useModalActive } from '../lib/useModalActive.js';

// ─── Font-scale-aware re-pagination ─────────────────────────────────
//
// Operator 2026-04-24 asked that NO text ever be clipped, and that
// increasing the font should INCREASE the page count (reflow to
// more pages) rather than shrinking the type or hiding content.
// This is the core function that implements that behaviour.
//
// The main-process chunker already groups source lines into pages
// of ≤2 lines / ≤160 chars (a conservative default for 1.0× zoom).
// At larger scales the same 2-line page no longer fits the viewport,
// so we split it further on the renderer side — no round-trip to
// main, no deck re-load, just a derived `paginated` array keyed by
// (slides, fontScale).
//
// Capacity heuristic (approximate, character-count based since
// exact text measurement would require a hidden <div> reflow per
// render — too expensive on every scale change):
//   • maxLinesPerPage = max(1, round(2 / fontScale))
//   • maxCharsPerLine = max(20, round(90 / fontScale))
// Both floors keep the result sensible even at fontScale 2.0
// (1 line, 45 chars) — still enough for a verse fragment.
function repaginate(slides, fontScale) {
  if (!Array.isArray(slides) || slides.length === 0) return [];
  const scale = Math.max(0.7, Math.min(2.2, Number(fontScale) || 1));
  // 1.0× keeps chunker's defaults; larger scales tighten aggressively.
  const maxLines = Math.max(1, Math.round(2 / scale));
  const maxChars = Math.max(20, Math.round(90 / scale));
  const wrapChars = Math.max(16, Math.round(70 / scale));
  const out = [];
  // Tag each output entry with its `baseIdx` (position in the
  // original slides array) so the renderer can map back to the
  // main-process state machine's slide index on navigation.
  slides.forEach((s, baseIdx) => {
    if (!s || s.kind !== 'text' || !s.ar) { out.push({ ...s, baseIdx }); return; }
    const rawLines = String(s.ar).split('\n').map((l) => l.trim()).filter(Boolean);
    const lines = [];
    for (const l of rawLines) {
      if (l.length <= wrapChars) { lines.push(l); continue; }
      const words = l.split(/\s+/);
      let buf = '';
      for (const w of words) {
        if (buf === '' && w.length > wrapChars) { lines.push(w); continue; }
        const cand = buf ? buf + ' ' + w : w;
        if (cand.length > wrapChars && buf) { lines.push(buf); buf = w; }
        else { buf = cand; }
      }
      if (buf) lines.push(buf);
    }
    let page = [];
    let pageChars = 0;
    const flushPage = () => {
      if (page.length > 0) out.push({ ...s, baseIdx, ar: page.join('\n') });
      page = []; pageChars = 0;
    };
    for (const l of lines) {
      const overflowLines = page.length + 1 > maxLines;
      const overflowChars = pageChars + l.length + 1 > maxChars;
      if ((overflowLines || overflowChars) && page.length > 0) flushPage();
      page.push(l);
      pageChars += l.length + 1;
    }
    flushPage();
  });
  return out;
}

// Reader font scale lives in localStorage — independent of renderer
// zoom. An elderly operator needs to enlarge the Arabic text without
// also blowing up the chrome around it. 1.0 = default; step is 0.15×.
// Range widened because the operator asked for specifically elderly-
// friendly type — the ceiling now doubles the base font.
const SCALE_MIN = 0.7;
const SCALE_MAX = 2.0;
const SCALE_STEP = 0.15;
const SCALE_KEY = 'mithnah:slideshow:font-scale';

function loadScale() {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    if (Number.isFinite(v) && v >= SCALE_MIN && v <= SCALE_MAX) return v;
  } catch (_) {}
  return 1.0;
}
function saveScale(v) {
  try { localStorage.setItem(SCALE_KEY, String(v)); } catch (_) {}
}

export default function SlideshowOverlay({ state }) {
  const [fontScale, setFontScale] = useState(loadScale);
  useEffect(() => { saveScale(fontScale); }, [fontScale]);
  const bumpScale = useCallback((delta) => {
    setFontScale((s) => {
      const next = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number((s + delta).toFixed(2))));
      return next;
    });
  }, []);
  // Keyboard: Ctrl/Cmd +/- and Ctrl/Cmd 0 while the slideshow is
  // open. The browser would otherwise zoom the whole window, but
  // main/index.js already swallows Ctrl+= so this gives the operator
  // a lighter-weight text-only resize.
  useEffect(() => {
    if (!state?.active) return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); bumpScale(+SCALE_STEP); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); bumpScale(-SCALE_STEP); }
      else if (e.key === '0') { e.preventDefault(); setFontScale(1.0); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state?.active, bumpScale]);
  // Mouse-idle-aware close button. A 70-year-old caretaker using a
  // mouse must ALWAYS have a visible exit affordance; keyboard Esc
  // alone is not enough (operator feedback 2026-04-23). Button
  // appears on any mouse movement inside the overlay and fades back
  // out after 3 s of stillness so the dua text stays the focus.
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimerRef = useRef(null);
  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
  }, []);
  useEffect(() => {
    if (!state?.active) return;
    // Show on open for 4 s so the caretaker sees the button exists,
    // then fade until the next mouse move.
    setChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => setChromeVisible(false), 4000);
    return () => {
      if (chromeTimerRef.current) { clearTimeout(chromeTimerRef.current); chromeTimerRef.current = null; }
    };
  }, [state?.active]);

  const onClose = useCallback(() => {
    try { window.electron?.slideshow?.command?.('CLOSE'); } catch (_) {}
  }, []);

  // Font-scale-aware re-pagination. Recomputes a paginated view of
  // the deck whenever the source slides or fontScale change. Pure
  // memo — no DOM measurement, no layout thrash. Operator 2026-04-24:
  // "كل ما كبرت الخط تزيد الصفحات لان الكلام ينتقل لصفة ثانيه بدل ما
  // يضيع برا الاطار" — exactly the behaviour this implements.
  const effectiveSlides = useMemo(
    () => repaginate(state?.slides || [], fontScale),
    [state?.slides, fontScale]
  );
  // Find the first paginated index whose baseIdx matches the
  // current main-process index. Used to sync the renderer's
  // navigation pointer when main dispatches a jump (OPEN to slide
  // N, Home, End, or an external command from the mobile page).
  const firstIdxForBase = useMemo(() => {
    const baseIdx = state?.index ?? 0;
    const i = effectiveSlides.findIndex((s) => s.baseIdx === baseIdx);
    return i < 0 ? 0 : i;
  }, [effectiveSlides, state?.index]);
  // Renderer-owned navigation pointer. Starts at the first sub-page
  // of whatever base slide main is currently on; advances through
  // sub-pages locally; calls main's NEXT/PREV only when crossing a
  // base-slide boundary so persistence still works.
  const [effectiveIndex, setEffectiveIndex] = useState(firstIdxForBase);
  useEffect(() => { setEffectiveIndex(firstIdxForBase); }, [firstIdxForBase]);

  // Take ownership of the slideshow keyboard shortcuts while we're
  // the active overlay. useModalActive publishes `modalActive: true`
  // so main/index.js' before-input-event handler bails on arrows,
  // letting our document listener below be the sole authority.
  // Without this, both main (which dispatches NEXT to advance BASE
  // slide by 1) and our local handler (which advances by 1 SUB-page)
  // would fire on a single keypress and get out of sync.
  useModalActive(!!state?.active);
  useEffect(() => {
    if (!state?.active) return;
    const onKey = (e) => {
      // Ctrl/Cmd combos belong to the font-scale handler above —
      // don't intercept them here.
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.code === 'Space') {
        e.preventDefault();
        setEffectiveIndex((i) => Math.min(i + 1, effectiveSlides.length - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
        e.preventDefault();
        setEffectiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setEffectiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setEffectiveIndex(Math.max(0, effectiveSlides.length - 1));
      } else if (e.key === 'b' || e.key === 'B' || e.key === '.') {
        e.preventDefault();
        try { window.electron?.slideshow?.command?.('BLANK'); } catch (_) {}
      } else if (e.key === 'Escape') {
        e.preventDefault();
        try { window.electron?.slideshow?.command?.('CLOSE'); } catch (_) {}
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state?.active, effectiveSlides.length]);

  // Sync main's base-slide index with our effective index so the
  // mobile remote-control snapshot and the resume-after-crash state
  // stay approximately correct. Only fires on base-slide crossings
  // (effectiveSlides[effectiveIndex].baseIdx !== state.index), never
  // on pure sub-page nav inside a base slide.
  useEffect(() => {
    if (!state?.active) return;
    const cur = effectiveSlides[effectiveIndex];
    if (!cur) return;
    if (cur.baseIdx === state.index) return;
    try {
      window.electron?.slideshow?.command?.('GOTO', { index: cur.baseIdx });
    } catch (_) { /* main not ready — renderer-local nav still works */ }
  }, [effectiveIndex, effectiveSlides, state?.active, state?.index]);

  // ──── Early return AFTER every hook above ────────────────────────
  // Every hook must run on every render so React can match them by
  // call order. Derived read-only values (deck, slides, slide,
  // counter, lineClass, arabicLines) live below the return because
  // they are plain const expressions — no hook cost.
  if (!state || !state.active) return null;

  const deck = state.deck || {};
  // Use the font-scale-paginated view, not the raw main-process
  // slides. `slide` is whatever the caretaker is looking at right
  // now; `effectiveSlides.length` is what the counter "X من Y"
  // should display — both grow as font scale grows so text never
  // ends up outside the frame.
  const slide = effectiveSlides[effectiveIndex] || null;
  const counter = `الصفحة ${toArabicDigits(effectiveIndex + 1)} من ${toArabicDigits(effectiveSlides.length || 1)}`;
  const subtitleHonorific = /علي بن أبي طالب|فاطمة|الحسن|الحسين|العسكري|المهدي|الصادق|الباقر|الرضا|الكاظم|السجاد|الجواد|الهادي/.test(deck.subtitle || '');
  const arabicLines = (slide?.ar || '').split('\n').map(l => l.trim()).filter(Boolean);
  // Every slide renders at the same type size — previous dynamic scaling
  // (lg/md/sm/xs) caused visible "jumps" between consecutive slides.
  // We paginate 1 verse per slide so scaling is no longer needed.
  const lineClass = '';

  return (
    <div
      className={`slideshow open ${chromeVisible ? 'slideshow--chrome-visible' : ''}`}
      dir="rtl"
      aria-live="polite"
      role="region"
      style={{ '--slideshow-font-scale': fontScale }}
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
      <StarPatternBg opacity={0.04} />

      {/* Exit button — pinned top-right (LTR → inset-inline-end), in
          the auto-hiding chrome layer. Ensures every elderly mouse-
          only operator sees a "way out" without needing Esc. */}
      <button
        type="button"
        className="slideshow__close"
        onClick={onClose}
        aria-label="إغلاق العرض"
        title="إغلاق العرض (Esc)"
      >
        ✕ إغلاق
      </button>

      {/* Font-size buttons — top-left corner so they don't compete
          with the counter/hints footer. On-screen pair in case the
          operator doesn't know the Ctrl+/- shortcut. */}
      <div className="slideshow__fontctl" aria-label="حجم الخط">
        <button type="button" className="slideshow__fontctl-btn" onClick={() => bumpScale(-SCALE_STEP)} aria-label="تصغير الخط" title="تصغير الخط (Ctrl -)">ﺍ-</button>
        <button type="button" className="slideshow__fontctl-btn slideshow__fontctl-reset" onClick={() => setFontScale(1.0)} title="إعادة الحجم (Ctrl 0)">
          {toArabicDigits(Math.round(fontScale * 100))}%
        </button>
        <button type="button" className="slideshow__fontctl-btn" onClick={() => bumpScale(+SCALE_STEP)} aria-label="تكبير الخط" title="تكبير الخط (Ctrl +)">ﺍ+</button>
      </div>
      <div className="slideshow__frame-outer" />
      <div className="slideshow__frame-inner" />

      <div className="slideshow__corner slideshow__corner--tr"><ArabesqueCorner size={80} opacity={0.55} rotate={0} /></div>
      <div className="slideshow__corner slideshow__corner--tl"><ArabesqueCorner size={80} opacity={0.55} rotate={90} /></div>
      <div className="slideshow__corner slideshow__corner--br"><ArabesqueCorner size={80} opacity={0.55} rotate={270} /></div>
      <div className="slideshow__corner slideshow__corner--bl"><ArabesqueCorner size={80} opacity={0.55} rotate={180} /></div>

      <div className="slideshow__column">
        <header className="slideshow__header">
          <div className="slideshow__title-row">
            <ImamiStar size={26} opacity={0.75} />
            <h1 className="slideshow__deck-title">{deck.title || ''}</h1>
            <ImamiStar size={26} opacity={0.75} />
          </div>
          {deck.subtitle && (
            <div className="slideshow__deck-subtitle">
              {deck.subtitle}
              {subtitleHonorific && <AlayhiSalam size={10} />}
            </div>
          )}
          {slide?.heading && (
            <div className="slideshow__section-marker">
              <span className="slideshow__section-marker-rule slideshow__section-marker-rule--start" />
              <span className="slideshow__section-marker-label">{slide.heading}</span>
              <span className="slideshow__section-marker-rule slideshow__section-marker-rule--end" />
            </div>
          )}
        </header>

        {/* `key` ties the body-inner's lifecycle to the slide identity.
            When the operator advances, React unmounts the previous
            body-inner and mounts a fresh one — the entering element
            runs its CSS fade-in keyframe from the very first paint,
            with no intermediate frame where the new text is rendered
            at full opacity (which is what made the text look like it
            "jumped" before the fade in the previous build). */}
        <div className="slideshow__body">
          <div
            key={`${deck.id}-${effectiveIndex}`}
            className={`slideshow__body-inner slideshow__body-inner--enter ${lineClass}`}
          >
            {arabicLines.length > 0 && (
              <div className="slideshow__ar-block">
                {arabicLines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </div>
          {slide?.subtitle && (
            <div className="slideshow__subtitle-layer" key={`sub-${deck.id}-${effectiveIndex}`}>
              <div className="slideshow__subtitle">{slide.subtitle}</div>
            </div>
          )}
        </div>

        <footer className="slideshow__footer">
          <div className="slideshow__footer-rule" />
          <div className="slideshow__footer-row">
            {/* Counter on its own line, centred. Previously it shared
                a 3-col row with source + hints; on 1920 the source
                text ran right into the bottom-right arabesque corner
                ornament. */}
            <div className="slideshow__footer-counter-line">
              <div className="slideshow__counter">
                <ImamiStar size={12} opacity={0.7} />
                <span>{counter}</span>
                <ImamiStar size={12} opacity={0.7} />
              </div>
            </div>
            {/* Meta line: source and hints tucked inward so they
                never cross the 80-100px corner glyphs. */}
            <div className="slideshow__footer-meta-line">
              <div className="slideshow__source">{deck.source ? `المصدر: ${deck.source}` : ''}</div>
              <div className="slideshow__hints">→ السابق · التالي ← · Esc للإغلاق</div>
            </div>
          </div>
        </footer>
      </div>

      <SalawatLine size="sm" className="slideshow__salawat" />

      <div className={`slideshow__blank ${state.blanked ? 'on' : ''}`} aria-hidden="true" />
    </div>
  );
}
