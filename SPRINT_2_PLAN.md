# Sprint 2 — Elderly UX Polish · Plan

_Generated 2026-05-08. Builds on Sprint 1 (12 a11y items in working tree). Targets the elderly-specific gaps Sprint 1 deliberately deferred._

## Standards anchoring

| Standard | Item | Threshold |
|---|---|---|
| WCAG 2.5.5 (AAA) — Target Size | Touch targets | ≥ 44 × 44 CSS px |
| Material Design — Touch targets | Touch targets | ≥ 48 × 48 dp |
| Apple HIG — Touch targets | Touch targets | ≥ 44 × 44 pt |
| NIA — Making Your Website Senior Friendly (NIH/NLM) | Touch targets, elderly | ≥ 64 × 64 px |
| WCAG 1.4.12 — Text Spacing | Line-height for paragraphs | ≥ 1.5 × |
| Arabic typography norms (UNESCO BBA, Arabic Type Society) | Body Arabic | 1.7 – 1.8 |
| WCAG 2.2.1 — Timing Adjustable | Auto-hiding chrome | ≥ 20 s OR adjustable; 5 s minimum |
| NN/g — Designing for Older Adults | Idle timeouts | ≥ 10 s for elderly |
| WCAG 3.1.5 — Reading Level | Microcopy | Concrete units, no math required |
| WCAG 3.2.4 — Consistent Identification | Same affordance → same label | n/a |

**Net target for this sprint:** all changes meet WCAG AA and where surgical, push toward AAA / NIA elderly-specific recommendations. Auto-hide timers raised to **10 s** (NN/g floor, well under the 20 s WCAG-AA guideline ceiling but a 4× improvement over current 2.5–4 s). Touch-target base floor lifted to **48 px** (Material / WCAG AAA), with the existing `largeText` branch reaching the **NIA 64 px** elderly target.

## 7 fixes, ordered by leverage

### 1 · Slideshow chrome auto-hide 3 s / 4 s → 10 s

- **File:** `src/renderer/components/SlideshowOverlay.jsx`
- **Change:** L150 `3000` → `10000`; L158 `4000` → `10000`. Also update the inline comments at L139 (`fades back out after 3 s`) and L154 (`for 4 s`) to match the new value.
- **Why:** WCAG 2.2.1 + NN/g elderly-research floor. An elderly reciter pausing to breathe mid-page should not lose the close button.
- **Risk:** none. Pure constant change. Sprint 1 added a focus trap to this same file but in a different code region (L142-146); no conflict.

### 2 · PrayerTracker controls auto-hide 2.5 s / 4 s → 10 s

- **File:** `src/renderer/components/PrayerTracker.jsx`
- **Change:** L124 `2500` → `10000`; L132 `4000` → `10000`. Update inline comment at L116 (`a 2.5 s idle hides them again`) and L126 (`for 4 s`).
- **Why:** same root issue as #1. Tracker controls auto-hiding fast forces the imam to wave the mouse repeatedly mid-prayer.
- **Risk:** none.

### 3 · Phone-remote lockout countdown — raw seconds → minutes-and-seconds

- **File:** `build-output/mobile-control.js`
- **Current:** L107 emits `بعد ٩٠٠ ثانية`; L168 emits `بعد ${retrySec} ثانية`. The file already has a `countdown(iso)` formatter at L61-71 that splits hours/minutes/seconds — but it operates on an ISO timestamp, not a raw seconds count. The auth path doesn't use it.
- **Change:** add a small `formatRetryDelay(sec)` helper near `countdown` that mirrors its hour/minute/second split for a raw seconds input. Use at L107 and L168.
- **Why:** WCAG 3.1.5 (Reading Level). An elderly caretaker should not have to convert "٩٠٠ ثانية" → 15 minutes mentally.
- **Risk:** none. Helper is a pure function, two call sites.

### 4 · Update progress percent — Latin → Arabic-Indic digits + Arabic percent sign

