# Sprint 1 — Accessibility Emergency Pass · Plan

_Generated 2026-05-02. Reviewing commit `a38d450`. 12 findings, scoped per the sprint brief. Read-only orientation done; no source files touched yet._

## Conventions discovered (relevant to all findings)

- **Focus-trap hook lives at `src/renderer/lib/useFocusTrap.js`** (the brief said `hooks/`, but the actual location is `lib/`; PROJECT_BRIEF and the existing import in `SettingsOverlay.jsx:19` confirm).
- **The hook's API is `useFocusTrap(containerRef, active)`** — it intercepts Tab to cycle within `containerRef.current`. It does **NOT** auto-focus on mount and does **NOT** restore focus on close, despite the JSDoc claim. Each consumer handles those itself via `lastFocusedRef`/`closeBtnRef` patterns.
- **`.sr-only` is already defined at `styles.css:54-57`** (standard visually-hidden pattern). No CSS additions required for D4-06.
- **Existing canonical pattern** (visible in `SettingsOverlay.jsx:226-231`, `HelpOverlay.jsx:63-64,82-101`): declare `containerRef = useRef(null)`, `lastFocusedRef = useRef(null)`, `closeBtnRef = useRef(null)`; call `useFocusTrap(containerRef, open)` at top; in an open-effect capture `lastFocusedRef.current = document.activeElement` then `closeBtnRef.current?.focus()` after a 30 ms tick; on cleanup focus `lastFocusedRef.current?.focus()`.

---

## 1 · D4-11 / F-002 — `prefers-reduced-motion` global block

- **File:** `src/renderer/styles.css`
- **Change:** insert the standard 6-line `@media (prefers-reduced-motion: reduce)` override **just below the `.sr-only` block at L57** (so it sits with the other "global accessibility primitives" before the design-token `:root` block at L67). Override `*, *::before, *::after { animation-duration / animation-iteration-count / transition-duration / scroll-behavior } !important`.
- **Risk:** none — purely additive; covered by spec.
- **Verify:** `Grep prefers-reduced-motion src/renderer/styles.css` returns ≥1 hit (currently 0).

## 2 · D4-06 / F-003 — Slideshow root `aria-live` SR spam

- **File:** `src/renderer/components/SlideshowOverlay.jsx`
- **Change:** delete `aria-live="polite"` from the root `<div>` at **L334**. Add a sibling sr-only counter element near the top of the root (after `StarPatternBg` at L340, before chrome buttons): `<div className="sr-only" role="status" aria-live="polite">{counter}</div>`. The visible footer counter at L444-449 stays unchanged.
- **Risk:** low; the body text was never the SR target — leaves the deck title visible/readable normally.
- **Verify:** `Grep aria-live src/renderer/components/SlideshowOverlay.jsx` returns exactly 1 line, on the sr-only counter.

## 3 · D4-01 / F-001 — Kiosk-quit modal focus trap + Esc + autoFocus

- **Files:** `src/renderer/components/Dashboard.jsx` (modal at L486-506 confirm-branch + the PIN-branch following it; both inside the same `{unlock && (...)}` container).
- **Change:** add `useRef`/`useFocusTrap` imports. Declare `unlockRef = useRef(null)` near other state. Call `useFocusTrap(unlockRef, !!unlock)` at top level. On the modal root `<div className="inline-modal">` at L487, add `ref={unlockRef}` and `onKeyDown={(e) => { if (e.key === 'Escape') setUnlock(null); }}` and `tabIndex={-1}` so the div can receive the keydown when focus hasn't entered yet. Add `autoFocus` to the **إلغاء** button at L500-504 (NOT the destructive نعم، إيقاف). PIN branch already has its own `<input>` autofocus pattern — leave alone.
- **Risk:** low; `tabIndex={-1}` on the wrapper is the standard pattern for keydown-on-modal-root.
- **Verify:** read the diff — exactly one `useFocusTrap(unlockRef, ...)` call, exactly one new `ref={unlockRef}`, `autoFocus` only on the cancel button.

## 4 · D4-09 — SettingsOverlay PIN-gate + skeleton focus trap broken

- **File:** `src/renderer/components/SettingsOverlay.jsx`
- **Change:** the hook is already declared at L231 `useFocusTrap(containerRef, open)`. Just add `ref={containerRef}` to the root `<div className="settings-overlay open" ...>` of the **PIN-gate early return at L408** and the **skeleton early return at L442**. The main return at L883 already has the ref.
- **Risk:** none; the hook's hot path is `if (!root) return` so adding the ref simply activates trapping in those two states.
- **Verify:** all three `<div className="settings-overlay open"` occurrences in the file have `ref={containerRef}`.

