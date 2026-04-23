// Fullscreen slideshow overlay. Activates when slideshow:state.active flips
// true; otherwise renders null. Driven entirely by the main-process state
// machine; no local state besides an "enter" animation class.

import { useState, useEffect, useCallback } from 'react';
import { toArabicDigits } from '../lib/format.js';
import {
  ImamiStar, ArabesqueCorner, AlayhiSalam, SalawatLine, StarPatternBg
} from './Ornaments.jsx';

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
  if (!state || !state.active) return null;

  const deck = state.deck || {};
  const slides = state.slides || [];
  const slide = slides[state.index] || null;
  // "الصفحة ١ من ١٠" reads more naturally in Arabic than the Latin
  // "1 / 10" — an elderly reader parses it as a sentence instead of a
  // fraction.
  const counter = `الصفحة ${toArabicDigits(state.index + 1)} من ${toArabicDigits(slides.length)}`;
  const subtitleHonorific = /علي بن أبي طالب|فاطمة|الحسن|الحسين|العسكري|المهدي|الصادق|الباقر|الرضا|الكاظم|السجاد|الجواد|الهادي/.test(deck.subtitle || '');

  const arabicLines = (slide?.ar || '').split('\n').map(l => l.trim()).filter(Boolean);
  // Every slide renders at the same type size — previous dynamic scaling
  // (lg/md/sm/xs) caused visible "jumps" between consecutive slides.
  // We paginate 1 verse per slide so scaling is no longer needed.
  const lineClass = '';

  return (
    <div
      className="slideshow open"
      dir="rtl"
      aria-live="polite"
      role="region"
      style={{ '--slideshow-font-scale': fontScale }}
    >
      <StarPatternBg opacity={0.04} />

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
            key={`${deck.id}-${state.index}`}
            className={`slideshow__body-inner slideshow__body-inner--enter ${lineClass}`}
          >
            {arabicLines.length > 0 && (
              <div className="slideshow__ar-block">
                {arabicLines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </div>
          {slide?.subtitle && (
            <div className="slideshow__subtitle-layer" key={`sub-${deck.id}-${state.index}`}>
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