- **Files:** `src/renderer/components/UpdateBadge.jsx`, `src/renderer/components/UpdateSection.jsx`
- **Change:** import `toArabicDigits` from `../lib/format.js` (UpdateBadge needs it added; UpdateSection too). Replace `${pct}%` → `${toArabicDigits(pct)}٪` and `${percent}%` → `${toArabicDigits(percent)}٪`. Note: `٪` is the Arabic percent sign U+066A, not Latin `%`.
- **Why:** WCAG 3.2.4 (Consistent Identification) + script consistency. The rest of the app uses Arabic-Indic digits everywhere; mixing scripts hurts elderly readers parsing a glance-status pill.
- **Risk:** none. Both files don't currently import `toArabicDigits`; adding it is a 1-line import.

### 5 · Touch-target base floor — `≥ 48 px` (largeText already → 56-64 px)

- **File:** `src/renderer/styles.css`
- **Audit:** `.settings__btn` already at 48 (L1423 ✓); `.prayer-tracker__rakah-btn` already at 48 in largeText branch (L3748). Gaps:
  - `.dua-picker__tab` (L1621) — verify; lift if < 48.
  - `.dua-picker__icon-btn` (star/edit/delete in DuaPicker rows, ~40-44 px per REVIEW D4-15) — lift to ≥ 48 px base, ≥ 56 px largeText.
  - Base `.prayer-tracker__rakah-btn` (L2055) — confirm and lift to 48 if < 48.
- **Why:** WCAG 2.5.5 AAA + Material 48dp. Below 48 px on a wall-mounted display + trembling hand misses the target.
- **Risk:** low — visual review recommended after, but the change is additive (`min-height` / `min-width` floor).

### 6 · Body Arabic line-height — bump dense surfaces 1.5 → 1.7

- **File:** `src/renderer/styles.css`
- **Scope:** ONLY surfaces with body Arabic at presbyopic reading distance: `.dua-picker__row-title` family, `.prayer-tracker__hadith-text`, `.settings__hint`, `.help-overlay__body p`. Slideshow body intentionally untouched (`--slideshow-font-scale` + DOM-measured pagination drives line counts; bumping breaks pagination — same reasoning as `a38d450` left it alone).
- **Why:** WCAG 1.4.12 floor (1.5) + Arabic typography norm 1.7-1.8 for body at distance.
- **Risk:** low-medium. Visual review after — if any surface starts wrapping into more lines than it should fit, narrow the scope.

### 7 · Microcopy unification: SettingsOverlay PIN-gate close

- **File:** `src/renderer/components/SettingsOverlay.jsx:440`
- **Change:** `إلغاء · Esc` → `إغلاق · Esc`.
- **Why:** WCAG 3.2.4. Every other overlay close in the app uses `إغلاق · Esc` (DuaPicker:446, HelpOverlay:170, PrayerTracker:256, SettingsOverlay:466,912). One outlier is one source of confusion. Functionally the button closes the entire overlay (returns to dashboard) — `إغلاق` is contextually correct too.
- **Risk:** none — single string swap.

---

## Out of scope for this sprint (carried to Sprint 3)

- **PinBadge component (D2-18 / F-005)** — needs a new component file (~80 lines), wiring in App.jsx, and an unauth pairing modal in FloatingMenu. Larger surgical surface than the 7 above; deserves its own focused pass.
- **FloatingMenu trigger 4 s idle fade (D2-12)** — unclear whether keeping at low-opacity vs raising the timer is the right answer; visual judgement on the wall display preferred over a guess.
- **Dark-theme `--m-text-faint` on raised surfaces (D4-13)** — explicitly deferred from Sprint 1; needs a token-system pass.
- **Settings bg-click-discards-unsaved-input guard (D2-07)** — needs a "dirty" tracker on the form; non-trivial.
- **Honorific drift `ع` → `عليه السلام`** — content edit, doctrinal-review-light.
- **`مضاف من القائم` phrasing review** — operator decision needed.

---

## Order of execution

1 → 2 → 7 → 3 → 4 → 5 → 6. Earlier items are constant-only (zero risk); later items touch CSS and need visual review.

After all 7: `npm test`, `git diff --stat`, `git status`, write `SPRINT_2_NOTES.md`.

---

**Plan complete. Beginning execution.**