## 5 · D4-05 — SlideshowOverlay focus trap + restore

- **File:** `src/renderer/components/SlideshowOverlay.jsx`
- **Change:** add `useFocusTrap` import. Declare `containerRef`, `lastFocusedRef`, `closeBtnRef` refs in the component body (alongside existing `chromeTimerRef` at L140). Call `useFocusTrap(containerRef, !!state?.active)` at top. In a new useEffect gated on `state?.active`: capture `lastFocusedRef.current = document.activeElement`, schedule `closeBtnRef.current?.focus()` on a 30 ms timeout (consistent with HelpOverlay/SettingsOverlay), and on cleanup restore `lastFocusedRef.current?.focus()`. Add `ref={containerRef}` to root at L331-339, `ref={closeBtnRef}` to the close button at L345-353.
- **Risk:** low — pattern mirrors HelpOverlay's existing wiring exactly.
- **Verify:** `Grep useFocusTrap src/renderer/components/SlideshowOverlay.jsx` shows import + call. Close button has `ref={closeBtnRef}`.

## 6 · D4-07 — HelpOverlay focus trap

- **File:** `src/renderer/components/HelpOverlay.jsx`
- **Change:** add `useFocusTrap` import. Declare `containerRef = useRef(null)` alongside the existing `lastFocusedRef`/`closeBtnRef` at L63-64. Call `useFocusTrap(containerRef, open)` at top. Add `ref={containerRef}` to root at L148. Existing focus-restore wiring (L97-99) stays.
- **Risk:** none.
- **Verify:** root has `ref={containerRef}`; hook called once.

## 7 · D4-08 — OnboardingOverlay + FirstRunTour focus traps

- **Files:** `src/renderer/components/OnboardingOverlay.jsx`, `src/renderer/components/FirstRunTour.jsx`
- **Change (Onboarding, L188 root):** import `useFocusTrap`, declare `containerRef = useRef(null)` near `runOnceRef` at L54, call `useFocusTrap(containerRef, !!needsOnboarding && stage !== 'done')` after the existing hooks, add `ref={containerRef}` to the root `<div className="onboarding-overlay open" ...>` at L188.
- **Change (FirstRunTour, L85 root):** import `useFocusTrap` + `useRef`, declare `containerRef`, call `useFocusTrap(containerRef, step >= 0 && step < STEPS.length)`, add `ref={containerRef}` to root at L85. Note the nested confirm-skip modal at L121-141 uses `role="dialog"` — useFocusTrap's deepest-dialog logic handles this automatically per its source comment at L40-52.
- **Risk:** low; OnboardingOverlay has `useModalActive` already — no conflict.
- **Verify:** each component has exactly one `useFocusTrap` call and one `ref={containerRef}` on its root.

## 8 · D4-04 — PrayerTracker imam-save error role

- **File:** `src/renderer/components/PrayerTracker.jsx`
- **Change:** L320, change `role="status"` → `role="alert"` on the `<span className="prayer-tracker__imam-picker-error">`. The span only renders when `imamSaveError` is truthy (L319) — error-only branch confirmed.
- **Risk:** none — single attribute swap; SR will interrupt rather than queue.
- **Verify:** read the line; confirm attribute changed and only the error span affected.

## 9 · D4-02 — `Field` wrapper `<label>` + `htmlFor` association

- **File:** `src/renderer/components/SettingsOverlay.jsx` (Field at L133-141), plus inline-modal labels at L1358 + L1368, plus `src/renderer/components/DuaPicker.jsx` CustomDuaEditor labels at L686 + L698.
- **Change (Field):** import `useId, cloneElement, isValidElement` from React. Inside `Field`, generate `const generatedId = useId();` and if the single child is a valid element without an `id`, clone it injecting `id={generatedId}` and set `htmlFor={generatedId}` on the label. If child already has an id, use it. If child is not a single element (rare/none in this codebase), label stays unassociated (no regression).
- **Change (inline-modal lat/lng in SettingsOverlay):** add stable `id="coords-lat"` to input at L1359 and `htmlFor="coords-lat"` to label at L1358; same for lng at L1368/L1369 (`coords-lng`).
- **Change (DuaPicker custom-editor):** add `id="dua-editor-title"` + `htmlFor="dua-editor-title"` at L686-687, same `dua-editor-body` at L698-699.
- **Risk:** Field uses `cloneElement` which is supported in React 18 — verified mainstream pattern. Stable ids in inline modals are safe because each renders as a singleton (no two CoordsModal instances simultaneously).
- **Verify:** the bare `<label className="settings__label">{label}</label>` at L136 no longer exists — it has `htmlFor`. Inline-modal labels at SettingsOverlay 1358/1368 + DuaPicker 686/698 each have a matching `htmlFor`/`id` pair.

## 10 · D4-03 — SettingsOverlay status messages role + aria-live

- **Files:** `src/renderer/components/SettingsOverlay.jsx` L904-906, `src/renderer/components/DuaPicker.jsx` L534.
- **Change (SettingsOverlay):** on the `<div className={`settings__msg ...`}>` at L904, add `role={msgKind === 'err' ? 'alert' : 'status'}` and `aria-live={msgKind === 'err' ? 'assertive' : 'polite'}`.
- **Change (DuaPicker):** on the `<div className="settings__msg settings__msg--err" ...>` at L534, add `role="alert"` and `aria-live="assertive"` (this branch is err-only).
- **Risk:** none — adding ARIA to message containers, no behavioral change.
- **Verify:** both lines now carry the role + aria-live attributes.

## 11 · D4-12 — Dashboard next-prayer name live region

- **File:** `src/renderer/components/Dashboard.jsx`
- **Change:** at L439 add `role="status" aria-live="polite" aria-atomic="true"` to the `<div className="next__name">`. Don't change the surrounding `.next__pair` or `.next__time` (countdown changing every second must stay un-announced).
- **Risk:** none — single attribute set.
- **Verify:** `Grep aria-live src/renderer/components/Dashboard.jsx` returns exactly one line.

## 12 · D4-10 — Light-theme palette: 4 tokens fail AA on body text

- **File:** `build-output/vendor/mithnah-design.css` (light-theme block L107-149).
- **Suggested vs computed (vs `--m-bg-base #f4ecd6`, gamma-2.4 sRGB → linear, hand-computed):**

  | Token | Old | Suggested | Computed ratio | Final value | Final ratio |
  |---|---|---|---|---|---|
  | `--m-text-muted` | `#6e7c75` | `#586863` | ~5.0:1 | **`#586863`** | ~5.0:1 ✅ |
  | `--m-text-faint` | `#a59c82` | `#7a7560` | ~3.9:1 ❌ | **`#6e6856`** | ~4.7:1 ✅ |
  | `--m-primary`    | `#2d8a82` | `#1f6e68` | ~5.1:1 | **`#1f6e68`** | ~5.1:1 ✅ |
  | `--m-accent`     | `#9c6f2a` | `#8b5a1a` | ~5.0:1 | **`#8b5a1a`** | ~5.0:1 ✅ |

  The suggested `#7a7560` for `text-faint` lands ~3.9:1 — fails AA 4.5:1. Deviating to `#6e6856` (110,104,86 — same hue family, slightly darker) hits ~4.7:1. **This is the only deviation from the REVIEW-suggested values; explained in SPRINT_1_NOTES.md.**
- **Change:** edit lines 116, 117, 119, 123 of `mithnah-design.css`. **Do not** touch `--m-accent-glow` at L126 (out of scope per spec), `--m-accent-bright` at L124, or `--m-accent-deep` at L125.
- **Risk:** low — color values only, but the visual review (human eyes on the phone) is recommended after.
- **Verify:** the 4 lines now carry the new hex values; recompute ratios and append to SPRINT_1_NOTES.md Appendix.

---

## Order of execution (deliberate)

1. **D4-11** (CSS-only, isolated)
2. **D4-06** (SlideshowOverlay aria-live removal — same file as #5 but lighter touch first)
3. **D4-01** (Dashboard kiosk modal — Critical)
4. **D4-09** (SettingsOverlay early-return refs — 2-line change)
5. **D4-05** (SlideshowOverlay focus trap — bigger touch in same file as #2)
6. **D4-07** (HelpOverlay)
7. **D4-08** (Onboarding + FirstRunTour)
8. **D4-04** (PrayerTracker — 1 char)
9. **D4-02** (Field wrapper — touches 2 components)
10. **D4-03** (status message roles)
11. **D4-12** (Dashboard next-prayer)
12. **D4-10** (light-theme tokens)

After each finding: re-read the immediate diff to confirm the change is exactly as planned.

After all 12: `npm test`, `git diff --stat`, `git status`, write SPRINT_1_NOTES.md.

---

## Notes on scope discipline

- **D4-13 (`--m-text-faint` on raised surfaces in dark theme)** is explicitly out of scope; my change to the light-theme `text-faint` (D4-10) only affects the light theme. Dark theme `--m-text-faint` at `mithnah-design.css` (different line) is untouched.
- **CHANGELOG, README, OPERATORS.md, doctrinal items, every other dimension** — untouched per spec.

---

**Plan complete. Awaiting human approval to begin Phase B.**
